// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

contract IDriss {
    mapping(string => address) public IDrissOwnersMap;

    constructor(address _secondAddress) {
        IDrissOwnersMap["a"] = msg.sender;
        IDrissOwnersMap["b"] = _secondAddress;
    }

    function getIDriss(string memory _hash)
        external
        view
        returns (string memory)
    {
        return "mock";
    }

    function IDrissOwners(string memory _hash) external view returns (address) {
        return IDrissOwnersMap[_hash];
    }
}
