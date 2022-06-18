// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

import { ISendToHash } from "interfaces/ISendToHash.sol";
import { IIDrissRegistry } from "interfaces/IIDrissRegistry.sol";
import { AssetLiability } from "structs/IDrissStructs.sol";
import { AssetType } from "enums/IDrissEnums.sol";


//TODO: add coin claimableUntil check
//TODO: remove console.log after testing
//TODO: add claim time check
/**
 * @title sendToHash
 * @author Rafał Kalinowski
 * @notice This contract is used to pay to the IDriss address without a need for it to be registered
 */
contract SendToHash is ISendToHash, Ownable, ReentrancyGuard, IERC721Receiver, IERC165 {
    using SafeCast for int256;

    // payer => beneficiaryHash => assetType => assetAddress => AssetLiability
    mapping(address => mapping(string => mapping(AssetType => mapping(address => AssetLiability)))) payerAssetMap;
    // beneficiaryHash => assetType => assetAddress => AssetLiability
    mapping(string => mapping(AssetType => mapping(address => AssetLiability))) beneficiaryAssetMap;
    // beneficiaryHash => assetType => assetAddress => payer[]
    mapping(string => mapping(AssetType => mapping(address => address[]))) beneficiaryPayersMap;

    address public immutable IDRISS_ADDR;
    uint256 public immutable TRANSFER_EXPIRATION_IN_SECS;
    uint256 public immutable SINGLE_ASSET_PAYMENTS_LIMIT = 100;
    uint256 public immutable DISTINCT_NFT_TRANSFER_LIMIT = 1000;
    uint256 public constant PAYMENT_FEE_PERCENTAGE = 10;
    uint256 public constant PAYMENT_FEE_PERCENTAGE_DENOMINATOR = 1000;
    uint256 public paymentFeesBalance;
    AggregatorV3Interface internal immutable MATIC_USD_PRICE_FEED;

    event AssetTransferred(string indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount);
    event AssetClaimed(string indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount);
    event AssetTransferReverted(string indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount);

    constructor(
        uint256 _transferExpirationInSecs,
        address _IDrissAddr,
        address _maticUsdAggregator
    )
    {
        TRANSFER_EXPIRATION_IN_SECS = _transferExpirationInSecs;
        IDRISS_ADDR = _IDrissAddr;
        MATIC_USD_PRICE_FEED = AggregatorV3Interface(_maticUsdAggregator);
    }

    /**
     * @notice This function allows a user to send tokens or coins to other IDriss. They are
     *         being kept in an escrow until it's claimed by beneficiary or reverted by payer
     * @dev Note that you have to approve this contract address in ERC to handle them on user's behalf.
     *      It's best to approve contract by using non standard function just like
     *      `increaseAllowance` in OpenZeppelin to mitigate risk of race condition and double spend.
     */
    function sendToAnyone (
        string memory _IDrissHash,
        uint256 _amount,
        AssetType _assetType,
        address _assetContractAddress,
        uint256[] calldata _assetIds
    ) external override nonReentrant() payable {
        uint256 calculatedClaimableUntil = block.timestamp + TRANSFER_EXPIRATION_IN_SECS;
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        (uint256 fee, uint256 paymentValue) = _splitPayment(msg.value);

        AssetLiability memory beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];
        AssetLiability memory payerAsset = payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress];
        AssetLiability memory incomingAssetLiability = AssetLiability({
            amount: _amount,
            claimableUntil: calculatedClaimableUntil,
            assetIds: _assetIds
        });


        //TODO: think if this still holds true after adding minimal fee
        // single asset type can hold only a limited amount of payments and NFTs to claim,
        // to prevent micro transactions bloating, making claiming payments unprofitable
        require (
           beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress].length < SINGLE_ASSET_PAYMENTS_LIMIT,
           "Numer of pending payments for the asset reached its limit and has to be claimed to send more."
        );
        require (
           beneficiaryAsset.assetIds.length + _assetIds.length < DISTINCT_NFT_TRANSFER_LIMIT,
           "Numer of NFTs for a contract reached its limit and has to be claimed to send more."
        );

        require (msg.value >= fee, "Value sent is smaller than minimal fee.");

        if (_assetType == AssetType.Coin) {
            _checkNonZeroValue(paymentValue, "Transferred value has to be bigger than 0");
        } else {
            _checkNonZeroValue(incomingAssetLiability.amount, "Asset value has to be bigger than 0");
            _checkNonZeroAddress(_assetContractAddress, "Asset address cannot be 0");
        }


        beneficiaryAsset = _mergeAsset(beneficiaryAsset, _amount, calculatedClaimableUntil, _assetIds);
        payerAsset = _mergeAsset(payerAsset, _amount, calculatedClaimableUntil, _assetIds);

        if (_assetType == AssetType.Coin) {
            incomingAssetLiability.amount = paymentValue;
            beneficiaryAsset.amount += paymentValue;
            payerAsset.amount += paymentValue;
        } else if (_assetType == AssetType.Token) {
            _sendTokenAssetFrom(incomingAssetLiability, msg.sender, address(this), _assetContractAddress);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(incomingAssetLiability, msg.sender, address(this), _assetContractAddress);
        }

        // state is modified after external calls, to avoid reentrancy attacks
        beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress] = beneficiaryAsset;
        payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress] = payerAsset;
        beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress].push(msg.sender);
        paymentFeesBalance += fee;

        emit AssetTransferred(_IDrissHash, msg.sender, adjustedAssetAddress, incomingAssetLiability.amount);
    }

    function _mergeAsset (
        AssetLiability memory _asset,
        uint256 _amount,
        uint256 _claimableUntil,
        uint256 [] calldata _assetIds
        ) internal pure returns (AssetLiability memory){
            uint256 [] memory concatenatedAssetIds =
                    new uint256[](_asset.assetIds.length + _assetIds.length);

                for (uint256 i = 0; i < _asset.assetIds.length; i++) {
                    concatenatedAssetIds[i] = _asset.assetIds[i];
                }

                for (uint256 i = 0; i < _assetIds.length; i++) {
                    concatenatedAssetIds[i + _asset.assetIds.length] = _assetIds[i];
                }

            return AssetLiability({
                amount: _asset.amount + _amount,
                claimableUntil: _claimableUntil,
                assetIds: concatenatedAssetIds
            });
    }

    function _splitPayment(uint256 _value) internal view returns (uint256 fee, uint256 value) {
        //TODO: check if price is adjusted to 10**18
        uint256 maticPrice = _getMaticUsdPrice();

        if ((_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR > maticPrice) {
            fee = (_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR;
        } else {
            fee = maticPrice;
        }

        value = _value - fee;
    }

    /**
     * @notice This function allows a user to revert sending tokens to other IDriss and claim them back
     */
    function claim (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override nonReentrant() {
        address ownerIDrissAddr = _getAddressFromHash(_IDrissHash);
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        AssetLiability memory beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];
        address [] memory payers = beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress];

        _checkNonZeroValue(beneficiaryAsset.amount, "Nothing to claim.");

        delete beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];

        for (uint256 i = 0; i < payers.length; i++) {
            beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress].pop();
            delete payerAssetMap[payers[i]][_IDrissHash][_assetType][adjustedAssetAddress];
        }

        if (_assetType == AssetType.Coin) {
            _sendCoin(ownerIDrissAddr, beneficiaryAsset.amount);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(beneficiaryAsset, address(this), ownerIDrissAddr, _assetContractAddress);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(beneficiaryAsset, ownerIDrissAddr, _assetContractAddress);
        }

        emit AssetClaimed(_IDrissHash, ownerIDrissAddr, adjustedAssetAddress, beneficiaryAsset.amount);
    }

    function balanceOf (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override view returns (uint256) {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        return beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress].amount;
    }

    /**
     * @notice This function allows a user to revert sending tokens to other IDriss and claim them back
     */
    function revertPayment (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override nonReentrant() {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        uint256 amountToRevert = payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress].amount;
        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];

        _checkNonZeroValue(amountToRevert, "Nothing to revert.");

        delete payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress];
        beneficiaryAsset.amount -= amountToRevert;

        if (_assetType == AssetType.Coin) {
            _sendCoin(msg.sender, amountToRevert);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(beneficiaryAsset, address(this), msg.sender, _assetContractAddress);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(beneficiaryAsset, msg.sender, _assetContractAddress);
        }

        emit AssetTransferReverted(_IDrissHash, msg.sender, adjustedAssetAddress, amountToRevert);
    }

    function claimPaymentFees() onlyOwner external {
        uint256 amountToClaim = paymentFeesBalance;
        paymentFeesBalance = 0;

        _sendCoin(msg.sender, amountToClaim);
    }

    function _sendCoin (address _to, uint256 _amount) internal {
        (bool sent, ) = payable(_to).call{value: _amount}("");
        require(sent, "Failed to withdraw");
    }

    function _sendNFTAsset (
        AssetLiability memory _asset,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        require(_asset.amount == _asset.assetIds.length, "Declared NFT amount is different from distinct NFT IDs list passed");

        IERC721 nft = IERC721(_contractAddress);
        for (uint256 i = 0; i < _asset.assetIds.length; i++) {
            require(nft.getApproved(_asset.assetIds[i]) == _to, "Receiver is not approved to receive the NFT");
            nft.safeTransferFrom(_from, _to, _asset.assetIds[i], "");
        }
    }

    function _sendTokenAsset (
        AssetLiability memory _asset,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        bool sent = token.transfer(_to, _asset.amount);
        require(sent, "Failed to transfer token");
    }

    function _sendTokenAssetFrom (
        AssetLiability memory _asset,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        bool sent = token.transferFrom(_from, _to, _asset.amount);
        require(sent, "Failed to transfer token");
    }

    /**
    * @notice Helper function to set asset address to 0 for coins for asset mapping
    */
    function _adjustAddress(address _addr, AssetType _assetType)
        internal
        pure
        returns (address) {
            if (_assetType == AssetType.Coin) {
                return address(0);
            }
            return _addr;
    }

    function _getAddressFromHash (string memory _IDrissHash)
        internal
        view
        returns (address IDrissAddress)
    {
        string memory IDrissString = IIDrissRegistry(IDRISS_ADDR).getIDriss(_IDrissHash);
        IDrissAddress = _safeHexStringToAddress(IDrissString);
        _checkNonZeroAddress(IDrissAddress, "Address for the IDriss hash cannot resolve to 0x0");
    }

    /**
    * @notice Change a single character from ASCII to 0-F hex value; revert on unparseable value
    */
    function _fromHexChar(uint8 c) internal pure returns (uint8) {
        if (bytes1(c) >= bytes1('0') && bytes1(c) <= bytes1('9')) {
            return c - uint8(bytes1('0'));
        } else if (bytes1(c) >= bytes1('a') && bytes1(c) <= bytes1('f')) {
            return 10 + c - uint8(bytes1('a'));
        } else if (bytes1(c) >= bytes1('A') && bytes1(c) <= bytes1('F')) {
            return 10 + c - uint8(bytes1('A'));
        } else {
            revert("Unparseable hex character found in address.");
        }
    }

    /**
    * @notice Get address from string. Revert if address is invalid.
    */    
    function _safeHexStringToAddress(string memory s) internal pure returns (address) {
        bytes memory ss = bytes(s);
        require(ss.length == 42, "Address length is invalid");
        bytes memory _bytes = new bytes(ss.length / 2);
        address resultAddress;

        for (uint256 i = 0; i < ss.length / 2; i++) {
            _bytes[i] = bytes1(_fromHexChar(uint8(ss[2*i])) * 16 +
                        _fromHexChar(uint8(ss[2*i+1])));
        }

        assembly {
            resultAddress := div(mload(add(add(_bytes, 0x20), 1)), 0x1000000000000000000000000)
        }

        return resultAddress;
    }

    function _getMaticUsdPrice() internal view returns (uint) {
        (,int price,,,) = MATIC_USD_PRICE_FEED.latestRoundData();

        return price.toUint256();
    }

    function _checkNonZeroAddress (address _addr, string memory message) internal pure {
        require(_addr != address(0), message);
    }

    function _checkNonZeroValue (uint256 _value, string memory message) internal pure {
        require(_value > 0, message);
    }

   function onERC721Received (
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
       return IERC721Receiver.onERC721Received.selector;
    }

    function supportsInterface (bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
         || interfaceId == type(IERC721Receiver).interfaceId
         || interfaceId == type(ISendToHash).interfaceId;
    }
}
