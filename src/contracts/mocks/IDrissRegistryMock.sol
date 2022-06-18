// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockToken is ERC20 {
    constructor() ERC20("MockToken", "MCKT"){
        _mint(msg.sender,1000*10**18);
    }
}

contract MockNFT is ERC721, Ownable {
    constructor() ERC721("MockNFT", "MNFT"){ }

    function safeMint(address to, uint256 tokenId) public onlyOwner() {
        _safeMint(to, tokenId);
    }
}

contract IDriss {
    mapping(string => address) public IDrissOwnersMap;
    mapping(string => string) public IDrissMap;

    constructor(address _secondAddress) {
        IDrissOwnersMap["a"] = msg.sender;
        IDrissOwnersMap["b"] = _secondAddress;
        IDrissOwnersMap["c"] = address(0);
    }

    function getIDriss(string memory _hash)
        external
        view
        returns (string memory) {
            return IDrissMap[_hash];
        }

    function IDrissOwners(string memory _hash)
        external
        view
        returns (address) {
            return IDrissOwnersMap[_hash];
        }

    function addIDriss(string memory _hash, string memory _address) external {
            IDrissMap[_hash] = _address;
    }
}

