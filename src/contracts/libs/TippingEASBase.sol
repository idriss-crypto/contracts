// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { AssetType } from "../enums/IDrissEnums.sol";
import { TippingCore } from "./TippingCore.sol";


/**
 * @title TippingEASBase
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @custom:contributor Lennard <@lennardevertz>
 * @notice This is an IDriss Send utility contract for chains supporting EAS attestations.
 */
abstract contract TippingEASBase is TippingCore {

    constructor(
        address _nativeUsdAggregator,
        address _eas,
        bytes32 _easSchema
    ) TippingCore(_nativeUsdAggregator, _eas, _easSchema)
    {}

    /**
     * Abstract functions to be overwritten
     */

    function _getMinimumFee() internal virtual override view returns (uint256);

    /**
     * Contract specific functions
    */

    /**
     * @notice This function checks if the recipient of a tip
     * @notice is a verified public good and attests the donation accordingly.
     * @notice It also makes sure that no fee is subtracted in such case.
     */
    function _beforeTransfer(
        AssetType _assetType,
        address _recipient,
        uint256 _amount,
        uint256 _assetId,
        address _assetContractAddress
        ) internal override returns (uint256 fee, uint256 value) {
            if (publicGoods[_recipient]) {
                value = _amount;
                fee;
                _attestDonor(_recipient);
            } else {
                (fee, value) = _splitPayment(_amount, _assetType);
            }
        }

}
