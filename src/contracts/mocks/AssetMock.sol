// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockToken
 * @author Rafał Kalinowski
 * @notice mock ERC20 token
 * custom:experimental used only as a mock for tests
 */
contract MockToken is ERC20 {
    constructor() ERC20("MockToken", "MCKT"){
        _mint(msg.sender,1000000000*10**18);
    }
}

/**
 * @title MockNFT
 * @author Rafał Kalinowski
 * @notice mock ERC721 token
 * custom:experimental used only as a mock for tests
 */
contract MockNFT is ERC721, Ownable {
    constructor() ERC721("MockNFT", "MNFT"){ }

    function safeMint(address to, uint256 tokenId) public onlyOwner() {
        _safeMint(to, tokenId);
    }
}

/**
 * @title MockERC1155
 * @author Rafał Kalinowski
 * @notice mock ERC1155 token
 * custom:experimental used only as a mock for tests
 */
contract MockERC1155 is ERC1155, Ownable {
    constructor() ERC1155("https://ipfs.io/ipfs/QmSknFJz1Z16xKGBJPF41DPsCzyzCYqBD8ZmVmnyaN1Vw4/{id}") { }

    function mint(address to, uint256 tokenId, uint256 amount) public onlyOwner() {
        _mint(to, tokenId, amount, "");
    }
}
