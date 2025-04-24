**Core Concept:**

dSTAKE allows users to stake a dSTABLE token (like dUSD) to earn yield. The deposited dSTABLE is converted into various yield-bearing or convertible ERC20 tokens (`vault assets`) held in a collateral vault. The user receives an ERC4626-compliant vault token (e.g., `sdUSD`) representing their pro-rata share of the total managed assets. This share token appreciates over time as the underlying `vault assets` generate yield or increase in value relative to the dSTABLE asset.

**Contracts:**

1.  **`dStakeToken.sol` (e.g., `sdUSD`)**
    *   **Type:** ERC4626 Vault Token (Non-Upgradeable)
    *   **Inherits:** `ERC4626`, `AccessControl`
    *   **Core Logic:** Minimal, immutable ERC4626 implementation handling share accounting (`sdUSD` mint/burn) relative to the underlying dSTABLE asset. Delegates complex operations.
    *   **Key State:**
        *   `dStable`: Address of the underlying dSTABLE token (e.g., dUSD). Immutable.
        *   `collateralVault`: Address of the `dStakeCollateralVault`. Settable by `DEFAULT_ADMIN_ROLE`.
        *   `router`: Address of the `dStakeRouter`. Settable by `DEFAULT_ADMIN_ROLE`.
        *   `withdrawalFeeBps`: Fee charged on withdrawal (in dSTABLE terms). Settable by `FEE_MANAGER_ROLE`.
        *   `maxWithdrawalFeeBps`: Hardcoded maximum for `withdrawalFeeBps`.
    *   **Roles:**
        *   `DEFAULT_ADMIN_ROLE`: Can set `collateralVault`, `router`, manage other roles.
        *   `FEE_MANAGER_ROLE`: Can set `withdrawalFeeBps` up to `maxWithdrawalFeeBps`.
    *   **Delegation:**
        *   `totalAssets()`: Delegates to `dStakeCollateralVault.getTotalAssetValue()` (returns value in dSTABLE terms).
        *   `_deposit()`: Takes user's dSTABLE, then delegates deposit logic to `dStakeRouter.deposit()`.
        *   `_withdraw()`: Calculates fee, then delegates withdrawal logic to `dStakeRouter.withdraw()`.

2.  **`dStakeCollateralVault.sol`**
    *   **Type:** Asset Management Contract (Non-Upgradeable, replaceable)
    *   **Purpose:** Holds various ERC20 `vault assets` that can be priced in the dSTABLE asset. Calculates total value. Avoids holding rebasing tokens directly (must be wrapped).
    *   **Key State:**
        *   `stakeToken`: Address of the `dStakeToken`. Immutable.
        *   `dStable`: Address of the underlying dSTABLE token (`dStakeToken.asset()`). Immutable.
        *   `router`: Address of the `dStakeRouter`. Settable by `stakeToken` admin.
        *   `adapterForAsset`: `mapping(address vaultAsset => address adapter)`. Maps `vault asset` to its `IDStableConversionAdapter`. Managed by `stakeToken` admin.
        *   `supportedAssets`: `address[]`. List of `vault asset` addresses. Managed by `stakeToken` admin.
    *   **Key Functions:**
        *   `getTotalAssetValue() returns (uint256 dStableValue)`: Iterates `supportedAssets`, calls `adapter.getAssetValue()` for each, sums results. View.
        *   `receiveAsset(address vaultAsset, uint256 amount)`: Acknowledges `vaultAsset` receipt. `onlyRouter`.
        *   `sendAsset(address vaultAsset, uint256 amount, address recipient)`: Sends `vaultAsset`. `onlyRouter`.
        *   `addAdapter(address vaultAsset, address adapterAddress)`: Governance (`stakeToken` admin) to add asset/adapter.
        *   `removeAdapter(address vaultAsset)`: Governance (`stakeToken` admin) to remove asset/adapter (requires zero balance).
        *   `setRouter(address newRouter)`: Governance (`stakeToken` admin).
        *   `asset() returns (address)`: Returns dSTABLE asset address. View.

