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
      contract: "DStakeToken",
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
        contract: "DStakeCollateralVault",
        args: [dStakeTokenDeployment.address, instanceConfig.dStable],
        log: false,
      }
    );
    console.log(
      `    Deployed ${collateralVaultDeploymentName} at ${collateralVaultDeployment.address}`
    );

    // --- Grant initial roles ---
    // Grant DEFAULT_ADMIN_ROLE on CollateralVault to the configured initialAdmin
    const collateralVault = await hre.ethers.getContractAt(
      "DStakeCollateralVault",
      collateralVaultDeployment.address
    );
    const adminRole = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE is bytes32(0)
    const hasAdminRole = await collateralVault.hasRole(
      adminRole,
      instanceConfig.initialAdmin
    );
    if (!hasAdminRole) {
      const tx = await collateralVault.grantRole(
        adminRole,
        instanceConfig.initialAdmin
      );
      await tx.wait(); // Wait for the transaction to be mined
      console.log(
        `      Granted DEFAULT_ADMIN_ROLE on ${collateralVaultDeploymentName} to ${instanceConfig.initialAdmin}`
      );
    } else {
      console.log(
        `      Skipping: ${instanceConfig.initialAdmin} already has DEFAULT_ADMIN_ROLE on ${collateralVaultDeploymentName}`
      );
    }
    // Note: DStakeToken grants admin/fee roles in its constructor based on config

    const routerDeploymentName = `dStakeRouter_${instanceKey}`;
    const routerDeployment = await deploy(routerDeploymentName, {
      from: deployer,
      contract: "DStakeRouter",
      args: [dStakeTokenDeployment.address, collateralVaultDeployment.address],
      log: false,
    });
    console.log(
      `    Deployed ${routerDeploymentName} at ${routerDeployment.address}`
    );

    // --- Grant Router Admin Role to Initial Admin ---
    // Router's DEFAULT_ADMIN_ROLE is initially msg.sender (deployer)
    const router = await hre.ethers.getContractAt(
      "DStakeRouter",
      routerDeployment.address
    );
    const routerAdminRole = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE is bytes32(0)

    // Grant the role from deployer to initialAdmin
    const hasRouterAdminRole = await router.hasRole(
      routerAdminRole,
      instanceConfig.initialAdmin
    );
    if (!hasRouterAdminRole) {
      const grantTx = await router
        .connect(await hre.ethers.getSigner(deployer)) // Ensure tx is from deployer
        .grantRole(routerAdminRole, instanceConfig.initialAdmin);
      await grantTx.wait();
      console.log(
        `      Granted Router DEFAULT_ADMIN_ROLE from deployer to ${instanceConfig.initialAdmin}`
      );

      // Optional: Renounce the role from the deployer if it's no longer needed
      // const renounceTx = await router.connect(await hre.ethers.getSigner(deployer)).renounceRole(routerAdminRole, deployer);
      // await renounceTx.wait();
      // console.log(`      Renounced Router DEFAULT_ADMIN_ROLE from deployer`);
    } else {
      console.log(
        `      Skipping: ${instanceConfig.initialAdmin} already has Router DEFAULT_ADMIN_ROLE`
      );
    }
  }

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["dStakeCore", "dStake"];
// Depends on adapters being deployed if adapters need to be configured *during* core deployment (unlikely)
// Primarily depends on the underlying dStable tokens being deployed.
func.dependencies = ["dStable", "Mocks"]; // Ensure dUSD/dS are deployed
