// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {AssetType} from "../enums/IDrissEnums.sol";
import {BatchCall} from "../structs/IDrissStructs.sol";

interface ITipping {
    function sendNativeTo(
        address _recipient,
        string memory _message
    ) external payable;

    function sendERC20To(
        address _recipient,
        uint256 _amount,
        address _tokenContractAddr,
        string memory _message
    ) external payable;

    function sendERC721To(
        address _recipient,
        uint256 _assetId,
        address _nftContractAddress,
        string memory _message
    ) external payable;

    function sendERC1155To(
        address _recipient,
        uint256 _assetId,
        uint256 _amount,
        address _nftContractAddress,
        string memory _message
    ) external payable;

    function batchSendTo(BatchCall[] calldata calls) external payable;

    function withdraw() external;

    function withdrawToken(address _tokenContract) external;

    function addAdmin(address _adminAddress) external;

    function deleteAdmin(address _adminAddress) external;

    function addPublicGood(address publicGoodAddress) external;

    function deletePublicGood(address publicGoodAddress) external;

    function addSupportedERC20(address erc20Address) external;

    function deleteSupportedERC20(address erc20Address) external;
}
