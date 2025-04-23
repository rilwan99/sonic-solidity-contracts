// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.20;

import {IPool} from "contracts/dlend/core/interfaces/IPool.sol";
import {IRewardsController} from "contracts/dlend/periphery/rewards/interfaces/IRewardsController.sol";

/**
 * @title IInitializableStaticATokenLM
 * @notice Interface for the initialize function on StaticATokenLM
 * @author Aave
 **/
interface IInitializableStaticATokenLM {
    // Removed initialize function and Initialized event as contract is no longer upgradeable
}
