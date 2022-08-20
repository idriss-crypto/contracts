// SPDX-License-Identifier: MIT
pragma solidity 0.8.7; 
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract payments {

    using SafeMath for uint256;
    mapping(string => uint256) percent;
    mapping(address => bool) private admins;
    address public contractOwner = msg.sender; 
    mapping(bytes32 => address) public receipts;
    mapping(bytes32 => uint256) public amounts;
    mapping(address => uint256) public balanceOf; 
    mapping(string => address) public delegate;

    constructor() {
        delegate["IDriss"] = contractOwner;
        percent["IDriss"] = 100;
    }

    event PaymentDone(address payer, uint256 amount, bytes32 paymentId_hash, string IDrissHash, uint256 date);
    event AdminAdded(address indexed admin);
    event AdminDeleted(address indexed admin);
    event DelegateAdded(string delegateHandle, address indexed delegateAddress);
    event DelegateDeleted(string delegateHandle, address indexed delegateAddress);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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

    function addDelegateException(address delegateAddress, string memory delegateHandle, uint256 percentage) external {
        require(msg.sender == contractOwner, "Only contractOwner can add special delegate partner.");
        require(delegate[delegateHandle] == address(0), "Delegate handle exists.");
        require(delegateAddress != address(0), "Ownable: delegateAddress is the zero address.");
        delegate[delegateHandle] = delegateAddress;
        percent[delegateHandle] = percentage;
        emit DelegateAdded(delegateHandle, delegateAddress);
    }

    // Anyone can create a delegate link for anyone
    function addDelegate(address delegateAddress, string memory delegateHandle) external {
        require(delegate[delegateHandle] == address(0), "Delegate handle exists.");
        require(delegateAddress != address(0), "Ownable: delegateAddress is the zero address.");
        delegate[delegateHandle] = delegateAddress;
        percent[delegateHandle] = 20;
        emit DelegateAdded(delegateHandle, delegateAddress);
    }

    // Delete the delegation link if needed.
    function deleteDelegate(string memory delegateHandle) external {
        require(msg.sender == delegate[delegateHandle], "Only delegate can delete delegation link.");
        address deletedDelegate = delegate[delegateHandle];
        delete delegate[delegateHandle];
        delete percent[delegateHandle];
        emit DelegateDeleted(delegateHandle, deletedDelegate);
    }

    // Payment function distributing the payment into two balances.
    function payNative(bytes32 paymentId_hash, string memory IDrissHash, string memory delegateHandle) external payable {
        require(receipts[paymentId_hash] == address(0), "Already paid this receipt.");
        receipts[paymentId_hash] = msg.sender;
        amounts[paymentId_hash] = msg.value;
        if (delegate[delegateHandle] != address(0)) {
            balanceOf[contractOwner] += msg.value.sub((msg.value.mul(percent[delegateHandle])).div(100));
            balanceOf[delegate[delegateHandle]] += (msg.value.mul(percent[delegateHandle])).div(100);
        } else {
            balanceOf[contractOwner] += msg.value;
        }
        emit PaymentDone(receipts[paymentId_hash], amounts[paymentId_hash], paymentId_hash, IDrissHash, block.timestamp);
    }

    // Anyone can withraw funds to any participating delegate
    function withdraw(uint256 amount, string memory delegateHandle) external returns (bytes memory) {
        require(amount <= balanceOf[delegate[delegateHandle]]);
        balanceOf[delegate[delegateHandle]] -= amount;
        (bool sent, bytes memory data) = delegate[delegateHandle].call{value: amount, gas: 40000}("");
        require(sent, "Failed to  withdraw");
        return data;
    }

    // commit payment hash creation
    function hashReceipt(string memory receiptId, address paymAddr) public pure returns (bytes32) {
        return keccak256(abi.encode(receiptId, paymAddr));
    }

    // reveal payment hash
    function verifyReceipt(string memory receiptId, address paymAddr) public view returns (bool) {
        require(receipts[hashReceipt(receiptId, paymAddr)] == paymAddr);
        return true;
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
        delegate["IDriss"] = newOwner;
        // set balance of new owner
        balanceOf[newOwner] = ownerAmount;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
