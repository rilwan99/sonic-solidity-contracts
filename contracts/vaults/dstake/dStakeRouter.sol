// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol"; // To query roles of dStakeToken
import {IdStakeRouter} from "./interfaces/IdStakeRouter.sol";
import {IDStableConversionAdapter} from "./interfaces/IDStableConversionAdapter.sol";
import {dStakeCollateralVault} from "./dStakeCollateralVault.sol"; // Using concrete type for interactions

/**
 * @title dStakeRouter
 * @notice Orchestrates deposits, withdrawals, and asset exchanges for a dStakeToken vault.
 * @dev Interacts with the dStakeToken, dStakeCollateralVault, and various IDStableConversionAdapters.
 *      This contract is non-upgradeable but replaceable via dStakeToken governance.
 *      Relies on the associated dStakeToken for role management.
 */
contract dStakeRouter is IdStakeRouter {
    using SafeERC20 for IERC20;

    // --- Errors ---
    error ZeroAddress();
    error Unauthorized();
    error InvalidAdapter(bytes32 protocolId);
    error AdapterNotFound(bytes32 protocolId);
    error InconsistentState(string message);
    error TransferFailed();

    // --- State ---
    address public immutable stakeToken; // The dStakeToken this router serves
    dStakeCollateralVault public immutable collateralVault; // The dStakeCollateralVault this router serves
    address public immutable dStable; // The underlying dSTABLE asset address

    mapping(bytes32 => address) public conversionAdapters; // protocolId => adapterAddress
    bytes32[] public protocolIds; // List of supported protocol IDs
    bytes32 public defaultDepositProtocolId; // Default strategy for deposits

    // --- Roles (Constants referencing dStakeToken roles) ---
    // We need the actual bytes32 values from dStakeToken to check roles via AccessControlEnumerable
    // Ideally, these would be fetched from dStakeToken or defined consistently.
    // Using placeholders for now - REPLACE with actual values or fetch mechanism.
    bytes32 public constant D_STAKE_TOKEN_DEFAULT_ADMIN_ROLE =
        keccak256("DEFAULT_ADMIN_ROLE"); // Placeholder
    bytes32 public constant D_STAKE_TOKEN_COLLATERAL_EXCHANGER_ROLE =
        keccak256("COLLATERAL_EXCHANGER_ROLE"); // Placeholder

    // --- Modifiers ---
    modifier onlyStakeToken() {
        if (msg.sender != stakeToken) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyCollateralExchanger() {
        // Check role on the stakeToken contract
        if (
            !AccessControlEnumerable(stakeToken).hasRole(
                D_STAKE_TOKEN_COLLATERAL_EXCHANGER_ROLE,
                msg.sender
            )
        ) {
            revert Unauthorized();
        }
        _;
    }

    // --- Constructor ---
    constructor(address _stakeToken, address _collateralVault) {
        if (_stakeToken == address(0) || _collateralVault == address(0)) {
            revert ZeroAddress();
        }
        stakeToken = _stakeToken;
        collateralVault = dStakeCollateralVault(_collateralVault);
        dStable = collateralVault.asset(); // Fetch dStable address from vault
        if (dStable == address(0)) {
            revert InconsistentState("Vault has no dStable asset");
        }
    }

    // --- External Functions (IdStakeRouter Interface) ---

    /**
     * @inheritdoc IdStakeRouter
     */
    function deposit(
        uint256 dStableAmount,
        address receiver
    ) external override onlyStakeToken {
        bytes32 protocolId = defaultDepositProtocolId;
        address adapterAddress = conversionAdapters[protocolId];
        if (adapterAddress == address(0)) {
            revert InvalidAdapter(protocolId);
        }

        // 1. Pull dStableAmount from stakeToken (caller)
        IERC20(dStable).safeTransferFrom(
            msg.sender,
            address(this),
            dStableAmount
        );

        // 2. Approve adapter (zero allowance first, then set required allowance using standard approve)
        IERC20(dStable).approve(adapterAddress, 0);
        IERC20(dStable).approve(adapterAddress, dStableAmount);

        // 3. Call adapter to convert and deposit to vault
        (
            address vaultAsset,
            uint256 vaultAssetAmount
        ) = IDStableConversionAdapter(adapterAddress).convertToVaultAsset(
                dStableAmount
            );

        // 4. Notify collateral vault (this also confirms asset is supported by vault)
        collateralVault.receiveAsset(vaultAsset, vaultAssetAmount);

        emit Deposited(
            protocolId,
            vaultAsset,
            vaultAssetAmount,
            dStableAmount,
            receiver
        );
    }

    /**
     * @inheritdoc IdStakeRouter
     */
    function withdraw(
        uint256 dStableAmount,
        address receiver,
        address owner
    ) external override onlyStakeToken {
        // V1: Simple withdrawal from the default deposit protocol
        bytes32 protocolId = defaultDepositProtocolId;
        address adapterAddress = conversionAdapters[protocolId];
        if (adapterAddress == address(0)) {
            revert InvalidAdapter(protocolId);
        }
        IDStableConversionAdapter adapter = IDStableConversionAdapter(
            adapterAddress
        );

        // 1. Determine vault asset and required amount
        address vaultAsset = adapter.getVaultAsset();
        // Calculate how much vaultAsset is needed to get `dStableAmount` of dStable
        // This requires a reverse calculation or an assumption in the adapter design.
        // Assuming getAssetValue gives the rate vaultAsset -> dStable.
        // We need vaultAssetAmount such that adapter.getAssetValue(vaultAsset, vaultAssetAmount) >= dStableAmount
        // This might need iteration or a dedicated function in the adapter if the rate is non-linear.
        // Simplification: Assuming 1:1 mapping for calculation or adapter handles it.
        // For a robust solution, the adapter might need a `getVaultAssetAmountForDStableAmount` function.
        // --- Placeholder calculation (NEEDS REFINEMENT based on adapter capabilities) ---
        uint256 rate = adapter.getAssetValue(vaultAsset, 1e18); // Example: Get rate for 1 unit
        if (rate == 0) revert InconsistentState("Adapter rate is zero");
        uint256 vaultAssetAmount = (dStableAmount * 1e18) / rate; // Approximate amount needed
        // Add buffer for potential slippage/rounding in conversion? Or adapter guarantees output?
        // --- End Placeholder ---

        // 2. Pull vaultAsset from collateral vault
        collateralVault.sendAsset(vaultAsset, vaultAssetAmount, address(this));

        // 3. Approve adapter (zero allowance first, then set required allowance using standard approve)
        IERC20(vaultAsset).approve(adapterAddress, 0);
        IERC20(vaultAsset).approve(adapterAddress, vaultAssetAmount);

        // 4. Call adapter to convert and send dStable to receiver
        uint256 receivedDStable = adapter.convertFromVaultAsset(
            dStableAmount,
            receiver
        );

        // Optional check: Ensure received amount is sufficient
        if (receivedDStable < dStableAmount) {
            // This indicates an issue with the adapter or rate calculation
            // Revert or handle potential shortfall? Reverting is safer.
            revert InconsistentState("Adapter returned insufficient dStable");
        }

        emit Withdrawn(
            protocolId,
            vaultAsset,
            vaultAssetAmount,
            dStableAmount,
            owner,
            receiver
        );
    }

    // --- External Functions (Exchange/Rebalance) ---

    /**
     * @notice Exchanges `fromVaultAssetAmount` of one vault asset for another via their adapters.
     * @dev Uses dSTABLE as the intermediary asset. Requires COLLATERAL_EXCHANGER_ROLE on dStakeToken.
     * @param fromProtocolId The protocol ID of the asset to sell.
     * @param toProtocolId The protocol ID of the asset to buy.
     * @param fromVaultAssetAmount The amount of the `fromVaultAsset` to exchange.
     */
    function exchangeAssets(
        bytes32 fromProtocolId,
        bytes32 toProtocolId,
        uint256 fromVaultAssetAmount
    ) external onlyCollateralExchanger {
        address fromAdapterAddress = conversionAdapters[fromProtocolId];
        address toAdapterAddress = conversionAdapters[toProtocolId];
        if (fromAdapterAddress == address(0))
            revert AdapterNotFound(fromProtocolId);
        if (toAdapterAddress == address(0))
            revert AdapterNotFound(toProtocolId);

        IDStableConversionAdapter fromAdapter = IDStableConversionAdapter(
            fromAdapterAddress
        );
        IDStableConversionAdapter toAdapter = IDStableConversionAdapter(
            toAdapterAddress
        );

        // 1. Get assets and calculate equivalent dStable amount
        address fromVaultAsset = fromAdapter.getVaultAsset();
        uint256 dStableAmountEquivalent = fromAdapter.getAssetValue(
            fromVaultAsset,
            fromVaultAssetAmount
        );

        // 2. Pull fromVaultAsset from collateral vault
        collateralVault.sendAsset(
            fromVaultAsset,
            fromVaultAssetAmount,
            address(this)
        );

        // 3. Approve fromAdapter & Convert fromVaultAsset -> dStable (sent to this router)
        IERC20(fromVaultAsset).approve(fromAdapterAddress, 0);
        IERC20(fromVaultAsset).approve(
            fromAdapterAddress,
            fromVaultAssetAmount
        );
        uint256 receivedDStable = fromAdapter.convertFromVaultAsset(
            dStableAmountEquivalent,
            address(this)
        );

        // 4. Approve toAdapter & Convert dStable -> toVaultAsset (sent to collateralVault)
        IERC20(dStable).approve(toAdapterAddress, 0);
        IERC20(dStable).approve(toAdapterAddress, receivedDStable);
        (address toVaultAsset, uint256 resultingToVaultAssetAmount) = toAdapter
            .convertToVaultAsset(receivedDStable);

        // 5. Notify collateral vault of received toVaultAsset
        collateralVault.receiveAsset(toVaultAsset, resultingToVaultAssetAmount);

        emit Exchanged(
            fromProtocolId,
            toProtocolId,
            fromVaultAsset,
            fromVaultAssetAmount,
            toVaultAsset,
            resultingToVaultAssetAmount,
            dStableAmountEquivalent
        );
    }

    // --- External Functions (Governance - Managed by dStakeToken Admin) ---

    /**
     * @notice Adds or updates a conversion adapter for a given protocol ID.
     * @dev Only callable by an address holding the DEFAULT_ADMIN_ROLE on the associated stakeToken contract.
     * @param protocolId The identifier for the protocol/strategy.
     * @param adapterAddress The address of the new adapter contract.
     */
    function addAdapter(bytes32 protocolId, address adapterAddress) external {
        _checkAdmin();
        if (adapterAddress == address(0)) {
            revert ZeroAddress();
        }

        // Basic validation (more robust checks in collateralVault.addAdapter)
        try IDStableConversionAdapter(adapterAddress).getVaultAsset() returns (
            address vaultAsset
        ) {
            if (vaultAsset == address(0)) revert InvalidAdapter(protocolId); // Adapter must report a vault asset
        } catch {
            revert InvalidAdapter(protocolId);
        }

        if (conversionAdapters[protocolId] == address(0)) {
            // Only add to array if it's a new protocol ID
            protocolIds.push(protocolId);
        }
        conversionAdapters[protocolId] = adapterAddress;
        emit AdapterSet(protocolId, adapterAddress);
    }

    /**
     * @notice Removes a conversion adapter for a given protocol ID.
     * @dev Only callable by an address holding the DEFAULT_ADMIN_ROLE on the associated stakeToken contract.
     * @dev Does not automatically migrate funds. Ensure assets managed by this adapter are zero
     *      in the collateral vault or migrated via exchangeAssets before calling.
     * @param protocolId The identifier for the protocol/strategy to remove.
     */
    function removeAdapter(bytes32 protocolId) external {
        _checkAdmin();
        address adapterAddress = conversionAdapters[protocolId];
        if (adapterAddress == address(0)) {
            revert AdapterNotFound(protocolId);
        }

        delete conversionAdapters[protocolId];

        // Remove from protocolIds array
        for (uint i = 0; i < protocolIds.length; i++) {
            if (protocolIds[i] == protocolId) {
                protocolIds[i] = protocolIds[protocolIds.length - 1];
                protocolIds.pop();
                break;
            }
        }
        // Note: Corresponding adapter should also be removed from collateralVault
        emit AdapterRemoved(protocolId, adapterAddress);
    }

    /**
     * @notice Sets the default protocol ID to use for new deposits.
     * @dev Only callable by an address holding the DEFAULT_ADMIN_ROLE on the associated stakeToken contract.
     * @param _protocolId The identifier for the default protocol/strategy.
     */
    function setDefaultDepositProtocol(bytes32 _protocolId) external {
        _checkAdmin();
        if (conversionAdapters[_protocolId] == address(0)) {
            revert AdapterNotFound(_protocolId);
        }
        defaultDepositProtocolId = _protocolId;
        emit DefaultDepositProtocolSet(_protocolId);
    }

    // --- Internal Functions ---

    /**
     * @dev Internal function to check if the caller has DEFAULT_ADMIN_ROLE on the stakeToken.
     */
    function _checkAdmin() internal view {
        if (
            !AccessControlEnumerable(stakeToken).hasRole(
                D_STAKE_TOKEN_DEFAULT_ADMIN_ROLE,
                msg.sender
            )
        ) {
            revert Unauthorized();
        }
    }

    // --- Events ---
    event Deposited(
        bytes32 indexed protocolId,
        address indexed vaultAsset,
        uint256 vaultAssetAmount,
        uint256 dStableAmount,
        address receiver
    );
    event Withdrawn(
        bytes32 indexed protocolId,
        address indexed vaultAsset,
        uint256 vaultAssetAmount,
        uint256 dStableAmount,
        address owner,
        address receiver
    );
    event Exchanged(
        bytes32 indexed fromProtocolId,
        bytes32 indexed toProtocolId,
        address fromVaultAsset,
        uint256 fromVaultAssetAmount,
        address toVaultAsset,
        uint256 toVaultAssetAmount,
        uint256 dStableAmountEquivalent
    );
    event AdapterSet(bytes32 indexed protocolId, address adapterAddress);
    event AdapterRemoved(bytes32 indexed protocolId, address adapterAddress);
    event DefaultDepositProtocolSet(bytes32 indexed protocolId);
}
