import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import 'dotenv/config'
import crypto from 'crypto'

import { HardhatUserConfig, task } from 'hardhat/config'
import {Contract} from "ethers";

const IDrissArtifact = require('./src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/IDriss.json')
const MaticPriceAggregatorV3MockArtifact = require('./src/artifacts/src/contracts/mocks/MaticPriceAggregatorV3Mock.sol/MaticPriceAggregatorV3Mock.json')
const MockERC1155Artifact = require('./src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockERC1155.json')
const MockNFTArtifact = require('./src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockNFT.json')
const MockTokenArtifact = require('./src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockToken.json')
const SendToHashArtifact = require('./src/artifacts/src/contracts/SendToHash.sol/SendToHash.json')

// syntactic sugar to add accounts element only if property exists
const accounts = process.env.NETWORK_RPC_ENDPOINT_PRIVATE_KEY && {accounts: [process.env.NETWORK_RPC_ENDPOINT_PRIVATE_KEY]}

task('accounts', 'print all accounts', async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  console.log("Accounts: ", accounts.map(v => v.address))
})

task('setup', 'setup smart contracts for development', async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  let sendToHashContract
  let idrissContract: Contract
  let mockTokenContract: Contract
  let mockToken2Contract: Contract
  let mockNFTContract: Contract
  let mockERC1155Contract: Contract
  let mockPriceOracleContract: Contract
  let ownerAddress
  let signer1Address
  let signer2Address
  let signer3Address
  let signer4Address
  let signer1Hash
  let signer2Hash
  let signer3Hash
  let signer4Hash

  const digestMessage = async (message: string) => {
    return crypto.createHash('sha256').update(message).digest('hex');
  }

  [
    ownerAddress,
    signer1Address,
    signer2Address,
    signer3Address,
    signer4Address,
  ] = accounts.map(sig => { return sig.address })

  signer1Hash = await digestMessage('hello@idriss.xyz' + "5d181abc9dcb7e79ce50e93db97addc1caf9f369257f61585889870555f8c321")
  signer2Hash = await digestMessage('+16506655942' + "92c7f97fb58ddbcb06c0d5a7cb720d74bc3c3aa52a0d706e477562cba68eeb73")
  signer3Hash = await digestMessage('@IDriss_xyz' + "4b118a4f0f3f149e641c6c43dd70283fcc07eacaa624efc762aa3843d85b2aba")
  signer4Hash = await digestMessage('deliriusz.eth@gmail.com' + "ec72020f224c088671cfd623235b59c239964a95542713390a2b6ba07dd1151c")

  console.log(`
  Hardhat node
  ========

  Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
  Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

  Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
  Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

  Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000 ETH)
  Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

  Account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (10000 ETH)
  Private Key: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

  Account #4: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (10000 ETH)
  Private Key: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

  Account #5: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (10000 ETH)
  Private Key: 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
  `)

  console.log("Address => IDriss hash")
  console.table([
    {address: ownerAddress, hash: "N/A"},
    {address: signer1Address, hash: signer1Hash},
    {address: signer2Address, hash: signer2Hash},
    {address: signer3Address, hash: signer3Hash},
    {address: signer4Address, hash: signer4Hash},
  ])

  mockPriceOracleContract = await hre.ethers.getContractFactoryFromArtifact(MaticPriceAggregatorV3MockArtifact).then(contract => contract.deploy())
  idrissContract = await hre.ethers.getContractFactoryFromArtifact(IDrissArtifact).then(contract => contract.deploy())

  await Promise.all([
    mockPriceOracleContract.deployed(),
    idrissContract.deployed()
  ])

  sendToHashContract = await hre.ethers.getContractFactoryFromArtifact(SendToHashArtifact).then(contract => contract.deploy(idrissContract.address, mockPriceOracleContract.address))
  mockERC1155Contract = await hre.ethers.getContractFactoryFromArtifact(MockERC1155Artifact).then(contract => contract.deploy())
  mockNFTContract = await hre.ethers.getContractFactoryFromArtifact(MockNFTArtifact).then(contract => contract.deploy())
  mockTokenContract = await hre.ethers.getContractFactoryFromArtifact(MockTokenArtifact).then(contract => contract.deploy())
  mockToken2Contract = await hre.ethers.getContractFactoryFromArtifact(MockTokenArtifact).then(contract => contract.deploy())

  await Promise.all([
    sendToHashContract.deployed(),
    mockERC1155Contract.deployed(),
    mockNFTContract.deployed(),
    mockTokenContract.deployed(),
    mockToken2Contract.deployed(),
  ])

  await idrissContract.functions.addIDriss(signer1Hash, signer1Address)
  await idrissContract.functions.addIDriss(signer2Hash, signer2Address)
  await idrissContract.functions.addIDriss(signer3Hash, signer3Address)
  await idrissContract.functions.addIDriss(signer4Hash, signer4Address)
  await mockERC1155Contract.functions.mint(ownerAddress, 0,  1).catch(_ => {})
  await mockERC1155Contract.functions.mint(ownerAddress, 1,  1).catch(_ => {})
  await mockERC1155Contract.functions.mint(ownerAddress, 2,  10).catch(_ => {})
  await mockERC1155Contract.functions.mint(ownerAddress, 3,  90).catch(_ => {})
  await mockERC1155Contract.functions.mint(ownerAddress, 4,  500).catch(_ => {})
  await mockNFTContract.functions.safeMint(ownerAddress, 0).catch(e => {console.log(e)})
  await mockNFTContract.functions.safeMint(ownerAddress, 1).catch(e => {console.log(e)})
  await mockNFTContract.functions.safeMint(ownerAddress, 2).catch(e => {console.log(e)})
  await mockNFTContract.functions.safeMint(ownerAddress, 3).catch(e => {console.log(e)})
  await mockToken2Contract.functions.transfer(signer4Address, (await mockToken2Contract.functions.totalSupply()).toString())

  console.log("Deployed Contracts:")
  console.table([
    {name: "IDriss Registry", address: idrissContract.address},
    {name: "Price Oracle", address: mockPriceOracleContract.address},
    {name: "Send To Anyone", address: sendToHashContract.address},
    {name: "Mock ERC20", address: mockTokenContract.address},
    {name: "Mock ERC20 (2)", address: mockToken2Contract.address},
    {name: "Mock NFT", address: mockNFTContract.address},
    {name: "Mock ERC1155", address: mockERC1155Contract.address},
  ])
})

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    outDir: 'src/types',
    target: 'ethers-v5',
    // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
    alwaysGenerateOverloads: false,
    // optional array of glob patterns with external artifacts to process (for example external libs from node_modules)
    externalArtifacts: ['externalArtifacts/*.json'],
  },
  paths: {
    artifacts: 'src/artifacts',
    sources: 'src/contracts'
  },
  mocha: {
    timeout: 100000000000
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
    },
    ganache: {
      chainId: 1337, //event though config says it's 5777
      url: process.env.NETWORK_RPC_ENDPOINT ?? "http://127.0.0.1:7545",
      allowUnlimitedContractSize: true,
      ...(accounts)
    },
    mumbai: {
      chainId: 80001,
      url: process.env.NETWORK_RPC_ENDPOINT ?? "https://matic-mumbai.chainstacklabs.com",
      ...(accounts)
    },
    polygon_mainnet: {
      chainId: 137,
      url: process.env.NETWORK_RPC_ENDPOINT ?? "https://polygon-rpc.com",
      ...(accounts)
    },
    hardhat_node: {
      chainId: 1337,
      url: "http://127.0.0.1:8545",
      allowUnlimitedContractSize: true,
    }
  }
}
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default config
