import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  HARD_PEG_ORACLE_WRAPPER_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../typescript/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  const { address: oracleAggregatorAddress } = await hre.deployments.deploy(
    ORACLE_AGGREGATOR_ID,
    {
      from: deployer,
      args: [BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals)],
      contract: "OracleAggregator",
      autoMine: true,
      log: false,
    }
  );

  // Get OracleAggregator contract
  const oracleAggregatorContract = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(deployer)
  );

  // Set the oracle wrapper for dUSD
  const { address: hardPegOracleWrapperAddress } = await hre.deployments.get(
    HARD_PEG_ORACLE_WRAPPER_ID
  );
  console.log(
    "Setting oracle wrapper for dUSD to",
    hardPegOracleWrapperAddress
  );
  await oracleAggregatorContract.setOracle(
    config.oracleAggregator.dUSDAddress,
    hardPegOracleWrapperAddress
  );

  console.log(`🔮 ${__filename.split("/").slice(-2).join("/")}: ✅`);
  // Return true to indicate deployment success
  return true;
};

func.tags = ["oracle-aggregator"];
func.dependencies = ["oracle-wrapper"];
func.id = ORACLE_AGGREGATOR_ID;

export default func;
