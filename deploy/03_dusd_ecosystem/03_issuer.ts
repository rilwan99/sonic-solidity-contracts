import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  AMO_MANAGER_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
  ISSUER_CONTRACT_ID,
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
  const { dusd } = await getConfig(hre);
  const { address: amoManagerAddress } =
    await hre.deployments.get(AMO_MANAGER_ID);

  await hre.deployments.deploy(ISSUER_CONTRACT_ID, {
    from: deployer,
    args: [
      collateralVaultAddress,
      dusd.address,
      oracleAggregatorAddress,
      amoManagerAddress,
    ],
    contract: "Issuer",
    autoMine: true,
    log: false,
  });

  // Get the deployed Issuer contract address
  const { address: issuerAddress } =
    await hre.deployments.get(ISSUER_CONTRACT_ID);

  // Grant MINTER_ROLE to the Issuer contract so it can mint dUSD
  const dusdContract = await hre.ethers.getContractAt(
    "ERC20StablecoinUpgradeable",
    dusd.address
  );

  const MINTER_ROLE = await dusdContract.MINTER_ROLE();

  await dusdContract.grantRole(MINTER_ROLE, issuerAddress);
  console.log(`Granted MINTER_ROLE to Issuer contract at ${issuerAddress}`);

  console.log(`☯️ ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = `dUSD:${ISSUER_CONTRACT_ID}`;
func.tags = ["dusd"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
  AMO_MANAGER_ID,
];

export default func;
