# Detailed Report

## Common Libraries
Threat model: Utility libraries are passive but can be used by many up-stream vaults and routers. An adversary will try to break assumptions (e.g. malicious ERC-20 tokens, fee-on-transfer behaviour, re-entrancy during token callbacks).

### BasisPointConstants.sol
Overview: Only holds percentage constants. Safe.

### Erc20Helper.sol
Overview: Helper that tries two low-level calls (totalSupply & balanceOf) to probe a token.

#### Finding 1 – Limited Reliability of `isERC20()`
*STRIDE*: Tampering, Denial of Service
*Description*: A malicious contract can implement the ERC-20 surface but always return crafted values (e.g. totalSupply = 0) or revert only on the second call. Although the helper catches reverts, down-stream code MAY still treat a non-compliant token as compliant, or vice-versa, leading to unexpected logic and frozen funds.
*Reproduce*: Deploy token whose `totalSupply()` returns large value once, reverts second call. Call `isERC20()` from a vault before & after – value flips.
*Recommendation*: When possible rely on allow-lists or stricter interface checks (IERC20Metadata, allowance pattern) instead of dynamic probing.
*Severity*: Low – edge-case, but could break exotic integrations.
*Complexity*: Low.

### RescuableVault.sol
Overview: Allows owner to rescue arbitrary ERC-20 except a configurable restricted list.

#### Finding 2 – Gas DoS via Unbounded Array Scan
*STRIDE*: Denial of Service
*Description*: `rescueToken()` loops through `restrictedRescueTokens` array linearly. If the inheriting vault mistakenly adds a very long list (> 1k) an attacker could block rescues via block-gas-limit DOS.
*Recommendation*: Use mapping(bool) or keep list length capped by design; emit events on add/remove to let off-chain monitoring reconstruct the list.
*Severity*: Informational.
*Complexity*: Trivial.

### SupportsWithdrawalFee.sol
Overview: Abstract helper that caps fees and derives net/gross amounts.

#### No issues found (initial pass).

### SwappableVault.sol
Overview: Provides `_swapExactOutput` wrapper that performs pre/post-balance checks around a virtual swap implementation.

#### Finding 3 – Fee-on-Transfer Inaccuracy
*STRIDE*: Tampering / Information Disclosure
*Description*: The invariants assume that a transfer of `outputToken` increases balance exactly by `amountOut`. Tokens with transfer fees or rebasing behaviour will break this assumption and cause a revert, blocking user operations. While this is "fail-safe", it may render the vault unusable against a popular fee token pair (=DoS).
*Recommendation*: Either document the limitation (only plain ERC-20) or relax the invariant to 'at least amountOut' and have slippage handled elsewhere.
*Severity*: Low.
*Complexity*: Low.

---

## dStable Module
Threat model: The attacker aims to inflate supply or drain collateral by exploiting mint / redeem paths or mis-configuration. Oracle manipulation is out of scope per requirements. Centralisation risks excluded.

Contracts: `ERC20StablecoinUpgradeable`, `Issuer`, `Redeemer`, `RedeemerWithFees`, `CollateralVault`, `AmoManager`.

### ERC20StablecoinUpgradeable
Overview: Upgradeable ERC-20 with permit, flash-mint, pausable.

#### Finding 4 – Unlimited Flash-Mint Could Bypass Down-stream Accounting
*STRIDE*: Tampering / Repudiation
*Description*: The inherited `ERC20FlashMintUpgradeable` allows any caller to flash-mint an arbitrary amount, only requiring it to be burned in the same tx. Protocols that depend on `totalSupply()` inside a flash-mint aware callback (e.g. `Issuer.issueUsingExcessCollateral`) could be tricked. Current code mints, then *afterwards* performs collateral ratio check – but still within the same tx, so invariant holds. However any other component or integration could mis-price.
*Recommendation*: Audit every contract that trusts `totalSupply()`; alternatively disable flash-mint or cap amount.
*Severity*: Medium.
*Complexity*: Moderate.

### Issuer.sol
Overview: Mints dStable against deposited collateral.

#### Finding 5 – Missing Re-entrancy Guard on `issue()`
*STRIDE*: Elevation of Privilege
*Description*: `issue()` transfers collateral in before minting. A malicious collateral token implementing `transferFrom` could call back into `Issuer.issue()` re-entrantly, mint twice against same collateral.
*Impact*: Over-mint dStable.
*Recommendation*: Add `nonReentrant` or 'pull' pattern (user pre-approves and collateral is pulled once); alternatively use Checks-Effects-Interactions (set local flag before external call).
*Severity*: High.
*Complexity*: Low.

### Redeemer.sol & RedeemerWithFees.sol
Overview: Burns dStable, releases collateral.

#### Finding 6 – Fee Receiver Hijack Risk
*STRIDE*: Spoofing
*Description*: `RedeemerWithFees`'s `setFeeReceiver()` callable only by DEFAULT_ADMIN. If admin key compromised, fees can be routed to attacker. (Out of scope? centralization) – Not scored per scope.

No critical re-entrancy observed (burn before withdraw; collateralVault.withdrawTo is internal safeTransfer).

### CollateralVault.sol
Overview: Holds collateral, price aware.

#### Finding 7 – Lack of State-Tracking Enables Fee-on-Transfer Collateral Loss
*Description*: Deposit relies on token balances. For deflationary tokens, the vault's recorded value equals on-chain balance post-deposit (which is already deflated) – user minted dStable according to **pre-transfer** amount. This could allow loss of collateral backing (though oracle value partial). Example: deposit 1M tokens with 10 % burn-on-transfer; vault receives 900 k, user still receives full credit.
*Recommendation*: For each collateral, maintain accounting that uses `balanceOf` before and after transfer to compute actual received amount.
*Severity*: Medium.
*Complexity*: Moderate.

