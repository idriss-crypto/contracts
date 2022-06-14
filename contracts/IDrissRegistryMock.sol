// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockToken is ERC20{
    constructor() ERC20("MockToken", "MCKT"){
        _mint(msg.sender,1000*10**18);
    }
}

contract MockNFT is ERC721{
    constructor() ERC721("MockNFT", "MNFT"){
        _mint(msg.sender,1000*10**18);
    }
}

contract IDriss {
    mapping(string => address) public IDrissOwnersMap;

    constructor(address _secondAddress) {
        IDrissOwnersMap["a"] = msg.sender;
        IDrissOwnersMap["b"] = _secondAddress;
    }

    function getIDriss(string memory _hash)
        external
        view
        returns (string memory) {
            return "mock";
        }

    function IDrissOwners(string memory _hash)
        external
        view
        returns (address) {
            return IDrissOwnersMap[_hash];
        }
}

