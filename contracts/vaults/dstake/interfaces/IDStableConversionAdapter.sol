// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDStableConversionAdapter Interface
 * @notice Interface for contracts that handle the conversion between the core dSTABLE asset
 *         and a specific yield-bearing or convertible ERC20 token (`vault asset`), as well as
 *         valuing that `vault asset` in terms of the dSTABLE asset.
 * @dev Implementations interact with specific protocols (lending pools, DEX LPs, wrappers, etc.).
 */
interface IDStableConversionAdapter {
    /**
     * @notice Converts a specified amount of the dSTABLE asset into the specific `vaultAsset`
     *         managed by this adapter.
     * @dev The adapter MUST pull `dStableAmount` of the dSTABLE asset from the caller (expected to be the Router).
     * @dev The resulting `vaultAsset` MUST be sent/deposited/minted directly to the `collateralVault` address provided during adapter setup or retrieved.
     * @param dStableAmount The amount of dSTABLE asset to convert.
     * @return vaultAsset The address of the specific `vault asset` token managed by this adapter.
     * @return vaultAssetAmount The amount of `vaultAsset` generated from the conversion.
     */
    function convertToVaultAsset(
        uint256 dStableAmount
    ) external returns (address vaultAsset, uint256 vaultAssetAmount);

    /**
     * @notice Converts a specific `vaultAsset` back into the dSTABLE asset.
     * @dev The adapter determines the amount of `vaultAsset` needed based on the target `dStableAmount`.
     * @dev The adapter MUST pull the required amount of `vaultAsset` from the caller (expected to be the Router).
     * @dev The resulting dSTABLE asset MUST be sent to the `receiver`.
     * @param dStableAmount The target amount of dSTABLE asset to be received by the `receiver`.
     * @param receiver The address to receive the converted dSTABLE asset.
     * @return convertedDStableAmount The actual amount of dSTABLE asset sent to the `receiver`.
     */
    function convertFromVaultAsset(
        uint256 dStableAmount,
        address receiver
    ) external returns (uint256 convertedDStableAmount);

    /**
     * @notice Calculates the value of a given amount of the specific `vaultAsset` managed by this adapter
     *         in terms of the dSTABLE asset.
     * @param vaultAsset The address of the vault asset token (should match getVaultAsset()). Included for explicitness.
     * @param vaultAssetAmount The amount of the `vaultAsset` to value.
     * @return dStableValue The equivalent value in the dSTABLE asset.
     */
    function getAssetValue(
        address vaultAsset,
        uint256 vaultAssetAmount
    ) external view returns (uint256 dStableValue);

    /**
     * @notice Returns the address of the specific `vault asset` token managed by this adapter.
     * @return The address of the `vault asset`.
     */
    function getVaultAsset() external view returns (address);
}
