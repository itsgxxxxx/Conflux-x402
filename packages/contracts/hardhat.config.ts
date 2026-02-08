import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    confluxESpace: {
      url: "https://evmtestnet.confluxrpc.com",
      chainId: 71,
      accounts: process.env.FACILITATOR_PRIVATE_KEY
        ? [process.env.FACILITATOR_PRIVATE_KEY]
        : [],
    },
    confluxESpaceMainnet: {
      url: "https://evm.confluxrpc.com",
      chainId: 1030,
      accounts: process.env.FACILITATOR_PRIVATE_KEY
        ? [process.env.FACILITATOR_PRIVATE_KEY]
        : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
