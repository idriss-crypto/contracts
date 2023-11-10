// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { TippingCore } from "./libs/TippingCore.sol";

/**
 * @title TippingOracle
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is the IDriss Send contract for tips sent on chains supporting Chainlink oracles.
 */
contract TippingOracle is TippingCore {

    constructor(
        address _nativeUsdAggregator,
        address _eas,
        bytes32 _easSchema
    ) TippingCore(_nativeUsdAggregator, _eas, _easSchema)
    {}

    /**
     * @notice Internal override using oracle-based fee calculation
     */
    function _getMinimumFee() internal override view returns (uint256) {
        return _getMinimumFeeOracle();
    }
}