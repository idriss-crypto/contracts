# SendToHash
This repo contains **SendToHash** contract together with tests and setup for Smart Contracts analysis tools like slither and myhtril.
## Setup
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

## Running code analysis tools
```
npm slither
npm mythril
```

## Deployment
In order to automatically deploy smart contracts to EVM node you have to create specific files for each environment:
- **.env.dev** - used for local development. Deploys contract to local ganache node.
- **.env.test** - test node config
- **.env.prod** - mainnet node config

After creating proper config files, you can deploy the contract by using proper command for each environment:
```
npm deploy-dev
npm deploy-test
npm deploy-prod
```