3.  **`dStakeRouter.sol`**
    *   **Type:** Logic/Routing Contract (Non-Upgradeable, replaceable)
    *   **Purpose:** Converts dSTABLE asset <=> `vault assets` via Adapters. Handles deposit/withdraw routing and asset exchange/rebalancing.
    *   **Key State:**
        *   `dStakeToken`: Address of `dStakeToken`. Immutable.
        *   `collateralVault`: Address of `dStakeCollateralVault`. Immutable.
        *   `dStable`: Address of the dSTABLE token (`stakeToken.asset()`). Immutable.
        *   `conversionAdapters`: `mapping(bytes32 protocolId => address adapter)`. Managed by `stakeToken` admin.
        *   `protocolIds`: `bytes32[]`. Managed by `stakeToken` admin.
        *   `defaultDepositProtocolId`: Default strategy ID for new deposits. Settable by `stakeToken` admin.
    *   **Roles (Managed by `stakeToken` AccessControl):**
        *   `COLLATERAL_EXCHANGER_ROLE`: Can call `exchangeAssets`.
    *   **Key Functions:**
        *   `deposit(uint256 dStableAmount, address receiver)`: `onlyStakeToken`. Converts `dStableAmount` to a chosen `vaultAsset` via adapter, sends `vaultAsset` to `collateralVault`.
            1.  Pulls `dStableAmount` from `stakeToken`.
            2.  Selects strategy/adapter (e.g., `defaultDepositProtocolId`).
            3.  Calls `adapter.convertToVaultAsset(dStableAmount)` depositing result to `collateralVault`.
            4.  Calls `collateralVault.receiveAsset()` to notify.
        *   `withdraw(uint256 dStableAmount, address receiver, address owner)`: `onlyStakeToken`. Pulls required `vaultAsset` from `collateralVault` via `sendAsset`, converts it back to `dStableAmount` via adapter, sends dSTABLE to `receiver`.
            1.  Selects strategy/adapter.
            2.  Calculates required `vaultAssetAmount` using `adapter.getAssetValue`.
            3.  Calls `collateralVault.sendAsset()` to pull `vaultAsset` to router.
            4.  Calls `adapter.convertFromVaultAsset(dStableAmount, receiver)`.
        *   `exchangeAssets(bytes32 fromProtocolId, bytes32 toProtocolId, uint256 fromVaultAssetAmount)`: `onlyCollateralExchangerRole`. Swaps `fromVaultAssetAmount` of one `vaultAsset` for another via their adapters, using dSTABLE as intermediary.
            1.  Get adapters, determine assets.
            2.  Calculate equivalent `dStableAmount` of `fromVaultAssetAmount`.
            3.  Call `collateralVault.sendAsset()` to pull `fromVaultAsset`.
            4.  Call `fromAdapter.convertFromVaultAsset()` sending dSTABLE to router.
            5.  Call `toAdapter.convertToVaultAsset()` using received dSTABLE, depositing result to `collateralVault`.
            6.  Call `collateralVault.receiveAsset()`.
        *   `addAdapter(bytes32 protocolId, address adapterAddress)`: Governance (`stakeToken` admin).
        *   `removeAdapter(bytes32 protocolId)`: Governance (`stakeToken` admin).
        *   `setDefaultDepositProtocol(bytes32 protocolId)`: Governance (`stakeToken` admin).

4.  **`IDStableConversionAdapter.sol` (Interface)**
    *   **Purpose:** Standard interface for converting dSTABLE asset <=> specific `vault asset` and valuing the `vault asset`.
    *   **Key Functions:**
        *   `convertToVaultAsset(uint256 dStableAmount) returns (address vaultAsset, uint256 vaultAssetAmount)`: Converts dSTABLE (pulled from caller) into `vaultAsset`, sending result to `collateralVault`.
        *   `convertFromVaultAsset(uint256 dStableAmount, address receiver) returns (uint256 convertedDStableAmount)`: Converts `vaultAsset` (pulled from caller) back to dSTABLE, sending `dStableAmount` to `receiver`.
        *   `getAssetValue(address vaultAsset, uint256 vaultAssetAmount) view returns (uint256 dStableValue)`: Calculates the value of `vaultAssetAmount` in terms of the dSTABLE asset.
        *   `getVaultAsset() view returns (address)`: Returns the specific `vault asset` address managed by this adapter.

5.  **`dLendConversionAdapter.sol` (Example Implementation)**
    *   **Purpose:** Implements `IDStableConversionAdapter` for a wrapped dLEND `aToken` (e.g., `wddUSD`). Wrapped using StaticATokenLM.sol
    *   **State:** Protocol addresses (`dLendLendingPool`), asset addresses (`dUSD`, `wddUSD`), `collateralVault` address.
    *   **Logic:** Wraps/unwraps dUSD/`wddUSD`, deposits/withdraws from dLEND (on behalf of `collateralVault`), uses appropriate rates for `getAssetValue`.

**Flow Summary:**

*   **Deposit:** User -> `dStakeToken.deposit` -> `Router.deposit` -> `Adapter.convertToVaultAsset` -> (Protocol Interaction) -> `CollateralVault` receives `vaultAsset` -> `dStakeToken` mints shares.
*   **Withdraw:** User -> `dStakeToken.withdraw` -> `Router.withdraw` -> `CollateralVault.sendAsset` (to Router) -> `Adapter.convertFromVaultAsset` -> (Protocol Interaction) -> User receives dSTABLE -> `dStakeToken` burns shares.

**Key Design Decisions Summary:**

*   **Core Vault (`dStakeToken`):** Immutable ERC4626 for share accounting, fees, governance.
*   **Modularity:** Replaceable contracts (`CollateralVault`, `Router`, `Adapters`) for complex logic, avoiding core upgrades.
*   **Generic Assets:** Supports any ERC20 (`vault asset`) convertible to/from dSTABLE via Adapters.
*   **Value Accrual:** Share value tracks `totalAssets()` relative to supply.
*   **Withdrawal Fee:** Configurable fee in `dStakeToken`.
*   **Rebalancing:** Dedicated `exchangeAssets` in `Router` via `COLLATERAL_EXCHANGER_ROLE`.
*   **Error Handling:** Revert with details on failure.
*   **Access Control:** Managed by `dStakeToken`.