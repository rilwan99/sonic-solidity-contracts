// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdStakeRouter Interface
 * @notice Defines the external functions of the dStakeRouter required by the dStakeToken
 *         for handling deposits and withdrawals.
 */
interface IDStakeRouter {
    /**
     * @notice Handles the conversion of deposited dStable asset into a chosen `vaultAsset`
     *         and informs the collateral vault.
     * @dev Called by `dStakeToken._deposit()` after the token has received the dStable asset.
     * @dev The router MUST pull `dStableAmount` from the caller (`dStakeToken`).
     * @param dStableAmount The amount of dStable asset deposited by the user into the dStakeToken.
     * @param receiver The ultimate receiver of the minted dSTAKE shares (passed through for potential future use/events).
     */
    function deposit(uint256 dStableAmount, address receiver) external;

    /**
     * @notice Handles the conversion of a `vaultAsset` back into the dStable asset for withdrawal.
     * @dev Called by `dStakeToken._withdraw()`.
     * @dev The router coordinates pulling the required `vaultAsset` from the collateral vault
     *      and ensuring the converted dStable asset is sent to the `receiver`.
     * @param dStableAmount The amount of dStable asset to be withdrawn to the `receiver` (after vault fees).
     * @param receiver The address that will receive the withdrawn dStable asset.
     * @param owner The original owner initiating the withdrawal (typically the user burning shares).
     */
    function withdraw(
        uint256 dStableAmount,
        address receiver,
        address owner
    ) external;
}
