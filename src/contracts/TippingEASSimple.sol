// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { TippingEASBase } from "./libs/TippingEASBase.sol";

/**
 * @title TippingEASSimple
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is the IDriss Send contract for tips sent on chains supporting EAS attestations.
 * @notice A simplified fee calculation is utilized.
 */
contract TippingEASSimple is TippingEASBase {

    constructor(
        address _nativeUsdAggregator,
        address _eas,
        bytes32 _easSchema
    ) TippingEASBase(_nativeUsdAggregator, _eas, _easSchema)
    {}

    /**
     * @notice Internal override using simplified fee calculation
     */
    function _getMinimumFee() internal override view returns (uint256) {
        return _getMinimumFeeSimple();
    }
}