// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

enum AssetType {
    Native,
    ERC20,
    ERC721,
    ERC1155,
    SUPPORTED_ERC20
}

/**
 * Percentage - constant percentage, e.g. 1% of the msg.value
 * PercentageOrConstantMaximum - get msg.value percentage, or constant dollar value, depending on what is bigger
 * Constant - constant dollar value, e.g. $1 - uses price Oracle
 */
enum FeeType {
    Percentage,
    PercentageOrConstantMaximum,
    Constant
}
