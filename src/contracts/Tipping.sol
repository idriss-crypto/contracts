// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./interfaces/ITipping.sol";
import "./libs/MultiAssetSender.sol";
import "./libs/FeeCalculator.sol";

import { AssetType, FeeType } from "./enums/IDrissEnums.sol";

error tipping__withdraw__OnlyAdminCanWithdraw();

/**
 * @title Tipping
 * @author Lennard (lennardevertz)
 * @custom:contributor Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @notice Tipping is a helper smart contract used for IDriss social media tipping functionality
 */
contract Tipping is Ownable, ITipping, MultiAssetSender, FeeCalculator, IERC165 {
    address public contractOwner;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public admins;

    event TipMessage(
        address indexed recipientAddress,
        string message,
        address sender,
        address tokenAddress
    );

    constructor(address _maticUsdAggregator) FeeCalculator(_maticUsdAggregator) {
        admins[msg.sender] = true;

        FEE_TYPE_MAPPING[AssetType.Coin] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.Token] = FeeType.Percentage;
        FEE_TYPE_MAPPING[AssetType.NFT] = FeeType.Constant;
        FEE_TYPE_MAPPING[AssetType.ERC1155] = FeeType.Constant;
    }

    /**
     * @notice Send native currency tip, charging a small fee
     */
    function sendTo(address _recipient, string memory _message) external payable override {
        (uint256 fee, uint256 paymentValue) = _splitPayment(msg.value, AssetType.Coin);
        _sendCoin(_recipient, paymentValue);

        emit TipMessage(_recipient, _message, msg.sender, address(0));
    }

    /**
     * @notice Send a tip in ERC20 token, charging a small fee
     */
    function sendTokenTo(
        address _recipient,
        uint256 _amount,
        address _tokenContractAddr,
        string memory _message
    ) external payable override {
        IERC20 paymentTc = IERC20(_tokenContractAddr);
        require(
            paymentTc.allowance(msg.sender, address(this)) >= _amount,
            "Insufficient Allowance"
        );

        require(
            paymentTc.transferFrom(msg.sender, address(this), _amount),
            "Transfer failed"
        );

        require(
            paymentTc.transfer(_recipient, _amount - (_amount / 100)),
            "Transfer failed"
        );

        emit TipMessage(_recipient, _message, msg.sender, _tokenContractAddr);
    }

    /**
     * @notice Withdraw native currency transfer fees
     */
    function withdraw() external override onlyAdminCanWithdraw {
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
    {
        IERC20 withdrawTC = IERC20(_tokenContract);
        withdrawTC.transfer(msg.sender, withdrawTC.balanceOf(address(this)));
    }

    /**
     * @notice Add admin with priviledged access
     */
    function addAdmin(address _adminAddress)
        external
        override
        onlyOwner
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
    {
        admins[_adminAddress] = false;
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