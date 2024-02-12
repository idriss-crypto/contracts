// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ITipping} from "./interfaces/ITipping.sol";
import {MultiAssetSender} from "./libs/MultiAssetSender.sol";
import {FeeCalculator, UnsupportedAssetType} from "./libs/FeeCalculator.sol";
import {PublicGoodAttester} from "./libs/Attestation.sol";

import {AssetType, FeeType} from "./enums/IDrissEnums.sol";
import {BatchCall} from "./structs/IDrissStructs.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error OnlyAdminMethod();
error WithdrawFailed();
error RenounceOwnershipNotAllowed();
error FeeHigherThanProvidedNativeCurrency(
    uint256 value,
    uint256 fee,
    uint256 msg
);
error PayingWithNative();

/**
 * @title Tipping
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @custom:security-contact hello@idriss.xyz
 * @notice This is an IDriss Send utility contract for all supported chains.
 */
contract Tipping is
    Ownable,
    ReentrancyGuard,
    PublicGoodAttester,
    ITipping,
    MultiAssetSender,
    FeeCalculator
{
    mapping(address => bool) public admins;

    using SafeERC20 for IERC20;

    constructor(
        address _nativeUsdAggregator,
        address _sequencerAddress,
        uint256 _stalenessThreshold,
        int256 _fallbackPrice,
        uint256 _fallbackDecimals,
        address _eas,
        bytes32 _easSchema
    )
        FeeCalculator(
            _nativeUsdAggregator,
            _sequencerAddress,
            _stalenessThreshold,
            _fallbackPrice,
            _fallbackDecimals
        )
        PublicGoodAttester(_eas, _easSchema)
    {
        admins[msg.sender] = true;

        FEE_TYPE_MAPPING[AssetType.Native] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.ERC20] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC721] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC1155] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.SUPPORTED_ERC20] = FeeType.Percentage;
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

    modifier onlyAdmin() {
        if (admins[msg.sender] != true) {
            revert OnlyAdminMethod();
        }
        _;
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
        uint256 _tokenId,
        address _assetContractAddress
    ) internal returns (uint256 fee, uint256 value) {
        if (publicGoods[_recipient]) {
            if (SUPPORTS_EAS) {
                _attestDonor(
                    _recipient,
                    _assetContractAddress,
                    _amount,
                    _tokenId
                );
            }
        }
        (fee, value) = _splitPayment(_amount, _assetType, _recipient);
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
        (uint256 fee, uint256 paymentValue) = _beforeTransfer(
            AssetType.Native,
            _recipient,
            msg.value,
            0,
            address(0)
        );

        _sendCoin(_recipient, paymentValue);

        emit TipMessage(
            _recipient,
            _message,
            msg.sender,
            AssetType.Native,
            address(0),
            0,
            paymentValue,
            fee
        );
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
        uint256 amountIn = _sendERC20From(
            _amount,
            msg.sender,
            address(this),
            _tokenContractAddr
        );
        /** Case: ERC20, constant fee in native */
        AssetType assetType = AssetType.ERC20;
        // overwriting fee type for supported ERC20s
        if (supportedERC20[_tokenContractAddr]) {
            /** Case: SUPPORTED_ERC20, % fee of amountIn */
            assetType = AssetType.SUPPORTED_ERC20;
            if (msg.value > 0) revert PayingWithNative();
        }
        /** Case: ERC20: paymentValue calculated as with ERC721, ERC1155 */
        /** Case: SUPPORTED_ERC20: paymentValue (%) calculated as with Native */
        (uint256 fee, uint256 paymentValue) = _beforeTransfer(
            assetType,
            _recipient,
            amountIn,
            0,
            _tokenContractAddr
        );

        _sendERC20(paymentValue, _recipient, _tokenContractAddr);

        emit TipMessage(
            _recipient,
            _message,
            msg.sender,
            assetType,
            _tokenContractAddr,
            0,
            paymentValue,
            fee
        );
    }

    /**
     * @notice Send a tip in ERC721 token, charging a small fee
     * @notice Please note that this protocol does not support ERC721 with
     * non-standard interfaces and functionality.
     * Usage of such tokens may result in a loss of assets.
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
        (uint256 fee, ) = _beforeTransfer(
            AssetType.ERC721,
            _recipient,
            1,
            _tokenId,
            _nftContractAddress
        );

        _sendERC721(_tokenId, msg.sender, _recipient, _nftContractAddress);

        emit TipMessage(
            _recipient,
            _message,
            msg.sender,
            AssetType.ERC721,
            _nftContractAddress,
            _tokenId,
            1,
            fee
        );
    }

    /**
     * @notice Send a tip in ERC1155 token, charging a small fee
     * @notice Please note that this protocol does not support ERC1155 with
     * non-standard interfaces and functionality.
     * Usage of such tokens may result in a loss of assets.
     * @param _recipient The address of the recipient of the tip
     * @param _tokenId The ID of the ERC1155 token being sent as a tip
     * @param _amount The amount of the ERC1155 token being sent as a tip
     * @param _assetContractAddress The address of the ERC1155 token contract
     * @param _message The message accompanying the tip
     */
    function sendERC1155To(
        address _recipient,
        uint256 _tokenId,
        uint256 _amount,
        address _assetContractAddress,
        string memory _message
    ) external payable override nonReentrant {
        (uint256 fee, ) = _beforeTransfer(
            AssetType.ERC1155,
            _recipient,
            _amount,
            _tokenId,
            _assetContractAddress
        );

        _sendERC1155(
            _tokenId,
            _amount,
            msg.sender,
            _recipient,
            _assetContractAddress
        );

        emit TipMessage(
            _recipient,
            _message,
            msg.sender,
            AssetType.ERC1155,
            _assetContractAddress,
            _tokenId,
            _amount,
            fee
        );
    }

    /**
     * @notice Please note that this protocol does not support ERC20/721/1155 with
     * non-standard interfaces and functionality.
     * Usage of such tokens may result in a loss of assets.
     * @param calls BatchCall array with each entry representing one transaction
     */
    function batchSendTo(
        BatchCall[] calldata calls
    ) external payable nonReentrant {
        uint256 paymentValue;
        uint256 fee;
        uint256 msgValueUsed;
        uint256 msgFeeUsed;

        for (uint256 i; i < calls.length; i++) {
            AssetType assetType = calls[i].assetType;
            if (supportedERC20[calls[i].tokenAddress]) {
                assetType = AssetType.SUPPORTED_ERC20;
            }
            if (
                assetType == AssetType.ERC20 ||
                assetType == AssetType.SUPPORTED_ERC20
            ) {
                uint256 amountIn = _sendERC20From(
                    calls[i].amount,
                    msg.sender,
                    address(this),
                    calls[i].tokenAddress
                );
                (fee, paymentValue) = _beforeTransfer(
                    assetType,
                    calls[i].recipient,
                    amountIn,
                    calls[i].tokenId,
                    calls[i].tokenAddress
                );
                if (assetType == AssetType.ERC20) {
                    /** Fee is taken in native currency */
                    msgFeeUsed += fee;
                }
                _sendERC20(
                    paymentValue,
                    calls[i].recipient,
                    calls[i].tokenAddress
                );
            } else {
                (fee, paymentValue) = _beforeTransfer(
                    assetType,
                    calls[i].recipient,
                    calls[i].amount,
                    calls[i].tokenId,
                    calls[i].tokenAddress
                );
                if (assetType == AssetType.Native) {
                    _sendCoin(calls[i].recipient, paymentValue);
                    msgValueUsed += paymentValue;
                    msgFeeUsed += fee;
                } else if (
                    assetType == AssetType.ERC721 ||
                    assetType == AssetType.ERC1155
                ) {
                    /** Here, msg.value >= overall fee. Check if enough msg.value is sent is done below. */
                    if (assetType == AssetType.ERC721) {
                        _sendERC721(
                            calls[i].tokenId,
                            msg.sender,
                            calls[i].recipient,
                            calls[i].tokenAddress
                        );
                    } else {
                        _sendERC1155(
                            calls[i].tokenId,
                            calls[i].amount,
                            msg.sender,
                            calls[i].recipient,
                            calls[i].tokenAddress
                        );
                    }
                    msgFeeUsed += fee;
                } else {
                    revert UnsupportedAssetType();
                }
            }
            emit TipMessage(
                calls[i].recipient,
                calls[i].message,
                msg.sender,
                calls[i].assetType,
                calls[i].tokenAddress,
                calls[i].tokenId,
                paymentValue,
                fee
            );
        }
        if (msg.value < msgValueUsed + (msgFeeUsed*(100 - PAYMENT_FEE_SLIPPAGE_PERCENT) / 100)) {
            revert FeeHigherThanProvidedNativeCurrency(
                msgValueUsed,
                msgFeeUsed,
                msg.value
            );
        }
    }

    /**
     * Owner and trusted admin methods
     */

    /**
     * @notice Add admin with privileged access
     */
    function addAdmin(address _adminAddress) external override onlyOwner {
        admins[_adminAddress] = true;
    }

    /**
     * @notice Remove admin
     */
    function deleteAdmin(address _adminAddress) external override onlyOwner {
        delete admins[_adminAddress];
    }

    /**
     * @notice Add public goods address with privileged fee structure
     */
    function addPublicGood(address publicGoodAddress) external onlyAdmin {
        publicGoods[publicGoodAddress] = true;
    }

    /**
     * @notice Remove public goods address
     */
    function deletePublicGood(address publicGoodAddress) external onlyAdmin {
        delete publicGoods[publicGoodAddress];
    }

    /**
     * @notice Add supported erc20 address with percentage fee structure
     */
    function addSupportedERC20(address erc20Address) external onlyAdmin {
        supportedERC20[erc20Address] = true;
    }

    /**
     * @notice ERC20 returns to minimum amount fee structure
     */
    function deleteSupportedERC20(address erc20Address) external onlyAdmin {
        delete supportedERC20[erc20Address];
    }

    /**
     * @notice Add EAS support
     */
    function enableEASSupport(
        address _eas,
        bytes32 _easSchema
    ) public onlyOwner {
        _initializeEAS(_eas, _easSchema);
        SUPPORTS_EAS = true;
    }

    /**
     * @notice Disable EAS support
     */
    function disableEASSupport() public onlyOwner {
        SUPPORTS_EAS = false;
    }

    /**
     * @notice Add Chainlink support
     */
    function enableChainlinkSupport(
        address _nativeUsdAggregator,
        address _sequencerAddress,
        uint256 _stalenessThreshold
    ) public onlyOwner {
        _initializeChainlink(
            _nativeUsdAggregator,
            _sequencerAddress,
            _stalenessThreshold
        );
        SUPPORTS_CHAINLINK = true;
    }

    /**
     * @notice Disable Chainlink support
     */
    function disableChainlinkSupport() public onlyOwner {
        SUPPORTS_CHAINLINK = false;
        CHECK_SEQUENCER = false;
    }

    /**
     * Free for all withdraw methods
     */

    /**
     * @notice Withdraw native currency transfer fees to owner address
     */
    function withdraw() external override nonReentrant {
        (bool success, ) = owner().call{value: address(this).balance}("");
        if (!success) {
            revert WithdrawFailed();
        }
    }

    /**
     * @notice Withdraw ERC20 transfer fees
     */
    function withdrawToken(
        address _tokenContract
    ) external override nonReentrant {
        IERC20 withdrawTC = IERC20(_tokenContract);
        withdrawTC.safeTransfer(owner(), withdrawTC.balanceOf(address(this)));
    }

    /*
     * @notice Always reverts. By default Ownable supports renouncing ownership, that is setting owner to address 0.
     *         However in this case it would disallow receiving payment fees by anyone.
     */
    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipNotAllowed();
    }
}
 