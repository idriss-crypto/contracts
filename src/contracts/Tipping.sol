// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import { ITipping } from "./interfaces/ITipping.sol";
import { MultiAssetSender } from "./libs/MultiAssetSender.sol";
import { FeeCalculator } from "./libs/FeeCalculator.sol";
import { PublicGoodAttester } from "./libs/Attestation.sol";

import { AssetType, FeeType } from "./enums/IDrissEnums.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error OnlyAdminCanWithdraw();
error UnknownFunctionSelector();
error WithdrawFailed();
error RenounceOwnershipNotAllowed();


/**
 * @title Tipping
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is an IDriss Send utility contract for all supported chains.
 */
abstract contract Tipping is Ownable, ReentrancyGuard, PublicGoodAttester, ITipping, MultiAssetSender, FeeCalculator {

    bool immutable SUPPORTS_CHAINLINK;
    bool immutable SUPPORTS_EAS;
    mapping(address => bool) public admins;
    mapping(address => bool) public publicGoods;

    using SafeERC20 for IERC20;

    struct BatchCall {
        AssetType assetType,
        address recipient,
        uint256 amount,
        uint256 tokenId,
        address tokenAddress,
        string calldata message
    }

    struct MultiSendAssetHelper {
        AssetType assetType,
        address assetAddress,
        uint256 tokenId,
        uint256 amountIn,
        uint256 totalFee
    }

    constructor(
        bool _supportsChainlink,
        bool _supportsEAS,
        address _nativeUsdAggregator,
        address _sequencerAddress,
        uint256 _stalenessThreshold,
        int256 _fallbackPrice,
        uint256 _fallbackDecimals,
        address _eas,
        bytes32 _easSchema
    ) FeeCalculator(_nativeUsdAggregator, _sequencerAddress, _stalenessThreshold, _fallbackPrice, _fallbackDecimals) PublicGoodAttester(_eas, _easSchema) {
        admins[msg.sender] = true;

        FEE_TYPE_MAPPING[AssetType.Native] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.ERC20] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC721] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC1155] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.SUPPORTED_ERC20] = FeeType.Percentage;
        SUPPORTS_CHAINLINK = _supportsChainlink;
        SUPPORTS_EAS = _supportsEAS;
    }

    event TipMessage(
        address indexed recipientAddress,
        string message,
        address indexed sender,
        AssetType assetType,
        address indexed tokenAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 fee
    );

    modifier onlyAdminCanWithdraw() {
        if (admins[msg.sender] != true) {
            revert OnlyAdminCanWithdraw();
        }
        _;
    }

    function _getMinimumFee() internal override view returns (uint256) {
        if (SUPPORTS_CHAINLINK) {
            return _getMinimumFeeOracle();
        }
        return _getMinimumFeeSimple();
    }

    /**
     * @notice This function checks if the recipient of a tip
     * @notice is a verified public good and attests the donation accordingly.
     * @notice It also makes sure that no fee is subtracted in such case.
     */

    function _beforeTransfer(
        AssetType _assetType,
        address _recipient,
        uint256 _amount,
        uint256 _assetId,
        address _assetContractAddress
        ) internal returns (uint256 fee, uint256 value) {
            if (publicGoods[_recipient]) {
                value = _amount;
                fee;
                if (SUPPORTS_EAS) {
                    _attestDonor(_recipient);
                }
            } else {
                // overwriting fee type for supported erc20s
                if (supportedERC20[_assetContractAddress]) _assetType = AssetType.SUPPORTED_ERC20;
                (fee, value) = _splitPayment(_amount, _assetType);
            }
        }

    /**
     * Tipping functions
    */

    /**
     * @notice Send native currency tip, charging a small fee
     * @param _recipient The address of the recipient of the tip
     * @param _message The message accompanying the tip
     */
    function sendNativeTo(
        address _recipient,
        string memory _message
    ) external payable override nonReentrant {
        (uint256 fee, uint256 paymentValue) = _beforeTransfer(AssetType.Native, _recipient, msg.value, 0, address(0));

        _sendCoin(_recipient, paymentValue);

        emit TipMessage(_recipient, _message, msg.sender, AssetType.Native, address(0), 0, paymentValue, fee);
    }

    /**
     * @notice Send a tip in ERC20 token, charging a small fee
     * @notice Please note that this protocol does not support tokens with
     * non-standard ERC20 interfaces and functionality,
     * such as tokens with rebasing functionality.
     * Usage of such tokens may result in a loss of assets.
     * @param _recipient The address of the recipient of the tip
     * @param _amount The amount of the ERC20 token being sent as a tip
     * @param _tokenContractAddr The address of the ERC20 token contract
     * @param _message The message accompanying the tip
     */
    function sendERC20To(
        address _recipient,
        uint256 _amount,
        address _tokenContractAddr,
        string memory _message
    ) external override nonReentrant {
        uint256 amountIn =  _sendTokenAssetFrom(_amount, msg.sender, address(this), _tokenContractAddr);

        (uint256 fee, uint256 paymentValue) = _beforeTransfer(AssetType.ERC20, _recipient, amountIn, 0, _tokenContractAddr);

        _sendTokenAsset(paymentValue, _recipient, _tokenContractAddr);

        emit TipMessage(_recipient, _message, msg.sender, AssetType.ERC20, _tokenContractAddr, 0, paymentValue, fee);
    }

    /**
     * @notice Send a tip in ERC721 token, charging a small fee
     * @param _recipient The address of the recipient of the tip
     * @param _tokenId The ID of the ERC721 token being sent as a tip
     * @param _nftContractAddress The address of the ERC721 token contract
     * @param _message The message accompanying the tip
     */
    function sendERC721To(
        address _recipient,
        uint256 _tokenId,
        address _nftContractAddress,
        string memory _message
    ) external payable override nonReentrant {

        (uint256 fee,) = _beforeTransfer(AssetType.ERC721, _recipient, msg.value, _tokenId, _nftContractAddress);

        _sendNFTAsset(_tokenId, msg.sender, _recipient, _nftContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, AssetType.ERC721, _nftContractAddress, _tokenId, msg.value, fee);
    }

    /**
     * @notice Send a tip in ERC1155 token, charging a small fee
     * @param _recipient The address of the recipient of the tip
     * @param _assetId The ID of the ERC1155 token being sent as a tip
     * @param _amount The amount of the ERC1155 token being sent as a tip
     * @param _assetContractAddress The address of the ERC1155 token contract
     * @param _message The message accompanying the tip
     */
    function sendERC1155To(
        address _recipient,
        uint256 _assetId,
        uint256 _amount,
        address _assetContractAddress,
        string memory _message
    ) external payable override nonReentrant {

        (uint256 fee,) = _beforeTransfer(AssetType.ERC1155, _recipient, msg.value, _assetId, _assetContractAddress);

        _sendERC1155Asset(_assetId, _amount, msg.sender, _recipient, _assetContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, AssetType.ERC1155, _assetContractAddress, _assetId, msg.value, fee);
    }

