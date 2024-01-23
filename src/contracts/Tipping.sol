// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {ITipping} from "./interfaces/ITipping.sol";
import {MultiAssetSender} from "./libs/MultiAssetSender.sol";
import {FeeCalculator} from "./libs/FeeCalculator.sol";
import {PublicGoodAttester} from "./libs/Attestation.sol";

import {AssetType, FeeType} from "./enums/IDrissEnums.sol";
import {BatchCall} from "./structs/IDrissStructs.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error OnlyAdminCanWithdraw();
error UnknownFunctionSelector();
error WithdrawFailed();
error RenounceOwnershipNotAllowed();
error FeeHigherThanProvidedNativeCurrency();
error UnsupportedAssetType();
error PayingWithNative();

/**
 * @title Tipping
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
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
    bool immutable SUPPORTS_CHAINLINK;
    bool immutable SUPPORTS_EAS;
    mapping(address => bool) public admins;

    using SafeERC20 for IERC20;

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

    function _getMinimumFee() internal view override returns (uint256) {
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
        uint256 _tokenId,
        address _assetContractAddress
    ) internal returns (uint256 fee, uint256 value) {
        if (publicGoods[_recipient]) {
            if (SUPPORTS_EAS) {
                _attestDonor(_recipient, _assetContractAddress, _amount, _tokenId);
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
        uint256 amountOut;
        uint256 amountIn = _sendERC20From(
            _amount,
            msg.sender,
            address(this),
            _tokenContractAddr
        );
        /** Case: ERC20, constant fee in native */
        uint256 amountToCheck = msg.value;
        AssetType assetType = AssetType.ERC20;

        // overwriting fee type for supported erc20s
        if (supportedERC20[_tokenContractAddr]) {
            /** Case: SUPPORTED_ERC20, % fee of amountIn */
            assetType = AssetType.SUPPORTED_ERC20;
            amountToCheck = amountIn;
            if (msg.value > 0) revert PayingWithNative();
        }
        /** Case: ERC20: paymentValue calculated as with ERC721, ERC1155 */
        /** Case: SUPPORTED_ERC20: paymentValue (%) calculated as with Native */
        (uint256 fee, uint256 paymentValue) = _beforeTransfer(
            assetType,
            _recipient,
            amountToCheck,
            0,
            _tokenContractAddr
        );

        if (assetType == AssetType.SUPPORTED_ERC20) {
            amountOut = paymentValue;
        } else {
            amountOut = amountIn;
        }

        _sendERC20(amountOut, _recipient, _tokenContractAddr);

        emit TipMessage(
            _recipient,
            _message,
            msg.sender,
            assetType,
            _tokenContractAddr,
            0,
            amountOut,
            fee
        );
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
        (uint256 fee, ) = _beforeTransfer(
            AssetType.ERC721,
            _recipient,
            msg.value,
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
            msg.value,
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
     * @notice Please note that this protocol does not support tokens with
     * non-standard ERC20 interfaces and functionality,
     * such as tokens with rebasing functionality or fee-on-transfer token.
     * Usage of such tokens may result in a loss of assets.
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
            if (supportedERC20[calls[i].tokenAddress])
                assetType = AssetType.SUPPORTED_ERC20;
            if (assetType == AssetType.Native) {
                (fee, paymentValue) = _beforeTransfer(
                    assetType,
                    calls[i].recipient,
                    calls[i].amount,
                    0,
                    address(0)
                );
                _sendCoin(calls[i].recipient, paymentValue);
                msgValueUsed += paymentValue;
                msgFeeUsed += fee;
            } else if (
                assetType == AssetType.ERC20 ||
                assetType == AssetType.SUPPORTED_ERC20
            ) {
                uint256 amountIn = _sendERC20From(
                    calls[i].amount,
                    msg.sender,
                    address(this),
                    calls[i].tokenAddress
                );
                if (assetType == AssetType.ERC20) {
                    /** ToDo check: Purposefully use msg.value. Here, msg.value can much bigger than overall fee, so the fee calculation should not throw an error. Fee error thrown below. */
                    (fee, ) = _beforeTransfer(
                        assetType,
                        calls[i].recipient,
                        msg.value,
                        0,
                        calls[i].tokenAddress
                    );
                    /** forward 100% of incoming token, as fee is taken in native currency */
                    msgFeeUsed += fee;
                    paymentValue = amountIn;
                } else {
                    (, paymentValue) = _beforeTransfer(
                        assetType,
                        calls[i].recipient,
                        amountIn,
                        0,
                        calls[i].tokenAddress
                    );
                }
                _sendERC20(
                    paymentValue,
                    calls[i].recipient,
                    calls[i].tokenAddress
                );
            } else if (
                assetType == AssetType.ERC721 || assetType == AssetType.ERC1155
            ) {
                /** ToDo check: Purposefully use msg.value. Here, msg.value can much bigger than overall fee, so the fee calculation should not throw an error. Fee error thrown below. */
                (fee, ) = _beforeTransfer(
                    assetType,
                    calls[i].recipient,
                    msg.value,
                    calls[i].tokenId,
                    calls[i].tokenAddress
                );
                if (assetType == AssetType.ERC721) {
                    paymentValue = 1;
                    _sendERC721(
                        calls[i].tokenId,
                        msg.sender,
                        calls[i].recipient,
                        calls[i].tokenAddress
                    );
                } else {
                    paymentValue = calls[i].amount;
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

        if (msgValueUsed + msgFeeUsed < msg.value) {
            revert FeeHigherThanProvidedNativeCurrency();
        }
    }

    /**
     * Trusted admin methods
     */

    /**
     * @notice Add admin with privileged access
     */
    function addAdmin(
        address _adminAddress
    ) external override onlyOwner nonReentrant {
        admins[_adminAddress] = true;
    }

    /**
     * @notice Remove admin
     */
    function deleteAdmin(
        address _adminAddress
    ) external override onlyOwner nonReentrant {
        delete admins[_adminAddress];
    }

    /**
     * @notice Add public goods address with privileged fee structure
     */
    function addPublicGood(
        address publicGoodAddress
    ) external onlyOwner nonReentrant {
        publicGoods[publicGoodAddress] = true;
    }

    /**
     * @notice Remove public goods address
     */
    function deletePublicGood(
        address publicGoodAddress
    ) external onlyOwner nonReentrant {
        delete publicGoods[publicGoodAddress];
    }

    /**
     * @notice Add supported erc20 address with percentage fee structure
     */
    function addSupportedERC20(
        address erc20Address
    ) external onlyOwner nonReentrant {
        supportedERC20[erc20Address] = true;
    }

    /**
     * @notice ERC20 returns to minimum amount fee structure
     */
    function deleteSupportedERC20(
        address erc20Address
    ) external onlyOwner nonReentrant {
        delete supportedERC20[erc20Address];
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
    function withdrawToken(
        address _tokenContract
    ) external override onlyAdminCanWithdraw nonReentrant {
        IERC20 withdrawTC = IERC20(_tokenContract);
        withdrawTC.safeTransfer(
            msg.sender,
            withdrawTC.balanceOf(address(this))
        );
    }

    /*
     * @notice Always reverts. By default Ownable supports renouncing ownership, that is setting owner to address 0.
     *         However in this case it would disallow receiving payment fees by anyone.
     */
    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipNotAllowed();
    }
}
