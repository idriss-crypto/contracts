import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from 'dotenv';

dotenv.config();


const config: HardhatUserConfig = {
  solidity: {
      version: "0.8.19",
      settings: {
          optimizer: {
              enabled: true,
              runs: 400,
          },
      },
  },
  paths: {
      artifacts: "src/artifacts",
      sources: "src/contracts",
  },
  defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 1337,
            allowUnlimitedContractSize: true,
        },
        mainnet: {
          url: "https://eth.drpc.org",
          accounts: [process.env.PRIVATE_KEY!],
          chainId: 1
        },
        sepolia: {
            chainId: 11155111,
            url: "https://rpc2.sepolia.org",
            accounts: [process.env.PRIVATE_KEY!],
        },
        base: {
          chainId: 8453,
          url: 'https://mainnet.base.org',
          accounts: [process.env.PRIVATE_KEY!],
        },
        optimism: {
          chainId: 10,
          url: 'https://mainnet.optimism.io',
          accounts: [process.env.PRIVATE_KEY!],
        },
        arbitrum: {
          chainId: 42161, 
          url: 'https://arb1.arbitrum.io/rpc', 
          accounts: [process.env.PRIVATE_KEY!], 
        },
        linea_mainnet: {
          chainId: 59144,
          url: 'https://rpc.linea.build',
          accounts: [process.env.PRIVATE_KEY!],
        },
        "base-sepolia": {
          chainId: 84532,
          url: 'https://sepolia.base.org',
          accounts: [process.env.PRIVATE_KEY!],
        },
        hardhat_node: {
            chainId: 1337,
            url: "http://127.0.0.1:8545",
            allowUnlimitedContractSize: true,
        }
      },
      etherscan: {
        apiKey: {
          mainnet: process.env.ETHERSCAN_KEY!,
          sepolia: process.env.ETHERSCAN_KEY!,
          'base-sepolia': process.env.BASESCAN_KEY!,
          base: process.env.BASESCAN_KEY!,
          optimism: process.env.BASESCAN_KEY!,
          optimisticEthereum: process.env.OPSCAN_KEY!,
          arbitrum: process.env.ARBSCAN_KEY!,
          arbitrumOne: process.env.ARBSCAN_KEY!,
          linea_mainnet: process.env.LINEASCAN_KEY!
        },
        customChains: [
          {
            network: "base-sepolia",
            chainId: 84532,
            urls: {
              apiURL: "https://api-sepolia.basescan.org/api",
              browserURL: "https://sepolia.basescan.org"
            }
          },
          {
            network: "base",
            chainId: 8453,
            urls: {
             apiURL: "https://api.basescan.org/api",
             browserURL: "https://basescan.org"
            }
          }
        ]
      }
};

export default config;
