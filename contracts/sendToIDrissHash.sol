// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IDriss {
    function getIDriss(string memory hashPub)
        external
        view
        returns (string memory);

    function IDrissOwners(string memory _address)
        external
        view
        returns (address);
}

struct AssetLiability {
    uint128 amount;
    uint128 claimableUntil;
    uint256[] assetIds;
}

enum AssetType {
    Coin,
    Token,
    NFT
}

/**
 * @title sendToHash
 * @author Rafał Kalinowski
 * @notice This contract is used to pay to the IDriss address without a need for it to be registered
 */
contract sendToHash is Ownable {
    // payer => beneficiary => assetAddress => AssetLiability
    mapping(address => mapping(address => mapping(address => AssetLiability))) payerAssetMap;
    // beneficiary => assetAddress => AssetLiability
    mapping(address => mapping(address => AssetLiability)) beneficiaryAssetMap;
    mapping(address => uint256) beneficiaryCoinBalance;

    address public immutable IDrissAddr;
    uint256 public immutable TRANSFER_EXPIRATION_IN_SECS;

    //  modifier isRoleActive(address _who) {
    //      require(
    //          _accoutRoleAssignmentTime[_who] <= block.timestamp,
    //          "Authorization: the address does not have an active role assigned yet."
    //      );
    //      _;
    //  }

    event AssetTransferred(
        address indexed to,
        address indexed from,
        address indexed assetContractAddress,
        uint256 amount
    );
    event AssetClaimed(
        address indexed to,
        address indexed from,
        address indexed assetContractAddress,
        uint256 amount
    );
    event AssetTransferReverted(
        address indexed to,
        address indexed from,
        address indexed assetContractAddress,
        uint256 amount
    );

    constructor(uint256 _transferExpirationInSecs, address _IDrissAddr) {
        TRANSFER_EXPIRATION_IN_SECS = _transferExpirationInSecs;
        IDrissAddr = _IDrissAddr;
        //   _assignAdminRole();
    }

    /**
     * @notice This function allows a user to send tokens or coins to other IDriss
     * @dev Note that you have to approve this contract to handle ERCs on user's behalf
     */
    function sendToAnyone(
        string memory _IDrissHash,
        uint256 _amount,
        AssetType _assetType,
        address _assetContractAddress
    ) external {
        //TODO: implement

        uint256 claimableUntil = block.timestamp + TRANSFER_EXPIRATION_IN_SECS;
    }

    /**
     * @notice This function allows a user to revert sending tokens to other IDriss and claim them back
     * @dev Note that you have to approve this contract to handle ERCs on user's behalf
     */
    //TODO: add checks if specific party have required allowance
    function claim(
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external payable {
        //TODO: implement
        address ownerIDrissAddr = _getAddressFromHash(_IDrissHash);
    }

    function balanceOf(
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external view returns (uint256) {
        address ownerIDrissAddr = _getAddressFromHash(_IDrissHash);

        if (_assetType == AssetType.Coin) {
            return _balanceOfCoin(ownerIDrissAddr);
        } else if (
            _assetType == AssetType.Token || _assetType == AssetType.NFT
        ) {
            return _balanceOfAsset(ownerIDrissAddr, _assetContractAddress);
        }

        return 0;
    }

    function _balanceOfCoin(address _beneficiary)
        internal
        view
        returns (uint256)
    {
        return beneficiaryCoinBalance[_beneficiary];
    }

    function _balanceOfAsset(
        address _beneficiary,
        address _assetContractAddress
    ) internal view returns (uint256) {
        return beneficiaryAssetMap[_beneficiary][_assetContractAddress].amount;
    }

    /**
     * @notice This function allows a user to revert sending tokens to other IDriss and claim them back
     */

    //TODO: implement -> transfering tokens + checks + reentrancyGuard
    function revertPayment(
        string memory _IDrissHash,
        AssetType _assetType,
        address _assetContractAddress
    ) external {
        address ownerIDrissAddr = _getAddressFromHash(_IDrissHash);
        uint256 amountToRevert = 0;

        if (_assetType == AssetType.Coin) {
            amountToRevert = beneficiaryCoinBalance[ownerIDrissAddr];
            (bool sent, ) = address(this).call{
                value: amountToRevert,
                gas: 40000
            }("");
            require(sent, "Failed to  withdraw");
        } else {
            amountToRevert = payerAssetMap[msg.sender][ownerIDrissAddr][
                _assetContractAddress
            ].amount;
            AssetLiability storage beneficiaryAsset = beneficiaryAssetMap[
                ownerIDrissAddr
            ][_assetContractAddress];
            delete payerAssetMap[msg.sender][ownerIDrissAddr][
                _assetContractAddress
            ];

            beneficiaryAsset.amount -= uint128(amountToRevert);

            if (_assetType == AssetType.NFT) {
                _sendNFTAsset(
                    beneficiaryAsset,
                    address(this),
                    msg.sender,
                    _assetContractAddress
                );
            } else if (_assetType == AssetType.Token) {
                _sendTokenAsset(
                    beneficiaryAsset,
                    msg.sender,
                    _assetContractAddress
                );
            }
        }

        emit AssetTransferReverted(
            ownerIDrissAddr,
            msg.sender,
            _assetContractAddress,
            amountToRevert
        );
    }

    function _sendNFTAsset(
        AssetLiability memory _asset,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC721 nft = IERC721(_contractAddress);
        for (uint256 i = 0; i < _asset.assetIds.length; i++) {
            nft.safeTransferFrom(
                address(this),
                msg.sender,
                _asset.assetIds[i],
                ""
            );
        }
    }

    function _sendTokenAsset(
        AssetLiability memory _asset,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        bool sent = token.transfer(_to, _asset.amount);
        require(sent, "Failed to  withdraw");
    }

    function _getAddressFromHash(string memory _IDrissHash)
        internal
        view
        returns (address)
    {
        return IDriss(IDrissAddr).IDrissOwners(_IDrissHash);
    }
}
