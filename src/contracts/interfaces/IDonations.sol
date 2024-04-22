// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IDonations {
    function vote(bytes memory encodedVote, address roundContractAddress, address asset) external payable;
}