// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7; 

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

error Payments__OnlyContractOwnerCanAddAdmins();
error Payments__OnlyContractOwnerCanDeleteAdmins();
error Payments__OnlyContractOwnerCanAddSpecialDelegatePartner();
error Payments__DelegateHandleExists();
error Payments__Ownable_DelegateAddressIsTheZeroAddress();
error Payments__OnlyDelegateCanDeleteDelegationLink();
error Payments__AlreadyPaidThisReceipt();
error Payments__OnlyContractOwnerCanChangeOwnershipOfContract();
error Payments__Ownable_NewContractOwnerIsTheZeroAddress();

contract payments {

    using SafeMath for uint256;
    address public contractOwner = msg.sender; 
    mapping(string => uint256) percent;
    mapping(address => bool) private admins;
    mapping(address => uint256) public balanceOf; 
    mapping(bytes32 => address) public receipts;
    mapping(bytes32 => uint256) public amounts;
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
        if(msg.sender != contractOwner) { revert Payments__OnlyContractOwnerCanAddAdmins(); }
        admins[adminAddress] = true;
        emit AdminAdded(adminAddress);
    }

    function deleteAdmin(address adminAddress) external {
        if(msg.sender != contractOwner) { revert Payments__OnlyContractOwnerCanDeleteAdmins(); }
        admins[adminAddress] = false;
        emit AdminDeleted(adminAddress);
    }

    function addDelegateException(address delegateAddress, string calldata delegateHandle, uint256 percentage) external {
        if(msg.sender != contractOwner){revert Payments__OnlyContractOwnerCanAddSpecialDelegatePartner();}
        if(delegate[delegateHandle] != address(0)){revert Payments__DelegateHandleExists();}
        if(delegateAddress == address(0)){revert Payments__Ownable_DelegateAddressIsTheZeroAddress();}
        delegate[delegateHandle] = delegateAddress;
        percent[delegateHandle] = percentage;
        emit DelegateAdded(delegateHandle, delegateAddress);
    }

    // Anyone can create a delegate link for anyone
    function addDelegate(address delegateAddress, string calldata delegateHandle) external {
        if(delegate[delegateHandle] != address(0)){revert Payments__DelegateHandleExists();}
        if(delegateAddress == address(0)){revert Payments__Ownable_DelegateAddressIsTheZeroAddress();}
        delegate[delegateHandle] = delegateAddress;
        percent[delegateHandle] = 20;
        emit DelegateAdded(delegateHandle, delegateAddress);
    }

    // Delete the delegation link if needed.
    function deleteDelegate(string calldata delegateHandle) external {
        if(msg.sender != delegate[delegateHandle]){revert Payments__OnlyDelegateCanDeleteDelegationLink();}
        address deletedDelegate = delegate[delegateHandle];
        delete delegate[delegateHandle];
        delete percent[delegateHandle];
        emit DelegateDeleted(delegateHandle, deletedDelegate);
    }

    // Payment function distributing the payment into two balances.
    function payNative(bytes32 paymentId_hash, string calldata IDrissHash, string calldata delegateHandle) external payable {
        if(receipts[paymentId_hash] != address(0)){revert Payments__AlreadyPaidThisReceipt();}
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
    function withdraw(uint256 amount, string calldata delegateHandle) external returns (bytes memory) {
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
        if(msg.sender != contractOwner){revert Payments__OnlyContractOwnerCanChangeOwnershipOfContract();}
        if(newOwner == address(0)){revert Payments__Ownable_NewContractOwnerIsTheZeroAddress();}
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