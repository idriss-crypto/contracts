// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import { ISendToHash } from "../interfaces/ISendToHash.sol";
import { SendToHash } from "../SendToHash.sol"; 
import { IIDrissRegistry } from "../interfaces/IIDrissRegistry.sol";
import { AssetLiability } from "../structs/IDrissStructs.sol";
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



    // mapping(address => mapping(string => mapping(AssetType => mapping(address => AssetLiability)))) payerAssetMap;
    // mapping(string => mapping(AssetType => mapping(address => AssetLiability))) beneficiaryAssetMap;
    // mapping(string => mapping(AssetType => mapping(address => address[]))) beneficiaryPayersMap;

    function getPayerAssetMapAmount(
        address _payerAddress,
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress) external view returns (uint256) {
            return payerAssetMap[_payerAddress][_IDrissHash][_assetType][_assetContractAddress].amount;
    }

    function getPayerAssetMapAssetIds(
        address _payerAddress,
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress) external view returns (uint256[] memory) {
            return payerAssetMap[_payerAddress][_IDrissHash][_assetType][_assetContractAddress].assetIds[_payerAddress];
    }

    function getBeneficiaryMapAmount(
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress) external view returns (uint256) {
            return beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress].amount;
    }

    function getBeneficiaryMapAssetIds(
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress,
        address _payerAddress) external view returns (uint256[] memory) {
            return beneficiaryAssetMap[_IDrissHash][_assetType][_assetContractAddress].assetIds[_payerAddress];
    }

    function getBeneficiaryPayersArray(
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress) external view returns (address[] memory) {
            return beneficiaryPayersArray[_IDrissHash][_assetType][_assetContractAddress];
    }

    function getBeneficiaryPayersMap(
        address _payerAddress,
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress) external view returns (bool) {
            return beneficiaryPayersMap[_IDrissHash][_assetType][_assetContractAddress][_payerAddress];
    }
}