---

## Oracle Aggregator
(Oracle manipulation excluded; basic review shows role-based oracle updates with unit consistency check. No issues.)

---

## DLoop Module
Threat model: Vault automates leveraged looping on external lending protocol. Adversary seeks to brick the vault, inflate subsidies, or arbitrage leverage boundaries to drain value.

### DLoopCoreBase.sol (shared base)
Overview: Provides wrappers that validate token balances with a hard-coded tolerance of 1 wei, then call virtual pool hooks.

#### Finding 8 – 1 Wei `BALANCE_DIFF_TOLERANCE` Is Too Strict For Interest-Bearing or Fee Tokens
*STRIDE*: Denial of Service  
*Description*: The wrappers `_borrowFromPool`, `_repayDebtToPool`, `_withdrawFromPool`, `_supplyToPool` require the observed balance delta to equal `amount ± 1`. For interest-bearing tokens (e.g. aTokens that accrue on transfer) or fee-on-transfer tokens, the delta can easily deviate by >1 wei, triggering `Unexpected*` reverts and bricking leverage maintenance. A single dust-level interest accrual can permanently disable `increaseLeverage`/`decreaseLeverage` for every user.  
*Exploit sketch*: Wait for interest to accrue so that `balanceOf(address(this))` grows by >1 wei between two `borrow` calls; subsequent `_borrowFromPool` will revert.  
*Remediation*: Either remove strict equality and rely on protocol return values, or widen tolerance to a percentage of `amount` (e.g. 1 bps), or detect rebasing tokens and disable invariant.  
*Severity*: Medium  
*Complexity*: Moderate

#### Finding 9 – Subsidy Front-Running via Self-Call
*STRIDE*: Tampering  
*Description*: `increaseLeverage` awards a caller-subsidy (not shown above) when they perform a leverage rebalance. An attacker can front-run the core transaction with a 0-impact call that moves leverage just inside the acceptable bounds, collect the subsidy, then revert the following user's call.  
*Remediation*: Pay subsidy in pull-based fashion after verifying that leverage delta exceeded a minimum threshold, or implement a cooldown per address.  
*Severity*: Low  
*Complexity*: Low

---

## DStake Module
Threat model: Attacker targets staking flows to siphon fees or manipulate withdrawal accounting.

### DStakeToken.sol

#### Finding 10 – Missing Re-entrancy Guard on `deposit()` and `withdraw()`
*STRIDE*: Elevation of Privilege / Tampering  
*Description*: `deposit()` pulls dStable from the user, then approves and calls `router.deposit()`. Because neither `deposit()` nor `withdraw()` is protected by `nonReentrant`, a malicious dStable token or a compromised adapter inside `router` can callback into DStakeToken before internal state (shares, fee accounting) is final. This can lead to double-minting of shares or fee evasion.  
*Recommendation*: Add `nonReentrant` to the external ERC4626 entry points or adopt the Checks-Effects-Interactions pattern: update share balances BEFORE any external calls.  
*Severity*: High  
*Complexity*: Low

### DStakeRewardManagerDLend.sol

#### Finding 11 – Repeated `approve()` Without Reset Enables Adapter Drain
*STRIDE*: Tampering  
*Description*: `_processExchangeAssetDeposit()` calls `IERC20(exchangeAsset).approve(adapter, amount)` every time. If the previous allowance is non-zero many ERC-20 require it to be set to 0 first; but here the call silently fails for strict tokens (e.g. USDT) causing future deposits to revert, or leaves a large leftover allowance that a compromised adapter can sweep.  
*Recommendation*: Use `safeIncreaseAllowance` with bounded limits or reset to 0 before setting; consider one-time permit style approvals.  
*Severity*: Low  
*Complexity*: Low

---

## Vesting Module
Threat model: Users attempt to bypass caps or trade soul-bound NFTs.

### ERC20VestingNFT.sol

#### Finding 12 – Matured NFTs Retain `amount` After Withdrawal (Accounting Drift)
*STRIDE*: Information Disclosure / Tampering  
*Description*: `withdrawMatured()` marks the position as `matured` and transfers tokens, but does **not** zero out `amount`. Subsequent `totalDeposited` calculations exclude the withdrawn value, yet on-chain inspection of `vestingPositions[tokenId].amount` suggests otherwise. Indexers or off-chain tooling relying on this field may mis-report the circulating supply, and future contract upgrades reading `amount` could be tricked.  
*Recommendation*: Set `vestingPositions[tokenId].amount = 0;` after successful withdrawal.  
*Severity*: Informational  
*Complexity*: Trivial

---

## Rewards Framework
No additional critical issues beyond Finding 11 were discovered. Treasury-fee logic is capped and role-gated; non-reentrancy modifiers are in place.

---

# Summary table of issues (updated)
| # | Title | Severity | Complexity |
|---|-------|----------|------------|
| 1 | `isERC20` reliability edge-cases | Low | Low |
| 2 | RescuableVault gas DOS via long array | Info | Trivial |
| 3 | SwappableVault strict balance check blocks fee tokens | Low | Low |
| 4 | Unlimited Flash-Mint external impact | Medium | Moderate |
| 5 | `Issuer.issue()` re-entrancy to over-mint | High | Low |
| 7 | Deflationary collateral mis-mint | Medium | Moderate |
| 8 | DLoop 1-wei tolerance DoS | Medium | Moderate |
| 9 | Subsidy front-running in DLoop | Low | Low |
| 10 | Re-entrancy in DStakeToken deposit/withdraw | High | Low |
| 11 | Adapter drain via repeated approve | Low | Low |
| 12 | Vesting NFT amount not zeroed | Info | Trivial |