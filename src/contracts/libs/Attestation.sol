// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IEAS, AttestationRequest, AttestationRequestData} from "../interfaces/IEAS.sol";
import {NO_EXPIRATION_TIME, EMPTY_UID} from "./Common.sol";

/**
 * @title PublicGoodAttester
 */
contract PublicGoodAttester {
    error InvalidEAS();

    IEAS easContract;
    bytes32 public EAS_SCHEMA;

    constructor(address eas, bytes32 easSchema) {
        if (eas != address(0)) {
            _initializeEAS(eas, easSchema);
        }
    }

    /**
     * @notice Set up EAS round
     * @notice Will not allow to use null EAS.
     * @param eas The new address of the EAS contract.
     * @param easSchema EAS schema that this contract attests to.
     */
    function _initializeEAS(address eas, bytes32 easSchema) internal {
        if (eas == address(0)) {
            revert InvalidEAS();
        }
        easContract = IEAS(eas);
        EAS_SCHEMA = easSchema;
    }

    /**
     * @notice Creates an attestation for a donor's contribution within a Gitcoin round.
     * @notice Emits an `Attested` event on the EAS contract.
     * @dev This function submits an attestation request through EAS if it's set.
     * The attestation includes information about the donation origin.
     * It's an internal function and can only be called within the contract itself.
     * @param _donor The address of the donor who is making the contribution.
     * @param _recipientId Unique recipientId indexed in the Allo indexer.
     * @param _round The identifier for the donation round.
     * @param _tokenSent The token address of the donated tokens.
     * @param _amount The amount of tokens donated.
     * @param _relayer The address of the relayer facilitating the cross-chain donation.
     */
    function _attestDonor(
        address _donor,
        address _recipientId,
        uint256 _round,
        address _tokenSent,
        uint256 _amount,
        address _relayer
    ) internal {
        if (address(easContract) == address(0)) return;
        easContract.attest(
            AttestationRequest({
                schema: EAS_SCHEMA,
                data: AttestationRequestData({
                    recipient: _donor,
                    expirationTime: NO_EXPIRATION_TIME,
                    revocable: false,
                    refUID: EMPTY_UID,
                    data: abi.encode(
                        _donor, // address
                        _recipientId, // address
                        _round, // uint256
                        _tokenSent, // address
                        _amount, // uint256
                        _relayer // address
                    ),
                    value: 0 
                })
            })
        );
    }
}