/** FIXME: unfinished */
    function calculateBatchFee(BatchCall [] calldata calls) external view returns (MultiSendAssetHelper[] memory) {
        MultiSendAssetHelper[] memory resultArray;
        mapping(address => MultiSendAssetHelper) memory resultMapping;

        for (uint256 i; i < calls.length; i++) {
            if (calls[i].assetType == AssetType.Native) resultMapping[calls.tokenAddress(0)].amountIn += calls.amount;
            else {
                (uint256 fee, uint256 value) = _splitPayment(calls.amount, calls.assetType);
                resultMapping[calls.tokenAddress].amountIn += fee;
            }
        }
    }

/** FIXME: unfinished */

/**
* @notice Please note that this protocol does not support tokens with
 * non-standard ERC20 interfaces and functionality,
 * such as tokens with rebasing functionality or fee-on-transfer token.
 * Usage of such tokens may result in a loss of assets.
*/
    function batchSendTo (BatchCall [] calldata calls) external nonReentrant {

        mapping(address => uint256) amountsIn;
        address[] erc20In;

        for (uint256 i; i < calls.length; i++) {
            if(calls.assetType == AssetType.ERC20 || calls.assetType == AssetType.SUPPORTED_ERC20) {
                amountsIn[calls.tokenAddress] += calls.amount;
                erc20In.push(calls.tokenAddress);
            }
        }

        uint256 msgValueUsed;
        uint256 msgFeeUsed;

        for (uint256 i; i < calls.length; i++) {
            if (supportedERC20[calls.assetAddress]) calls.assetType = AssetType.SUPPORTED_ERC20;
            (uint256 fee, uint256 paymentValue) = _beforeTransfer(calls.assetType, calls.recipient, calls.amount, 0, address(0));
            if (calls.assetType == AssetType.Native) {
                _sendTo(calls.recipient, paymentValue, calls.message);
                msgValueUsed += paymentValue;
                msgFeeUsed += fee;
            } else if (calls.assetType == AssetType.ERC20) {
                _sendERC20To(calls.recipient, paymentValue, calls.tokenAddress, calls.message);
            else if (calls.assetType == AssetType.SUPPORTED_ERC20) {
                _sendERC20To(calls.recipient, paymentValue, calls.tokenAddress, calls.message);
                msgFeeUsed += fee;
            } else if (calls.assetType == AssetType.ERC721) {
                _sendERC721To(calls.recipient, calls.tokenAddress, calls.tokenId, calls.message);
                msgFeeUsed += fee;
            } else if (calls.assetType == AssetType.ERC1155) {
                /** ToDo: check amount */
                _sendERC1155To(calls.recipient, calls.amount, calls.tokenAddress, calls.tokenId, calls.message);
                msgFeeUsed += fee;
            } else {
                revert tipping__UnsupportedAssetType;
            }
        }

        if (msgValueUsed + msgFeeUsed != msg.value) {
            revert tipping__MsgValueMismatch(mgs.value, msgValueUsed);
        }
    }


    /**
     * Trusted admin methods
    */

    /**
     * @notice Add admin with privileged access
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
        delete admins[_adminAddress];
    }

    /**
     * @notice Add public goods address with privileged fee structure
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
     * @notice Add supported erc20 address with percentage fee structure
     */
    function addSupportedERC20(address erc20Address) external onlyOwner nonReentrant {
        supportedERC20[publicGoodAddress] = true;
    }

    /**
     * @notice ERC20 returns to minimum amount fee structure
     */
    function deleteSupportedERC20(address erc20Address) external onlyOwner nonReentrant {
        delete supportedERC20[publicGoodAddress];
    }

    /**
     * @notice Withdraw native currency transfer fees
     */
    function withdraw() external override onlyAdminCanWithdraw nonReentrant {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        if (!success) {
            revert WithdrawFailed();
        }
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

    /*
    * @notice Always reverts. By default Ownable supports renouncing ownership, that is setting owner to address 0.
    *         However in this case it would disallow receiving payment fees by anyone.
    */
    function renounceOwnership() public override view onlyOwner {
        revert RenounceOwnershipNotAllowed();
    }

}
