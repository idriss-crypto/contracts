// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import { ITipping } from "../interfaces/ITipping.sol";
import { MultiAssetSender } from "./MultiAssetSender.sol";
import { FeeCalculator } from "./FeeCalculator.sol";
import { PublicGoodAttester } from "./Attestation.sol";
import { Batchable } from "./Batchable.sol";

import { AssetType, FeeType } from "../enums/IDrissEnums.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error OnlyAdminCanWithdraw();
error UnknownFunctionSelector();

abstract contract TippingCore is Ownable, ReentrancyGuard, ITipping, MultiAssetSender, FeeCalculator, Batchable {
    mapping(address => bool) public admins;
    mapping(address => bool) public publicGoods;

    using SafeERC20 for IERC20;

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
     * Abstract methods to be overwritten
    */

    function _beforeTransfer(
        AssetType _assetType,
        address _recipient,
        uint256 _amount,
        uint256 _assetId,
        address _assetContractAddress
        ) internal virtual returns (uint256 fee, uint256 value);

    function _afterTransfer(
        AssetType _assetType,
        address _recipient,
        uint256 _amount,
        uint256 _assetId,
        address _assetContractAddress
        ) internal virtual;


    /**
     * Tipping methods
    */


    /**
     * @notice Send native currency tip, charging a small fee
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

        (uint256 fee, uint256 paymentValue) = _beforeTransfer(AssetType.ERC20, _recipient, amountIn, 0, _tokenContractAddr);

        _sendTokenAsset(paymentValue, _recipient, _tokenContractAddr);

        _afterTransfer(AssetType.ERC20, _recipient, amountIn, 0, _tokenContractAddr);

        emit TipMessage(_recipient, _message, msg.sender, _tokenContractAddr, paymentValue, fee);
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

        (uint256 fee,) = _beforeTransfer(AssetType.ERC721, _recipient, msg.value, _tokenId, _nftContractAddress);

        _sendNFTAsset(_tokenId, msg.sender, _recipient, _nftContractAddress);

        _afterTransfer(AssetType.ERC721, _recipient, msg.value, _tokenId, _nftContractAddress);

        emit TipMessage(_recipient, _message, msg.sender, _nftContractAddress, msg.value, fee);
    }

    /**
     * @notice Send a tip in ERC1155 token, charging a small $ fee
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
     * @notice Withdraw native currency transfer fees
     */
    function withdraw() external override onlyAdminCanWithdraw nonReentrant {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Failed to withdraw.");
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
     * Batch methods -> delete
    */

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
            revert UnknownFunctionSelector();
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

}

