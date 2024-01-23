// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

error CoinSendFailed();
error NothingToSend();

/**
 * @title MultiAssetSender
 * @author Rafał Kalinowski <deliriusz.eth@gmail.com>
 * @notice This is an utility contract for sending different kind of assets
 * @dev Please note that you should make reentrancy check yourself
 */
contract MultiAssetSender {
    constructor() {}

    using SafeERC20 for IERC20;

    /**
     * @notice Wrapper for sending native Coin via call function
     * @dev When using this function please make sure to not send it to anyone, verify the
     *      address in IDriss registry
     */
    function _sendCoin(address _to, uint256 _amount) internal {
        (bool sent, ) = payable(_to).call{value: _amount}("");
        if (!sent) {
            revert CoinSendFailed();
        }
    }

    /**
     * @notice Wrapper for sending single ERC1155 asset
     * @dev due to how approval in ERC1155 standard is handled, the smart contract has to ask for permissions to manage
     *      ALL tokens "for simplicity"... Hence, it has to be done before calling function that transfers the token
     *      to smart contract, and revoked afterwards
     */
    function _sendERC1155AssetBatch(
        uint256[] memory _assetIds,
        uint256[] memory _amounts,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC1155 nft = IERC1155(_contractAddress);
        nft.safeBatchTransferFrom(_from, _to, _assetIds, _amounts, "");
    }

    /**
     * @notice Wrapper for sending multiple ERC1155 assets
     * @dev due to how approval in ERC1155 standard is handled, the smart contract has to ask for permissions to manage
     *      ALL tokens "for simplicity"... Hence, it has to be done before calling function that transfers the token
     *      to smart contract, and revoked afterwards
     */
    function _sendERC1155(
        uint256 _assetId,
        uint256 _amount,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC1155 nft = IERC1155(_contractAddress);
        nft.safeTransferFrom(_from, _to, _assetId, _amount, "");
    }

    /**
     * @notice Wrapper for sending NFT asset
     */
    function _sendERC721(
        uint256 _assetId,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC721 nft = IERC721(_contractAddress);
        nft.transferFrom(_from, _to, _assetId);
    }

    /**
     * @notice Wrapper for sending NFT asset with additional checks and iteraton over an array
     */
    function _sendNFTAssetBatch(
        uint256[] memory _assetIds,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        if (_assetIds.length == 0) {
            revert NothingToSend();
        }

        IERC721 nft = IERC721(_contractAddress);
        for (uint256 i = 0; i < _assetIds.length; ++i) {
            nft.transferFrom(_from, _to, _assetIds[i]);
        }
    }

    /**
     * @notice Wrapper for sending ERC20 Token asset with additional checks
     */
    function _sendERC20(
        uint256 _amount,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        token.safeTransfer(_to, _amount);
    }

    /**
     * @notice Wrapper for sending ERC20 token from specific account with additional checks and iteraton over an array
     */
    function _sendERC20From(
        uint256 _amount,
        address _from,
        address _to,
        address _contractAddress
    ) internal returns (uint256) {
        IERC20 token = IERC20(_contractAddress);

        uint256 balanceBefore = token.balanceOf(_to);

        token.safeTransferFrom(_from, _to, _amount);

        uint256 balanceAfter = token.balanceOf(_to);
        return (balanceAfter - balanceBefore);
    }
}
