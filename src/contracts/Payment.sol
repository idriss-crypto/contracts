// SPDX-License-Identifier: MIT
pragma solidity 0.8.19; 

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

error AlreadyPaidThisReceipt();
error WithdrawFailed();
error RenounceOwnershipNotAllowed();

/**
 * @title Payment
 * @author Levertz <levertz@idriss.xzy>
 * @custom:security-contact hello@idriss.xyz
 * @notice This is an IDriss Registry payment contract for all supported chains.
 */
contract Payment is Ownable {

    mapping(bytes32 => address) public receipts;
    mapping(bytes32 => uint256) public amounts;
    mapping(string => bytes32) public IDrissHashes;

    // Event emitted when a payment is made
    event PaymentDone(address payer, uint256 amount, bytes32 paymentId_hash, string IDrissHash);

    /**
     * @notice Make a payment using native currency.
     * @param paymentId_hash The hash of the payment ID.
     * @param IDrissHash The IDriss hash associated with the payment.
     */
    function payNative(bytes32 paymentId_hash, string calldata IDrissHash) external payable {
        if (receipts[paymentId_hash] != address(0)) {
            revert AlreadyPaidThisReceipt();
        }
        receipts[paymentId_hash] = msg.sender;
        amounts[paymentId_hash] = msg.value;
        IDrissHashes[IDrissHash] = paymentId_hash;
        emit PaymentDone(msg.sender, msg.value, paymentId_hash, IDrissHash);
    }

    /**
     * @notice Withdraw native currency transfer fees to the owner's address.
     */
    function withdraw() external {
        (bool success, ) = owner().call{value: address(this).balance}("");
        if (!success) {
            revert WithdrawFailed();
        }
    }

    /**
     * @notice Create a hash for a receipt.
     * @param receiptId The ID of the receipt.
     * @param paymAddr The address of the payer.
     * @return bytes32 The hash of the receipt.
     */
    function hashReceipt(string memory receiptId, address paymAddr) public pure returns (bytes32) {
        return keccak256(abi.encode(receiptId, paymAddr));
    }

    /**
     * @notice Verify if a receipt belongs to a given payer.
     * @param receiptId The ID of the receipt.
     * @param paymAddr The address of the payer.
     * @return bool True if the receipt belongs to the payer, false otherwise.
     */
    function verifyReceipt(string memory receiptId, address paymAddr) public view returns (bool) {
        require(receipts[hashReceipt(receiptId, paymAddr)] == paymAddr);
        return true;
    }

    /**
     * @notice Verify the owner of a receipt using the receipt ID and IDriss hash.
     * @param receiptId The ID of the receipt.
     * @param IDrissHash The IDriss hash associated with the receipt.
     * @return address The address of the receipt owner, or address(0) if verification fails.
     */
    function verifyReceiptOwner(string memory receiptId, string memory IDrissHash) public view returns (address) {
        bytes32 receiptHash = IDrissHashes[IDrissHash];
        address ownerTemp = receipts[receiptHash];
        if (verifyReceipt(receiptId, ownerTemp)) {
            return ownerTemp;
        }
        return address(0);
    }

    /**
     * @notice Always reverts. By default, Ownable supports renouncing ownership, 
     *         that is setting owner to address 0. However, in this case, 
     *         it would disallow receiving payment fees by anyone.
     */
    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipNotAllowed();
    }
}
