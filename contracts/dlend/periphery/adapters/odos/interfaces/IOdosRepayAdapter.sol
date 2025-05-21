// SPDX-License-Identifier: AGPL-3.0
/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\  __-.  /\__  _\ /\  == \   /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \      *
 *   \ \ \/\ \ \/_/\ \/ \ \  __<   \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \     *
 *    \ \____-    \ \_\  \ \_\ \_\  \ \_\  \ \_\\"\_\  \ \_\    \ \_\  \/\_____\    *
 *     \/____/     \/_/   \/_/ /_/   \/_/   \/_/ \/_/   \/_/     \/_/   \/_____/    *
 *                                                                                  *
 * ————————————————————————————————— dtrinity.org ————————————————————————————————— *
 *                                                                                  *
 *                                         ▲                                        *
 *                                        ▲ ▲                                       *
 *                                                                                  *
 * ———————————————————————————————————————————————————————————————————————————————— *
 * dTRINITY Protocol: https://github.com/dtrinity                                   *
 * ———————————————————————————————————————————————————————————————————————————————— */

pragma solidity ^0.8.20;

import {IBaseOdosAdapter} from "./IBaseOdosAdapter.sol";

/**
 * @title IOdosRepayAdapter
 * @notice Interface for the OdosRepayAdapter
 */
interface IOdosRepayAdapter is IBaseOdosAdapter {
    /**
     * @dev Custom error for insufficient amount to repay
     * @param amountReceived The amount received from the swap
     * @param amountToRepay The amount needed to repay
     */
    error InsufficientAmountToRepay(
        uint256 amountReceived,
        uint256 amountToRepay
    );

    /**
     * @dev Struct for repay parameters
     * @param collateralAsset The address of the collateral asset
     * @param collateralAmount The amount of collateral to swap
     * @param debtAsset The address of the debt asset
     * @param repayAmount The amount of debt to repay
     * @param rateMode The rate mode of the debt (1 = stable, 2 = variable)
     * @param withFlashloan Whether to use a flashloan to repay the debt
     * @param user The address of the user
     * @param minAmountToReceive The minimum amount to receive from the swap
     * @param swapData The encoded swap data for Odos
     */
    struct RepayParams {
        address collateralAsset;
        uint256 collateralAmount;
        address debtAsset;
        uint256 repayAmount;
        uint256 rateMode;
        bool withFlashloan;
        address user;
        uint256 minAmountToReceive;
        bytes swapData;
    }

    /**
     * @notice Repays with collateral by swapping the collateral asset to debt asset
     * @param repayParams struct describing the repay with collateral swap
     * @param collateralATokenPermit optional permit for collateral aToken
     */
    function repayWithCollateral(
        RepayParams memory repayParams,
        PermitInput memory collateralATokenPermit
    ) external;
}
