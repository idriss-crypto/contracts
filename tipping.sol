// SPDX-License-Identifier: MIT
pragma solidity 0.8.1; 
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

interface ERC20 {
    function balanceOf(address _tokenOwner) external view returns (uint balance);
    function transfer(address _to, uint _tokens) external returns (bool success);
    function allowance(address _contract, address _spender) external view returns (uint256 remaining);
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool success);
}
 

contract tipping {

    using SafeMath for uint256;
    address public contractOwner = msg.sender;  
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public admins; 

    event TipMessage(address indexed recipientAddress, string message, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function sendTo(address recipient_, string memory message_) public payable {
        (bool success, ) = recipient_.call{value: msg.value.sub(msg.value.div(100))}("");
        require(success, "Failed to send.");
        emit TipMessage(recipient_, message_, msg.value);
    }

    function sendTokenTo(address recipient_, uint256 amount_, address tokenContractAddr_, string memory message_) public payable {
        ERC20 paymentTc = ERC20(tokenContractAddr_);
        require(paymentTc.allowance(msg.sender, address(this)) >= amount_, "Insufficient Allowance");
        require(paymentTc.transferFrom(msg.sender, address(this), amount_), "Transfer failed");
        require(paymentTc.transfer(recipient_, amount_.sub(amount_.div(100))), "Transfer failed");
        emit TipMessage(recipient_, message_, amount_);
    }

    function withdraw() external {
        require(admins[msg.sender] == true, "Only admin can withdraw.");
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Failed to withdraw.");
    }

    function withdrawToken(address tokenContract) external {
        require(admins[msg.sender] == true, "Only admin can withdraw.");
        ERC20 withdrawTC = ERC20(tokenContract);
        withdrawTC.transfer(msg.sender, withdrawTC.balanceOf(address(this)));
    }

    function addAdmin(address adminAddress) external {
        require(msg.sender == contractOwner, "Only contractOwner can add admins.");
        admins[adminAddress] = true;
    }

    function deleteAdmin(address adminAddress) external {
        require(msg.sender == contractOwner, "Only contractOwner can delete admins.");
        admins[adminAddress] = false;
    }

    // Transfer contract ownership
    function transferContractOwnership(address newOwner) public payable {
        require(msg.sender == contractOwner, "Only contractOwner can change ownership of contract.");
        require(newOwner != address(0), "Ownable: new contractOwner is the zero address.");
        _transferOwnership(newOwner);
    }

    // Helper function
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = contractOwner;
        contractOwner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
