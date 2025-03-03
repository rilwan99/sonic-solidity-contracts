import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  AMO_MANAGER_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../typescript/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { dusd } = await getConfig(hre);

  const { address: collateralVaultAddress } = await hre.deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID
  );

  const { address: oracleAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  await hre.deployments.deploy(AMO_MANAGER_ID, {
    from: deployer,
    args: [dusd.address, collateralVaultAddress, oracleAddress],
    contract: "AmoManager",
    autoMine: true,
    log: false,
  });

  console.log(`☯️ ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = `dUSD:${AMO_MANAGER_ID}`;
func.tags = ["dusd"];
func.dependencies = ["dUSD", COLLATERAL_VAULT_CONTRACT_ID];

export default func;
