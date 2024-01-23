// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {ISchemaRegistry} from "./ISchemaRegistry.sol";
import {Attestation, EIP712Signature} from "../libs/Common.sol";

/// @notice A struct representing the arguments of the attestation request.
struct AttestationRequestData {
    address recipient; // The recipient of the attestation.
    uint64 expirationTime; // The time when the attestation expires (Unix timestamp).
    bool revocable; // Whether the attestation is revocable.
    bytes32 refUID; // The UID of the related attestation.
    bytes data; // Custom attestation data.
    uint256 value; // An explicit ETH amount to send to the resolver. This is important to prevent accidental user errors.
}

/// @notice A struct representing the full arguments of the attestation request.
struct AttestationRequest {
    bytes32 schema; // The unique identifier of the schema.
    AttestationRequestData data; // The arguments of the attestation request.
}

/// @notice A struct representing the full arguments of the full delegated attestation request.
struct DelegatedAttestationRequest {
    bytes32 schema; // The unique identifier of the schema.
    AttestationRequestData data; // The arguments of the attestation request.
    EIP712Signature signature; // The EIP712 signature data.
    address attester; // The attesting account.
}

/// @notice A struct representing the full arguments of the multi attestation request.
struct MultiAttestationRequest {
    bytes32 schema; // The unique identifier of the schema.
    AttestationRequestData[] data; // The arguments of the attestation request.
}

/// @notice A struct representing the full arguments of the delegated multi attestation request.
struct MultiDelegatedAttestationRequest {
    bytes32 schema; // The unique identifier of the schema.
    AttestationRequestData[] data; // The arguments of the attestation requests.
    EIP712Signature[] signatures; // The EIP712 signatures data. Please note that the signatures are assumed to be signed with increasing nonces.
    address attester; // The attesting account.
}

/// @notice A struct representing the arguments of the revocation request.
struct RevocationRequestData {
    bytes32 uid; // The UID of the attestation to revoke.
    uint256 value; // An explicit ETH amount to send to the resolver. This is important to prevent accidental user errors.
}

/// @notice A struct representing the full arguments of the revocation request.
struct RevocationRequest {
    bytes32 schema; // The unique identifier of the schema.
    RevocationRequestData data; // The arguments of the revocation request.
}

/// @notice A struct representing the arguments of the full delegated revocation request.
struct DelegatedRevocationRequest {
    bytes32 schema; // The unique identifier of the schema.
    RevocationRequestData data; // The arguments of the revocation request.
    EIP712Signature signature; // The EIP712 signature data.
    address revoker; // The revoking account.
}

/// @notice A struct representing the full arguments of the multi revocation request.
struct MultiRevocationRequest {
    bytes32 schema; // The unique identifier of the schema.
    RevocationRequestData[] data; // The arguments of the revocation request.
}

/// @notice A struct representing the full arguments of the delegated multi revocation request.
struct MultiDelegatedRevocationRequest {
    bytes32 schema; // The unique identifier of the schema.
    RevocationRequestData[] data; // The arguments of the revocation requests.
    EIP712Signature[] signatures; // The EIP712 signatures data. Please note that the signatures are assumed to be signed with increasing nonces.
    address revoker; // The revoking account.
}

/// @title IEAS
/// @notice EAS - Ethereum Attestation Service interface.
interface IEAS {
    event Attested(
        address indexed recipient,
        address indexed attester,
        bytes32 uid,
        bytes32 indexed schema
    );

    event Revoked(
        address indexed recipient,
        address indexed attester,
        bytes32 uid,
        bytes32 indexed schema
    );

    event Timestamped(bytes32 indexed data, uint64 indexed timestamp);

    event RevokedOffchain(
        address indexed revoker,
        bytes32 indexed data,
        uint64 indexed timestamp
    );

    function getSchemaRegistry() external view returns (ISchemaRegistry);

    function attest(
        AttestationRequest calldata request
    ) external payable returns (bytes32);

    function attestByDelegation(
        DelegatedAttestationRequest calldata delegatedRequest
    ) external payable returns (bytes32);

    function multiAttest(
        MultiAttestationRequest[] calldata multiRequests
    ) external payable returns (bytes32[] memory);

    function multiAttestByDelegation(
        MultiDelegatedAttestationRequest[] calldata multiDelegatedRequests
    ) external payable returns (bytes32[] memory);

    function revoke(RevocationRequest calldata request) external payable;

    function revokeByDelegation(
        DelegatedRevocationRequest calldata delegatedRequest
    ) external payable;

    function multiRevoke(
        MultiRevocationRequest[] calldata multiRequests
    ) external payable;

    function multiRevokeByDelegation(
        MultiDelegatedRevocationRequest[] calldata multiDelegatedRequests
    ) external payable;

    function timestamp(bytes32 data) external returns (uint64);

    function multiTimestamp(bytes32[] calldata data) external returns (uint64);

    function revokeOffchain(bytes32 data) external returns (uint64);

    function multiRevokeOffchain(
        bytes32[] calldata data
    ) external returns (uint64);

    function getAttestation(
        bytes32 uid
    ) external view returns (Attestation memory);

    function isAttestationValid(bytes32 uid) external view returns (bool);

    function getTimestamp(bytes32 data) external view returns (uint64);

    function getRevokeOffchain(
        address revoker,
        bytes32 data
    ) external view returns (uint64);
}
