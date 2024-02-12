// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { AssetType } from "../enums/IDrissEnums.sol";

struct AssetLiability {
    uint256 amount;
    // IMPORTANT - when deleting AssetLiability, please remove assetIds array first. Reference:
    // https://github.com/crytic/slither/wiki/Detector-Documentation#deletion-on-mapping-containing-a-structure
    mapping (address => uint256[]) assetIds;
    mapping (address => AssetIdAmount[]) assetIdAmounts;
}

struct AssetIdAmount {
    uint256 id;
    uint256 amount;
}

struct BatchCall {
    AssetType assetType;
    address recipient;
    uint256 amount;
    uint256 tokenId;
    address tokenAddress;
    string message;
}

struct AdjustedBatchCall {
    AssetType assetType;
    address recipient;
    uint256 amount;
    uint256 tokenId;
    address tokenAddress;
    string message;
    uint256 nativeAmount;
}