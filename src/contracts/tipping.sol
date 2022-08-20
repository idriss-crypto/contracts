// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error tipping__withdraw__OnlyAdminCanWithdraw();
error tipping__withdrawToken__OnlyAdminCanWithdrawToken();
error tipping__addAdmin__OnlyContractOwnerCanAddAdmins();
error tipping__deleteAdmin__OnlyContractOwnerCanDeleteAdmins();
error tipping__transferContractOwnership__OnlyContractOwnerCanChangeOwnership();


contract Tipping {
    using SafeMath for uint256;
    address public contractOwner;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public admins;

    constructor () {
        contractOwner = msg.sender;
    }

    event TipMessage(
        address indexed recipientAddress,
        string message,
        address sender,
        address tokenAddress
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    function sendTo(address _recipient, string memory _message) public payable {
        (bool success, ) = _recipient.call{
            value: msg.value.sub(msg.value.div(100))
        }("");
        require(success, "Failed to send.");
        emit TipMessage(_recipient, _message, msg.sender, address(0));
    }

    function sendTokenTo(
        address _recipient,
        uint256 _amount,
        address _tokenContractAddr,
        string memory _message
    ) public payable {
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
            paymentTc.transfer(_recipient, _amount.sub(_amount.div(100))),
            "Transfer failed"
        );

        emit TipMessage(_recipient, _message, msg.sender, _tokenContractAddr);
    }

    function withdraw() external OnlyAdminCanWithdraw {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Failed to withdraw.");
    }

    modifier OnlyAdminCanWithdraw() {
        if (admins[msg.sender] != true) {
            revert tipping__withdraw__OnlyAdminCanWithdraw();
        }
        _;
    }

    function withdrawToken(address _tokenContract)
        external
        OnlyAdminCanWithdrawToken
    {
        IERC20 withdrawTC = IERC20(_tokenContract);
        withdrawTC.transfer(msg.sender, withdrawTC.balanceOf(address(this)));
    }

    modifier OnlyAdminCanWithdrawToken() {
        if (admins[msg.sender] != true) {
            revert tipping__withdrawToken__OnlyAdminCanWithdrawToken();
        }
        _;
    }

    function addAdmin(address _adminAddress)
        external
        OnlyContractOwnerCanAddAdmins
    {
        admins[_adminAddress] = true;
    }

    modifier OnlyContractOwnerCanAddAdmins() {
        if (msg.sender != contractOwner) {
            revert tipping__addAdmin__OnlyContractOwnerCanAddAdmins();
        }
        _;
    }

    function deleteAdmin(address _adminAddress)
        external
        OnlyContractOwnerCanDeleteAdmins
    {
        admins[_adminAddress] = false;
    }

    modifier OnlyContractOwnerCanDeleteAdmins() {
        if (msg.sender != contractOwner) {
            revert tipping__deleteAdmin__OnlyContractOwnerCanDeleteAdmins();
        }
        _;
    }

    // Transfer contract ownership
    function transferContractOwnership(address _newOwner)
        public
        OnlyContractOwnerCanChangeOwnership
    {
        require(
            _newOwner != address(0),
            "Ownable: new contractOwner is the zero address."
        );
        _transferOwnership(_newOwner);
    }

    modifier OnlyContractOwnerCanChangeOwnership() {
        if (msg.sender != contractOwner) {
            revert tipping__transferContractOwnership__OnlyContractOwnerCanChangeOwnership();
        }
        _;
    }

    // Helper function
    function _transferOwnership(address _newOwner) internal virtual {
        address oldOwner = contractOwner;
        contractOwner = _newOwner;
        emit OwnershipTransferred(oldOwner, _newOwner);
    }
}