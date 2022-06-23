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

import { ISendToHash } from "./interfaces/ISendToHash.sol";
import { IIDrissRegistry } from "./interfaces/IIDrissRegistry.sol";
import { AssetLiability } from "./structs/IDrissStructs.sol";
import { AssetType } from "./enums/IDrissEnums.sol";


//TODO: move utils functions to library
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
    mapping(string => mapping(AssetType => mapping(address => address[]))) beneficiaryPayersArray;
    // beneficiaryHash => assetType => assetAddress => payer => didPay
    mapping(string => mapping(AssetType => mapping(address => mapping(address => bool)))) beneficiaryPayersMap;

    AggregatorV3Interface internal immutable MATIC_USD_PRICE_FEED;
    address public immutable IDRISS_ADDR;
    uint256 public constant PAYMENT_FEE_PERCENTAGE = 10;
    uint256 public constant PAYMENT_FEE_PERCENTAGE_DENOMINATOR = 1000;
    uint256 public constant PAYMENT_FEE_SLIPPAGE_PERCENT = 5;
    uint256 public paymentFeesBalance;

    event AssetTransferred(string indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount);
    event AssetClaimed(string indexed toHash, address indexed beneficiary,
        address indexed assetContractAddress, uint256 amount);
    event AssetTransferReverted(string indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount);

    constructor(
        address _IDrissAddr,
        address _maticUsdAggregator
    )
    {
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
        uint256 _assetId
    ) external override nonReentrant() payable {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        (uint256 fee, uint256 paymentValue) = _splitPayment(msg.value);

        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];
        AssetLiability storage payerAsset = payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress];


        if (_assetType == AssetType.Coin) {
            _checkNonZeroValue(paymentValue, "Transferred value has to be bigger than 0");
        } else {
            _checkNonZeroValue(_amount, "Asset amount has to be bigger than 0");
            _checkNonZeroAddress(_assetContractAddress, "Asset address cannot be 0");
            require(_isContract(_assetContractAddress), "Asset address is not a contract");
        }


        if (_assetType == AssetType.Coin) {
            _amount = paymentValue;
        } else if (_assetType == AssetType.Token) {
            _sendTokenAssetFrom(_amount, msg.sender, address(this), _assetContractAddress);
        } else if (_assetType == AssetType.NFT) {
            uint256 [] memory assetIds = new uint[](1);
            assetIds[0] = _assetId;
            _sendNFTAsset(assetIds, msg.sender, address(this), _assetContractAddress);
            beneficiaryAsset.assetIds[msg.sender].push(_assetId);
            payerAsset.assetIds[msg.sender].push(_assetId);
        }

        // state is modified after external calls, to avoid reentrancy attacks
        beneficiaryAsset.amount += _amount;
        payerAsset.amount += _amount;
        paymentFeesBalance += fee;

        if(false == beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress][msg.sender]) {
            beneficiaryPayersArray[_IDrissHash][_assetType][adjustedAssetAddress].push(msg.sender);
            beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress][msg.sender] = true;
        }

        emit AssetTransferred(_IDrissHash, msg.sender, adjustedAssetAddress, _amount);
    }

    function _splitPayment(uint256 _value) internal view returns (uint256 fee, uint256 value) {
        uint256 dollarPriceInWei = _dollarToWei();
        uint256 feeFromValue = (_value * PAYMENT_FEE_PERCENTAGE) / PAYMENT_FEE_PERCENTAGE_DENOMINATOR;

        if (feeFromValue > dollarPriceInWei) {
            fee = feeFromValue;
        // we accept slippage of matic price
        } else if (_value >= dollarPriceInWei * (100 - PAYMENT_FEE_SLIPPAGE_PERCENT) / 100
                        && _value <= dollarPriceInWei) {
            fee = _value;
        } else {
            fee = dollarPriceInWei;
        }

        require (_value >= fee, "Value sent is smaller than minimal fee.");

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
        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];
        address [] memory payers = beneficiaryPayersArray[_IDrissHash][_assetType][adjustedAssetAddress];
        uint256 amountToClaim = beneficiaryAsset.amount;

        _checkNonZeroValue(amountToClaim, "Nothing to claim.");
        require(ownerIDrissAddr == msg.sender, "Only owner can claim payments.");

        for (uint256 i = 0; i < payers.length; i++) {
            beneficiaryPayersArray[_IDrissHash][_assetType][adjustedAssetAddress].pop();
            delete payerAssetMap[payers[i]][_IDrissHash][_assetType][adjustedAssetAddress];
            delete beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress][payers[i]];
            if (_assetType == AssetType.NFT) {
                uint256[] memory assetIds = beneficiaryAsset.assetIds[payers[i]];
                delete beneficiaryAsset.assetIds[payers[i]];
                _sendNFTAsset(assetIds, address(this), ownerIDrissAddr, _assetContractAddress);
            }
        }

        delete beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];

        if (_assetType == AssetType.Coin) {
            _sendCoin(ownerIDrissAddr, amountToClaim);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(amountToClaim, ownerIDrissAddr, _assetContractAddress);
        }

        emit AssetClaimed(_IDrissHash, ownerIDrissAddr, adjustedAssetAddress, amountToClaim);
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
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(amountToRevert, msg.sender, _assetContractAddress);
        } else if (_assetType == AssetType.NFT) {
            uint256[] memory assetIds = beneficiaryAsset.assetIds[msg.sender];
            delete beneficiaryAsset.assetIds[msg.sender];
            _sendNFTAsset(assetIds, address(this), msg.sender, _assetContractAddress);
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
        uint256[] memory _assetIds,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        require(_assetIds.length > 0, "Nothing to send");

        IERC721 nft = IERC721(_contractAddress);
        for (uint256 i = 0; i < _assetIds.length; i++) {
            nft.safeTransferFrom(_from, _to, _assetIds[i], "");
        }
    }

    function _sendTokenAsset (
        uint256 _amount,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        bool sent = token.transfer(_to, _amount);
        require(sent, "Failed to transfer token");
    }

    function _sendTokenAssetFrom (
        uint256 _amount,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        bool sent = token.transferFrom(_from, _to, _amount);
        require(sent, "Failed to transfer token");
    }

    /**
    * @notice Check if an address is a deployed contract
    * @dev IMPORTANT!! This function is used for very specific reason, i.e. to check
    *      if ERC20 or ERC721 is already deployed before trying to interact with it.
    *      It should not be used to detect if msg.sender is an user, as any code run
    *      in a contructor has code size of 0
    */    
    function _isContract(address addr) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(addr) }
        return size > 0;
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
        require(bytes(IDrissString).length > 0, "IDriss not found.");
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

        for (uint256 i = 1; i < ss.length / 2; i++) {
            _bytes[i] = bytes1(_fromHexChar(uint8(ss[2*i])) * 16 +
                        _fromHexChar(uint8(ss[2*i+1])));
        }

        assembly {
            resultAddress := div(mload(add(add(_bytes, 0x20), 1)), 0x1000000000000000000000000)
        }

        return resultAddress;
    }

    /*
    * @notice Get current amount of wei in a dollar
    * @dev ChainLink officially supports only USD -> MATIC,
    *      so we have to convert it back to get current amount of wei in a dollar
    */
    function _dollarToWei() internal view returns (uint256) {
        (,int256 maticPrice,,,) = MATIC_USD_PRICE_FEED.latestRoundData();
        require (maticPrice > 0, "Unable to retrieve MATIC price.");

        uint256 maticPriceMultiplier = 10**MATIC_USD_PRICE_FEED.decimals();

        return(10**18 * maticPriceMultiplier) / uint256(maticPrice);
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
    ) external override pure returns (bytes4) {
       return IERC721Receiver.onERC721Received.selector;
    }

    function supportsInterface (bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
         || interfaceId == type(IERC721Receiver).interfaceId
         || interfaceId == type(ISendToHash).interfaceId;
    }
}