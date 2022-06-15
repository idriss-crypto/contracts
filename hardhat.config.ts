import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'

import { HardhatUserConfig, task } from 'hardhat/config'

task('accounts', 'print all accounts', async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  console.log("Accounts: ", accounts.map(v => v.address))
})

const config: HardhatUserConfig = {
  solidity: "0.8.7",
  typechain: {
    outDir: 'src/types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false, // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
    externalArtifacts: ['externalArtifacts/*.json'], // optional array of glob patterns with external artifacts to process (for example external libs from node_modules)
  },
  paths: {
    artifacts: 'src/artifacts',
    sources: 'src/contracts'
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 1337,
    },
    rinkeby: {
      url: "https://eth-rinkeby.alchemyapi.io/v2/123abc123abc123abc123abc123abcde",
      // accounts: [privateKey1, privateKey2, ...]
    },
    ganache: {
      chainId: 1337, //event though config says it's 5777
      url: "http://127.0.0.1:7545",
    }
  }
}
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default config
