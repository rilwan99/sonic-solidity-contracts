import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { dLendFixture, DLendFixtureResult } from "./fixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  StaticATokenFactory,
  StaticATokenLM,
  AToken,
  TestERC20,
  Pool,
  ERC20StablecoinUpgradeable,
} from "../../typechain-types";
import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("StaticATokenFactory & StaticATokenLM", () => {
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let fixture: DLendFixtureResult;
  let pool: Pool;
  let factory: StaticATokenFactory;

  beforeEach(async () => {
    const named = await hre.getNamedAccounts();
    deployer = await ethers.getSigner(named.deployer);
    user1 = await ethers.getSigner(named.user1);
    user2 = await ethers.getSigner(named.user2);
    user3 = await ethers.getSigner(named.user3);
    fixture = await dLendFixture();
    pool = fixture.contracts.pool;

    const Factory = await ethers.getContractFactory(
      "StaticATokenFactory",
      deployer
    );
    factory = (await Factory.deploy(
      await pool.getAddress()
    )) as StaticATokenFactory;
  });

  describe("createStaticATokens", () => {
    let nonDStableAsset: string;
    let nonDStableAToken: AToken;

    beforeEach(async () => {
      const nonDStable = Object.values(fixture.assets).find(
        (a) => !a.isDStable
      );
      if (!nonDStable) throw new Error("No non-dStable asset found in fixture");
      nonDStableAsset = nonDStable.address;
      nonDStableAToken = fixture.contracts.aTokens[nonDStableAsset];
    });

    it("factory starts empty", async () => {
      expect(await factory.getStaticATokens()).to.be.empty;
      expect(await factory.getStaticAToken(nonDStableAsset)).to.equal(
        ethers.ZeroAddress
      );
    });

    it("deploys new wrapper for non-dStable and caches it", async () => {
      const tx = await factory.createStaticATokens([nonDStableAsset]);
      const tokenAddr = await factory.getStaticAToken(nonDStableAsset);

      await expect(tx)
        .to.emit(factory, "StaticTokenCreated")
        .withArgs(tokenAddr, nonDStableAsset);
      expect(await factory.getStaticATokens()).to.deep.equal([tokenAddr]);

      const staticToken = (await ethers.getContractAt(
        "StaticATokenLM",
        tokenAddr
      )) as StaticATokenLM;
      expect(await staticToken.name()).to.equal(
        "Wrapped " + (await nonDStableAToken.name())
      );
      expect(await staticToken.symbol()).to.equal(
        "w" + (await nonDStableAToken.symbol())
      );
      expect(await staticToken.decimals()).to.equal(
        await nonDStableAToken.decimals()
      );

      const tx2 = await factory.createStaticATokens([nonDStableAsset]);
      await expect(tx2).not.to.emit(factory, "StaticTokenCreated");
      expect(await factory.getStaticAToken(nonDStableAsset)).to.equal(
        tokenAddr
      );
      expect(await factory.getStaticATokens()).to.deep.equal([tokenAddr]);
    });

    it("reverts for unlisted asset", async () => {
      await expect(
        factory.createStaticATokens([ethers.ZeroAddress])
      ).to.be.revertedWith("UNDERLYING_NOT_LISTED");
    });

    it("batch deploys multiple wrappers (incl. dS)", async () => {
      const assetsToDeploy: string[] = [];
      const dSAddress = fixture.dStables.dS;
      if (!nonDStableAsset)
        throw new Error("nonDStableAsset not set for batch test");

      assetsToDeploy.push(nonDStableAsset);
      assetsToDeploy.push(dSAddress);

      const initialRegistry = await factory.getStaticATokens();
      const tx = await factory.createStaticATokens(assetsToDeploy);
      await tx.wait();

      for (const asset of assetsToDeploy) {
        const createdAddr = await factory.getStaticAToken(asset);
        expect(createdAddr).to.not.equal(ethers.ZeroAddress);
        expect(initialRegistry).to.not.include(createdAddr);
      }

      const finalRegistry = await factory.getStaticATokens();
      expect(finalRegistry.length).to.equal(
        initialRegistry.length + assetsToDeploy.length
      );
      for (const asset of assetsToDeploy) {
        expect(finalRegistry).to.include(await factory.getStaticAToken(asset));
      }
    });
  });

  describe("deposit/withdraw & rebasing (wrapping dS)", () => {
    let underlying: string;
    let aToken: AToken;
    let underlyingToken: ERC20StablecoinUpgradeable;
    let staticToken: StaticATokenLM;
    let depositAmount: bigint;
    let user2CollateralAsset: string;
    let user2CollateralToken: TestERC20;
    let user3DepositAmount: bigint;
    let borrowAmount: bigint;
    let poolAddress: string;
    let staticTokenAddress: string;

    beforeEach(async () => {
      underlying = fixture.dStables.dS;
      aToken = fixture.contracts.aTokens[underlying];
      underlyingToken = await ethers.getContractAt(
        "ERC20StablecoinUpgradeable",
        underlying
      );

      await factory.createStaticATokens([underlying]);
      const [tokenAddr] = await factory.getStaticATokens();
      staticToken = await ethers.getContractAt(
        "StaticATokenLM",
        tokenAddr,
        deployer
      );
      poolAddress = await pool.getAddress();
      staticTokenAddress = await staticToken.getAddress();

      const dec = await underlyingToken.decimals();
      depositAmount = ethers.parseUnits("2000", dec);
      borrowAmount = ethers.parseUnits("1000", dec);
      user3DepositAmount = ethers.parseUnits("5000", dec);

      const collateralAssets = Object.values(fixture.assets).filter(
        (a) => !a.isDStable && a.ltv !== BigInt(0)
      );
      if (collateralAssets.length === 0)
        throw new Error("Need a collateral asset for the borrower.");
      const stSAssetInfo = collateralAssets.find((a) => a.symbol === "stS");
      const chosenCollateral = stSAssetInfo || collateralAssets[0];
      user2CollateralAsset = chosenCollateral.address;
      user2CollateralToken = await ethers.getContractAt(
        "TestERC20",
        user2CollateralAsset
      );
      const user2CollateralDecimals = await user2CollateralToken.decimals();

      const dSPrice: bigint =
        await fixture.contracts.priceOracle.getAssetPrice(underlying);
      const collateralPrice: bigint =
        await fixture.contracts.priceOracle.getAssetPrice(user2CollateralAsset);
      const collateralLTV: bigint = BigInt(chosenCollateral.ltv.toString());

      const tenPowDec: bigint = BigInt(10) ** BigInt(dec);
      const borrowValueBase: bigint = (borrowAmount * dSPrice) / tenPowDec;

      const tenPow4: bigint = BigInt(10000);
      const requiredCollateralValueBase: bigint =
        (borrowValueBase * tenPow4) / collateralLTV;

      const num120: bigint = BigInt(120);
      const num100: bigint = BigInt(100);
      const requiredCollateralValueBaseBuffered: bigint =
        (requiredCollateralValueBase * num120) / num100;

      const tenPowCollateralDec: bigint =
        BigInt(10) ** BigInt(user2CollateralDecimals);
      const requiredCollateralAmount: bigint =
        (requiredCollateralValueBaseBuffered * tenPowCollateralDec) /
        collateralPrice;

      const oneUnitBuffer: bigint = ethers.parseUnits(
        "1",
        user2CollateralDecimals
      );
      const user2CollateralAmount: bigint =
        requiredCollateralAmount + oneUnitBuffer;

      await user2CollateralToken
        .connect(deployer)
        .transfer(user2.address, user2CollateralAmount);
      await user2CollateralToken
        .connect(user2)
        .approve(poolAddress, user2CollateralAmount);
      await pool
        .connect(user2)
        .supply(user2CollateralAsset, user2CollateralAmount, user2.address, 0);
      await pool
        .connect(user2)
        .setUserUseReserveAsCollateral(user2CollateralAsset, true);

      await underlyingToken
        .connect(deployer)
        .approve(staticTokenAddress, depositAmount);
      await staticToken["deposit(uint256,address,uint16,bool)"](
        depositAmount,
        deployer.address,
        0,
        true
      );

      await pool
        .connect(user2)
        .borrow(underlying, borrowAmount, 2, 0, user2.address);

      await underlyingToken
        .connect(deployer)
        .transfer(user3.address, user3DepositAmount);
      await underlyingToken
        .connect(user3)
        .approve(poolAddress, user3DepositAmount);
      await pool
        .connect(user3)
        .supply(underlying, user3DepositAmount, user3.address, 0);
    });

    it("can deposit and withdraw dS via wrapper", async () => {
      expect(await staticToken.balanceOf(deployer.address)).to.equal(
        depositAmount
      );
      const actualATokenBalance = await aToken.balanceOf(staticTokenAddress);
      const tolerance = depositAmount / 1_000_000n + 1n;
      expect(actualATokenBalance).to.be.closeTo(depositAmount, tolerance);
      const expectedUnderlyingOut =
        await staticToken.previewRedeem(depositAmount);
      const deployerUnderlyingBalanceBefore = await underlyingToken.balanceOf(
        deployer.address
      );
      const deployerATokenBalanceBefore = await aToken.balanceOf(
        deployer.address
      );
      const wrapperATokenBalanceBefore =
        await aToken.balanceOf(staticTokenAddress);

      await staticToken["redeem(uint256,address,address,bool)"](
        depositAmount,
        deployer.address,
        deployer.address,
        true
      );

      const deployerUnderlyingBalanceAfter = await underlyingToken.balanceOf(
        deployer.address
      );
      const receivedUnderlying =
        deployerUnderlyingBalanceAfter - deployerUnderlyingBalanceBefore;
      const tolerance1 = expectedUnderlyingOut / 1_000_000n + 1n;
      expect(receivedUnderlying).to.be.closeTo(
        expectedUnderlyingOut,
        tolerance1
      );

      expect(await staticToken.balanceOf(deployer.address)).to.equal(0);
      const wrapperATokenBalanceAfter =
        await aToken.balanceOf(staticTokenAddress);
      expect(wrapperATokenBalanceAfter).to.be.lte(1);

      // Check Deployer aToken Balance (Should NOT change)
      const finalATokenBalanceCheck = await aToken.balanceOf(deployer.address);
      expect(finalATokenBalanceCheck).to.be.closeTo(
        deployerATokenBalanceBefore,
        1
      );

      // Check Wrapper aToken Balance (Should DECREASE by underlying value withdrawn)
      const wrapperATokenBalanceAfter_Test1 =
        await aToken.balanceOf(staticTokenAddress);
      const expectedWrapperBalanceAfter_Test1 =
        wrapperATokenBalanceBefore - expectedUnderlyingOut;
      const wrapperTolerance_Test1 =
        (expectedWrapperBalanceAfter_Test1 > 0
          ? expectedWrapperBalanceAfter_Test1
          : 1n) /
          1_000_000n +
        1n;
      expect(wrapperATokenBalanceAfter_Test1).to.be.closeTo(
        expectedWrapperBalanceAfter_Test1,
        wrapperTolerance_Test1
      );
    });

    it("rebasing increases assets per share without changing share balance", async () => {
      const assetsBefore = await staticToken.convertToAssets(depositAmount);
      const tolerance2 = depositAmount / 1_000_000n + 1n;
      expect(assetsBefore).to.be.closeTo(depositAmount, tolerance2);

      const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
      await time.increase(ONE_YEAR_IN_SECS);

      const interactionAmount = BigInt(1);
      await underlyingToken
        .connect(deployer)
        .transfer(user2.address, interactionAmount);
      await underlyingToken
        .connect(user2)
        .approve(poolAddress, interactionAmount);
      await pool
        .connect(user2)
        .repay(underlying, interactionAmount, 2, user2.address);

      expect(await staticToken.balanceOf(deployer.address)).to.equal(
        depositAmount
      );
      const assetsAfter = await staticToken.convertToAssets(depositAmount);
      expect(assetsAfter).to.be.gt(depositAmount);
    });

    it("withdraw returns correct amount of aTokens after rebase", async () => {
      const initialShares = await staticToken.balanceOf(deployer.address);

      const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
      await time.increase(ONE_YEAR_IN_SECS);

      const interactionAmount = BigInt(1);
      await underlyingToken
        .connect(deployer)
        .transfer(user2.address, interactionAmount);
      await underlyingToken
        .connect(user2)
        .approve(poolAddress, interactionAmount);
      await pool
        .connect(user2)
        .repay(underlying, interactionAmount, 2, user2.address);

      const assetsValueBeforeRedeem =
        await staticToken.convertToAssets(initialShares);
      expect(assetsValueBeforeRedeem).to.be.gt(depositAmount);

      const aTokensBeforeRedeem = await aToken.balanceOf(deployer.address);
      const expectedATokensOut = await staticToken.previewRedeem(initialShares);
      await staticToken["redeem(uint256,address,address,bool)"](
        initialShares,
        deployer.address,
        deployer.address,
        false
      );

      const finalATokenBalance = await aToken.balanceOf(deployer.address);
      const receivedATokens3 = finalATokenBalance - aTokensBeforeRedeem;
      const tolerance3 = expectedATokensOut / 1_000_000n + 1n;
      expect(receivedATokens3).to.be.closeTo(expectedATokensOut, tolerance3);

      expect(await staticToken.balanceOf(deployer.address)).to.equal(0);
      expect(await aToken.balanceOf(staticTokenAddress)).to.be.lte(1);
    });

    it("withdraw underlying returns correct amount after rebase", async () => {
      const initialShares = await staticToken.balanceOf(deployer.address);

      const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
      await time.increase(ONE_YEAR_IN_SECS);

      const interactionAmount = BigInt(1);
      await underlyingToken
        .connect(deployer)
        .transfer(user2.address, interactionAmount);
      await underlyingToken
        .connect(user2)
        .approve(poolAddress, interactionAmount);
      await pool
        .connect(user2)
        .repay(underlying, interactionAmount, 2, user2.address);

      const maxSharesRedeemable = await staticToken.maxRedeem(deployer.address);

      const expectedWithdrawAmountCheck =
        await staticToken.previewRedeem(maxSharesRedeemable);
      expect(expectedWithdrawAmountCheck).to.be.gt(depositAmount);

      const previewAmount =
        await staticToken.previewRedeem(maxSharesRedeemable);

      const underlyingBalanceBefore_Test2 = await underlyingToken.balanceOf(
        deployer.address
      );
      const deployerATokenBalanceBefore_Test2 = await aToken.balanceOf(
        deployer.address
      );
      const wrapperATokenBalanceBefore_Test2 =
        await aToken.balanceOf(staticTokenAddress);

      await staticToken["redeem(uint256,address,address,bool)"](
        maxSharesRedeemable,
        deployer.address,
        deployer.address,
        true // Redeem for Underlying
      );

      const underlyingBalanceAfter_Test2 = await underlyingToken.balanceOf(
        deployer.address
      );
      const receivedAmount =
        underlyingBalanceAfter_Test2 - underlyingBalanceBefore_Test2;
      const tolerance4 = previewAmount / 1_000_000n + 1n;

      expect(receivedAmount).to.be.closeTo(previewAmount, tolerance4);
      expect(await staticToken.balanceOf(deployer.address)).to.equal(
        initialShares - maxSharesRedeemable
      );
      // Check Deployer aToken Balance (Should NOT change)
      const finalATokenBalanceCheck_Test2 = await aToken.balanceOf(
        deployer.address
      );
      expect(finalATokenBalanceCheck_Test2).to.be.closeTo(
        deployerATokenBalanceBefore_Test2,
        1
      );
      // Check Wrapper aToken Balance (Should DECREASE by underlying value withdrawn)
      const wrapperATokenBalanceAfter_Test2 =
        await aToken.balanceOf(staticTokenAddress);
      const expectedWrapperBalanceAfter_Test2 =
        wrapperATokenBalanceBefore_Test2 - previewAmount;
      const wrapperTolerance_Test2 =
        (expectedWrapperBalanceAfter_Test2 > 0
          ? expectedWrapperBalanceAfter_Test2
          : 1n) /
          1_000_000n +
        1n;
      expect(wrapperATokenBalanceAfter_Test2).to.be.closeTo(
        expectedWrapperBalanceAfter_Test2,
        wrapperTolerance_Test2
      );
    });

    it("withdraw non-Aave returns correct amount of aTokens", async () => {
      const initialShares = await staticToken.balanceOf(deployer.address);

      const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
      await time.increase(ONE_YEAR_IN_SECS);

      const interactionAmount = BigInt(1);
      await underlyingToken
        .connect(deployer)
        .transfer(user2.address, interactionAmount);
      await underlyingToken
        .connect(user2)
        .approve(poolAddress, interactionAmount);
      await pool
        .connect(user2)
        .repay(underlying, interactionAmount, 2, user2.address);

      const sharesToWithdraw = initialShares / BigInt(2);
      const assetsToWithdraw =
        await staticToken.previewRedeem(sharesToWithdraw);
      const sharesBurned = await staticToken.previewWithdraw(assetsToWithdraw);

      expect(sharesBurned).to.be.closeTo(sharesToWithdraw, 1);

      const deployerStaticBalanceBefore = await staticToken.balanceOf(
        deployer.address
      );
      const deployerATokenBalanceBefore = await aToken.balanceOf(
        deployer.address
      );
      const wrapperATokenBalanceBefore =
        await aToken.balanceOf(staticTokenAddress);

      await staticToken
        .connect(deployer)
        .withdraw(assetsToWithdraw, deployer.address, deployer.address);

      const deployerStaticBalanceAfter = await staticToken.balanceOf(
        deployer.address
      );
      const actualSharesBurned =
        deployerStaticBalanceBefore - deployerStaticBalanceAfter;
      const toleranceShares = sharesBurned / 1_000_000n + 1n;
      expect(actualSharesBurned).to.be.closeTo(sharesBurned, toleranceShares);

      // Check Deployer aToken Balance (Should NOT change)
      const finalATokenBalanceCheck = await aToken.balanceOf(deployer.address);
      expect(finalATokenBalanceCheck).to.be.closeTo(
        deployerATokenBalanceBefore,
        1
      );

      // Check Wrapper aToken Balance (Should DECREASE)
      const wrapperATokenBalanceAfter =
        await aToken.balanceOf(staticTokenAddress);
      const expectedWrapperBalanceAfter =
        wrapperATokenBalanceBefore - assetsToWithdraw; // It decreases by the underlying value withdrawn
      const wrapperTolerance = expectedWrapperBalanceAfter / 1_000_000n + 1n; // Use relative tolerance on expected value
      expect(wrapperATokenBalanceAfter).to.be.closeTo(
        expectedWrapperBalanceAfter,
        wrapperTolerance
      );
    });

    it("withdraw(assets) returns correct amount of underlying", async () => {
      const initialShares = await staticToken.balanceOf(deployer.address);

      const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
      await time.increase(ONE_YEAR_IN_SECS);

      const interactionAmount = BigInt(1);
      await underlyingToken
        .connect(deployer)
        .transfer(user2.address, interactionAmount);
      await underlyingToken
        .connect(user2)
        .approve(poolAddress, interactionAmount);
      await pool
        .connect(user2)
        .repay(underlying, interactionAmount, 2, user2.address);

      const sharesToWithdraw = initialShares / BigInt(2);
      const assetsToWithdraw =
        await staticToken.previewRedeem(sharesToWithdraw);
      const sharesBurned = await staticToken.previewWithdraw(assetsToWithdraw);

      expect(sharesBurned).to.be.closeTo(sharesToWithdraw, 1);

      const deployerStaticBalanceBefore = await staticToken.balanceOf(
        deployer.address
      );
      const deployerATokenBalanceBefore_Test3 = await aToken.balanceOf(
        deployer.address
      );
      const wrapperATokenBalanceBefore_Test3 =
        await aToken.balanceOf(staticTokenAddress);
      const deployerUnderlyingBalanceBefore = await underlyingToken.balanceOf(
        deployer.address
      );

      await staticToken
        .connect(deployer)
        .withdraw(assetsToWithdraw, deployer.address, deployer.address);

      const deployerStaticBalanceAfter = await staticToken.balanceOf(
        deployer.address
      );
      const actualSharesBurned =
        deployerStaticBalanceBefore - deployerStaticBalanceAfter;
      const toleranceShares = sharesBurned / 1_000_000n + 1n;
      expect(actualSharesBurned).to.be.closeTo(sharesBurned, toleranceShares);

      const deployerATokenBalanceAfter_Test3 = await aToken.balanceOf(
        deployer.address
      );
      expect(deployerATokenBalanceAfter_Test3).to.be.closeTo(
        deployerATokenBalanceBefore_Test3,
        1
      );

      const wrapperATokenBalanceAfter_Test3 =
        await aToken.balanceOf(staticTokenAddress);
      const expectedWrapperBalanceAfter_Test3 =
        wrapperATokenBalanceBefore_Test3 - assetsToWithdraw;
      const wrapperTolerance_Test3 =
        (expectedWrapperBalanceAfter_Test3 > 0
          ? expectedWrapperBalanceAfter_Test3
          : 1n) /
          1_000_000n +
        1n;
      expect(wrapperATokenBalanceAfter_Test3).to.be.closeTo(
        expectedWrapperBalanceAfter_Test3,
        wrapperTolerance_Test3
      );

      const deployerUnderlyingBalanceAfter = await underlyingToken.balanceOf(
        deployer.address
      );
      const receivedUnderlying =
        deployerUnderlyingBalanceAfter - deployerUnderlyingBalanceBefore;
      const underlyingTolerance = assetsToWithdraw / 1_000_000n + 1n;
      expect(receivedUnderlying).to.be.closeTo(
        assetsToWithdraw,
        underlyingTolerance
      );
    });
  });
});
