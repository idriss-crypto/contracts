// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import { ITipping } from "../interfaces/ITipping.sol";
import { MultiAssetSender } from "./MultiAssetSender.sol";
import { FeeCalculator } from "./FeeCalculator.sol";
import { PublicGoodAttester } from "./Attestation.sol";

import { AssetType, FeeType } from "../enums/IDrissEnums.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error OnlyAdminCanWithdraw();
error UnknownFunctionSelector();
error WithdrawFailed();
error RenounceOwnershipNotAllowed();


/**
 * @title TippingCore
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is an IDriss Send utility contract for all supported chains.
 */
abstract contract TippingCore is Ownable, ReentrancyGuard, PublicGoodAttester, ITipping, MultiAssetSender, FeeCalculator {

    mapping(address => bool) public admins;
    mapping(address => bool) public publicGoods;

    using SafeERC20 for IERC20;

    constructor(
        address _nativeUsdAggregator,
        address _eas,
        bytes32 _easSchema
    ) FeeCalculator(_nativeUsdAggregator) PublicGoodAttester(_eas, _easSchema) {
        admins[msg.sender] = true;

        FEE_TYPE_MAPPING[AssetType.Native] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.ERC20] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.ERC721] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC1155] = FeeType.Constant;
    }

    event TipMessage(
        address indexed recipientAddress,
        string message,
        address indexed sender,
        address indexed tokenAddress,
        uint256 amount,
        uint256 fee
    );

    modifier onlyAdminCanWithdraw() {
        if (admins[msg.sender] != true) {
            revert OnlyAdminCanWithdraw();
        }
        _;
    }

    /**
     * Abstract functions to be overwritten
    */

    function _beforeTransfer(
        AssetType _assetType,
        address _recipient,
        uint256 _amount,
        uint256 _assetId,
        address _assetContractAddress
        ) internal virtual returns (uint256 fee, uint256 value) {}

    function _afterTransfer(
        AssetType _assetType,
        address _recipient,
        uint256 _amount,
        uint256 _assetId,
        address _assetContractAddress
        ) internal virtual {}

    function _getMinimumFee() internal virtual override view returns (uint256);

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

        _afterTransfer(AssetType.Native, _recipient, paymentValue, 0, address(0));

        emit TipMessage(_recipient, _message, msg.sender, address(0), paymentValue, fee);
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
    ) external payable override nonReentrant {
        uint256 amountIn =  _sendTokenAssetFrom(_amount, msg.sender, address(this), _tokenContractAddr);

        (uint256 fee, uint256 paymentValue) = _beforeTransfer(AssetType.ERC20, _recipient, amountIn, 0, _tokenContractAddr);

        _sendTokenAsset(paymentValue, _recipient, _tokenContractAddr);

        _afterTransfer(AssetType.ERC20, _recipient, amountIn, 0, _tokenContractAddr);

        emit TipMessage(_recipient, _message, msg.sender, _tokenContractAddr, paymentValue, fee);
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

        _afterTransfer(AssetType.ERC721, _recipient, msg.value, _tokenId, _nftContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, _nftContractAddress, msg.value, fee);
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

        _afterTransfer(AssetType.ERC1155, _recipient, msg.value, _assetId, _assetContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, _assetContractAddress, msg.value, fee);
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
        admins[_adminAddress] = false;
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

