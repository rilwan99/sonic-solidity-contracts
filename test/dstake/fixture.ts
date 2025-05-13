import hre from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "ethers"; // Import ethers directly if needed, but prefer hre.ethers
import {
  createDStableFixture,
  DStableFixtureConfig,
  DUSD_CONFIG,
} from "../dstable/fixtures"; // Adjust path if needed
import {
  getTokenContractForSymbol,
  TokenInfo,
} from "../../typescript/token/utils";
import {
  dStakeToken,
  dStakeCollateralVault,
  dStakeRouter,
  IDStableConversionAdapter,
  ERC20, // Use for tokens to avoid IERC20 ambiguity
} from "../../typechain-types"; // Adjust paths as needed
// Use specific IERC20 implementation to avoid ambiguity
import { IERC20 } from "../../typechain-types/@openzeppelin/contracts/token/ERC20/IERC20";
import {
  DSTAKE_DEPLOYMENT_TAG,
  SDUSD_DSTAKE_TOKEN_ID,
  SDUSD_COLLATERAL_VAULT_ID,
  SDUSD_ROUTER_ID,
  DUSD_A_TOKEN_WRAPPER_ID,
} from "../../typescript/deploy-ids";
import { expect } from "chai";
import { dLendFixture, DLendFixtureResult } from "../dlend/fixtures";

// Interface defining the structure of the fixture's config
export interface DStakeFixtureConfig {
  dStableSymbol: "dUSD" | "dS"; // Underlying dStable
  dStakeTokenSymbol: string; // e.g., "sdUSD"
  dStakeTokenContractId: string;
  collateralVaultContractId: string;
  routerContractId: string;
  // Specify the default vault asset for testing
  defaultVaultAssetSymbol: string; // e.g., "wddUSD"
  // Added name property for the dStakeToken
  name?: string; // Optional name for the token, will use "Staked {dStableSymbol}" if not provided
  underlyingDStableConfig: DStableFixtureConfig; // Config for the base dStable
  deploymentTags: string[]; // Tags needed to deploy dSTAKE and dependencies
}

// Configuration for the sdUSD dSTAKE system
export const SDUSD_CONFIG: DStakeFixtureConfig = {
  dStableSymbol: "dUSD",
  dStakeTokenSymbol: "sdUSD",
  dStakeTokenContractId: SDUSD_DSTAKE_TOKEN_ID,
  collateralVaultContractId: SDUSD_COLLATERAL_VAULT_ID,
  routerContractId: SDUSD_ROUTER_ID,
  defaultVaultAssetSymbol: "wddUSD", // Wrapped dLEND dUSD aToken
  underlyingDStableConfig: DUSD_CONFIG,
  // Include all tags needed for full deployment
  deploymentTags: [
    "local-setup",
    "oracles",
    "dStable",
    "dlend",
    DSTAKE_DEPLOYMENT_TAG,
  ],
};

/**
 * Creates a fixture for dSTAKE testing using real contracts and dependencies
 * This leverages the dLEND fixture to ensure all dependencies are properly set up
 */
export const createDStakeFixture = (config: DStakeFixtureConfig) => {
  return hre.deployments.createFixture(
    async (hre: HardhatRuntimeEnvironment) => {
      const { deployments, getNamedAccounts, ethers } = hre;
      const { deployer } = await getNamedAccounts();
      const deployerSigner = await ethers.getSigner(deployer);

      // Run full deployment fixture to ensure all dependencies are available
      try {
        await deployments.fixture(config.deploymentTags);
      } catch (error: any) {
        console.error("Error during deployment fixture setup:", error.message);
        // Fall back to mock deployments if real ones fail
        await deployments.fixture(["mocks"]);
      }

      // Get the dLEND fixture for aTokens
      const dLendFixtureResult = await dLendFixture();

      // Get the dStable token
      const { contract: dStableToken, tokenInfo: dStableInfo } =
        await getTokenContractForSymbol(hre, deployer, config.dStableSymbol);
      const dStableAddress = await dStableToken.getAddress();

      // Get dStake contracts from deployment
      const dStakeToken = await ethers.getContractAt(
        "dStakeToken",
        (await deployments.get(config.dStakeTokenContractId)).address
      );

      const collateralVault = await ethers.getContractAt(
        "dStakeCollateralVault",
        (await deployments.get(config.collateralVaultContractId)).address
      );

      const router = await ethers.getContractAt(
        "dStakeRouter",
        (await deployments.get(config.routerContractId)).address
      );

      // Get the wrapped aToken (vault asset)
      const wrappedATokenAddress = (
        await deployments.get(DUSD_A_TOKEN_WRAPPER_ID)
      ).address;
      const wrappedAToken = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        wrappedATokenAddress
      );

      // Get adapter from vault's registered adapters
      const vaultAssetAddress = wrappedATokenAddress;
      let adapterAddress;
      let adapter;
      try {
        adapterAddress =
          await collateralVault.adapterForAsset(vaultAssetAddress);
        adapter = await ethers.getContractAt(
          "IDStableConversionAdapter",
          adapterAddress
        );
      } catch (err: any) {
        console.warn(
          `Unable to get adapter for asset ${vaultAssetAddress}: ${err.message}`
        );
        // Set to null values that can be checked in tests
        adapterAddress = ethers.ZeroAddress;
        adapter = null;
      }

      // Return the deployed contracts and information
      return {
        config,
        dStakeToken,
        collateralVault,
        router,
        dStableToken: dStableToken as unknown as ERC20,
        dStableInfo,
        vaultAssetToken: wrappedAToken as unknown as IERC20,
        vaultAssetAddress,
        adapter,
        adapterAddress,
        deployer: deployerSigner,
        dLend: dLendFixtureResult, // Include dLEND for reference
      };
    }
  );
};
