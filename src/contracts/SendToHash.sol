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

interface IDriss {
    function getIDriss(string memory hashPub) external view returns (string memory);
    function IDrissOwners(string memory _address) external view returns (address);
}

struct AssetLiability {
    uint256 amount;
    uint256 claimableUntil;
    uint256[] assetIds;
}

enum AssetType {
    Coin,
    Token,
    NFT
}

interface ISendToHash {
    function sendToAnyone (
        string memory _IDrissHash,
        uint256 _amount,
        AssetType _assetType,
        address _assetContractAddress,
        uint256[] calldata _assetIds
    ) external payable;

    function claim (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external;

    function revertPayment (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external;

    function balanceOf (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external view returns (uint256);
}

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
     //TODO: verify IDrissHash length
    function sendToAnyone (
        string memory _IDrissHash,
        uint256 _amount,
        AssetType _assetType,
        address _assetContractAddress,
        uint256[] calldata _assetIds
    ) external override nonReentrant() payable {
        uint256 calculatedClaimableUntil = block.timestamp + TRANSFER_EXPIRATION_IN_SECS;

        AssetLiability memory beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress];
        AssetLiability memory payerAsset = payerAssetMap[msg.sender][_IDrissHash][_assetType][_assetContractAddress];
        AssetLiability memory incomingAssetLiability = AssetLiability({
            amount: _amount,
            claimableUntil: calculatedClaimableUntil,
            assetIds: _assetIds
        });

        //TODO: think about reimbursement for Tokens and NFTs
        (uint256 fee, uint256 paymentValue, uint256 reimbursement) = _splitPayment(msg.value);

        //TODO: think if this still holds true after adding minimal fee
        // single asset type can hold only a limited amount of payments and NFTs to claim,
        // to prevent micro transactions bloating, making claiming payments unprofitable
        require(
           beneficiaryPayersMap[_IDrissHash][_assetType][_assetContractAddress].length < SINGLE_ASSET_PAYMENTS_LIMIT,
           "Numer of pending payments for the asset reached its limit and has to be claimed to send more."
        );
        require(
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
            beneficiaryAsset.amount += paymentValue;
            payerAsset.amount += paymentValue;
        } else if (_assetType == AssetType.Token) {
            _sendTokenAssetFrom(incomingAssetLiability, msg.sender, address(this), _assetContractAddress);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(incomingAssetLiability, msg.sender, address(this), _assetContractAddress);
        }

        // state is modified after external calls, to avoid reentrancy attacks
        beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress] = beneficiaryAsset;
        payerAssetMap[msg.sender][_IDrissHash][_assetType][_assetContractAddress] = payerAsset;
        beneficiaryPayersMap[_IDrissHash][_assetType][_assetContractAddress].push(msg.sender);
        paymentFeesBalance += fee;

        emit AssetTransferred(_IDrissHash, msg.sender, _assetContractAddress, _amount);
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

    function _splitPayment(uint256 _value) internal view returns (uint256 fee, uint256 value, uint256 reimbursement) {
        uint256 paymentFee;
        //TODO: check if price is adjusted to 10**18
        uint256 maticPrice = _getMaticUsdPrice();

        if ((_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR > maticPrice) {
            fee = (_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR;
        } else {
            fee = maticPrice;
        }

        value = _value - fee;
        //reimbursement is required for Tokens and NFTs
        reimbursement = _value - maticPrice;
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
        AssetLiability memory beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress];
        address [] memory payers = beneficiaryPayersMap[_IDrissHash][_assetType][_assetContractAddress];

        _checkNonZeroValue(beneficiaryAsset.amount, "Nothing to claim.");

        delete beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress];

        for (uint256 i = 0; i < payers.length; i++) {
            beneficiaryPayersMap[_IDrissHash][_assetType][_assetContractAddress].pop();
            delete payerAssetMap[payers[i]][_IDrissHash][_assetType][_assetContractAddress];
        }

        if (_assetType == AssetType.Coin) {
            _sendCoin(ownerIDrissAddr, beneficiaryAsset.amount);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(beneficiaryAsset, address(this), ownerIDrissAddr, _assetContractAddress);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(beneficiaryAsset, ownerIDrissAddr, _assetContractAddress);
        }

        emit AssetClaimed(_IDrissHash, ownerIDrissAddr, _assetContractAddress, beneficiaryAsset.amount);
    }

    function balanceOf (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override view returns (uint256) {
        return beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress].amount;
    }

    /**
     * @notice This function allows a user to revert sending tokens to other IDriss and claim them back
     */
    function revertPayment (
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override nonReentrant() {
        uint256 amountToRevert = payerAssetMap[msg.sender][_IDrissHash][_assetType][_assetContractAddress].amount;
        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress];

        _checkNonZeroValue(amountToRevert, "Nothing to revert.");

        delete payerAssetMap[msg.sender][_IDrissHash][_assetType][_assetContractAddress];
        beneficiaryAsset.amount -= amountToRevert;

        if (_assetType == AssetType.Coin) {
            _sendCoin(msg.sender, amountToRevert);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(beneficiaryAsset, address(this), msg.sender, _assetContractAddress);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(beneficiaryAsset, msg.sender, _assetContractAddress);
        }

        emit AssetTransferReverted(_IDrissHash, msg.sender, _assetContractAddress, amountToRevert);
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

    function _getAddressFromHash (string memory _IDrissHash)
        internal
        view
        returns (address IDrissAddress)
    {
        IDrissAddress = IDriss(IDRISS_ADDR).IDrissOwners(_IDrissHash);
        _checkNonZeroAddress(IDrissAddress, "Address for the IDriss hash cannot resolve to 0x0");
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
