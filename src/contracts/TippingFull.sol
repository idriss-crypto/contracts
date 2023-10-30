// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import { ITipping } from "./interfaces/ITipping.sol";
import { MultiAssetSender } from "./libs/MultiAssetSender.sol";
import { FeeCalculator } from "./libs/FeeCalculator.sol";
import { PublicGoodAttester } from "./libs/Attestation.sol";
import { Batchable } from "./libs/Batchable.sol";

import { AssetType, FeeType } from "./enums/IDrissEnums.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


error tipping__withdraw__OnlyAdminCanWithdraw();
error unknown_function_selector();

/**
 * @title Tipping
 * @author Lennard (lennardevertz)
 * @custom:contributor Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @notice Tipping is a helper smart contract used for IDriss social media tipping functionality
 * @notice This contract features Public Good Attestations and Chainlink oracles for fee calculation
 */
contract TippingFull is Ownable, ReentrancyGuard, ITipping, MultiAssetSender, FeeCalculator, PublicGoodAttester, Batchable, IERC165 {
    mapping(address => bool) public admins;
    mapping(address => bool) public publicGoods;

    event TipMessage(
        address indexed recipientAddress,
        string message,
        address indexed sender,
        address indexed tokenAddress,
        uint256 amount,
        uint256 fee
    );

    constructor(address _nativeUsdAggregator, address _eas, bytes32 _easSchema) FeeCalculator(_nativeUsdAggregator) PublicGoodAttester(_eas, _easSchema) {
        admins[msg.sender] = true;

        FEE_TYPE_MAPPING[AssetType.Native] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.ERC20] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.ERC721] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC1155] = FeeType.Constant;
    }

    using SafeERC20 for IERC20;

    /**
     * @notice Send native currency tip, charging a small fee
     */
    function sendNativeTo(
        address _recipient,
        uint256, // amount is used only for multicall
        string memory _message
    ) external payable override nonReentrant {
        uint256 msgValue = _MSG_VALUE > 0 ? _MSG_VALUE : msg.value;
        uint256 paymentValue;
        if (publicGoods[_recipient]) {
            paymentValue = msgValue;
            _attestDonor(_recipient);
        } else {
            (, paymentValue) = _splitPayment(msgValue, AssetType.Native);
        }

        _sendCoin(_recipient, paymentValue);

        emit TipMessage(_recipient, _message, msg.sender, address(0), paymentValue, msgValue-paymentValue);
    }

    /**
     * @notice Send a tip in ERC20 token, charging a small fee
     * @notice Please note that this protocol does not support tokens with
     *         non-standard ERC20 interfaces and functionality,
     *         such as tokens with rebasing functionality.
     *         Usage of such tokens may result in a loss of assets.
     */
    function sendERC20To(
        address _recipient,
        uint256 _amount,
        address _tokenContractAddr,
        string memory _message
    ) external payable override nonReentrant {
        uint256 amountIn =  _sendTokenAssetFrom(_amount, msg.sender, address(this), _tokenContractAddr);

        uint256 paymentValue;
        if (publicGoods[_recipient]) {
            paymentValue = amountIn;
            _attestDonor(_recipient);
        } else {
            (, paymentValue) = _splitPayment(amountIn, AssetType.ERC20);
        }

        _sendTokenAsset(paymentValue, _recipient, _tokenContractAddr);

        emit TipMessage(_recipient, _message, msg.sender, _tokenContractAddr, paymentValue, amountIn-paymentValue);
    }

    /**
     * @notice Send a tip in ERC721 token, charging a small $ fee
     */
    function sendERC721To(
        address _recipient,
        uint256 _tokenId,
        address _nftContractAddress,
        string memory _message
    ) external payable override nonReentrant {
        // we use it just to revert when value is too small
        uint256 msgValue = _MSG_VALUE > 0 ? _MSG_VALUE : msg.value;
        (uint256 fee,) = _splitPayment(msgValue, AssetType.ERC721);

        _sendNFTAsset(_tokenId, msg.sender, _recipient, _nftContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, _nftContractAddress, msgValue, fee);
    }

    /**
     * @notice Send a tip in ERC721 token, charging a small $ fee
     */
    function sendERC1155To(
        address _recipient,
        uint256 _assetId,
        uint256 _amount,
        address _assetContractAddress,
        string memory _message
    ) external payable override nonReentrant {
        // we use it just to revert when value is too small
        uint256 msgValue = _MSG_VALUE > 0 ? _MSG_VALUE : msg.value;
        (uint256 fee,) = _splitPayment(msgValue, AssetType.ERC1155);

        _sendERC1155Asset(_assetId, _amount, msg.sender, _recipient, _assetContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, _assetContractAddress, msgValue, fee);
    }

    /**
     * @notice Withdraw native currency transfer fees
     */
    function withdraw() external override onlyAdminCanWithdraw nonReentrant {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Failed to withdraw.");
    }

    modifier onlyAdminCanWithdraw() {
        if (admins[msg.sender] != true) {
            revert tipping__withdraw__OnlyAdminCanWithdraw();
        }
        _;
    }

    /**
     * @notice Withdraw ERC20 transfer fees
     */
    function withdrawToken(address _tokenContract)
        external
        override
        onlyAdminCanWithdraw
        nonReentrant
    {
        IERC20 withdrawTC = IERC20(_tokenContract);
        withdrawTC.safeTransfer(msg.sender, withdrawTC.balanceOf(address(this)));
    }

    /**
     * @notice Add admin with priviledged access
     */
    function addAdmin(address _adminAddress)
        external
        override
        onlyOwner
        nonReentrant
    {
        admins[_adminAddress] = true;
    }

    /**
     * @notice Remove admin
     */
    function deleteAdmin(address _adminAddress)
        external
        override
        onlyOwner
        nonReentrant
    {
        admins[_adminAddress] = false;
    }

    /**
     * @notice Add public goods address with priviledged fee structure
     */
    function addPublicGood(address publicGoodAddress) external onlyOwner nonReentrant {
        publicGoods[publicGoodAddress] = true;
    }

    /**
     * @notice Remove public goods address
     */
    function deletePublicGood(address publicGoodAddress) external onlyOwner nonReentrant {
        delete publicGoods[publicGoodAddress];
    }

    /**
    * @notice This is a function that allows for multicall
    * @param _calls An array of inputs for each call.
    * @dev calls Batchable::callBatch
    */
    function batch(bytes[] calldata _calls) external payable nonReentrant {
        batchCall(_calls);
    }

    function isMsgValueOverride(bytes4 _selector) override pure internal returns (bool) {
        return
            _selector == this.sendNativeTo.selector ||
            _selector == this.sendERC20To.selector ||
            _selector == this.sendERC721To.selector ||
            _selector == this.sendERC1155To.selector
        ;
    }

    function calculateMsgValueForACall(bytes4 _selector, bytes memory _calldata) override view internal returns (uint256) {
        uint256 currentCallPriceAmount;

        if (_selector == this.sendNativeTo.selector) {
            assembly {
                currentCallPriceAmount := mload(add(_calldata, 68))
            }
        } else if (_selector == this.sendERC20To.selector) {
            currentCallPriceAmount = getPaymentFee(0, AssetType.ERC20);
        } else if (_selector == this.sendERC721To.selector) {
            currentCallPriceAmount = getPaymentFee(0, AssetType.ERC721);
        } else if (_selector == this.sendERC1155To.selector) {
            currentCallPriceAmount = getPaymentFee(0, AssetType.ERC1155);
        } else {
            revert unknown_function_selector();
        }

        return currentCallPriceAmount;
    }

    /*
    * @notice Always reverts. By default Ownable supports renouncing ownership, that is setting owner to address 0.
    *         However in this case it would disallow receiving payment fees by anyone.
    */
    function renounceOwnership() public override view onlyOwner {
        revert("Operation not supported");
    }

    /**
     * @notice ERC165 interface function implementation, listing all supported interfaces
     */
    function supportsInterface (bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
         || interfaceId == type(ITipping).interfaceId;
    }
}