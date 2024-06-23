// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IIDrissRegistry } from "./interfaces/IIDrissRegistry.sol";
import { IReverseRegistry } from "./interfaces/IReverseRegistry.sol";

contract IDrissWrapperContract {
    IIDrissRegistry public registry;
    IReverseRegistry public reverseRegistry;

    struct IDrissResult {
        string _hash;
        string result;
    }

    struct IDrissReverseResult {
        address _address;
        string result;
    }

    constructor(address _idrissRegistryAddress, address _idrissReverseRegistryAddress) {
        registry = IIDrissRegistry(_idrissRegistryAddress);
        reverseRegistry = IReverseRegistry(_idrissReverseRegistryAddress);
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

    function getMultipleReverse(address[] calldata addresses) external view returns (IDrissReverseResult[] memory) {
        IDrissReverseResult[] memory resultArray = new IDrissReverseResult[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            try reverseRegistry.reverseIDriss(addresses[i]) returns (string memory result) {
                resultArray[i] = IDrissReverseResult(addresses[i], result);
            } catch {
                resultArray[i] = IDrissReverseResult(addresses[i], "");
            }
        }

        return resultArray;
    }
}