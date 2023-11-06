// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { AssetType } from "../enums/IDrissEnums.sol";

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

    function withdraw() external;

    function withdrawToken(address _tokenContract) external;

    function addAdmin(address _adminAddress) external;

    function deleteAdmin(address _adminAddress) external;

}