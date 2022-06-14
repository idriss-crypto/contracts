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
    uint256 amount;
    uint256 claimableUntil;
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
    mapping(address => mapping(address => uint256)) payerCoinBalance;
    mapping(address => uint256) beneficiaryCoinBalance;

    address public immutable IDRISS_ADDR;
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
        IDRISS_ADDR = _IDrissAddr;
    }

    /**
     * @notice This function allows a user to send tokens or coins to other IDriss. They are
     *         being kept in an escrow until
     * @dev Note that you have to approve this contract to handle ERCs on user's behalf
     */
    function sendToAnyone(
        string memory _IDrissHash,
        uint256 _amount,
        AssetType _assetType,
        address _assetContractAddress,
        uint256[] calldata _assetIds
    ) external payable {
        //TODO: implement + reentrancy guard

        uint256 calculatedClaimableUntil = block.timestamp +
            TRANSFER_EXPIRATION_IN_SECS;
        address ownerIDrissAddr = _getAddressFromHash(_IDrissHash);

        if (_assetType == AssetType.Coin) {
            beneficiaryCoinBalance[ownerIDrissAddr] += msg.value;
            payerCoinBalance[msg.sender][ownerIDrissAddr] += msg.value;
        } else {
            AssetLiability memory beneficiaryAsset = beneficiaryAssetMap[
                ownerIDrissAddr
            ][_assetContractAddress];

            if (beneficiaryAsset.claimableUntil == 0) {
                beneficiaryAsset = AssetLiability({
                    amount: _amount,
                    claimableUntil: calculatedClaimableUntil,
                    assetIds: _assetIds
                });
            } else {
                beneficiaryAsset.amount += _amount;
                beneficiaryAsset.claimableUntil = calculatedClaimableUntil;

                if (_assetType == AssetType.Token) {
                    _sendTokenAssetFrom(
                        AssetLiability({
                            amount: _amount,
                            claimableUntil: calculatedClaimableUntil,
                            assetIds: new uint256[](0)
                        }),
                        msg.sender,
                        address(this),
                        _assetContractAddress
                    );
                } else if (_assetType == AssetType.NFT) {
                    for (uint256 i = 0; i < _assetIds.length; i++) {
                        //https://docs.soliditylang.org/en/v0.8.12/types.html#allocating-memory-arrays
                        //beneficiaryAsset.assetIds.push(_assetIds[i]);
                    }

                    _sendNFTAsset(
                        AssetLiability({
                            amount: _amount,
                            claimableUntil: calculatedClaimableUntil,
                            assetIds: _assetIds
                        }),
                        msg.sender,
                        address(this),
                        _assetContractAddress
                    );
                }
            }

            payerAssetMap[msg.sender][ownerIDrissAddr][
                _assetContractAddress
            ] = beneficiaryAsset; // TODO:change
            beneficiaryAssetMap[ownerIDrissAddr][
                _assetContractAddress
            ] = beneficiaryAsset;
        }
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
            return beneficiaryCoinBalance[ownerIDrissAddr];
        } else if (
            _assetType == AssetType.Token || _assetType == AssetType.NFT
        ) {
            return
                beneficiaryAssetMap[ownerIDrissAddr][_assetContractAddress]
                    .amount;
        }

        return 0;
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
            amountToRevert = payerCoinBalance[msg.sender][ownerIDrissAddr];
            beneficiaryCoinBalance[ownerIDrissAddr] -= amountToRevert;
            payerCoinBalance[msg.sender][ownerIDrissAddr] = 0;
            (bool sent, ) = address(this).call{value: amountToRevert}("");
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
        require(sent, "Failed to transfer token");
    }

    function _sendTokenAssetFrom(
        AssetLiability memory _asset,
        address _from,
        address _to,
        address _contractAddress
    ) internal {
        IERC20 token = IERC20(_contractAddress);

        bool sent = token.transferFrom(_from, _to, _asset.amount);
        require(sent, "Failed to transfer token");
    }

    function _getAddressFromHash(string memory _IDrissHash)
        internal
        view
        returns (address)
    {
        //TODO: check if the address is valid. Revert otherwise
        return IDriss(IDRISS_ADDR).IDrissOwners(_IDrissHash);
    }
}
