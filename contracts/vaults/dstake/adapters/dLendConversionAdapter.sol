// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDStableConversionAdapter} from "../interfaces/IDStableConversionAdapter.sol";
import {IStaticATokenLM} from "../../atoken_wrapper/interfaces/IStaticATokenLM.sol"; // Interface for StaticATokenLM
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title dLendConversionAdapter
 * @notice Adapter for converting between a dSTABLE asset (like dUSD) and a wrapped dLEND aToken
 *         (like wddUSD, implemented via StaticATokenLM).
 * @dev Implements the IDStableConversionAdapter interface.
 *      Interacts with a specific StaticATokenLM contract.
 */
contract dLendConversionAdapter is IDStableConversionAdapter {
    using SafeERC20 for IERC20;

    // --- Errors ---
    error ZeroAddress();
    error InvalidAmount();
    error TransferFailed();
    error InconsistentState(string message);

    // --- State ---
    address public immutable dStable; // The underlying dSTABLE asset (e.g., dUSD)
    IStaticATokenLM public immutable vaultAsset; // The wrapped dLEND aToken (StaticATokenLM instance, e.g., wddUSD)
    address public immutable collateralVault; // The dStakeCollateralVault to deposit vaultAsset into

    // --- Constructor ---
    constructor(
        address _dStable,
        address _vaultAsset,
        address _collateralVault
    ) {
        if (
            _dStable == address(0) ||
            _vaultAsset == address(0) ||
            _collateralVault == address(0)
        ) {
            revert ZeroAddress();
        }
        dStable = _dStable;
        vaultAsset = IStaticATokenLM(_vaultAsset);
        collateralVault = _collateralVault;

        // Sanity check: Ensure the StaticATokenLM wrapper uses the correct underlying by casting to IERC4626
        if (IERC4626(_vaultAsset).asset() != _dStable) {
            revert InconsistentState("StaticATokenLM underlying mismatch");
        }
    }

    // --- IDStableConversionAdapter Implementation ---

    /**
     * @inheritdoc IDStableConversionAdapter
     * @dev Converts dStable -> vaultAsset (wrapped aToken) by depositing into StaticATokenLM.
     *      The StaticATokenLM contract MUST be pre-approved to spend dStable held by this adapter.
     *      The StaticATokenLM contract mints the vaultAsset directly to the collateralVault.
     */
    function convertToVaultAsset(
        uint256 dStableAmount
    )
        external
        override
        returns (address _vaultAsset, uint256 vaultAssetAmount)
    {
        if (dStableAmount == 0) {
            revert InvalidAmount();
        }

        // 1. Pull dStable from caller (Router)
        IERC20(dStable).safeTransferFrom(
            msg.sender,
            address(this),
            dStableAmount
        );

        // 2. Approve the StaticATokenLM wrapper to pull the dStable
        IERC20(dStable).approve(address(vaultAsset), dStableAmount);

        // 3. Deposit dStable into the StaticATokenLM wrapper, minting vaultAsset to collateralVault
        //    StaticATokenLM acts like ERC4626 deposit, returning the amount of shares (vaultAsset) minted.
        vaultAssetAmount = IERC4626(address(vaultAsset)).deposit(
            dStableAmount,
            collateralVault
        );

        return (address(vaultAsset), vaultAssetAmount);
    }

    /**
     * @inheritdoc IDStableConversionAdapter
     * @dev Converts vaultAsset (wrapped aToken) -> dStable by withdrawing from StaticATokenLM.
     *      The StaticATokenLM contract sends the dStable directly to the `receiver`.
     */
    function convertFromVaultAsset(
        uint256 dStableAmount,
        address receiver
    ) external override returns (uint256 convertedDStableAmount) {
        if (dStableAmount == 0) {
            revert InvalidAmount();
        }

        // 1. Calculate the required vaultAsset amount (shares) for the target dStable amount
        //    StaticATokenLM's previewWithdraw calculates shares needed for assets.
        uint256 vaultAssetAmount = IERC4626(address(vaultAsset))
            .previewWithdraw(dStableAmount);
        if (vaultAssetAmount == 0) {
            revert InvalidAmount(); // Cannot withdraw if zero shares are needed
        }

        // 2. Pull vaultAsset (shares) from caller (Router)
        IERC20(address(vaultAsset)).safeTransferFrom(
            msg.sender,
            address(this),
            vaultAssetAmount
        );

        // 3. Withdraw from StaticATokenLM, sending dStable to receiver
        //    StaticATokenLM's withdraw function takes assets (dStableAmount) as input.
        //    It requires this adapter contract (owner of shares) to call it.
        //    It internally burns the vaultAssetAmount shares from this contract.
        convertedDStableAmount = IERC4626(address(vaultAsset)).withdraw(
            dStableAmount,
            receiver,
            address(this) // owner of the shares being burned
        );

        // Ensure the amount received by the user matches the requested amount
        // StaticATokenLM should handle this, but an extra check can be cautious.
        if (convertedDStableAmount < dStableAmount) {
            revert InconsistentState("StaticATokenLM withdraw mismatch");
        }

        return convertedDStableAmount;
    }

    /**
     * @inheritdoc IDStableConversionAdapter
     * @dev Uses StaticATokenLM's previewRedeem function to get the underlying value (dStable).
     */
    function getAssetValue(
        address _vaultAsset,
        uint256 vaultAssetAmount
    ) external view override returns (uint256 dStableValue) {
        require(
            _vaultAsset == address(vaultAsset),
            "Incorrect vault asset address"
        );
        // previewRedeem takes shares (vaultAssetAmount) and returns assets (dStableValue)
        return IERC4626(address(vaultAsset)).previewRedeem(vaultAssetAmount);
    }

    /**
     * @inheritdoc IDStableConversionAdapter
     */
    function getVaultAsset() external view override returns (address) {
        return address(vaultAsset);
    }
}
