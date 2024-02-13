## Contracts
A set of Solidity smart contracts used by IDriss. You will find different versions of our contracts in folders labeled after the contract version number.

# Version info
IDriss currently uses v1 Contracts for everything except the tipping contracts. 
Refer to v2 for updated functionality and support.

- [Version 1 Documentation](v1/README.md)
- [Version 2 Documentation](v2/README.md)

# Setting Up and Updating Submodules

The v2 contracts are maintained as a Git submodule. 
To ensure you have the complete and latest version of the code, 
follow these steps:

####Cloning the Repository with Submodules

When cloning this repository, use the `--recurse-submodules` option to 
automatically initialize and update each submodule:
```commandline
git clone --recurse-submodules https://github.com/idriss-crypto/contracts.git
```
####Initializing Submodules After Cloning
If you've already cloned the repository without submodules, 
you can initialize and update them with:
```commandline
git submodule init
git submodule update
```
####Pulling Latest Updates for Submodules
To update the submodules to their latest commits, run:
```commandline
git submodule update --remote
```
This fetches the latest changes in the submodules.
## License

This project is licensed under [GPLv3](https://github.com/idriss-crypto/contracts/blob/main/LICENSE).
