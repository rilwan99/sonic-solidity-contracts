import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  COLLATERAL_VAULT_CONTRACT_ID,
  REDEEMER_CONTRACT_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../typescript/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  // Get deployed addresses
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  const { address: collateralVaultAddress } = await hre.deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID
  );
  const collateralVault = await hre.ethers.getContractAt(
    "CollateralHolderVault",
    collateralVaultAddress,
    await hre.ethers.getSigner(deployer)
  );
  const { dusd } = await getConfig(hre);

  const deployment = await hre.deployments.deploy(REDEEMER_CONTRACT_ID, {
    from: deployer,
    args: [collateralVaultAddress, dusd.address, oracleAggregatorAddress],
    contract: "Redeemer",
    autoMine: true,
    log: false,
  });

  console.log("Allowing Redeemer to withdraw collateral");
  await collateralVault.grantRole(
    await collateralVault.COLLATERAL_WITHDRAWER_ROLE(),
    deployment.address
  );

  console.log(`☯️ ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = `dUSD:${REDEEMER_CONTRACT_ID}`;
func.tags = ["dusd"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
];

export default func;
