import { ethers, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import {
  DStakeToken,
  DStakeCollateralVault,
  DStakeRouter,
  ERC20,
  IERC20,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { createDStakeFixture, SDUSD_CONFIG } from "./fixture";
import { ZeroAddress } from "ethers";
import { ERC20StablecoinUpgradeable } from "../../typechain-types/contracts/dstable/ERC20StablecoinUpgradeable";
import { DStakeToken__factory } from "../../typechain-types/factories/contracts/vaults/dstake/DStakeToken__factory";
import { WrappedDLendConversionAdapter__factory } from "../../typechain-types/factories/contracts/vaults/dstake/adapters/WrappedDLendConversionAdapter__factory";
import { WrappedDLendConversionAdapter } from "../../typechain-types/contracts/vaults/dstake/adapters/WrappedDLendConversionAdapter";

const parseUnits = (value: string | number, decimals: number | bigint) =>
  ethers.parseUnits(value.toString(), decimals);

describe("dStakeToken", () => {
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let dStakeToken: DStakeToken;
  let collateralVault: DStakeCollateralVault;
  let router: DStakeRouter;
  let dStableToken: ERC20;
  let stable: ERC20StablecoinUpgradeable;
  let minterRole: string;
  let adapterAddress: string;
  let adapter: WrappedDLendConversionAdapter;

  let dStakeTokenAddress: string;
  let collateralVaultAddress: string;
  let routerAddress: string;
  let dStableDecimals: bigint;

  beforeEach(async () => {
    const named = await getNamedAccounts();
    deployer = await ethers.getSigner(named.deployer);
    user1 = await ethers.getSigner(named.user1 || named.deployer);

    // Deploy using fixture
    const fixture = await createDStakeFixture(SDUSD_CONFIG)();
    adapterAddress = fixture.adapterAddress;
    adapter = WrappedDLendConversionAdapter__factory.connect(
      adapterAddress,
      deployer
    );
    dStakeToken = fixture.dStakeToken as unknown as DStakeToken;
    collateralVault =
      fixture.collateralVault as unknown as DStakeCollateralVault;
    router = fixture.router as unknown as DStakeRouter;
    dStableToken = fixture.dStableToken;
    dStableDecimals = await dStableToken.decimals();

    // Prepare stablecoin for minting
    stable = (await ethers.getContractAt(
      "ERC20StablecoinUpgradeable",
      await dStableToken.getAddress(),
      deployer
    )) as ERC20StablecoinUpgradeable;
    minterRole = await stable.MINTER_ROLE();
    await stable.grantRole(minterRole, deployer.address);

    dStakeTokenAddress = await dStakeToken.getAddress();
    collateralVaultAddress = await collateralVault.getAddress();
    routerAddress = await router.getAddress();
  });

  describe("Initialization & State", () => {
    it("Should set immutable dStable address via asset()", async () => {
      expect(await dStakeToken.asset()).to.equal(
        await dStableToken.getAddress()
      );
    });

    it("Should revert constructor if dStable address is zero", async () => {
      const factory = new DStakeToken__factory(deployer);
      await expect(
        factory.deploy(
          ZeroAddress,
          "TestName",
          "TST",
          deployer.address,
          deployer.address
        )
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("Should grant DEFAULT_ADMIN_ROLE to initialAdmin", async () => {
      const adminRole = await dStakeToken.DEFAULT_ADMIN_ROLE();
      expect(await dStakeToken.hasRole(adminRole, user1.address)).to.be.true;
    });

    it("Should have collateralVault and router set from fixture", async () => {
      expect(await dStakeToken.collateralVault()).to.equal(
        collateralVaultAddress
      );
      expect(await dStakeToken.router()).to.equal(routerAddress);
    });

    it("Should set maxWithdrawalFeeBps constant", async () => {
      expect(await dStakeToken.maxWithdrawalFeeBps()).to.equal(10000);
    });

    it("New instance withdrawalFeeBps should be zero by default", async () => {
      const factory = new DStakeToken__factory(deployer);
      const fresh = await factory.deploy(
        await dStableToken.getAddress(),
        "Fresh",
        "FRS",
        deployer.address,
        deployer.address
      );
      expect(await fresh.withdrawalFeeBps()).to.equal(0);
    });

    it("Fixture withdrawalFeeBps should equal initial config value", async () => {
      expect(await dStakeToken.withdrawalFeeBps()).to.equal(10);
    });

    it("Should have correct name and symbol", async () => {
      expect(await dStakeToken.name()).to.equal("Staked dUSD");
      expect(await dStakeToken.symbol()).to.equal("sdUSD");
    });

    it("Should use same decimals as underlying dStable", async () => {
      expect(await dStakeToken.decimals()).to.equal(dStableDecimals);
    });
  });

  describe("Role-Based Access Control & Configuration", () => {
    let DEFAULT_ADMIN_ROLE: string;
    let FEE_MANAGER_ROLE: string;

    beforeEach(async () => {
      DEFAULT_ADMIN_ROLE = await dStakeToken.DEFAULT_ADMIN_ROLE();
      FEE_MANAGER_ROLE = await dStakeToken.FEE_MANAGER_ROLE();
    });

    describe("setCollateralVault", () => {
      it("Should allow admin to set collateralVault", async () => {
        await expect(
          dStakeToken.connect(user1).setCollateralVault(user1.address)
        )
          .to.emit(dStakeToken, "CollateralVaultSet")
          .withArgs(user1.address);
        expect(await dStakeToken.collateralVault()).to.equal(user1.address);
      });

      it("Should revert if non-admin calls setCollateralVault", async () => {
        await expect(
          dStakeToken.connect(deployer).setCollateralVault(user1.address)
        ).to.be.revertedWithCustomError(
          dStakeToken,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("Should revert if setting collateralVault to zero", async () => {
        await expect(
          dStakeToken.connect(user1).setCollateralVault(ZeroAddress)
        ).to.be.revertedWithCustomError(dStakeToken, "ZeroAddress");
      });
    });

    describe("setRouter", () => {
      it("Should allow admin to set router", async () => {
        await expect(dStakeToken.connect(user1).setRouter(user1.address))
          .to.emit(dStakeToken, "RouterSet")
          .withArgs(user1.address);
        expect(await dStakeToken.router()).to.equal(user1.address);
      });

      it("Should revert if non-admin calls setRouter", async () => {
        await expect(
          dStakeToken.connect(deployer).setRouter(user1.address)
        ).to.be.revertedWithCustomError(
          dStakeToken,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("Should revert if setting router to zero", async () => {
        await expect(
          dStakeToken.connect(user1).setRouter(ZeroAddress)
        ).to.be.revertedWithCustomError(dStakeToken, "ZeroAddress");
      });
    });

    describe("Role Management", () => {
      it("Should allow admin to grant and revoke FEE_MANAGER_ROLE", async () => {
        await expect(
          dStakeToken
            .connect(user1)
            .grantRole(FEE_MANAGER_ROLE, deployer.address)
        ).to.not.be.reverted;
        expect(await dStakeToken.hasRole(FEE_MANAGER_ROLE, deployer.address)).to
          .be.true;
        await expect(
          dStakeToken
            .connect(user1)
            .revokeRole(FEE_MANAGER_ROLE, deployer.address)
        ).to.not.be.reverted;
        expect(await dStakeToken.hasRole(FEE_MANAGER_ROLE, deployer.address)).to
          .be.false;
      });
    });

    describe("setWithdrawalFee", () => {
      it("Should allow fee manager to set withdrawal fee", async () => {
        await expect(dStakeToken.connect(user1).setWithdrawalFee(100))
          .to.emit(dStakeToken, "WithdrawalFeeSet")
          .withArgs(100);
        expect(await dStakeToken.withdrawalFeeBps()).to.equal(100);
      });

      it("Should revert if non-fee-manager sets withdrawal fee", async () => {
        await expect(
          dStakeToken.connect(deployer).setWithdrawalFee(100)
        ).to.be.revertedWithCustomError(
          dStakeToken,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("Should revert if fee exceeds maxWithdrawalFeeBps", async () => {
        await expect(
          dStakeToken.connect(user1).setWithdrawalFee(10001)
        ).to.be.revertedWithCustomError(dStakeToken, "InvalidFeeBps");
      });

      it("Should allow setting fee to 0", async () => {
        await dStakeToken.connect(user1).setWithdrawalFee(0);
        expect(await dStakeToken.withdrawalFeeBps()).to.equal(0);
      });
    });
  });

  describe("ERC4626 Core Functionality (Deposits & Minting)", () => {
    const assetsToDeposit = parseUnits("100", dStableDecimals);
    let factory: DStakeToken__factory;
    let fresh: DStakeToken;

    beforeEach(async () => {
      factory = new DStakeToken__factory(deployer);
      fresh = await factory.deploy(
        await dStableToken.getAddress(),
        "Fresh",
        "FRS",
        user1.address,
        user1.address
      );
    });

    it("totalAssets returns 0 if collateralVault not set", async () => {
      expect(await fresh.totalAssets()).to.equal(0);
    });

    it("totalAssets returns 0 if collateralVault has no assets", async () => {
      expect(await dStakeToken.totalAssets()).to.equal(0);
    });

    it("totalAssets delegates correctly to collateralVault", async () => {
      await stable.mint(user1.address, assetsToDeposit);
      await dStableToken
        .connect(user1)
        .approve(dStakeTokenAddress, assetsToDeposit);
      await dStakeToken.connect(user1).deposit(assetsToDeposit, user1.address);
      const expected = await collateralVault.totalValueInDStable();
      expect(await dStakeToken.totalAssets()).to.equal(expected);
    });

    describe("convertToShares & convertToAssets", () => {
      it("should handle zero correctly", async () => {
        expect(await dStakeToken.convertToShares(0n)).to.equal(0n);
        expect(await dStakeToken.convertToAssets(0n)).to.equal(0n);
      });

      it("should convert assets to shares 1:1 when empty", async () => {
        const shares = await dStakeToken.convertToShares(assetsToDeposit);
        expect(shares).to.equal(assetsToDeposit);
        const assets = await dStakeToken.convertToAssets(assetsToDeposit);
        expect(assets).to.equal(assetsToDeposit);
      });

      it("should reflect share price change when vault has extra assets", async () => {
        // initial deposit to set base share price
        await stable.mint(user1.address, assetsToDeposit);
        await dStableToken
          .connect(user1)
          .approve(dStakeTokenAddress, assetsToDeposit);
        await dStakeToken
          .connect(user1)
          .deposit(assetsToDeposit, user1.address);

        // simulate additional yield by adapter
        const extra = parseUnits("50", dStableDecimals);
        await stable.mint(user1.address, extra);
        await dStableToken.connect(user1).approve(adapterAddress, extra);
        await adapter.connect(user1).convertToVaultAsset(extra);

        // now share price > 1:1, so convertToShares returns less shares
        const newShares = await dStakeToken.convertToShares(assetsToDeposit);
        expect(newShares).to.be.lt(assetsToDeposit);

        // convertToAssets on newShares should not exceed original assets due to rounding
        const newAssets = await dStakeToken.convertToAssets(newShares);
        expect(newAssets).to.be.lte(assetsToDeposit);
      });
    });

    it("previewDeposit returns expected shares", async () => {
      expect(await dStakeToken.previewDeposit(assetsToDeposit)).to.equal(
        assetsToDeposit
      );
    });

    it("maxDeposit returns uint256 max", async () => {
      expect(await dStakeToken.maxDeposit(user1.address)).to.equal(
        ethers.MaxUint256
      );
    });

    describe("deposit function", () => {
      it("should revert if router not set", async () => {
        await stable.mint(user1.address, assetsToDeposit);
        await dStableToken
          .connect(user1)
          .approve(await fresh.getAddress(), assetsToDeposit);
        await expect(
          fresh.connect(user1).deposit(assetsToDeposit, user1.address)
        ).to.be.revertedWithCustomError(fresh, "ZeroAddress");
      });

      // zero-asset deposit allowed by default OpenZeppelin behavior
      it("should revert with ERC20InvalidReceiver when receiver is zero", async () => {
        await stable.mint(user1.address, assetsToDeposit);
        await dStableToken
          .connect(user1)
          .approve(dStakeTokenAddress, assetsToDeposit);
        await expect(
          dStakeToken.connect(user1).deposit(assetsToDeposit, ZeroAddress)
        )
          .to.be.revertedWithCustomError(dStakeToken, "ERC20InvalidReceiver")
          .withArgs(ZeroAddress);
      });

      it("should revert on insufficient balance", async () => {
        await dStableToken
          .connect(user1)
          .approve(dStakeTokenAddress, assetsToDeposit);
        await expect(
          dStakeToken.connect(user1).deposit(assetsToDeposit, user1.address)
        ).to.be.reverted;
      });

      it("should mint shares and emit Deposit event", async () => {
        await stable.mint(user1.address, assetsToDeposit);
        await dStableToken
          .connect(user1)
          .approve(dStakeTokenAddress, assetsToDeposit);
        const shares = await dStakeToken.previewDeposit(assetsToDeposit);
        await expect(
          dStakeToken.connect(user1).deposit(assetsToDeposit, user1.address)
        )
          .to.emit(dStakeToken, "Deposit")
          .withArgs(user1.address, user1.address, assetsToDeposit, shares);
        expect(await dStakeToken.balanceOf(user1.address)).to.equal(shares);
      });
    });

    describe("mint function", () => {
      it("should mint shares and emit Deposit event via mint", async () => {
        const sharesToMint = parseUnits("50", dStableDecimals);
        const assetsToProvide = await dStakeToken.previewMint(sharesToMint);
        await stable.mint(user1.address, assetsToProvide);
        await dStableToken
          .connect(user1)
          .approve(dStakeTokenAddress, assetsToProvide);
        await expect(
          dStakeToken.connect(user1).mint(sharesToMint, user1.address)
        )
          .to.emit(dStakeToken, "Deposit")
          .withArgs(
            user1.address,
            user1.address,
            assetsToProvide,
            sharesToMint
          );
        expect(await dStakeToken.balanceOf(user1.address)).to.equal(
          sharesToMint
        );
      });
    });
  });

  describe("ERC4626 Core Functionality (Withdrawals & Redeeming)", () => {
    // Tests for withdraw, redeem, preview, and max functions
    const assetsToDeposit = parseUnits("100", dStableDecimals);
    let shares: bigint;

    beforeEach(async () => {
      // Disable withdrawal fee for simplicity
      await dStakeToken.connect(user1).setWithdrawalFee(0);
      // Mint and deposit assets for user1
      await stable.mint(user1.address, assetsToDeposit);
      await dStableToken
        .connect(user1)
        .approve(dStakeTokenAddress, assetsToDeposit);
      shares = await dStakeToken.previewDeposit(assetsToDeposit);
      await dStakeToken.connect(user1).deposit(assetsToDeposit, user1.address);
    });

    it("previewWithdraw returns expected shares", async () => {
      expect(await dStakeToken.previewWithdraw(assetsToDeposit)).to.equal(
        shares
      );
    });

    it("previewRedeem returns expected assets", async () => {
      expect(await dStakeToken.previewRedeem(shares)).to.equal(assetsToDeposit);
    });

    it("maxWithdraw returns deposit amount", async () => {
      expect(await dStakeToken.maxWithdraw(user1.address)).to.equal(
        assetsToDeposit
      );
    });

    it("maxRedeem returns share balance", async () => {
      expect(await dStakeToken.maxRedeem(user1.address)).to.equal(shares);
    });

    it("should withdraw assets and burn shares", async () => {
      const assetsToWithdraw = assetsToDeposit;
      const sharesToBurn = await dStakeToken.previewWithdraw(assetsToWithdraw);
      await expect(
        dStakeToken
          .connect(user1)
          .withdraw(assetsToWithdraw, user1.address, user1.address)
      )
        .to.emit(dStakeToken, "Withdraw")
        .withArgs(
          user1.address,
          user1.address,
          user1.address,
          assetsToWithdraw,
          sharesToBurn
        );
      expect(await dStakeToken.balanceOf(user1.address)).to.equal(0);
      expect(await dStableToken.balanceOf(user1.address)).to.equal(
        assetsToWithdraw
      );
    });

    it("should redeem shares and transfer assets", async () => {
      const sharesToRedeem = shares;
      const assetsToReceive = await dStakeToken.previewRedeem(sharesToRedeem);
      await expect(
        dStakeToken
          .connect(user1)
          .redeem(sharesToRedeem, user1.address, user1.address)
      )
        .to.emit(dStakeToken, "Withdraw")
        .withArgs(
          user1.address,
          user1.address,
          user1.address,
          assetsToReceive,
          sharesToRedeem
        );
      expect(await dStakeToken.balanceOf(user1.address)).to.equal(0);
      expect(await dStableToken.balanceOf(user1.address)).to.equal(
        assetsToReceive
      );
    });
  });

  describe("ERC4626 Withdrawals & Redeeming with Fees", () => {
    const assetsToDeposit = parseUnits("100", dStableDecimals);
    let shares: bigint;

    beforeEach(async () => {
      // Set withdrawal fee to 1%
      await dStakeToken.connect(user1).setWithdrawalFee(10000);
      // Mint and deposit assets for user1
      await stable.mint(user1.address, assetsToDeposit);
      await dStableToken
        .connect(user1)
        .approve(dStakeTokenAddress, assetsToDeposit);
      shares = await dStakeToken.previewDeposit(assetsToDeposit);
      await dStakeToken.connect(user1).deposit(assetsToDeposit, user1.address);
    });

    it("should withdraw assets with fee deducted", async () => {
      const fee = (assetsToDeposit * 10000n) / 1000000n;
      const netAssets = assetsToDeposit - fee;
      await expect(
        dStakeToken
          .connect(user1)
          .withdraw(assetsToDeposit, user1.address, user1.address)
      )
        .to.emit(dStakeToken, "WithdrawalFee")
        .withArgs(user1.address, user1.address, fee);
      expect(await dStableToken.balanceOf(user1.address)).to.equal(netAssets);
      expect(await dStakeToken.balanceOf(user1.address)).to.equal(0n);
    });

    it("should redeem shares with fee deducted", async () => {
      const fee = (assetsToDeposit * 10000n) / 1000000n;
      const netAssets = assetsToDeposit - fee;
      await expect(
        dStakeToken.connect(user1).redeem(shares, user1.address, user1.address)
      )
        .to.emit(dStakeToken, "WithdrawalFee")
        .withArgs(user1.address, user1.address, fee);
      expect(await dStableToken.balanceOf(user1.address)).to.equal(netAssets);
      expect(await dStakeToken.balanceOf(user1.address)).to.equal(0n);
    });
  });
});
