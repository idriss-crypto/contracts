// SPDX-License-Identifier: MIT
pragma solidity 0.8.1; 
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract payments {
    using SafeMath for uint256;
    mapping(string => uint256) percent;
    mapping(address => bool) private admins;
    address public contractOwner = msg.sender; 
    mapping(uint256 => address) public receipts;
    mapping(uint256 => uint256) public amounts;
    mapping(uint256 => string) public paymentType;
    mapping(address => uint256) public balanceOf; 
    mapping(string => address) public delegationOwner;
    mapping(string => address) public delegationWithdrawAddress;

    constructor() {
        delegationOwner["IDriss"] = contractOwner;
        delegationWithdrawAddress["IDriss"] = 0xc62d0142c91Df69BcdfC13954a87d6Fe1DdfdEd6;
        percent["IDriss"] = 100;
    }

    event PaymentDone(address payer, uint256 amount, string token, uint256 paymentId, uint256 date);
    event AdminAdded(address indexed admin);
    event AdminDeleted(address indexed admin);
    event DelegateAdded(string delegateHandle, address indexed delegateAddress);
    event DelegateDeleted(string delegateHandle, address indexed delegateAddress);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WithdrawAddressChanged(string delegateHandle, address indexed newWithdrawAddress);

    function addAdmin(address adminAddress) external {
        require(msg.sender == contractOwner, "Only contractOwner can add admins.");
        admins[adminAddress] = true;
        emit AdminAdded(adminAddress);
    }

    function deleteAdmin(address adminAddress) external {
        require(msg.sender == contractOwner, "Only contractOwner can delete admins.");
        admins[adminAddress] = false;
        emit AdminDeleted(adminAddress);
    }

    function addDelegateException(address delegateAddress, address delegateWithdrawAddress, string memory delegateHandle, uint256 percentage) external {
        require(msg.sender == contractOwner, "Only contractOwner can add special delegate partner.");
        require(delegationOwner[delegateHandle] == address(0), "Delegate handle exists.");
        require(delegateWithdrawAddress != address(0), "Ownable: delegateWithdrawAddress is the zero address.");
        require(delegateAddress != address(0), "Ownable: delegateAddress is the zero address.");
        delegationOwner[delegateHandle] = delegateAddress;
        delegationWithdrawAddress[delegateHandle] = delegateWithdrawAddress;
        percent[delegateHandle] = percentage;
        emit DelegateAdded(delegateHandle, delegateAddress);
    }

    // Anyone can create a delegate link for anyone
    function addDelegate(address delegateAddress, address delegateWithdrawAddress, string memory delegateHandle) external {
        require(delegationOwner[delegateHandle] == address(0), "Delegate handle exists.");
        require(delegateWithdrawAddress != address(0), "Ownable: delegateWithdrawAddress is the zero address.");
        require(delegateAddress != address(0), "Ownable: delegateAddress is the zero address.");
        delegationOwner[delegateHandle] = delegateAddress;
        delegationWithdrawAddress[delegateHandle] = delegateWithdrawAddress;
        percent[delegateHandle] = 15; // TBD
        emit DelegateAdded(delegateHandle, delegateAddress);
    }

    // Delete the delegation link if needed.
    function deleteDelegate(string memory delegateHandle) external {
        require(msg.sender == delegationOwner[delegateHandle], "Only delegateOwner can delete delegation link.");
        address deletedDelegate = delegationOwner[delegateHandle];
        delete delegationOwner[delegateHandle];
        delete delegationWithdrawAddress[delegateHandle];
        delete percent[delegateHandle];
        emit DelegateDeleted(delegateHandle, deletedDelegate);
    }

    // Change the withdraw address for a delegate (change of treasury, ...).
    function changeWithdrawAddress(string memory delegateHandle, address newWithdrawAddress) external {
        require(msg.sender == delegationOwner[delegateHandle], "Only delegateOwner can change withdraw address.");
        delegationWithdrawAddress[delegateHandle] = newWithdrawAddress;
        emit WithdrawAddressChanged(delegateHandle, newWithdrawAddress);
    }

    // Payment function distributing the payment into two balances.
    function payNative(uint256 paymentId, string memory delegateHandle) external payable {
        require(receipts[paymentId] == address(0), "Already paid this receipt.");
        receipts[paymentId] = msg.sender;
        amounts[paymentId] = msg.value;
        paymentType[paymentId] = "MATIC";
        if (delegationOwner[delegateHandle] != address(0)) {
            balanceOf[contractOwner] += msg.value.sub((msg.value.mul(percent[delegateHandle])).div(100));
            balanceOf[delegationOwner[delegateHandle]] += (msg.value.mul(percent[delegateHandle])).div(100);
        } else {
            balanceOf[contractOwner] += msg.value;
        }
        emit PaymentDone(receipts[paymentId], amounts[paymentId], paymentType[paymentId], paymentId, block.timestamp);
    }

    // Anyone can withraw funds to any participating delegate
    function withdraw(uint256 amount, string memory delegateHandle) external returns (bytes memory) {
        require(amount <= balanceOf[delegationOwner[delegateHandle]]);
        balanceOf[delegationOwner[delegateHandle]] -= amount;
        (bool sent, bytes memory data) = delegationWithdrawAddress[delegateHandle].call{value: amount, gas: 40000}("");
        require(sent, "Failed to  withdraw");
        return data;
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
        // transfer balance of old owner to new owner
        uint256 ownerAmount = balanceOf[oldOwner];
        // delete balance of old owner
        balanceOf[oldOwner] = 0;
        contractOwner = newOwner;
        // set new owner
        delegationOwner["IDriss"] = newOwner;
        // set balance of new owner
        balanceOf[newOwner] = ownerAmount;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
