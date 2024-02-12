import {HardhatUserConfig} from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    paths: {
        artifacts: "src/artifacts",
        sources: "src/contracts",
    },
    typechain: {
        outDir: "src/types",
        target: "ethers-v6",
        // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
        alwaysGenerateOverloads: false,
        // optional array of glob patterns with external artifacts to process (for example external libs from node_modules)
        externalArtifacts: ["externalArtifacts/*.json"],
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 1337,
            allowUnlimitedContractSize: true,
        },
        ganache: {
            chainId: 1337, //event though config says it's 5777
            url: "http://127.0.0.1:7545",
            allowUnlimitedContractSize: true,
            accounts: [process.env.PRIVATE_KEY!],
        },
        mumbai: {
            chainId: 80001,
            url: "https://matic-mumbai.chainstacklabs.com",
            accounts: [process.env.PRIVATE_KEY!],
        },
        polygon_mainnet: {
            chainId: 137,
            url: "https://polygon-rpc.com",
            accounts: [process.env.PRIVATE_KEY!],
        },
        sepolia: {
            chainId: 11155111,
            url: "https://rpc2.sepolia.org",
            accounts: [process.env.PRIVATE_KEY!],
        },
        ethereum: {
            chainId: 1,
            url: "https://eth.llamarpc.com",
            accounts: [process.env.PRIVATE_KEY!],
        },
        bnbTestnet: {
            chainId: 97,
            url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
            accounts: [process.env.PRIVATE_KEY!],
        },
        bnb: {
            chainId: 56,
            url: "https://bsc-dataseed.bnbchain.org/",
            accounts: [process.env.PRIVATE_KEY!],
        },
        optimisticGoerli: {
          chainId: 420,
          url: "https://goerli.optimism.io",
          accounts: [process.env.PRIVATE_KEY!],
        },
        optimisticEthereum: {
          chainId: 10,
          url: "https://mainnet.optimism.io",
          accounts: [process.env.PRIVATE_KEY!],
        },
        'base-goerli': {
          chainId: 84531,
          url: 'https://goerli.base.org',
          accounts: [process.env.PRIVATE_KEY!],
        },
        base: {
          chainId: 8453,
          url: 'https://mainnet.base.org',
          accounts: [process.env.PRIVATE_KEY!],
        },
        scrollSepolia: {
          chainId:534351,
          url: "https://sepolia-rpc.scroll.io/",
          accounts: [process.env.PRIVATE_KEY!],
        },
        Scroll: {
          chainId: 534352,
          url: "https://rpc.scroll.io ",
          accounts: [process.env.PRIVATE_KEY!],
        },
        mantleTest: {
          chainId: 5001,
          url: "https://rpc.testnet.mantle.xyz",
          accounts: [process.env.PRIVATE_KEY!],
        },
        mantle: {
          chainId: 5000,
          url: "https://rpc.mantle.xyz",
          accounts: [process.env.PRIVATE_KEY!],
        },
        linea_testnet: {
          chainId: 59140,
          url: 'https://rpc.goerli.linea.build',
          accounts: [process.env.PRIVATE_KEY!],
        },
        linea_mainnet: {
          chainId: 59144,
          url: 'https://rpc.linea.build',
          accounts: [process.env.PRIVATE_KEY!],
        },
        hardhat_node: {
            chainId: 1337,
            url: "http://127.0.0.1:8545",
            allowUnlimitedContractSize: true,
        },
    },
    etherscan: {
      apiKey: {
        optimisticGoerli: process.env.OPSCAN_KEY!,
        optimisticEthereum: process.env.OPSCAN_KEY!,
        ethereum: process.env.ETHERSCAN_KEY!,
        sepolia: process.env.ETHERSCAN_KEY!,
        mantleTest: process.env.MANTLE_KEY!,
        mantle: process.env.MANTLE_KEY!,
        scrollSepolia: process.env.SCROLL_KEY!,
        Scroll: process.env.SCROLL_KEY!,
        'base-goerli': process.env.BASESCAN_KEY!,
        base: process.env.BASESCAN_KEY!,
        linea_mainnet: process.env.LINEASCAN_KEY!
      },
      customChains: [
        {
          network: "linea_mainnet",
          chainId: 59144,
          urls: {
            apiURL: "https://api.lineascan.build/api",
            browserURL: "https://lineascan.build/"
          }
        },
        {
          network: "pgn",
          chainId: 424,
          urls: {
            apiURL: "https://explorer.publicgoods.network/api",
            browserURL: "https://explorer.publicgoods.network"
          }
        },
        {
          network: "mantleTest",
          chainId: 5001,
          urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz"
          }
        },
        {
          network: "mantle",
          chainId: 5000,
          urls: {
          apiURL: "https://explorer.mantle.xyz/api",
          browserURL: "https://explorer.mantle.xyz"
          }
        },
        {
          network: "scrollSepolia",
          chainId: 534351,
          urls: {
            apiURL: 'https://sepolia-blockscout.scroll.io/api',
            browserURL: 'https://sepolia-blockscout.scroll.io/',
          },
        },
        {
          network: 'Scroll',
          chainId: 534352,
          urls: {
            apiURL: 'https://blockscout.scroll.io/api',
            browserURL: 'https://blockscout.scroll.io/',
          },
        },
        {
          network: "base-goerli",
          chainId: 84531,
          urls: {
          //  apiURL: "https://api-goerli.basescan.org/api",
          //  browserURL: "https://goerli.basescan.org"
           apiURL: "https://base-goerli.blockscout.com/api",
           browserURL: "https://base-goerli.blockscout.com"
          }
        },
        {
          network: "base",
          chainId: 8453,
          urls: {
          //  apiURL: "https://api.basescan.org/api",
          //  browserURL: "https://basescan.org"
           apiURL: "https://base.blockscout.com/api",
           browserURL: "https://base.blockscout.com"
          }
        }
      ]
    }
};

export default config;
