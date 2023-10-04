// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { IEAS, AttestationRequest, AttestationRequestData } from "../interfaces/IEAS.sol";
import { NO_EXPIRATION_TIME, EMPTY_UID } from "./Common.sol";

/**
 * @title Ethereum Attestation Service - Example
 */
contract PublicGoodAttester {
    error InvalidEAS();

    // The address of the global EAS contract.
    IEAS private immutable _eas;

    /**
     * @dev Creates a new ExampleAttester instance.
     *
     * @param eas The address of the global EAS contract.
     */
    constructor(address eas) {
        if (eas == address(0)) {
            revert InvalidEAS();
        }
        _eas = IEAS(eas);
    }

    /**
     * @dev Attests to a schema that receives parameter
     * @param _publicGood: recipient address of public good
     * @return The UID of the new attestation.
     */
    function _attestDonor(address _publicGood) internal returns (bytes32) {
        return
            _eas.attest(
                AttestationRequest({
                    schema: 0x20E35DD07C2DCEE57DC819AC38BD364B1F4D96FA7741A94CEA5D55BA658C23B5,
                    data: AttestationRequestData({
                        recipient: msg.sender, // the supporter receives the attestation
                        expirationTime: NO_EXPIRATION_TIME, // No expiration time
                        revocable: false,
                        refUID: EMPTY_UID, // No references UI
                        data: abi.encode(_publicGood), // Encode grantee address
                        value: 0 // No value/ETH
                    })
                })
            );
    }
}