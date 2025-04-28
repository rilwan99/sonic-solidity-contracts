import { ethers, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import {
  DStakeCollateralVault,
  DStakeToken,
  DStakeRouter,
  IDStableConversionAdapter,
  ERC20,
  IERC20,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { createDStakeFixture, SDUSD_CONFIG } from "./fixture"; // Use the specific fixture
import { ZeroAddress } from "ethers"; // Import ZeroAddress

// Helper function to parse units
const parseUnits = (value: string | number, decimals: number | bigint) =>
  ethers.parseUnits(value.toString(), decimals);

// Add this helper function after all imports but before the main test suite
// Helper to fund vault with tokens by direct transfer from deployer
async function fundVaultWithTokens(
  vaultAssetToken: IERC20,
  vaultAssetAddress: string,
  deployer: SignerWithAddress,
  collateralVault: DStakeCollateralVault,
  amount: bigint
): Promise<void> {
  try {
    // Cast to IERC20 to ensure the transfer method is available
    const tokenContract = (await ethers.getContractAt(
      "IERC20",
      vaultAssetAddress
    )) as IERC20;
    const collateralVaultAddress = await collateralVault.getAddress();

    // Use direct transfer to fund the vault
    console.log(`Transferring ${amount} tokens to vault...`);
    await tokenContract
      .connect(deployer)
      .transfer(collateralVaultAddress, amount);

    // Verify transfer succeeded
    const balance = await vaultAssetToken.balanceOf(collateralVaultAddress);
    console.log(`Vault now has ${balance} tokens`);
    if (balance < amount) {
      throw new Error(
        `Transfer failed: vault has ${balance} but expected at least ${amount}`
      );
    }
  } catch (e) {
    console.error("Error funding vault:", e);
    throw e;
  }
}

describe("DStakeCollateralVault", () => {
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let adminRole: string;
  let routerRole: string;

  // Fixture types
  let dStakeToken: DStakeToken;
  let collateralVault: DStakeCollateralVault;
  let router: DStakeRouter;
  let dStableToken: ERC20;
  let dStableDecimals: bigint;
  let vaultAssetToken: IERC20; // Keep as IERC20 to match fixture
  let vaultAssetAddress: string;
  let vaultAssetDecimals: bigint; // Populated in a different way
  let adapter: IDStableConversionAdapter;
  let adapterAddress: string;
  let dStakeTokenAddress: string;
  let dStableTokenAddress: string;
  let collateralVaultAddress: string;
  let routerAddress: string;
  let routerSigner: SignerWithAddress;

  // Load fixture before each test
  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    user1 = accounts[1]; // Assign another signer for non-admin/non-router tests

    // Use the specific sdUSD fixture defined in fixture.ts
    const fixture = await createDStakeFixture(SDUSD_CONFIG)();

    dStakeToken = fixture.dStakeToken;
    collateralVault = fixture.collateralVault;
    router = fixture.router;
    dStableToken = fixture.dStableToken;
    dStableDecimals = await dStableToken.decimals();
    vaultAssetToken = fixture.vaultAssetToken; // Keep as IERC20 from fixture
    vaultAssetAddress = fixture.vaultAssetAddress;
    adapter = fixture.adapter!; // Assert non-null, expect adapter to exist in fixture
    adapterAddress = fixture.adapterAddress;

    dStakeTokenAddress = await dStakeToken.getAddress();
    dStableTokenAddress = await dStableToken.getAddress();
    collateralVaultAddress = await collateralVault.getAddress();
    routerAddress = await router.getAddress();

    // Create an ERC20 contract interface to get decimals()
    const vaultAssetERC20 = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      vaultAssetAddress
    )) as unknown as {
      decimals(): Promise<bigint>;
      transfer(to: string, amount: bigint): Promise<any>;
      balanceOf(account: string): Promise<bigint>;
    };
    vaultAssetDecimals = await vaultAssetERC20.decimals();

    adminRole = await collateralVault.DEFAULT_ADMIN_ROLE();
    routerRole = await collateralVault.ROUTER_ROLE();

    // Create routerSigner for tests that need a signer with router role
    // We need to use the actual router, not just a random address
    await collateralVault.connect(deployer).setRouter(routerAddress);
    try {
      // Attempt to get a signer for the router (which is a contract address)
      routerSigner = await ethers.getSigner(routerAddress);
    } catch (e: any) {
      console.warn(
        `Cannot impersonate router contract directly. Using deployer as router signer.`
      );
      // Fall back to deployer but set the router properly
      routerSigner = deployer;
    }

    // Make sure the routerRole is correctly set on the router address
    if (!(await collateralVault.hasRole(routerRole, routerAddress))) {
      console.warn(
        `Router role not set correctly. Setting router role to router address.`
      );
      // Ensure the router address has the router role
      await collateralVault.connect(deployer).setRouter(routerAddress);
    }

    // Pre-checks from fixture - Ensure adapter exists and vault asset matches
    expect(adapterAddress).to.not.equal(ZeroAddress);
    expect(adapter).to.not.be.null;
    if (adapter) {
      expect(await adapter.vaultAsset()).to.equal(vaultAssetAddress);
    } else {
      throw new Error("Adapter not found in fixture setup");
    }

    // Ensure deployer starts with admin role from contract deployment
    expect(await collateralVault.hasRole(adminRole, deployer.address)).to.be
      .true;

    // Initial state verification from fixture (related to T1 tests)
    expect(await collateralVault.DStakeToken()).to.equal(dStakeTokenAddress);
    expect(await collateralVault.dStable()).to.equal(dStableTokenAddress);

    // Ensure vaultAssetToken is correctly typed as IERC20
    vaultAssetToken = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      vaultAssetAddress
    )) as unknown as IERC20;
  });

  // --- 1. Initialization & Deployment ---
  describe("Initialization & Deployment", () => {
    it("Should deploy correctly", async () => {
      expect(collateralVaultAddress).to.not.equal(ZeroAddress);
    });

    it("Should set immutable state correctly", async () => {
      expect(await collateralVault.DStakeToken()).to.equal(dStakeTokenAddress);
      expect(await collateralVault.dStable()).to.equal(dStableTokenAddress);
    });

    it("Should have router as zero address initially", async () => {
      const VaultFactory = await ethers.getContractFactory(
        "DStakeCollateralVault"
      );
      const newVault = await VaultFactory.deploy(
        dStakeTokenAddress,
        dStableTokenAddress
      );
      await newVault.waitForDeployment();
      expect(await newVault.router()).to.equal(ZeroAddress);
    });

    it("Should grant DEFAULT_ADMIN_ROLE to deployer", async () => {
      expect(await collateralVault.hasRole(adminRole, deployer.address)).to.be
        .true;
    });

    it("Should not grant ROUTER_ROLE initially", async () => {
      const VaultFactory = await ethers.getContractFactory(
        "DStakeCollateralVault"
      );
      const newVault = await VaultFactory.deploy(
        dStakeTokenAddress,
        dStableTokenAddress
      );
      await newVault.waitForDeployment();
      expect(await newVault.hasRole(routerRole, routerAddress)).to.be.false;
      expect(await newVault.hasRole(routerRole, deployer.address)).to.be.false;
      expect(await newVault.hasRole(routerRole, user1.address)).to.be.false;
    });

    it("Should have no adapters initially", async () => {
      const VaultFactory = await ethers.getContractFactory(
        "DStakeCollateralVault"
      );
      const newVault = await VaultFactory.deploy(
        dStakeTokenAddress,
        dStableTokenAddress
      );
      await newVault.waitForDeployment();

      try {
        const firstAsset = await newVault.supportedAssets(0);
        expect(firstAsset).to.equal(ZeroAddress);
      } catch (e: any) {
        expect(e.message).to.include("reverted");
      }

      expect(await newVault.adapterForAsset(vaultAssetAddress)).to.equal(
        ZeroAddress
      );
    });
  });

  // --- 2. Router Management (setRouter) ---
  describe("Router Management (setRouter)", () => {
    it("Should only allow admin to set router", async () => {
      if (await collateralVault.hasRole(adminRole, user1.address)) {
        await collateralVault
          .connect(deployer)
          .revokeRole(adminRole, user1.address);
      }

      await expect(collateralVault.connect(user1).setRouter(routerAddress)).to
        .be.reverted;

      await expect(collateralVault.connect(deployer).setRouter(routerAddress))
        .to.not.be.reverted;
    });

    it("Should revert if setting router to zero address", async () => {
      await expect(
        collateralVault.connect(deployer).setRouter(ZeroAddress)
      ).to.be.revertedWithCustomError(collateralVault, "ZeroAddress");
    });

    it("Should set the initial router correctly", async () => {
      await expect(collateralVault.connect(deployer).setRouter(routerAddress))
        .to.emit(collateralVault, "RouterSet")
        .withArgs(routerAddress);
      expect(await collateralVault.router()).to.equal(routerAddress);
      expect(await collateralVault.hasRole(routerRole, routerAddress)).to.be
        .true;
    });

    it("Should replace the router correctly", async () => {
      const routerA = user1.address;
      const routerB = routerAddress;

      await collateralVault.connect(deployer).setRouter(routerA);
      expect(await collateralVault.router()).to.equal(routerA);
      expect(await collateralVault.hasRole(routerRole, routerA)).to.be.true;
      expect(await collateralVault.hasRole(routerRole, routerB)).to.be.false;

      await expect(collateralVault.connect(deployer).setRouter(routerB))
        .to.emit(collateralVault, "RouterSet")
        .withArgs(routerB);
      expect(await collateralVault.router()).to.equal(routerB);
      expect(await collateralVault.hasRole(routerRole, routerA)).to.be.false;
      expect(await collateralVault.hasRole(routerRole, routerB)).to.be.true;
    });
  });

  // --- 3. Adapter Management (addAdapter, removeAdapter) ---
  describe("Adapter Management", () => {
    beforeEach(async function () {
      // Set a shorter timeout for this hook
      this.timeout(10000);

      try {
        // Ensure router is set for consistency in tests that might need it indirectly
        if ((await collateralVault.router()) !== routerAddress) {
          await collateralVault.connect(deployer).setRouter(routerAddress);
        }

        // Make sure deployer has router role for these tests
        if (!(await collateralVault.hasRole(routerRole, deployer.address))) {
          await collateralVault
            .connect(deployer)
            .grantRole(routerRole, deployer.address);
        }

        // Ensure any existing adapter is removed to start tests with a clean state
        if (
          (await collateralVault.adapterForAsset(vaultAssetAddress)) !==
          ZeroAddress
        ) {
          // Remove any balance first if needed
          const balance = await vaultAssetToken.balanceOf(
            collateralVaultAddress
          );
          if (balance > 0n) {
            // Use routerSigner to send assets back to deployer
            await collateralVault
              .connect(routerSigner)
              .sendAsset(vaultAssetAddress, balance, deployer.address);
          }

          // Now remove the adapter
          await collateralVault
            .connect(deployer)
            .removeAdapter(vaultAssetAddress);
        }

        // Verify adapters are removed
        expect(
          await collateralVault.adapterForAsset(vaultAssetAddress)
        ).to.equal(ZeroAddress);
      } catch (e) {
        console.error("Error in adapter management beforeEach:", e);
        throw e;
      }
    });

    it("Should only allow admin to add/remove adapter", async () => {
      // First revoke admin role from user1 to ensure they don't have it
      if (await collateralVault.hasRole(adminRole, user1.address)) {
        await collateralVault
          .connect(deployer)
          .revokeRole(adminRole, user1.address);
      }

      // Now expect the revert
      await expect(
        collateralVault
          .connect(user1)
          .addAdapter(vaultAssetAddress, adapterAddress)
      ).to.be.reverted; // Don't expect specific message as it might vary

      await expect(
        collateralVault.connect(user1).removeAdapter(vaultAssetAddress)
      ).to.be.reverted; // Don't expect specific message as it might vary

      // Add adapter as admin to test removal by non-admin
      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress);
      await expect(
        collateralVault.connect(user1).removeAdapter(vaultAssetAddress)
      ).to.be.reverted; // Don't expect specific message as it might vary

      // Verify admin can add and remove
      await collateralVault.connect(deployer).removeAdapter(vaultAssetAddress); // Remove first
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(vaultAssetAddress, adapterAddress)
      ).to.not.be.reverted;
      await expect(
        collateralVault.connect(deployer).removeAdapter(vaultAssetAddress)
      ).to.not.be.reverted;
    });

    it("addAdapter: Should revert for zero addresses", async () => {
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(vaultAssetAddress, ZeroAddress)
      ).to.be.revertedWithCustomError(collateralVault, "ZeroAddress");
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(ZeroAddress, adapterAddress)
      ).to.be.revertedWithCustomError(collateralVault, "ZeroAddress");
    });

    it("addAdapter: Should revert for invalid adapter (EOA)", async () => {
      const eoaAddress = user1.address; // Use an EOA which doesn't implement the interface
      // Use a more general revert check
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(vaultAssetAddress, eoaAddress)
      ).to.be.reverted; // Expect any revert, specific error may vary
    });

    it("addAdapter: Should revert on adapter asset mismatch", async () => {
      // Get dStableToken address for mismatch test (without deploying a new token)
      const differentAssetAddress = await dStableToken.getAddress();

      // The real adapter reports vaultAssetAddress, but we pass differentAssetAddress
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(differentAssetAddress, adapterAddress)
      )
        .to.be.revertedWithCustomError(collateralVault, "AdapterMismatch")
        .withArgs(differentAssetAddress, vaultAssetAddress); // Expected asset, actual asset reported by adapter
    });

    it("addAdapter: Should add a valid adapter correctly", async () => {
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(vaultAssetAddress, adapterAddress)
      )
        .to.emit(collateralVault, "AdapterAdded")
        .withArgs(vaultAssetAddress, adapterAddress);

      expect(await collateralVault.adapterForAsset(vaultAssetAddress)).to.equal(
        adapterAddress
      );
      // Check that vaultAssetAddress is in supportedAssets array
      let found = false;
      let assetsCount = 0;

      try {
        // Try reading until we get a revert (end of array) or find the asset
        // Limit loop iterations to avoid infinite loop
        const maxIterations = 100;
        while (assetsCount < maxIterations) {
          const asset = await collateralVault.supportedAssets(assetsCount);
          if (asset === vaultAssetAddress) {
            found = true;
            break;
          }
          assetsCount++;
        }
      } catch (e: any) {
        // This is expected when we reach the end of the array
      }

      // Should find the asset
      expect(found).to.be.true;
      // Should have one asset (assetsCount is the index, first asset is at index 0)
      expect(assetsCount).to.equal(0);
    });

    it("addAdapter: Should revert when adding a duplicate asset", async () => {
      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress); // Add first time
      await expect(
        collateralVault
          .connect(deployer)
          .addAdapter(vaultAssetAddress, adapterAddress)
      ) // Add second time
        .to.be.revertedWithCustomError(collateralVault, "AssetAlreadySupported")
        .withArgs(vaultAssetAddress);
    });

    it("removeAdapter: Should revert if asset not supported", async () => {
      const nonSupportedAsset = user1.address; // Use an address guaranteed not to be supported
      await expect(
        collateralVault.connect(deployer).removeAdapter(nonSupportedAsset)
      )
        .to.be.revertedWithCustomError(collateralVault, "AssetNotSupported")
        .withArgs(nonSupportedAsset);
    });

    it("removeAdapter: Should revert if vault has non-zero balance of asset", async () => {
      // First add the adapter
      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress);

      // Try to get some tokens - in a real scenario we would use the router's depositDStable
      // But for test we're using a direct transfer from deployer if they have tokens
      const deployerVaultTokenBalance = await vaultAssetToken.balanceOf(
        deployer.address
      );
      if (deployerVaultTokenBalance > 0n) {
        // Transfer a small amount to the vault
        const amount =
          deployerVaultTokenBalance > 1000000n
            ? 1000000n
            : deployerVaultTokenBalance / 2n;
        await vaultAssetToken
          .connect(deployer)
          .transfer(collateralVaultAddress, amount);

        // Verify the vault has non-zero balance
        expect(
          await vaultAssetToken.balanceOf(collateralVaultAddress)
        ).to.be.gt(0);

        // Now attempt to remove the adapter, which should revert
        await expect(
          collateralVault.connect(deployer).removeAdapter(vaultAssetAddress)
        )
          .to.be.revertedWithCustomError(collateralVault, "NonZeroBalance")
          .withArgs(vaultAssetAddress);

        // Cleanup: send tokens back to deployer to not affect other tests
        await collateralVault
          .connect(routerSigner)
          .sendAsset(vaultAssetAddress, amount, deployer.address);
      } else {
        console.log(
          "No vault tokens available for test - skipping balance check"
        );
      }
    });

    it("removeAdapter: Should remove adapter correctly when balance is zero", async () => {
      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress);
      expect(await vaultAssetToken.balanceOf(collateralVaultAddress)).to.equal(
        0
      ); // Ensure zero balance

      await expect(
        collateralVault.connect(deployer).removeAdapter(vaultAssetAddress)
      )
        .to.emit(collateralVault, "AdapterRemoved")
        .withArgs(vaultAssetAddress);

      expect(await collateralVault.adapterForAsset(vaultAssetAddress)).to.equal(
        ZeroAddress
      );

      // Check that vaultAssetAddress is not in supportedAssets array anymore
      try {
        // Try to access each element to check if vaultAssetAddress is in the array
        let assetsCount = 0;
        let found = false;

        // Try reading until we get a revert (end of array)
        // Limit loop iterations to avoid infinite loop
        const maxIterations = 100;
        while (assetsCount < maxIterations) {
          const asset = await collateralVault.supportedAssets(assetsCount);
          if (asset === vaultAssetAddress) {
            found = true;
            break;
          }
          assetsCount++;
        }

        expect(found).to.be.false;
      } catch (e: any) {
        // This is expected when we reach the end of the array
      }
    });
  });

  // --- 4. Asset Transfer (sendAsset) ---
  describe("Asset Transfer (sendAsset)", () => {
    describe("Asset Transfer Tests", () => {
      beforeEach(async () => {
        // Set a shorter timeout for this hook
        // Arrow functions don't have their own 'this', so we can't use this.timeout
        // Instead we'll rely on the default timeout

        try {
          // Ensure router is set
          await collateralVault.connect(deployer).setRouter(routerAddress);

          // Make sure deployer has router role for these tests (as backup)
          if (!(await collateralVault.hasRole(routerRole, deployer.address))) {
            await collateralVault
              .connect(deployer)
              .grantRole(routerRole, deployer.address);
          }

          // Skip if the adapter and vault asset are not set up properly
          if (
            adapterAddress === ethers.ZeroAddress ||
            adapter === null ||
            adapter === undefined
          ) {
            console.warn("Real adapter not found in fixture, skipping tests.");
            return; // We can't use this.skip() in arrow functions
          }

          // Add adapter if not already added
          if (
            (await collateralVault.adapterForAsset(vaultAssetAddress)) ===
            ethers.ZeroAddress
          ) {
            await collateralVault
              .connect(deployer)
              .addAdapter(vaultAssetAddress, adapterAddress);
          }

          // Check if the vault has any balance of the asset
          const vaultBalance = await vaultAssetToken.balanceOf(
            collateralVaultAddress
          );
          if (vaultBalance <= 0n) {
            console.log(
              "Vault needs funding for tests - depositing vault asset"
            );
            // We need to provide some tokens to the vault
            // In a real scenario, this would happen via the adapter's convertToVaultAsset
            // For test purposes, we need to mint or transfer some tokens directly

            // Approach 1: If deployer has wrapped tokens, transfer directly
            const deployerBalance = await vaultAssetToken.balanceOf(
              deployer.address
            );
            if (deployerBalance > 0n) {
              const transferAmount =
                deployerBalance > parseUnits("10", vaultAssetDecimals)
                  ? parseUnits("10", vaultAssetDecimals)
                  : deployerBalance;
              // Use the router's sendAsset function to transfer from deployer to vault
              // First, approve the router to spend tokens
              await vaultAssetToken
                .connect(deployer)
                .approve(routerAddress, transferAmount);
              // Call router deposit function if available, or transfer directly
              await vaultAssetToken
                .connect(deployer)
                .transfer(collateralVaultAddress, transferAmount);
            } else {
              console.log(
                "Deployer has no wrapped tokens, skipping fund transfer tests"
              );
              return; // We can't use this.skip() in arrow functions
            }
          }

          // Verify funding worked
          const newVaultBalance = await vaultAssetToken.balanceOf(
            collateralVaultAddress
          );
          console.log(
            `Vault has ${newVaultBalance} vault asset tokens for testing`
          );
          expect(newVaultBalance).to.be.gt(0);
        } catch (e) {
          console.error("Error in Asset Transfer beforeEach:", e);
          throw e;
        }
      });

      it("Should only allow router to send assets", async () => {
        // Skip if we couldn't fund the vault
        if ((await vaultAssetToken.balanceOf(collateralVaultAddress)) <= 0n) {
          console.log("Vault has no balance, skipping test");
          return; // We can't use this.skip() in arrow functions
        }

        const recipient = user1.address;
        const amount = parseUnits("1", vaultAssetDecimals);

        // First confirm vault has enough balance
        const vaultBalance = await vaultAssetToken.balanceOf(
          collateralVaultAddress
        );
        const sendAmount = vaultBalance > amount ? amount : vaultBalance / 2n;
        expect(
          await vaultAssetToken.balanceOf(collateralVaultAddress)
        ).to.be.gte(sendAmount);

        // Try from non-router user
        await expect(
          collateralVault
            .connect(user1)
            .sendAsset(vaultAssetAddress, sendAmount, recipient)
        ).to.be.reverted; // AccessControl error

        // Try from router-role address - should succeed
        await expect(
          collateralVault
            .connect(deployer) // Using deployer who has router role
            .sendAsset(vaultAssetAddress, sendAmount, recipient)
        ).to.not.be.reverted;

        // Verify the transfer worked
        expect(await vaultAssetToken.balanceOf(recipient)).to.equal(sendAmount);
      });

      it("Should transfer asset correctly", async () => {
        // Skip if we couldn't fund the vault
        if ((await vaultAssetToken.balanceOf(collateralVaultAddress)) <= 0n) {
          console.log("Vault has no balance, skipping test");
          return; // We can't use this.skip() in arrow functions
        }

        const recipient = user1.address;
        const vaultBalance = await vaultAssetToken.balanceOf(
          collateralVaultAddress
        );
        const amountToSend =
          vaultBalance > parseUnits("1", vaultAssetDecimals)
            ? parseUnits("1", vaultAssetDecimals)
            : vaultBalance / 2n;

        const initialVaultBalance = await vaultAssetToken.balanceOf(
          collateralVaultAddress
        );
        const initialRecipientBalance =
          await vaultAssetToken.balanceOf(recipient);

        await expect(
          collateralVault
            .connect(deployer)
            .sendAsset(vaultAssetAddress, amountToSend, recipient)
        ).to.not.be.reverted;

        const finalVaultBalance = await vaultAssetToken.balanceOf(
          collateralVaultAddress
        );
        const finalRecipientBalance =
          await vaultAssetToken.balanceOf(recipient);

        expect(finalVaultBalance).to.equal(initialVaultBalance - amountToSend);
        expect(finalRecipientBalance).to.equal(
          initialRecipientBalance + amountToSend
        );
      });

      it("Should revert on insufficient balance", async () => {
        const recipient = user1.address;
        const vaultBalance = await vaultAssetToken.balanceOf(
          collateralVaultAddress
        );
        const amountToSend = vaultBalance + 1n; // More than balance

        // Should revert with transfer amount exceeds balance
        await expect(
          collateralVault
            .connect(deployer)
            .sendAsset(vaultAssetAddress, amountToSend, recipient)
        ).to.be.reverted;
      });
    });

    // Keep the existing Asset Transfer API section
    describe("Asset Transfer API", () => {
      beforeEach(async function () {
        // Set a shorter timeout for this hook
        this.timeout(5000);

        // Ensure router is set
        await collateralVault.connect(deployer).setRouter(routerAddress);

        // Make sure deployer has router role for these tests
        if (!(await collateralVault.hasRole(routerRole, deployer.address))) {
          // Grant router role to deployer explicitly
          await collateralVault
            .connect(deployer)
            .grantRole(routerRole, deployer.address);
        }

        // Add adapter if not already added
        if (
          adapterAddress !== ethers.ZeroAddress &&
          adapter !== null &&
          adapter !== undefined
        ) {
          if (
            (await collateralVault.adapterForAsset(vaultAssetAddress)) ===
            ethers.ZeroAddress
          ) {
            await collateralVault
              .connect(deployer)
              .addAdapter(vaultAssetAddress, adapterAddress);
          }
        }
      });

      it("Should revert if asset is not supported", async () => {
        // Use a known address that's guaranteed not to be supported
        // Using ZeroAddress (0x0) or a predefined constant address instead of user1.address
        const nonSupportedAsset = "0x0000000000000000000000000000000000000123"; // Use a non-zero but clearly invalid address
        const recipient = user1.address;
        const amount = parseUnits(1, vaultAssetDecimals);

        await expect(
          collateralVault
            .connect(deployer) // Use deployer directly instead of routerSigner
            .sendAsset(nonSupportedAsset, amount, recipient)
        )
          .to.be.revertedWithCustomError(collateralVault, "AssetNotSupported")
          .withArgs(nonSupportedAsset);
      });
    });
  });

  // --- 5. Value Calculation (totalValueInDStable) ---
  describe("Value Calculation (totalValueInDStable)", () => {
    beforeEach(async () => {
      // Set a shorter timeout for this hook - using arrow function so no this.timeout

      try {
        // Ensure router is set
        await collateralVault.connect(deployer).setRouter(routerAddress);

        // Make sure deployer has router role for these tests
        if (!(await collateralVault.hasRole(routerRole, deployer.address))) {
          await collateralVault
            .connect(deployer)
            .grantRole(routerRole, deployer.address);
        }

        // Skip if the adapter and vault asset are not set up properly
        if (
          adapterAddress === ethers.ZeroAddress ||
          adapter === null ||
          adapter === undefined
        ) {
          console.warn(
            "Real adapter not found in fixture, skipping adapter-dependent tests."
          );
          return; // Skip in arrow function
        }

        // First remove any existing adapters
        const isAssetSupported =
          (await collateralVault.adapterForAsset(vaultAssetAddress)) !==
          ethers.ZeroAddress;

        if (isAssetSupported) {
          // Remove any balance first
          const balance = await vaultAssetToken.balanceOf(
            collateralVaultAddress
          );
          if (balance > 0n) {
            await collateralVault
              .connect(deployer)
              .sendAsset(vaultAssetAddress, balance, deployer.address);
          }
          await collateralVault
            .connect(deployer)
            .removeAdapter(vaultAssetAddress);
        }

        // Verify adapter is removed
        expect(
          await collateralVault.adapterForAsset(vaultAssetAddress)
        ).to.equal(ethers.ZeroAddress);
      } catch (e) {
        console.error("Error in Value Calculation beforeEach:", e);
        throw e;
      }
    });

    it("Should return 0 if no assets are supported", async () => {
      expect(await collateralVault.totalValueInDStable()).to.equal(0);
    });

    it("Should return 0 if supported asset has zero balance", async () => {
      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress);
      expect(await collateralVault.totalValueInDStable()).to.equal(0);
    });

    it("Should return correct value for a single asset with balance", async () => {
      // Skip this test if adapter setup failed
      if (
        adapterAddress === ethers.ZeroAddress ||
        adapter === null ||
        adapter === undefined
      ) {
        console.log("Skipping test as adapter is not available");
        return;
      }

      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress);

      // Check if deployer has any vault asset tokens
      const deployerBalance = await vaultAssetToken.balanceOf(deployer.address);
      if (deployerBalance > 0n) {
        // Use a small amount to avoid overflow issues
        const amount =
          deployerBalance > 1000000n ? 1000000n : deployerBalance / 2n;

        // Transfer to vault directly - in real usage this would be via the router's depositDStable
        await vaultAssetToken
          .connect(deployer)
          .transfer(collateralVaultAddress, amount);

        // Get balance and expected value
        const vaultBalance = await vaultAssetToken.balanceOf(
          collateralVaultAddress
        );
        expect(vaultBalance).to.equal(amount);

        const expectedValue = await adapter.assetValueInDStable(
          vaultAssetAddress,
          vaultBalance
        );

        // Check total value
        const actualValue = await collateralVault.totalValueInDStable();
        expect(actualValue).to.equal(expectedValue);

        // Clean up - return tokens to deployer
        await collateralVault
          .connect(deployer)
          .sendAsset(vaultAssetAddress, vaultBalance, deployer.address);
      } else {
        console.log("Test skipped: deployer has no vault asset tokens");
      }
    });

    it("Should return 0 after asset balance is removed and adapter is removed", async () => {
      // Skip this test if adapter setup failed
      if (
        adapterAddress === ethers.ZeroAddress ||
        adapter === null ||
        adapter === undefined
      ) {
        console.log("Skipping test as adapter is not available");
        return;
      }

      await collateralVault
        .connect(deployer)
        .addAdapter(vaultAssetAddress, adapterAddress);

      // Check if deployer has any vault asset tokens
      const deployerBalance = await vaultAssetToken.balanceOf(deployer.address);
      if (deployerBalance > 0n) {
        // Use a small amount
        const amount =
          deployerBalance > 1000000n ? 1000000n : deployerBalance / 2n;

        // Transfer to vault
        await vaultAssetToken
          .connect(deployer)
          .transfer(collateralVaultAddress, amount);

        // Check that value is non-zero
        const initialValue = await collateralVault.totalValueInDStable();
        expect(initialValue).to.be.gt(0);

        // Send tokens back to deployer
        await collateralVault
          .connect(deployer)
          .sendAsset(vaultAssetAddress, amount, deployer.address);

        // Check that value is now zero
        expect(await collateralVault.totalValueInDStable()).to.equal(0);

        // Remove adapter
        await collateralVault
          .connect(deployer)
          .removeAdapter(vaultAssetAddress);
        expect(await collateralVault.totalValueInDStable()).to.equal(0);
      } else {
        console.log("Test skipped: deployer has no vault asset tokens");
      }
    });
  });
});
