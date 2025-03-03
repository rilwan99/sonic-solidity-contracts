import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";

import { HardhatUserConfig } from "hardhat/config";

import "hardhat-deploy";
import "dotenv/config";
import {
  getEnvPrivateKeys,
  getStandardNamedAccounts,
} from "./typescript/hardhat/named-accounts";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      deploy: ["deploy-mocks", "deploy"],
      allowUnlimitedContractSize: true,
      saveDeployments: false, // allow testing without needing to remove the previous deployments
    },
    localhost: {
      deploy: ["deploy-mocks", "deploy"],
      saveDeployments: true,
    },
    ethereum_testnet: {
      url: `https://ethereum-sepolia-rpc.publicnode.com`,
      deploy: ["deploy-mocks", "deploy"],
      saveDeployments: true,
      accounts: getEnvPrivateKeys("ethereum_testnet"),
    },
    // A much cheaper EVM testnet for testing deployments
    fraxtal_testnet: {
      url: `https://fraxtal-holesky-rpc.publicnode.com`,
      deploy: ["deploy-mocks", "deploy"],
      saveDeployments: true,
      accounts: getEnvPrivateKeys("fraxtal_testnet"),
    },
  },
  namedAccounts: getStandardNamedAccounts(),
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deployments: "./deployments",
    deploy: "./deploy",
  },
  gasReporter: {
    enabled: false, // Enable this when testing new complex functions
  },
};

export default config;
