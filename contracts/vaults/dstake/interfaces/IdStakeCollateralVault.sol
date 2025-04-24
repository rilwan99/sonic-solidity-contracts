// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdStakeCollateralVault Interface
 * @notice Defines the external functions of the dStakeCollateralVault required by other
 *         contracts in the dSTAKE system, primarily the dStakeToken.
 */
interface IdStakeCollateralVault {
    /**
     * @notice Calculates the total value of all managed `vault assets` held by the vault,
     *         denominated in the underlying dSTABLE asset.
     * @dev This is typically called by the dStakeToken's `totalAssets()` function.
     * @return dStableValue The total value of managed assets in terms of the dSTABLE asset.
     */
    function getTotalAssetValue() external view returns (uint256 dStableValue);

    /**
     * @notice Returns the address of the underlying dSTABLE asset the vault operates with.
     * @return The address of the dSTABLE asset.
     */
    function asset() external view returns (address);
}
