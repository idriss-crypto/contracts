// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ITipping} from "../interfaces/ITipping.sol";
import {BatchCall} from "../structs/IDrissStructs.sol";
import {AssetType} from "../enums/IDrissEnums.sol";

/**
 * @title MockAttacker
 * @notice mock attacker
 * custom:experimental used only as a mock for tests
 */
contract MockAttacker {
    ITipping public tippingContract;

    enum FunctionToAttack {
        initialFund,
        sendNativeTo,
        batchSendTo,
        withdrawNonReentrant,
        withdrawFailed
    }
    FunctionToAttack private functionToAttack;

    constructor(address _tippingContractAddress) {
        tippingContract = ITipping(_tippingContractAddress);
    }

    function setFunctionToAttack(FunctionToAttack _functionToAttack) public {
        functionToAttack = _functionToAttack;
    }

    // add address(this) as public good and owner for mock testing purposes
    function attack() external {
        if (functionToAttack == FunctionToAttack.sendNativeTo) {
            tippingContract.sendNativeTo{value: 100}(address(this), "");
        } else if (functionToAttack == FunctionToAttack.batchSendTo) {
            BatchCall[] memory testCall = new BatchCall[](1);
            testCall[0] = BatchCall({
                assetType: AssetType.Native,
                recipient: address(this),
                amount: 100,
                tokenId: 0,
                tokenAddress: address(0),
                message: ""
            });
            tippingContract.batchSendTo(testCall);
        } else if (functionToAttack == FunctionToAttack.withdrawNonReentrant) {
            tippingContract.withdraw();
        } else if (functionToAttack == FunctionToAttack.withdrawFailed) {
            tippingContract.withdraw();
        }
    }

    receive() external payable {
        if (functionToAttack == FunctionToAttack.sendNativeTo) {
            tippingContract.sendNativeTo{value: 100}(address(this), "");
        } else if (functionToAttack == FunctionToAttack.batchSendTo) {
            BatchCall[] memory testCall = new BatchCall[](1);
            testCall[0] = BatchCall({
                assetType: AssetType.Native,
                recipient: address(this),
                amount: 100,
                tokenId: 0,
                tokenAddress: address(0),
                message: ""
            });
            tippingContract.batchSendTo(testCall);
        } else if (functionToAttack == FunctionToAttack.withdrawNonReentrant) {
            tippingContract.withdraw();
        } else if (functionToAttack == FunctionToAttack.withdrawFailed) {
            revert("Rejecting Ether transfers");
        }
    }
}
