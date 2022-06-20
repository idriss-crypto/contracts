// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import { ISendToHash } from "../interfaces/ISendToHash.sol";
import { SendToHash } from "../SendToHash.sol"; 
import { IIDrissRegistry } from "../interfaces/IIDrissRegistry.sol";
import { AssetType } from "../enums/IDrissEnums.sol";

/**
 * @title sendToHash
 * @author Rafał Kalinowski
 * @notice This contract is used to pay to the IDriss address without a need for it to be registered
 */
contract SendToHashMock is SendToHash {

    constructor(
        address _IDrissAddr,
        address _maticUsdAggregator
    ) SendToHash(_IDrissAddr, _maticUsdAggregator)
    { }


    function splitPayment(uint256 _value) public view returns (uint256 fee, uint256 value) {
        return _splitPayment(_value);
    }

    function adjustAddress(address _addr, AssetType _assetType)
        external
        pure
        returns (address) {
            return _adjustAddress(_addr, _assetType);
    }

    function getAddressFromHash (string memory _IDrissHash)
        external
        view
        returns (address IDrissAddress)
    {
        return _getAddressFromHash(_IDrissHash);
    }

    function fromHexChar(uint8 c) external pure returns (uint8) {
        return _fromHexChar(c);
    }

    function safeHexStringToAddress(string memory s) external pure returns (address) {
        return _safeHexStringToAddress(s);
    }

    function dollarToWei() external view returns (uint256) {
        return _dollarToWei();
    }
}