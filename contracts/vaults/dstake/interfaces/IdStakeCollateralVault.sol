// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdStakeCollateralVault Interface
 * @notice Defines the external functions of the dStakeCollateralVault required by other
 *         contracts in the dSTAKE system, primarily the dStakeToken.
 */
interface IDStakeCollateralVault {
    /**
     * @notice Calculates the total value of all managed `vault assets` held by the vault,
     *         denominated in the underlying dStable asset.
     * @dev This is typically called by the dStakeToken's `totalAssets()` function.
     * @return dStableValue The total value of managed assets in terms of the dStable asset.
     */
    function totalValueInDStable() external view returns (uint256 dStableValue);

    /**
     * @notice Returns the address of the underlying dStable asset the vault operates with.
     * @return The address of the dStable asset.
     */
    function dStable() external view returns (address);
}
