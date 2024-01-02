// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title MaticPriceAggregatorV3Mock
 * @author Rafał Kalinowski
 * @notice mock MaticPriceAffregatorV3
 * custom:experimental used only as a mock for tests
 */
contract PublicGoodAttesterMock {
    mapping(address => bool) public mockAttestations;

  // Attests to a schema that receives parameter
  function _attestDonor(address _publicGood) internal {
        mockAttestations[msg.sender] = true;
    }

}