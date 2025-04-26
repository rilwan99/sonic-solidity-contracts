import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network, ethers } from "hardhat";

import { getConfig } from "../../config/config";
import { DStakeInstanceConfig } from "../../config/types";
import { DUSD_TOKEN_ID, DS_TOKEN_ID } from "../../typescript/deploy-ids"; // Assuming these IDs exist

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("-----------------------------------------------------");
  console.log("Deploying dSTAKE Core Contracts...");

  const config = await getConfig(hre);

  if (!config.dStake) {
    console.log(
      "No dStake configuration found for this network. Skipping core deployment."
    );
    return;
  }

  // Validate all configs before deploying anything
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;
    if (
      !instanceConfig.dStable ||
      instanceConfig.dStable === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing dStable address for dSTAKE instance ${instanceKey}`
      );
    }
    if (!instanceConfig.symbol) {
      throw new Error(`Missing symbol for dSTAKE instance ${instanceKey}`);
    }
    if (!instanceConfig.name) {
      throw new Error(`Missing name for dSTAKE instance ${instanceKey}`);
    }
    if (
      !instanceConfig.initialAdmin ||
      instanceConfig.initialAdmin === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing initialAdmin for dSTAKE instance ${instanceKey}`
      );
    }
    if (
      !instanceConfig.initialFeeManager ||
      instanceConfig.initialFeeManager === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing initialFeeManager for dSTAKE instance ${instanceKey}`
      );
    }
    if (typeof instanceConfig.initialWithdrawalFeeBps !== "number") {
      throw new Error(
        `Missing initialWithdrawalFeeBps for dSTAKE instance ${instanceKey}`
      );
    }
    if (!instanceConfig.adapters || !Array.isArray(instanceConfig.adapters)) {
      throw new Error(
        `Missing adapters array for dSTAKE instance ${instanceKey}`
      );
    }
    if (
      !instanceConfig.defaultDepositVaultAsset ||
      instanceConfig.defaultDepositVaultAsset === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing defaultDepositVaultAsset for dSTAKE instance ${instanceKey}`
      );
    }
    if (
      !instanceConfig.collateralExchangers ||
      !Array.isArray(instanceConfig.collateralExchangers)
    ) {
      throw new Error(
        `Missing collateralExchangers array for dSTAKE instance ${instanceKey}`
      );
    }
  }

  // All configs are valid, proceed with deployment
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;
    const dStakeTokenDeploymentName = `dStakeToken_${instanceKey}`;
    const dStakeTokenDeployment = await deploy(dStakeTokenDeploymentName, {
      from: deployer,
      contract: "dStakeToken",
      args: [
        instanceConfig.dStable,
        instanceConfig.name,
        instanceConfig.symbol,
        instanceConfig.initialAdmin,
        instanceConfig.initialFeeManager,
      ],
      log: false,
    });
    console.log(
      `    Deployed ${dStakeTokenDeploymentName} at ${dStakeTokenDeployment.address}`
    );

    const collateralVaultDeploymentName = `dStakeCollateralVault_${instanceKey}`;
    const collateralVaultDeployment = await deploy(
      collateralVaultDeploymentName,
      {
        from: deployer,
        contract: "dStakeCollateralVault",
        args: [dStakeTokenDeployment.address, instanceConfig.dStable],
        log: false,
      }
    );
    console.log(
      `    Deployed ${collateralVaultDeploymentName} at ${collateralVaultDeployment.address}`
    );

    const routerDeploymentName = `dStakeRouter_${instanceKey}`;
    const routerDeployment = await deploy(routerDeploymentName, {
      from: deployer,
      contract: "dStakeRouter",
      args: [dStakeTokenDeployment.address, collateralVaultDeployment.address],
      log: false,
    });
    console.log(
      `    Deployed ${routerDeploymentName} at ${routerDeployment.address}`
    );
  }

  console.log("dSTAKE Core Contracts Deployed!");
  console.log("-----------------------------------------------------");
};

export default func;
func.tags = ["dStakeCore", "dStake"];
// Depends on adapters being deployed if adapters need to be configured *during* core deployment (unlikely)
// Primarily depends on the underlying dStable tokens being deployed.
func.dependencies = ["dStable", "Mocks"]; // Ensure dUSD/dS are deployed
