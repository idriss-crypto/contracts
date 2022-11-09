// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import 'hardhat/console.sol';

import { ISendToHash } from "./interfaces/ISendToHash.sol";
import { IIDrissRegistry } from "./interfaces/IIDrissRegistry.sol";
import { AssetLiability, AssetIdAmount } from "./structs/IDrissStructs.sol";
import { AssetType, FeeType } from "./enums/IDrissEnums.sol";
import { ConversionUtils } from "./libs/ConversionUtils.sol";
import { MultiAssetSender } from "./libs/MultiAssetSender.sol";
import { FeeCalculator } from "./libs/FeeCalculator.sol";
import { Batchable } from "./libs/Batchable.sol";


/**
 * @title SendToHash
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @notice This contract is used to pay to the IDriss address without a need for it to be registered
 */
contract SendToHash is
                ISendToHash, Ownable, ReentrancyGuard, MultiAssetSender,
                FeeCalculator, IERC721Receiver, IERC165, IERC1155Receiver, Batchable {
    using SafeCast for int256;

    // payer => beneficiaryHash => assetType => assetAddress => AssetLiability
    mapping(address => mapping(bytes32 => mapping(AssetType => mapping(address => AssetLiability)))) payerAssetMap;
    // beneficiaryHash => assetType => assetAddress => AssetLiability
    mapping(bytes32 => mapping(AssetType => mapping(address => AssetLiability))) beneficiaryAssetMap;
    // beneficiaryHash => assetType => assetAddress => payer[]
    mapping(bytes32 => mapping(AssetType => mapping(address => address[]))) beneficiaryPayersArray;
    // beneficiaryHash => assetType => assetAddress => payer => didPay
    mapping(bytes32 => mapping(AssetType => mapping(address => mapping(address => bool)))) beneficiaryPayersMap;

    address public immutable IDRISS_ADDR;
    uint256 public paymentFeesBalance;

    event AssetTransferred(bytes32 indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount, AssetType assetType, string message);
    event AssetMoved(bytes32 indexed fromHash, bytes32 indexed toHash,
        address indexed from, address assetContractAddress, AssetType assetType);
    event AssetClaimed(bytes32 indexed toHash, address indexed beneficiary,
        address indexed assetContractAddress, uint256 amount, AssetType assetType);
    event AssetTransferReverted(bytes32 indexed toHash, address indexed from,
        address indexed assetContractAddress, uint256 amount, AssetType assetType);

    constructor(address _IDrissAddr, address _maticUsdAggregator) FeeCalculator(_maticUsdAggregator) {
        _checkNonZeroAddress(_IDrissAddr, "IDriss address cannot be 0");

        IDRISS_ADDR = _IDrissAddr;

        FEE_TYPE_MAPPING[AssetType.Coin] = FeeType.PercentageOrConstantMaximum;
        FEE_TYPE_MAPPING[AssetType.Token] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.NFT] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC1155] = FeeType.Constant;
    }

    /**
     * @notice This function allows a user to send tokens or coins to other IDriss. They are
     *         being kept in an escrow until it's claimed by beneficiary or reverted by payer
     * @dev Note that you have to approve this contract address in ERC to handle them on user's behalf.
     *      It's best to approve contract by using non standard function just like
     *      `increaseAllowance` in OpenZeppelin to mitigate risk of race condition and double spend.
     */
    function sendToAnyone (
        bytes32 _IDrissHash,
        uint256 _amount,
        AssetType _assetType,
        address _assetContractAddress,
        uint256 _assetId,
        string memory _message
    ) external override nonReentrant() payable {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        uint256 msgValue = _MSG_VALUE > 0 ? _MSG_VALUE : msg.value;
        (uint256 fee, uint256 paymentValue) = _splitPayment(msgValue, _assetType);
        if (_assetType != AssetType.Coin) { fee = msgValue; }
        if (_assetType == AssetType.Token || _assetType == AssetType.ERC1155) { paymentValue = _amount; }
        if (_assetType == AssetType.NFT) { paymentValue = 1; }

        setStateForSendToAnyone(_IDrissHash, paymentValue, fee, _assetType, _assetContractAddress, _assetId);

        if (_assetType == AssetType.Token) {
            _sendTokenAssetFrom(paymentValue, msg.sender, address(this), _assetContractAddress);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAsset(_assetId, msg.sender, address(this), _assetContractAddress);
        } else if (_assetType == AssetType.ERC1155) {
            _sendERC1155Asset(_assetId, paymentValue, msg.sender, address(this), _assetContractAddress);
        }

        emit AssetTransferred(_IDrissHash, msg.sender, adjustedAssetAddress, paymentValue, _assetType, _message);
    }

    /**
     * @notice Sets state for sendToAnyone function invocation
     */
    function setStateForSendToAnyone (
        bytes32 _IDrissHash,
        uint256 _amount,
        uint256 _fee,
        AssetType _assetType,
        address _assetContractAddress,
        uint256 _assetId
    ) internal {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);

        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];
        AssetLiability storage payerAsset = payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress];

        if (_assetType == AssetType.Coin) {
            _checkNonZeroValue(_amount, "Transferred value has to be bigger than 0");
        } else {
            _checkNonZeroValue(_amount, "Asset amount has to be bigger than 0");
            _checkNonZeroAddress(_assetContractAddress, "Asset address cannot be 0");
            require(_isContract(_assetContractAddress), "Asset address is not a contract");
        }

        if (!beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress][msg.sender]) {
            beneficiaryPayersArray[_IDrissHash][_assetType][adjustedAssetAddress].push(msg.sender);
            beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress][msg.sender] = true;
        }

        uint256 paymentValue = _amount;

        if (_assetType == AssetType.NFT) { paymentValue = 1; }

        beneficiaryAsset.amount += paymentValue;
        payerAsset.amount += paymentValue;
        paymentFeesBalance += _fee;

        if (_assetType == AssetType.NFT) {
            beneficiaryAsset.assetIds[msg.sender].push(_assetId);
            payerAsset.assetIds[msg.sender].push(_assetId);
        }

        if (_assetType == AssetType.ERC1155) {
            AssetIdAmount memory asset = AssetIdAmount({id: _assetId, amount: paymentValue});
            beneficiaryAsset.assetIdAmounts[msg.sender].push(asset);
            payerAsset.assetIdAmounts[msg.sender].push(asset);
        }
    }

    /**
     * @notice Allows claiming assets by an IDriss owner
     */
    function claim (
        string memory _IDrissHash,
        string memory _claimPassword,
        AssetType _assetType,
        address _assetContractAddress
    ) external override nonReentrant() {
        address ownerIDrissAddr = _getAddressFromHash(_IDrissHash);
        bytes32 hashWithPassword = hashIDrissWithPassword(_IDrissHash, _claimPassword);

        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[hashWithPassword][_assetType][adjustedAssetAddress];
        address [] memory payers = beneficiaryPayersArray[hashWithPassword][_assetType][adjustedAssetAddress];
        uint256 amountToClaim = beneficiaryAsset.amount;

        _checkNonZeroValue(amountToClaim, "Nothing to claim.");
        require(ownerIDrissAddr == msg.sender, "Only owner can claim payments.");

        beneficiaryAsset.amount = 0;

        for (uint256 i = 0; i < payers.length; ++i) {
            beneficiaryPayersArray[hashWithPassword][_assetType][adjustedAssetAddress].pop();
            delete payerAssetMap[payers[i]][hashWithPassword][_assetType][adjustedAssetAddress].assetIds[payers[i]];
            delete payerAssetMap[payers[i]][hashWithPassword][_assetType][adjustedAssetAddress].assetIdAmounts[payers[i]];
            delete payerAssetMap[payers[i]][hashWithPassword][_assetType][adjustedAssetAddress];
            delete beneficiaryPayersMap[hashWithPassword][_assetType][adjustedAssetAddress][payers[i]];
            if (_assetType == AssetType.NFT) {
                uint256[] memory assetIds = beneficiaryAsset.assetIds[payers[i]];
                delete beneficiaryAsset.assetIds[payers[i]];
                _sendNFTAssetBatch(assetIds, address(this), ownerIDrissAddr, _assetContractAddress);
            } else if (_assetType == AssetType.ERC1155) {
                AssetIdAmount[] memory assetAmountIds = beneficiaryAsset.assetIdAmounts[payers[i]];
                delete beneficiaryAsset.assetIdAmounts[payers[i]];
                for (uint256 j = 0; j < assetAmountIds.length; ++j) {
                    _sendERC1155Asset(assetAmountIds[j].id, assetAmountIds[j].amount, address(this), ownerIDrissAddr, _assetContractAddress);
                }
            }
        }

        delete beneficiaryAssetMap[hashWithPassword][_assetType][adjustedAssetAddress];

        if (_assetType == AssetType.Coin) {
            _sendCoin(ownerIDrissAddr, amountToClaim);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(amountToClaim, ownerIDrissAddr, _assetContractAddress);
        }

        emit AssetClaimed(hashWithPassword, ownerIDrissAddr, adjustedAssetAddress, amountToClaim, _assetType);
    }

    /**
     * @notice Get balance of given asset for IDrissHash
     */
    function balanceOf (
        bytes32 _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress,
        uint256 _assetId
    ) external override view returns (uint256) {
        uint256 balance = 0;
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        AssetLiability storage asset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];
        address [] memory payers = beneficiaryPayersArray[_IDrissHash][_assetType][adjustedAssetAddress];

        if (_assetType != AssetType.ERC1155) {
            balance = asset.amount;
        } else {
            // it's external view function, so arrays cost us nothing
            for (uint256 i = 0; i < payers.length; ++i) {
                AssetIdAmount[] memory assetAmounts = asset.assetIdAmounts[payers[i]];
                for (uint256 j = 0; j < assetAmounts.length; ++j) {
                    if (assetAmounts[j].id == _assetId) {
                        balance += assetAmounts[j].amount;
                    }
                }
            }
        }

        return balance;
    }

    /**
     * @notice Reverts sending tokens to an IDriss hash and claim them back
     */
    function revertPayment (
        bytes32 _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override nonReentrant() {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        uint256[] memory assetIds = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress].assetIds[msg.sender];
        AssetIdAmount[] memory assetAmountIds = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress].assetIdAmounts[msg.sender];

        // has to be invoked after all reads required by this function, as it modifies state
        uint256 amountToRevert = setStateForRevertPayment(_IDrissHash, _assetType, _assetContractAddress);

        if (_assetType == AssetType.Coin) {
            _sendCoin(msg.sender, amountToRevert);
        } else if (_assetType == AssetType.Token) {
            _sendTokenAsset(amountToRevert, msg.sender, _assetContractAddress);
        } else if (_assetType == AssetType.NFT) {
            _sendNFTAssetBatch(assetIds, address(this), msg.sender, _assetContractAddress);
        } else if (_assetType == AssetType.ERC1155) {
            uint256[] memory amounts = new uint256[](assetAmountIds.length);
            uint256[] memory ids = new uint256[](assetAmountIds.length);
            for (uint256 j = 0; j < assetAmountIds.length; ++j) {
                ids[j] = assetAmountIds[j].id;
                amounts[j] = assetAmountIds[j].amount;
            }

            _sendERC1155AssetBatch(ids, amounts, address(this), msg.sender, _assetContractAddress);
        }

        emit AssetTransferReverted(_IDrissHash, msg.sender, adjustedAssetAddress, amountToRevert, _assetType);
    }

    /**
     * @notice Sets the state for reverting the payment for a user
     */
    function setStateForRevertPayment (
        bytes32 _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) internal returns(uint256 amountToRevert) {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        amountToRevert = payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress].amount;
        AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[_IDrissHash][_assetType][adjustedAssetAddress];

        _checkNonZeroValue(amountToRevert, "Nothing to revert.");

        delete payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress].assetIds[msg.sender];
        delete payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress].assetIdAmounts[msg.sender];
        delete payerAssetMap[msg.sender][_IDrissHash][_assetType][adjustedAssetAddress];
        beneficiaryAsset.amount -= amountToRevert;

        address [] storage payers = beneficiaryPayersArray[_IDrissHash][_assetType][adjustedAssetAddress];

        for (uint256 i = 0; i < payers.length; ++i) {
            if (msg.sender == payers[i]) {
                delete beneficiaryPayersMap[_IDrissHash][_assetType][adjustedAssetAddress][payers[i]];
                if (_assetType == AssetType.NFT) {
                    delete beneficiaryAsset.assetIds[payers[i]];
                } else if (_assetType == AssetType.ERC1155) {
                    delete beneficiaryAsset.assetIdAmounts[payers[i]];
                }
                payers[i] = payers[payers.length - 1];
                payers.pop();
            }
        }

        if (_assetType == AssetType.NFT) {
            delete beneficiaryAsset.assetIds[msg.sender];
        } else if (_assetType == AssetType.ERC1155) {
            delete beneficiaryAsset.assetIdAmounts[msg.sender];
        }
}

    /**
     * @notice This function allows a user to move tokens or coins they already sent to other IDriss
     */
    function moveAssetToOtherHash (
        bytes32 _FromIDrissHash,
        bytes32 _ToIDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external override nonReentrant() {
        address adjustedAssetAddress = _adjustAddress(_assetContractAddress, _assetType);
        uint256[] memory assetIds = beneficiaryAssetMap[_FromIDrissHash][_assetType][adjustedAssetAddress].assetIds[msg.sender];
        AssetIdAmount[] memory assetIdAmounts = beneficiaryAssetMap[_FromIDrissHash][_assetType][adjustedAssetAddress].assetIdAmounts[msg.sender];
        uint256 _amount = setStateForRevertPayment(_FromIDrissHash, _assetType, _assetContractAddress);

        _checkNonZeroValue(_amount, "Nothing to transfer");

        if (_assetType == AssetType.NFT) {
            for (uint256 i = 0; i < assetIds.length; ++i) {
                setStateForSendToAnyone(_ToIDrissHash, _amount, 0, _assetType, _assetContractAddress, assetIds[i]);
            }
        } else if (_assetType == AssetType.ERC1155) {
            for (uint256 i = 0; i < assetIdAmounts.length; ++i) {
                setStateForSendToAnyone(_ToIDrissHash, assetIdAmounts[i].amount, 0, _assetType, _assetContractAddress, assetIdAmounts[i].id);
            }
        } else {
            setStateForSendToAnyone(_ToIDrissHash, _amount, 0, _assetType, _assetContractAddress, 0);
        }

        emit AssetMoved(_FromIDrissHash, _ToIDrissHash, msg.sender, adjustedAssetAddress, _assetType);
    }

    /**
    * @notice This is a function that allows for multicall
    * @param _calls An array of inputs for each call.
    * @dev calls Batchable::batchCall
    */
    function batch(bytes[] calldata _calls) external payable {
        batchCall(_calls);
    }

    function isMsgValueOverride(bytes4 _selector) override pure internal returns (bool) {
        return _selector == this.sendToAnyone.selector;
    }

    function calculateMsgValueForACall(bytes4, bytes memory _calldata) override view internal returns (uint256) {
        uint256 currentCallPriceAmount;
        AssetType assetType;

        assembly {
            currentCallPriceAmount := mload(add(_calldata, 68))
            assetType := mload(add(_calldata, 100))
        }

        if (assetType != AssetType.Coin) {
            currentCallPriceAmount = getPaymentFee(0, assetType);
        }

        return currentCallPriceAmount;
    }

    /**
     * @notice Claim fees gathered from sendToAnyone(). Only owner can execute this function
     */
    function claimPaymentFees() onlyOwner external {
        uint256 amountToClaim = paymentFeesBalance;
        paymentFeesBalance = 0;

        _sendCoin(msg.sender, amountToClaim);
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

    /**
    * @notice Helper function to retrieve address string from IDriss hash and transforming it into address type
    */
    function _getAddressFromHash (string memory _IDrissHash)
        internal
        view
        returns (address IDrissAddress)
    {
        string memory IDrissString = IIDrissRegistry(IDRISS_ADDR).getIDriss(_IDrissHash);
        require(bytes(IDrissString).length > 0, "IDriss not found.");
        IDrissAddress = ConversionUtils.safeHexStringToAddress(IDrissString);
        _checkNonZeroAddress(IDrissAddress, "Address for the IDriss hash cannot resolve to 0x0");
    }

    /**
    * @notice Helper function to check if address is non-zero. Reverts with passed message in that casee.
    */
    function _checkNonZeroAddress (address _addr, string memory message) internal pure {
        require(_addr != address(0), message);
    }

    /**
    * @notice Helper function to check if value is bigger than 0. Reverts with passed message in that casee.
    */
    function _checkNonZeroValue (uint256 _value, string memory message) internal pure {
        require(_value > 0, message);
    }

    /**
    * @notice Get bytes32 hash of IDriss and password. It's used to obfuscate real IDriss that received a payment until the owner claims it.
    *         Because it's a pure function, it won't be visible in mempool, and it's safe to execute.
    */
    function hashIDrissWithPassword (
        string memory  _IDrissHash,
        string memory _claimPassword
    ) public pure override returns (bytes32) {
        return keccak256(abi.encodePacked(_IDrissHash, _claimPassword));
    }

    /*
    * @notice Always reverts. By default Ownable supports renouncing ownership, that is setting owner to address 0.
    *         However in this case it would disallow receiving payment fees by anyone.
    */
    function renounceOwnership() public override view onlyOwner {
        revert("Renouncing ownership is not supported");
    }

   function onERC721Received (
        address,
        address,
        uint256,
        bytes calldata
    ) external override pure returns (bytes4) {
       return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface (bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
         || interfaceId == type(IERC721Receiver).interfaceId
         || interfaceId == type(IERC1155Receiver).interfaceId
         || interfaceId == type(ISendToHash).interfaceId;
    }
}