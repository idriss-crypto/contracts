// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface ERC20 {
    function balanceOf(address _tokenOwner)
        external
        view
        returns (uint balance);

    function transfer(address _to, uint _tokens)
        external
        returns (bool success);

    function approve(address _spender, uint256 _value)
        external
        returns (bool success);

    function allowance(address _contract, address _spender)
        external
        view
        returns (uint256 remaining);

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool success);
}

contract IDrissMappings {
    uint public countAdding;
    uint public countDeleting;
    uint public price;
    uint public creationTime = block.timestamp;
    address public contractOwner = msg.sender;
    mapping(string => string) private IDriss;
    mapping(string => string) private IDrissHash;
    mapping(string => address) public IDrissOwners;
    mapping(string => uint) public payDates;
    mapping(address => bool) private admins;

    event Increment(uint value);
    event Decrement(uint value);
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event IDrissOwnershipTransferred(
        address indexed previousIDrissOwner,
        address indexed newIDrissOwner
    );
    event IDrissAdded(string indexed hash);
    event IDrissDeleted(string indexed hash);
    event NewPrice(uint price);
    event AdminAdded(address indexed admin);
    event AdminDeleted(address indexed admin);

    error IDrissMappings__OnlyContractOwnerCanAddAdmins();
    error IDrissMappings__OnlyContractOwnerCanDeleteAdmins();
    error IDrissMappings__OnlyContractOwnerCanSetPrice();
    error IDrissMappings__OnlyTrustedAdminCanWithdraw();
    error IDrissMappings__OnlyTrustedAdminCanAddIDriss();
    error IDrissMappings__OnlyIDrissOwnerCanDeleteBinding();
    error IDrissMappings__OnlyIDrissOwnerCanChangeOwnership();
    error IDrissMappings__OnlyContractOwnerCanChangeOwnership();
    error IDrissMappings__Ownable_NewContractOwnerIsTheZeroAddress();
    error IDrissMappings__FailedToWithdraw();
    error IDrissMappings__CannotChangeExistingBinding();
    error IDrissMappings__NotEnough_MATIC();
    error IDrissMappings__BindingDoesNotExist();
    error IDrissMappings__BindingAlreadyCreated();

    function addAdmin(address adminAddress) external {
        if (msg.sender != contractOwner) {
            revert IDrissMappings__OnlyContractOwnerCanAddAdmins();
        }
        admins[adminAddress] = true;
        emit AdminAdded(adminAddress);
    }

    function deleteAdmin(address adminAddress) external {
        if (msg.sender != contractOwner) {
            revert IDrissMappings__OnlyContractOwnerCanDeleteAdmins();
        }
        admins[adminAddress] = false;
        emit AdminDeleted(adminAddress);
    }

    function setPrice(uint newPrice) external {
        if (msg.sender != contractOwner) {
            revert IDrissMappings__OnlyContractOwnerCanSetPrice();
        }
        price = newPrice;
        emit NewPrice(price);
    }

    function withdraw() external returns (bytes memory) {
        if (admins[msg.sender] != true) {
            revert IDrissMappings__OnlyTrustedAdminCanWithdraw();
        }
        (bool sent, bytes memory data) = msg.sender.call{
            value: address(this).balance,
            gas: 40000
        }("");
        if(!sent) {revert IDrissMappings__FailedToWithdraw();}
        return data;
    }

    function withdrawTokens(address tokenContract) external {
        if (admins[msg.sender] != true) {
            revert IDrissMappings__OnlyTrustedAdminCanWithdraw();
        }
        ERC20 tc = ERC20(tokenContract);
        tc.transfer(msg.sender, tc.balanceOf(address(this)));
    }

    function increment() private {
        countAdding += 1;
        emit Increment(countAdding);
    }

    function decrement() private {
        countDeleting += 1;
        emit Decrement(countDeleting);
    }

    function addIDriss(
        string memory hashPub,
        string memory hashID,
        string memory address_,
        address ownerAddress
    ) external payable {
        if (admins[msg.sender] != true) {
            revert IDrissMappings__OnlyTrustedAdminCanAddIDriss();
        }
        if(keccak256(bytes(IDrissHash[hashPub])) != keccak256(bytes(""))) {
            revert IDrissMappings__CannotChangeExistingBinding();
        }
        if(msg.value < price){ revert IDrissMappings__NotEnough_MATIC();}
        IDriss[hashID] = address_;
        IDrissHash[hashPub] = hashID;
        IDrissOwners[hashPub] = ownerAddress;
        payDates[hashPub] = block.timestamp;
        increment();
        emit IDrissAdded(hashPub);
    }

    function addIDrissToken(
        string memory hashPub,
        string memory hashID,
        string memory address_,
        address token,
        uint amount,
        address ownerAddress
    ) external payable {
        if (admins[msg.sender] != true) {
            revert IDrissMappings__OnlyTrustedAdminCanAddIDriss();
        }
        if(keccak256(bytes(IDrissHash[hashPub])) != keccak256(bytes(""))) {
            revert IDrissMappings__BindingAlreadyCreated();
        }
        ERC20 paymentTc = ERC20(token);
        require(
            paymentTc.allowance(msg.sender, address(this)) >= amount,
            "Insuficient Allowance."
        );
        require(
            paymentTc.transferFrom(msg.sender, address(this), amount),
            "Transfer Failed."
        );
        IDriss[hashID] = address_;
        IDrissHash[hashPub] = hashID;
        IDrissOwners[hashPub] = ownerAddress;
        payDates[hashPub] = block.timestamp;
        increment();
        emit IDrissAdded(hashPub);
    }

    function deleteIDriss(string memory hashPub) external payable {
        if (IDrissOwners[hashPub] != msg.sender) {
            revert IDrissMappings__OnlyIDrissOwnerCanDeleteBinding();
        }
        if(keccak256(bytes(IDrissHash[hashPub])) == keccak256(bytes(""))){
            revert IDrissMappings__BindingDoesNotExist();
        }
        delete IDriss[IDrissHash[hashPub]];
        delete IDrissHash[hashPub];
        delete IDrissOwners[hashPub];
        delete payDates[hashPub];
        decrement();
        emit IDrissDeleted(hashPub);
    }

    function getIDriss(string memory hashPub)
        public
        view
        returns (string memory)
    {
        if(keccak256(bytes(IDrissHash[hashPub])) == keccak256(bytes(""))){
            revert IDrissMappings__BindingDoesNotExist();
        }
        return IDriss[IDrissHash[hashPub]];
    }

    function transferIDrissOwnership(string memory hashPub, address newOwner)
        external
        payable
    {
        if (IDrissOwners[hashPub] != msg.sender) {
            revert IDrissMappings__OnlyIDrissOwnerCanChangeOwnership();
        }
        IDrissOwners[hashPub] = newOwner;
        emit IDrissOwnershipTransferred(msg.sender, newOwner);
    }

    function transferContractOwnership(address newOwner) public payable {
        if (msg.sender != contractOwner) {
            revert IDrissMappings__OnlyContractOwnerCanChangeOwnership();
        }
        if (newOwner == address(0)) {
            revert IDrissMappings__Ownable_NewContractOwnerIsTheZeroAddress();
        }
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = contractOwner;
        contractOwner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}