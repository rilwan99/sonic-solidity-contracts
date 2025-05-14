import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { DStakeInstanceConfig } from "../../config/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { execute, read, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const config = await getConfig(hre);

  if (!config.dStake) {
    console.log(
      "No dStake configuration found for this network. Skipping configuration.",
    );
    return;
  }

  // Validate all configs before configuring anything
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;

    if (
      !instanceConfig.dStable ||
      instanceConfig.dStable === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing dStable address for dSTAKE instance ${instanceKey}`,
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
        `Missing initialAdmin for dSTAKE instance ${instanceKey}`,
      );
    }

    if (
      !instanceConfig.initialFeeManager ||
      instanceConfig.initialFeeManager === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing initialFeeManager for dSTAKE instance ${instanceKey}`,
      );
    }

    if (typeof instanceConfig.initialWithdrawalFeeBps !== "number") {
      throw new Error(
        `Missing initialWithdrawalFeeBps for dSTAKE instance ${instanceKey}`,
      );
    }

    if (!instanceConfig.adapters || !Array.isArray(instanceConfig.adapters)) {
      throw new Error(
        `Missing adapters array for dSTAKE instance ${instanceKey}`,
      );
    }

    if (
      !instanceConfig.defaultDepositVaultAsset ||
      instanceConfig.defaultDepositVaultAsset === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing defaultDepositVaultAsset for dSTAKE instance ${instanceKey}`,
      );
    }

    if (
      !instanceConfig.collateralExchangers ||
      !Array.isArray(instanceConfig.collateralExchangers)
    ) {
      throw new Error(
        `Missing collateralExchangers array for dSTAKE instance ${instanceKey}`,
      );
    }
  }

  // All configs are valid, proceed with configuration
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;
    const dStakeTokenDeploymentName = `dStakeToken_${instanceKey}`;
    const collateralVaultDeploymentName = `dStakeCollateralVault_${instanceKey}`;
    const routerDeploymentName = `dStakeRouter_${instanceKey}`;

    const _dStakeTokenDeployment = await get(dStakeTokenDeploymentName);
    const collateralVaultDeployment = await get(collateralVaultDeploymentName);
    const routerDeployment = await get(routerDeploymentName);

    const initialAdmin = instanceConfig.initialAdmin;
    const initialFeeManager = instanceConfig.initialFeeManager;

    const adminSigner = initialAdmin === deployer ? deployer : initialAdmin;
    const feeManagerSigner =
      initialFeeManager === deployer ? deployer : initialFeeManager;

    // --- Configure dStakeToken ---
    const currentRouter = await read(dStakeTokenDeploymentName, "router");

    if (currentRouter !== routerDeployment.address) {
      await execute(
        dStakeTokenDeploymentName,
        { from: adminSigner, log: false },
        "setRouter",
        routerDeployment.address,
      );
    }
    const currentVault = await read(
      dStakeTokenDeploymentName,
      "collateralVault",
    );

    if (currentVault !== collateralVaultDeployment.address) {
      await execute(
        dStakeTokenDeploymentName,
        { from: adminSigner, log: false },
        "setCollateralVault",
        collateralVaultDeployment.address,
      );
    }
    const currentFee = await read(
      dStakeTokenDeploymentName,
      "withdrawalFeeBps",
    );

    if (
      currentFee.toString() !==
      instanceConfig.initialWithdrawalFeeBps.toString()
    ) {
      await execute(
        dStakeTokenDeploymentName,
        { from: feeManagerSigner, log: false },
        "setWithdrawalFee",
        instanceConfig.initialWithdrawalFeeBps,
      );
    }

    // --- Configure dStakeCollateralVault ---
    const vaultRouter = await read(collateralVaultDeploymentName, "router");
    const vaultRouterRole = await read(
      collateralVaultDeploymentName,
      "ROUTER_ROLE",
    );
    const isRouterRoleGranted = await read(
      collateralVaultDeploymentName,
      "hasRole",
      vaultRouterRole,
      routerDeployment.address,
    );

    if (vaultRouter !== routerDeployment.address || !isRouterRoleGranted) {
      await execute(
        collateralVaultDeploymentName,
        { from: adminSigner, log: false },
        "setRouter",
        routerDeployment.address,
      );
    }

    for (const adapterConfig of instanceConfig.adapters) {
      const adapterDeploymentName = `${adapterConfig.adapterContract}_${instanceConfig.symbol}`;
      const adapterDeployment = await get(adapterDeploymentName);
      const vaultAssetAddress = adapterConfig.vaultAsset;
      const currentAdapter = await read(
        collateralVaultDeploymentName,
        "adapterForAsset",
        vaultAssetAddress,
      );

      if (currentAdapter !== adapterDeployment.address) {
        await execute(
          collateralVaultDeploymentName,
          { from: adminSigner, log: false },
          "addAdapter",
          vaultAssetAddress,
          adapterDeployment.address,
        );
      }
    }

    // --- Configure dStakeRouter ---
    const collateralExchangerRole = await read(
      routerDeploymentName,
      "COLLATERAL_EXCHANGER_ROLE",
    );

    for (const adapterConfig of instanceConfig.adapters) {
      const adapterDeploymentName = `${adapterConfig.adapterContract}_${instanceConfig.symbol}`;
      const adapterDeployment = await get(adapterDeploymentName);
      const vaultAssetAddress = adapterConfig.vaultAsset;
      const currentAdapter = await read(
        routerDeploymentName,
        "vaultAssetToAdapter",
        vaultAssetAddress,
      );

      if (currentAdapter !== adapterDeployment.address) {
        await execute(
          routerDeploymentName,
          { from: adminSigner, log: false },
          "addAdapter",
          vaultAssetAddress,
          adapterDeployment.address,
        );
      }
    }

    const currentDefaultAsset = await read(
      routerDeploymentName,
      "defaultDepositVaultAsset",
    );

    if (currentDefaultAsset !== instanceConfig.defaultDepositVaultAsset) {
      await execute(
        routerDeploymentName,
        { from: adminSigner, log: false },
        "setDefaultDepositVaultAsset",
        instanceConfig.defaultDepositVaultAsset,
      );
    }

    for (const exchanger of instanceConfig.collateralExchangers) {
      const hasRole = await read(
        routerDeploymentName,
        "hasRole",
        collateralExchangerRole,
        exchanger,
      );

      if (!hasRole) {
        await execute(
          routerDeploymentName,
          { from: adminSigner, log: false },
          "addCollateralExchanger",
          exchanger,
        );
      }
    }
  }

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["dStakeConfigure", "dStake"];
func.dependencies = ["dStakeCore", "dStakeAdapters"];
func.runAtTheEnd = true;
