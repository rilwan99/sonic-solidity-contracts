// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IdStableConversionAdapter} from "../interfaces/IdStableConversionAdapter.sol";
import {IStaticATokenLM} from "../../atoken_wrapper/interfaces/IStaticATokenLM.sol"; // Interface for StaticATokenLM
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title dLendConversionAdapter
 * @notice Adapter for converting between a dSTABLE asset (like dUSD) and a wrapped dLEND aToken
 *         (like wddUSD, implemented via StaticATokenLM).
 * @dev Implements the IDStableConversionAdapter interface.
 *      Interacts with a specific StaticATokenLM contract.
 */
contract dLendConversionAdapter is IdStableConversionAdapter {
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

    // --- IdStableConversionAdapter Implementation ---

    /**
     * @inheritdoc IdStableConversionAdapter
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
        //    Use previewConvertToVaultAsset for calculation
        (_vaultAsset, vaultAssetAmount) = previewConvertToVaultAsset(
            dStableAmount
        );
        vaultAssetAmount = IERC4626(address(vaultAsset)).deposit(
            dStableAmount,
            collateralVault
        );

        return (address(vaultAsset), vaultAssetAmount);
    }

    /**
     * @inheritdoc IdStableConversionAdapter
     * @dev Converts vaultAsset (wrapped aToken) -> dStable by withdrawing from StaticATokenLM.
     *      The StaticATokenLM contract sends the dStable directly to msg.sender.
     */
    function convertFromVaultAsset(
        uint256 vaultAssetAmount
    ) external override returns (uint256 dStableAmount) {
        if (vaultAssetAmount == 0) {
            revert InvalidAmount();
        }

        // 1. Preview the dStable amount to be received
        dStableAmount = previewConvertFromVaultAsset(vaultAssetAmount);
        if (dStableAmount == 0) {
            revert InvalidAmount();
        }

        // 2. Pull vaultAsset (shares) from caller (Router)
        IERC20(address(vaultAsset)).safeTransferFrom(
            msg.sender,
            address(this),
            vaultAssetAmount
        );

        // 3. Withdraw from StaticATokenLM, sending dStable to msg.sender
        uint256 withdrawn = IERC4626(address(vaultAsset)).redeem(
            vaultAssetAmount,
            msg.sender,
            address(this)
        );
        if (withdrawn < dStableAmount) {
            revert InconsistentState("StaticATokenLM redeem mismatch");
        }
        return withdrawn;
    }

    /**
     * @inheritdoc IdStableConversionAdapter
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
     * @inheritdoc IdStableConversionAdapter
     */
    function getVaultAsset() external view override returns (address) {
        return address(vaultAsset);
    }

    /**
     * @inheritdoc IdStableConversionAdapter
     * @dev Preview the result of converting a given dSTABLE amount to vaultAsset.
     */
    function previewConvertToVaultAsset(
        uint256 dStableAmount
    )
        public
        view
        override
        returns (address _vaultAsset, uint256 vaultAssetAmount)
    {
        _vaultAsset = address(vaultAsset);
        vaultAssetAmount = IERC4626(address(vaultAsset)).previewDeposit(
            dStableAmount
        );
    }

    /**
     * @inheritdoc IdStableConversionAdapter
     * @dev Preview the result of converting a given vaultAsset amount to dSTABLE.
     */
    function previewConvertFromVaultAsset(
        uint256 vaultAssetAmount
    ) public view override returns (uint256 dStableAmount) {
        dStableAmount = IERC4626(address(vaultAsset)).previewRedeem(
            vaultAssetAmount
        );
    }
}
