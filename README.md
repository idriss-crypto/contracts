# Contracts
A set of Solidity smart contracts used by IDriss. 

## Version info
IDriss currently uses v1 Contracts for everything except the tipping contracts. 
Refer to v2 for updated functionality and support.

- [Version 2 Documentation](v2/README.md)

## Setting Up and Updating Submodules

The v2 contracts are maintained as a Git submodule. 
To ensure you have the complete and latest version of the code, 
follow these steps:

#### Cloning the Repository with Submodules

When cloning this repository, use the `--recurse-submodules` option to 
automatically initialize and update each submodule:
```commandline
git clone --recurse-submodules https://github.com/idriss-crypto/contracts.git
```
#### Initializing Submodules After Cloning
If you've already cloned the repository without submodules, 
you can initialize and update them with:
```commandline
git submodule init
git submodule update
```
#### Pulling Latest Updates for Submodules
To update the submodules to their latest commits, run:
```commandline
git submodule update --remote
```
This fetches the latest changes in the submodules.


## V1 Setup
```
npm install
npx hardhat compile
```

### Mythril
Mythril is a symbolic execution engine. Setup instructions can be found [HERE](https://mythril-classic.readthedocs.io/en/master/installation.html)

### Slither
Slither is a static code analyzer. Setup instructions can be found [HERE](https://github.com/crytic/slither#how-to-install)

## Running tests
```
npx hardhat test
```

## Testing manually with Remix
0. Setup remix to connect Remix to a local filesystem or copy-paste the contracts mentioned below:
1. Deploy ```src/contracts/mocks/MaticPriceAggregatorV3Mock.sol```
1. Deploy ```src/contracts/mocks/IDrissRegistryMock.sol```
3. Add new hash to address mappings by invoking ```IDrissRegistryMock.addIDriss()```
1. Deploy ```src/contracts/mocks/SendToHashMock.sol``` providing addresses of contracts from step ***1*** and ***2***


## Running code analysis tools
```
npm run slither
npm run mythril
```

## Deployment
In order to automatically deploy smart contracts to EVM node you have to create specific files for each environment:
- **.env.dev** - used for local development. Deploys contract to local ganache node.
- **.env.test** - test node config
- **.env.prod** - mainnet node config

After creating proper config files, you can deploy the contract by using proper command for each environment:
```
npm run deploy-dev
npm run deploy-test
npm run deploy-prod
```

## License

This project is licensed under [GPLv3](https://github.com/idriss-crypto/contracts/blob/main/LICENSE).
