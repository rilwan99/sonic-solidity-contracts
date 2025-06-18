// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ERC20VestingNFT
 * @notice A soft locker contract for dSTAKE tokens with 6-month vesting period
 * @dev Users deposit dSTAKE tokens and receive NFTs representing their vesting positions.
 *      NFTs can be burned for early exit or become soul-bound after matured withdrawal.
 */
contract ERC20VestingNFT is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    /// @notice The dSTAKE token contract
    IERC20 public immutable dstakeToken;

    /// @notice The vesting period duration (6 months, set at deployment)
    uint256 public immutable vestingPeriod;

    /// @notice Whether new deposits are enabled
    bool public depositsEnabled;

    /// @notice Maximum total dSTAKE supply that can be deposited
    uint256 public maxTotalSupply;

    /// @notice Minimum deposit amount threshold
    uint256 public minDepositAmount;

    /// @notice Current total dSTAKE deposited
    uint256 public totalDeposited;

    /// @notice Token ID counter
    uint256 private _tokenIdCounter;

    /// @notice Vesting position data for each NFT
    struct VestingPosition {
        uint256 amount; // Amount of dSTAKE deposited
        uint256 depositTime; // Timestamp when deposit was made
        // @pattern initialised to false in deposit(), marked as true in withdrawMatured()
        bool matured; // Whether the NFT has been matured (soul-bound)
    }

    /// @notice Mapping from token ID to vesting position
    mapping(uint256 => VestingPosition) public vestingPositions;

    // ============ Events ============

    event Deposited(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount
    );
    event RedeemedEarly(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount
    );
    event WithdrawnMatured(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount
    );
    event DepositsToggled(bool enabled);
    event MaxTotalSupplyUpdated(uint256 newMaxSupply);
    event MinDepositAmountUpdated(uint256 newMinDepositAmount);

    // ============ Errors ============

    error ZeroAmount();
    error ZeroAddress();
    error DepositsDisabled();
    error MaxSupplyExceeded();
    error TokenNotExists();
    error NotTokenOwner();
    error VestingNotComplete();
    error VestingAlreadyComplete();
    error TokenAlreadyMatured();
    error TransferOfMaturedToken();
    error DepositBelowMinimum();

    // ============ Constructor ============

    /**
     * @notice Initialize the vesting NFT contract
     * @param _name Name of the NFT collection
     * @param _symbol Symbol of the NFT collection
     * @param _dstakeToken Address of the dSTAKE token
     * @param _vestingPeriod Vesting period in seconds (6 months)
     * @param _maxTotalSupply Maximum total dSTAKE that can be deposited
     * @param _minDepositAmount Minimum deposit amount threshold
     * @param _initialOwner Initial owner of the contract
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _dstakeToken,
        uint256 _vestingPeriod,
        uint256 _maxTotalSupply,
        uint256 _minDepositAmount,
        address _initialOwner
    ) ERC721(_name, _symbol) Ownable(_initialOwner) {
        if (_dstakeToken == address(0)) {
            revert ZeroAddress();
        }
        if (_vestingPeriod == 0 || _maxTotalSupply == 0) {
            revert ZeroAmount();
        }

        // Set state vars
        dstakeToken = IERC20(_dstakeToken);
        vestingPeriod = _vestingPeriod;
        maxTotalSupply = _maxTotalSupply;
        minDepositAmount = _minDepositAmount;
        depositsEnabled = true;

        // Start token IDs from 1
        _tokenIdCounter = 1;
    }

    // ============ External Functions ============

    /**
     * @notice Deposit dSTAKE tokens and receive a vesting NFT
     * @param amount Amount of dSTAKE tokens to deposit
     * @return tokenId The ID of the minted NFT
     */
    function deposit(
        uint256 amount
    ) external nonReentrant returns (uint256 tokenId) {
        // Basic validation checks
        if (amount == 0) revert ZeroAmount();
        if (!depositsEnabled) revert DepositsDisabled();
        if (amount < minDepositAmount) revert DepositBelowMinimum();
        if (totalDeposited + amount > maxTotalSupply)
            revert MaxSupplyExceeded();

        // Transfer dSTAKE tokens from user
        dstakeToken.safeTransferFrom(msg.sender, address(this), amount);

        // set tokenID and update state var
        tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        // Mint NFT with tokenID to caller
        _safeMint(msg.sender, tokenId);

        // Store vesting position
        vestingPositions[tokenId] = VestingPosition({
            amount: amount,
            depositTime: block.timestamp,
            matured: false
        });

        // Update total deposited
        totalDeposited += amount;

        emit Deposited(msg.sender, tokenId, amount);
    }

    /**
     * @notice Redeem dSTAKE tokens early by burning the NFT (before vesting period)
     * @param tokenId The ID of the NFT to redeem
     */
    function redeemEarly(uint256 tokenId) external nonReentrant {
        if (!_tokenExists(tokenId)) revert TokenNotExists();
        
        // auth check
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        // Verify token is not already matured
        VestingPosition memory position = vestingPositions[tokenId];
        if (position.matured) revert TokenAlreadyMatured();

        // Cannot redeemEarly if vesting period has elapsed -> need to call withdrawaMatured()
        if (block.timestamp >= position.depositTime + vestingPeriod) {
            revert VestingAlreadyComplete();
        }

        uint256 amount = position.amount;

        // Delete vesting position and burn NFT
        delete vestingPositions[tokenId];
        _burn(tokenId);

        // Update total deposited
        totalDeposited -= amount;

        // Transfer dSTAKE tokens back to user
        dstakeToken.safeTransfer(msg.sender, amount);

        emit RedeemedEarly(msg.sender, tokenId, amount);
    }

    /**
     * @notice Withdraw dSTAKE tokens after vesting period and make NFT soul-bound
     * @param tokenId The ID of the NFT to withdraw from
     */
    function withdrawMatured(uint256 tokenId) external nonReentrant {
        if (!_tokenExists(tokenId)) revert TokenNotExists();
        
        // Auth check
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        // Verify token is not already matured
        VestingPosition storage position = vestingPositions[tokenId];
        if (position.matured) revert TokenAlreadyMatured();

        // Verify vesting period has elapsed
        if (block.timestamp < position.depositTime + vestingPeriod) {
            revert VestingNotComplete();
        }

        uint256 amount = position.amount;

        // Mark as matured (soul-bound)
        position.matured = true;

        // Update total deposited
        totalDeposited -= amount;

        // Transfer dSTAKE tokens back to user
        dstakeToken.safeTransfer(msg.sender, amount);

        emit WithdrawnMatured(msg.sender, tokenId, amount);
    }

    // ============ Owner Functions ============

    /**
     * @notice Toggle whether new deposits are enabled
     * @param enabled Whether deposits should be enabled
     */
    function setDepositsEnabled(bool enabled) external onlyOwner {
        depositsEnabled = enabled;
        emit DepositsToggled(enabled);
    }

    /**
     * @notice Update the maximum total supply of dSTAKE that can be deposited
     * @param newMaxSupply New maximum total supply
     * @dev Can be set below current totalDeposited to allow withdrawals until cap is reached
     */
    function setMaxTotalSupply(uint256 newMaxSupply) external onlyOwner {
        maxTotalSupply = newMaxSupply;
        emit MaxTotalSupplyUpdated(newMaxSupply);
    }

    /**
     * @notice Set minimum deposit amount threshold
     * @param newMinDepositAmount New minimum deposit amount
     */
    function setMinDepositAmount(
        uint256 newMinDepositAmount
    ) external onlyOwner {
        minDepositAmount = newMinDepositAmount;
        emit MinDepositAmountUpdated(newMinDepositAmount);
    }

    // ============ View Functions ============

    /**
     * @notice Check if a vesting position is ready for matured withdrawal
     * @param tokenId The NFT token ID
     * @return Whether the vesting period has completed
     */
    function isVestingComplete(uint256 tokenId) external view returns (bool) {
        if (!_tokenExists(tokenId)) return false;
        VestingPosition memory position = vestingPositions[tokenId];
        return block.timestamp >= position.depositTime + vestingPeriod;
    }

    /**
     * @notice Get the remaining vesting time for a position
     * @param tokenId The NFT token ID
     * @return Remaining time in seconds (0 if vesting complete)
     */
    function getRemainingVestingTime(
        uint256 tokenId
    ) external view returns (uint256) {
        if (!_tokenExists(tokenId)) return 0;
        VestingPosition memory position = vestingPositions[tokenId];
        uint256 vestingEndTime = position.depositTime + vestingPeriod;
        if (block.timestamp >= vestingEndTime) return 0;
        return vestingEndTime - block.timestamp;
    }

    /**
     * @notice Get vesting position details
     * @param tokenId The NFT token ID
     * @return amount Amount of dSTAKE deposited
     * @return depositTime Timestamp of deposit
     * @return matured Whether the NFT is soul-bound
     * @return vestingComplete Whether vesting period has ended
     */
    function getVestingPosition(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 amount,
            uint256 depositTime,
            bool matured,
            bool vestingComplete
        )
    {
        if (!_tokenExists(tokenId)) {
            return (0, 0, false, false);
        }

        VestingPosition memory position = vestingPositions[tokenId];
        return (
            position.amount,
            position.depositTime,
            position.matured,
            block.timestamp >= position.depositTime + vestingPeriod
        );
    }

    // ============ Internal Functions ============

    /**
     * @notice Check if a token exists
     * @param tokenId The token ID to check
     * @return Whether the token exists
     */
    function _tokenExists(uint256 tokenId) internal view returns (bool) {
        return vestingPositions[tokenId].amount > 0;
    }

    /**
     * @notice Override to prevent transfers of matured (soul-bound) NFTs
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting and burning
        if (from != address(0) && to != address(0)) {
            // Prevent transfer of matured NFTs
            // @audit BUG: Matured NFTs can still be transferred if withdrawMatured() has not been called yet
            if (vestingPositions[tokenId].matured) {
                revert TransferOfMaturedToken();
            }
        }

        return super._update(to, tokenId, auth);
    }

    /**
     * @notice Override to handle balance updates
     */
    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    /**
     * @notice Override required by Solidity for multiple inheritance
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
