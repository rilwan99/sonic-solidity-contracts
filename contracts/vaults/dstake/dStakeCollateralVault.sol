// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IdStakeCollateralVault} from "./interfaces/IdStakeCollateralVault.sol";
import {IDStableConversionAdapter} from "./interfaces/IDStableConversionAdapter.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol"; // Corrected path

/**
 * @title dStakeCollateralVault
 * @notice Holds various yield-bearing/convertible ERC20 tokens (`vault assets`) managed by dSTAKE.
 * @dev Calculates the total value of these assets in terms of the underlying dSTABLE asset
 *      using registered adapters. This contract is non-upgradeable but replaceable via
 *      dStakeToken governance.
 *      Relies on the associated dStakeToken for role management (checking admin roles).
 */
contract dStakeCollateralVault is IdStakeCollateralVault {
    using SafeERC20 for IERC20;

    // --- Errors ---
    error ZeroAddress();
    error Unauthorized();
    error InvalidAdapter();
    error AssetNotSupported(address asset);
    error AssetAlreadySupported(address asset);
    error AdapterMismatch(address expected, address actual);
    error NonZeroBalance(address asset);

    // --- State ---
    address public immutable stakeToken; // The dStakeToken this vault serves
    address public immutable dStable; // The underlying dSTABLE asset address

    address public router; // The dStakeRouter allowed to interact

    mapping(address => address) public adapterForAsset; // vaultAsset => adapter
    address[] public supportedAssets; // List of supported vault assets

    // --- Modifiers ---
    modifier onlyRouter() {
        if (msg.sender != router) {
            revert Unauthorized();
        }
        _;
    }

    // --- Constructor ---
    constructor(address _stakeToken, address _dStable) {
        if (_stakeToken == address(0) || _dStable == address(0)) {
            revert ZeroAddress();
        }
        stakeToken = _stakeToken;
        dStable = _dStable;
    }

    // --- External Views (IdStakeCollateralVault Interface) ---

    /**
     * @inheritdoc IdStakeCollateralVault
     */
    function getTotalAssetValue()
        external
        view
        override
        returns (uint256 dStableValue)
    {
        uint256 totalValue = 0;
        for (uint i = 0; i < supportedAssets.length; i++) {
            address vaultAsset = supportedAssets[i];
            address adapterAddress = adapterForAsset[vaultAsset];
            if (adapterAddress != address(0)) {
                uint256 balance = IERC20(vaultAsset).balanceOf(address(this));
                if (balance > 0) {
                    totalValue += IDStableConversionAdapter(adapterAddress)
                        .getAssetValue(vaultAsset, balance);
                }
            }
        }
        return totalValue;
    }

    /**
     * @inheritdoc IdStakeCollateralVault
     */
    function asset() external view override returns (address) {
        return dStable;
    }

    // --- External Functions (Router Interactions) ---

    /**
     * @notice Called by the router to acknowledge that `vaultAsset` tokens should have arrived.
     * @dev Primarily acts as a check that the asset is supported.
     * @param vaultAsset The address of the vault asset received.
     * @param amount The amount received (unused in current logic, present for potential future hooks).
     */
    function receiveAsset(
        address vaultAsset,
        uint256 amount
    ) external onlyRouter {
        if (adapterForAsset[vaultAsset] == address(0)) {
            revert AssetNotSupported(vaultAsset);
        }
        // No action needed beyond check, assets are transferred directly by adapters/router
        emit AssetReceived(vaultAsset, amount);
    }

    /**
     * @notice Transfers `amount` of `vaultAsset` from this vault to the `recipient`.
     * @dev Only callable by the registered router.
     * @param vaultAsset The address of the vault asset to send.
     * @param amount The amount to send.
     * @param recipient The address to receive the asset.
     */
    function sendAsset(
        address vaultAsset,
        uint256 amount,
        address recipient
    ) external onlyRouter {
        if (adapterForAsset[vaultAsset] == address(0)) {
            revert AssetNotSupported(vaultAsset);
        }
        IERC20(vaultAsset).safeTransfer(recipient, amount);
        emit AssetSent(vaultAsset, amount, recipient);
    }

    // --- External Functions (Governance) ---

    /**
     * @notice Sets the address of the dStakeRouter contract.
     * @dev Only callable by an address holding the DEFAULT_ADMIN_ROLE on the associated stakeToken contract.
     * @param _newRouter The address of the new router contract.
     */
    function setRouter(address _newRouter) external {
        _checkAdmin();
        if (_newRouter == address(0)) {
            revert ZeroAddress();
        }
        router = _newRouter;
        emit RouterSet(_newRouter);
    }

    /**
     * @notice Adds support for a new `vaultAsset` and its associated conversion adapter.
     * @dev Only callable by an address holding the DEFAULT_ADMIN_ROLE on the associated stakeToken contract.
     * @param vaultAsset The address of the new vault asset to support.
     * @param adapterAddress The address of the IDStableConversionAdapter for this asset.
     */
    function addAdapter(address vaultAsset, address adapterAddress) external {
        _checkAdmin();
        if (vaultAsset == address(0) || adapterAddress == address(0)) {
            revert ZeroAddress();
        }
        if (adapterForAsset[vaultAsset] != address(0)) {
            revert AssetAlreadySupported(vaultAsset);
        }

        // Validate adapter interface and asset match
        try IDStableConversionAdapter(adapterAddress).getVaultAsset() returns (
            address reportedAsset
        ) {
            if (reportedAsset != vaultAsset) {
                revert AdapterMismatch(vaultAsset, reportedAsset);
            }
        } catch {
            revert InvalidAdapter();
        }

        adapterForAsset[vaultAsset] = adapterAddress;
        supportedAssets.push(vaultAsset);
        emit AdapterAdded(vaultAsset, adapterAddress);
    }

    /**
     * @notice Removes support for a `vaultAsset` and its adapter.
     * @dev Only callable by an address holding the DEFAULT_ADMIN_ROLE on the associated stakeToken contract.
     * @dev Requires the vault to hold zero balance of the asset being removed.
     * @param vaultAsset The address of the vault asset to remove support for.
     */
    function removeAdapter(address vaultAsset) external {
        _checkAdmin();
        if (adapterForAsset[vaultAsset] == address(0)) {
            revert AssetNotSupported(vaultAsset);
        }
        if (IERC20(vaultAsset).balanceOf(address(this)) > 0) {
            revert NonZeroBalance(vaultAsset);
        }

        delete adapterForAsset[vaultAsset];

        // Remove from supportedAssets array
        for (uint i = 0; i < supportedAssets.length; i++) {
            if (supportedAssets[i] == vaultAsset) {
                supportedAssets[i] = supportedAssets[
                    supportedAssets.length - 1
                ];
                supportedAssets.pop();
                break;
            }
        }
        emit AdapterRemoved(vaultAsset);
    }

    // --- Internal Functions ---

    /**
     * @dev Internal function to check if the caller has DEFAULT_ADMIN_ROLE on the stakeToken.
     */
    function _checkAdmin() internal view {
        // Use AccessControlEnumerable interface to check role on the stakeToken contract
        if (
            !AccessControlEnumerable(stakeToken).hasRole(
                AccessControlEnumerable(stakeToken).DEFAULT_ADMIN_ROLE(),
                msg.sender
            )
        ) {
            revert Unauthorized();
        }
    }

    // --- Events ---
    event RouterSet(address indexed router);
    event AdapterAdded(address indexed vaultAsset, address indexed adapter);
    event AdapterRemoved(address indexed vaultAsset);
    event AssetReceived(address indexed vaultAsset, uint256 amount);
    event AssetSent(
        address indexed vaultAsset,
        uint256 amount,
        address indexed recipient
    );
}
