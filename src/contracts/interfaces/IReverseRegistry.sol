// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IReverseRegistry {
    function reverseIDriss(address _address) external view returns (string memory);
}