# Contracts
A set of Solidity smart contracts used by IDriss.
## Setup
```
npm install
npx hardhat compile
```

## Running tests
```
npx hardhat test
```
### Or with coverage report
```
npx hardhat coverage
```

## Deployment
In order to automatically deploy smart contracts to EVM node you have to create specific files for each environment:
- **.env.dev** - Example variables needed for deployment and contract management
- **.env** - Create locally, mainnet node config

After creating proper config files, you can deploy the contract by using proper command for each environment:
```
npx hardhat run --network <network> scripts/deploy.ts
```

And verify them on the block explorer using
```
npx hardhat verify --network <network> <address> --constructor-args args.js
```

after adding the correct constructor args to `args.js`

## License

This project is licensed under [GPLv3](https://github.com/idriss-crypto/contracts/blob/main/LICENSE).
