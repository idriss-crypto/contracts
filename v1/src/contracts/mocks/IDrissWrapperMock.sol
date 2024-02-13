// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IIDrissRegistry } from "../interfaces/IIDrissRegistry.sol";

contract IDrissWrapperContract {
    IIDrissRegistry public registry;

    struct IDrissResult {
        string hash;
        string result;
        // Add other components as needed
    }


    constructor(address _idrissRegistryAddress) {
        registry = IIDrissRegistry(_idrissRegistryAddress);
    }

    function getMultipleIDriss(string[] calldata hashes) external view returns (IDrissResult[] memory) {
        IDrissResult[] memory resultArray = new IDrissResult[](hashes.length);

        for (uint256 i = 0; i < hashes.length; i++) {
            try registry.getIDriss(hashes[i]) returns (string memory result) {
                resultArray[i] = IDrissResult(hashes[i], result);
            } catch {
                resultArray[i] = IDrissResult(hashes[i], "");
            }
        }

        return resultArray;
    }
}