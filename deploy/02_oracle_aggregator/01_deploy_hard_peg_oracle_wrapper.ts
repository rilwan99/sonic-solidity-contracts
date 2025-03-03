import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { HARD_PEG_ORACLE_WRAPPER_ID } from "../../typescript/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  await hre.deployments.deploy(HARD_PEG_ORACLE_WRAPPER_ID, {
    from: deployer,
    args: [
      config.oracleAggregator.hardDusdPeg,
      BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals),
    ],
    contract: "HardPegOracleWrapper",
    autoMine: true,
    log: false,
  });

  console.log(`🔮 ${__filename.split("/").slice(-2).join("/")}: ✅`);
  // Return true to indicate deployment success
  return true;
};

func.tags = ["oracle-aggregator", "oracle-wrapper", "hard-peg-oracle-wrapper"];
func.dependencies = [];
func.id = HARD_PEG_ORACLE_WRAPPER_ID;

export default func;
