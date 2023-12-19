// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { TippingEASBase } from "./libs/TippingEASBase.sol";

/**
 * @title TippingEASOracle
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is the IDriss Send contract for tips sent on chains supporting EAS attestations and Chainlink oracles.
 */
contract TippingEASOracle is TippingEASBase {

    constructor(
        address _nativeUsdAggregator,
        address _sequencerAddress,
        uint256 _stalenessThreshold,
        int256 _fallbackPrice,
        uint256 _fallbackDecimals,
        address _eas,
        bytes32 _easSchema
    ) TippingEASBase(_nativeUsdAggregator, _sequencerAddress, _stalenessThreshold, _fallbackPrice, _fallbackDecimals, _eas, _easSchema)
    {}

    /**
     * @notice Internal override using oracle-based fee calculation
     */
    function _getMinimumFee() internal override view returns (uint256) {
        return _getMinimumFeeOracle();
    }
}