// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

struct AssetLiability {
    uint256 amount;
    // payerAddress => assets
    mapping (address => uint256[]) assetIds;
}