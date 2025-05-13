// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IdStakeCollateralVault} from "./interfaces/IdStakeCollateralVault.sol";
import {IdStakeRouter} from "./interfaces/IdStakeRouter.sol";
import {BasisPointConstants} from "../../common/BasisPointConstants.sol";

/**
 * @title dStakeToken
 * @dev ERC4626-compliant token representing shares in the dStakeCollateralVault.
 */
contract dStakeToken is ERC4626, AccessControl {
    // --- Roles ---
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    // --- Errors ---
    error ZeroAddress();
    error InvalidFeeBps(uint256 feeBps, uint256 maxFeeBps);

    // --- State ---
    IdStakeCollateralVault public collateralVault;
    IdStakeRouter public router;

    uint256 public withdrawalFeeBps;
    uint256 public constant maxWithdrawalFeeBps =
        BasisPointConstants.ONE_PERCENT_BPS;

    // --- Constructor ---
    constructor(
        IERC20 _dStable,
        string memory _name,
        string memory _symbol,
        address _initialAdmin,
        address _initialFeeManager
    ) ERC4626(IERC20(address(_dStable))) ERC20(_name, _symbol) {
        if (
            address(_dStable) == address(0) ||
            _initialAdmin == address(0) ||
            _initialFeeManager == address(0)
        ) {
            revert ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _initialAdmin);
        _grantRole(FEE_MANAGER_ROLE, _initialFeeManager);
    }

    // --- ERC4626 Overrides ---

    /**
     * @inheritdoc ERC4626
     * @dev Delegates call to the collateralVault to get the total value of managed assets.
     */
    function totalAssets() public view virtual override returns (uint256) {
        if (address(collateralVault) == address(0)) {
            return 0;
        }
        return collateralVault.totalValueInDStable();
    }

    /**
     * @inheritdoc ERC4626
     * @dev Pulls dSTABLE asset from depositor, then delegates the core deposit logic
     *      (converting dSTABLE to vault assets) to the router.
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        if (
            address(router) == address(0) ||
            address(collateralVault) == address(0)
        ) {
            revert ZeroAddress(); // Router or Vault not set
        }

        // Pull assets from caller
        super._deposit(caller, receiver, assets, shares); // This handles the ERC20 transfer

        // Approve router to spend the received assets (necessary because super._deposit transfers to this contract)
        IERC20(asset()).approve(address(router), assets);

        // Delegate conversion and vault update logic to router
        router.deposit(assets, receiver);
    }

    /**
     * @inheritdoc ERC4626
     * @dev Calculates withdrawal fee, then delegates the core withdrawal logic
     *      (converting vault assets back to dSTABLE) to the router.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        if (
            address(router) == address(0) ||
            address(collateralVault) == address(0)
        ) {
            revert ZeroAddress(); // Router or Vault not set
        }

        uint256 fee = (assets * withdrawalFeeBps) /
            BasisPointConstants.ONE_HUNDRED_PERCENT_BPS;
        uint256 amountToSend = assets - fee;

        // Delegate conversion and vault update logic to router
        // Router is responsible for ensuring `amountToSend` of dSTABLE reaches the `receiver`.
        router.withdraw(amountToSend, receiver, owner);

        // Burn shares from owner AFTER router interaction (ensures assets are available)
        super._withdraw(caller, receiver, owner, assets, shares); // This handles the share burning

        // Optional: Transfer fee somewhere (e.g., treasury) - needs implementation
        if (fee > 0) {
            // IERC20(asset()).transfer(FEE_RECIPIENT, fee); // Example: Requires FEE_RECIPIENT address
            emit WithdrawalFee(owner, receiver, fee);
        }
    }

    // --- Governance Functions ---

    /**
     * @notice Sets the address of the dStakeRouter contract.
     * @dev Only callable by DEFAULT_ADMIN_ROLE.
     * @param _router The address of the new router contract.
     */
    function setRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_router == address(0)) {
            revert ZeroAddress();
        }
        router = IdStakeRouter(_router);
        emit RouterSet(_router);
    }

    /**
     * @notice Sets the address of the dStakeCollateralVault contract.
     * @dev Only callable by DEFAULT_ADMIN_ROLE.
     * @param _collateralVault The address of the new collateral vault contract.
     */
    function setCollateralVault(
        address _collateralVault
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_collateralVault == address(0)) {
            revert ZeroAddress();
        }
        collateralVault = IdStakeCollateralVault(_collateralVault);
        emit CollateralVaultSet(_collateralVault);
    }

    /**
     * @notice Sets the withdrawal fee in basis points.
     * @dev Requires FEE_MANAGER_ROLE.
     * @param _feeBps The new withdrawal fee (e.g., 10 = 0.1%).
     */
    function setWithdrawalFee(
        uint256 _feeBps
    ) external onlyRole(FEE_MANAGER_ROLE) {
        if (_feeBps > maxWithdrawalFeeBps) {
            revert InvalidFeeBps(_feeBps, maxWithdrawalFeeBps);
        }
        withdrawalFeeBps = _feeBps;
        emit WithdrawalFeeSet(_feeBps);
    }

    // --- Events ---
    event RouterSet(address indexed router);
    event CollateralVaultSet(address indexed collateralVault);
    event WithdrawalFeeSet(uint256 feeBps);
    event WithdrawalFee(
        address indexed owner,
        address indexed receiver,
        uint256 feeAmount
    );
}
