import hre from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "ethers"; // Import ethers directly if needed, but prefer hre.ethers
import {
  createDStableFixture,
  DStableFixtureConfig,
  DUSD_CONFIG,
  DS_CONFIG, // Import DS_CONFIG to use it in DStake config
} from "../dstable/fixtures"; // Adjust path if needed
import {
  getTokenContractForSymbol,
  TokenInfo,
} from "../../typescript/token/utils";
import {
  DStakeToken,
  DStakeCollateralVault,
  DStakeRouter,
  IdStableConversionAdapter,
  ERC20, // Use for tokens to avoid IERC20 ambiguity
} from "../../typechain-types"; // Adjust paths as needed
// Use specific IERC20 implementation to avoid ambiguity
import { IERC20 } from "../../typechain-types/@openzeppelin/contracts/token/ERC20/IERC20";
import {
  DSTAKE_DEPLOYMENT_TAG,
  SDUSD_DSTAKE_TOKEN_ID,
  SDUSD_COLLATERAL_VAULT_ID,
  SDUSD_ROUTER_ID,
  SDS_DSTAKE_TOKEN_ID,
  SDS_COLLATERAL_VAULT_ID,
  SDS_ROUTER_ID,
  DUSD_A_TOKEN_WRAPPER_ID,
  DS_A_TOKEN_WRAPPER_ID, // Import DS_A_TOKEN_WRAPPER_ID
} from "../../typescript/deploy-ids";
import { dLendFixture } from "../dlend/fixtures";

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

// Add configuration for the sDS dSTAKE system
export const SDS_CONFIG: DStakeFixtureConfig = {
  dStableSymbol: "dS",
  dStakeTokenSymbol: "sDS",
  dStakeTokenContractId: SDS_DSTAKE_TOKEN_ID,
  collateralVaultContractId: SDS_COLLATERAL_VAULT_ID,
  routerContractId: SDS_ROUTER_ID,
  defaultVaultAssetSymbol: "wdS", // Placeholder - need to define the wrapped aToken symbol
  underlyingDStableConfig: DS_CONFIG,
  deploymentTags: [
    "local-setup",
    "oracles",
    "dStable", // Need to ensure dS is included in dStable deployment
    "dlend", // Need to ensure wDS aToken is deployed
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
      await deployments.fixture(config.deploymentTags);

      // Get the dStable token
      const { contract: dStableToken, tokenInfo: dStableInfo } =
        await getTokenContractForSymbol(hre, deployer, config.dStableSymbol);

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
      // Need to determine the correct aToken wrapper ID based on the dStable symbol
      const wrappedATokenAddress = (
        await deployments.get(
          config.dStableSymbol === "dUSD"
            ? DUSD_A_TOKEN_WRAPPER_ID
            : DS_A_TOKEN_WRAPPER_ID
        )
      ).address;
      const wrappedAToken = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        wrappedATokenAddress
      );

      // Get adapter from vault's registered adapters
      const vaultAssetAddress = wrappedATokenAddress;
      let adapterAddress;
      let adapter;
      adapterAddress = await collateralVault.adapterForAsset(vaultAssetAddress);
      if (adapterAddress !== ethers.ZeroAddress) {
        adapter = await ethers.getContractAt(
          "IdStableConversionAdapter",
          adapterAddress
        );
      } else {
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
      };
    }
  );
};
