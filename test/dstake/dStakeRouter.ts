import { expect } from "chai";
import { ethers, getNamedAccounts } from "hardhat";
import { ZeroAddress } from "ethers";
import {
  DStakeRouter,
  DStakeCollateralVault,
  DStakeToken,
  IdStableConversionAdapter,
  ERC20,
  IERC20,
} from "../../typechain-types";
import { createDStakeFixture, SDUSD_CONFIG } from "./fixture";
import { DStakeRouter__factory } from "../../typechain-types/factories/contracts/vaults/dstake/DStakeRouter__factory";

describe("dStakeRouter", function () {
  let deployerAddr: string;
  let user1Addr: string;
  let user2Addr: string;
  let deployerSigner: any;
  let user1Signer: any;
  let user2Signer: any;
  let dStakeToken: DStakeToken;
  let collateralVault: DStakeCollateralVault;
  let router: DStakeRouter;
  let dStableToken: IERC20;
  let vaultAssetToken: IERC20;
  let vaultAssetAddress: string;
  let adapter: IdStableConversionAdapter;
  let adapterAddress: string;

  beforeEach(async function () {
    const named = await getNamedAccounts();
    deployerAddr = named.deployer;
    user1Addr = named.user1 || named.deployer;
    user2Addr = named.user2 || named.deployer;
    deployerSigner = await ethers.getSigner(deployerAddr);
    user1Signer = await ethers.getSigner(user1Addr);
    user2Signer = await ethers.getSigner(user2Addr);

    const fixture = await createDStakeFixture(SDUSD_CONFIG)();
    dStakeToken = fixture.dStakeToken as unknown as DStakeToken;
    collateralVault =
      fixture.collateralVault as unknown as DStakeCollateralVault;
    router = fixture.router as unknown as DStakeRouter;
    dStableToken = fixture.dStableToken as unknown as IERC20;
    vaultAssetToken = fixture.vaultAssetToken as unknown as IERC20;
    vaultAssetAddress = fixture.vaultAssetAddress;
    adapter = fixture.adapter as unknown as IdStableConversionAdapter;
    adapterAddress = fixture.adapterAddress;
  });

  describe("Initialization and State", function () {
    it("should set correct immutable addresses", async function () {
      expect(await router.dStakeToken()).to.equal(
        await dStakeToken.getAddress()
      );
      expect(await router.collateralVault()).to.equal(
        await collateralVault.getAddress()
      );
      expect(await router.dStable()).to.equal(await dStableToken.getAddress());
    });

    it("should revert constructor if any address is zero", async function () {
      const factory = new DStakeRouter__factory(deployerSigner);
      await expect(
        factory.deploy(ZeroAddress, await collateralVault.getAddress())
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(
        factory.deploy(await dStakeToken.getAddress(), ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const adminRole = await router.DEFAULT_ADMIN_ROLE();
      expect(await router.hasRole(adminRole, deployerAddr)).to.be.true;
    });

    it("should grant DSTAKE_TOKEN_ROLE to the dStakeToken address", async function () {
      const tokenRole = await router.DSTAKE_TOKEN_ROLE();
      expect(await router.hasRole(tokenRole, await dStakeToken.getAddress())).to
        .be.true;
    });

    it("defaultDepositVaultAsset should be zero address initially", async function () {
      expect(await router.defaultDepositVaultAsset()).to.equal(
        vaultAssetAddress
      );
    });

    it("vaultAssetToAdapter mapping should be empty initially", async function () {
      expect(await router.vaultAssetToAdapter(vaultAssetAddress)).to.equal(
        adapterAddress
      );
    });
  });

  describe("Role-Based Access Control & Configuration", function () {
    it("admin can add a new adapter", async function () {
      await expect(
        router
          .connect(deployerSigner)
          .addAdapter(vaultAssetAddress, adapterAddress)
      )
        .to.emit(router, "AdapterSet")
        .withArgs(vaultAssetAddress, adapterAddress);
      expect(await router.vaultAssetToAdapter(vaultAssetAddress)).to.equal(
        adapterAddress
      );
    });

    it("non-admin cannot add adapter", async function () {
      await expect(
        router
          .connect(user2Signer)
          .addAdapter(vaultAssetAddress, adapterAddress)
      ).to.be.reverted;
    });

    it("cannot add adapter with zero addresses", async function () {
      await expect(
        router.connect(deployerSigner).addAdapter(ZeroAddress, adapterAddress)
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
      await expect(
        router
          .connect(deployerSigner)
          .addAdapter(vaultAssetAddress, ZeroAddress)
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
    });

    it("admin can remove an adapter", async function () {
      // First add
      await router
        .connect(deployerSigner)
        .addAdapter(vaultAssetAddress, adapterAddress);
      // Then remove
      await expect(
        router.connect(deployerSigner).removeAdapter(vaultAssetAddress)
      )
        .to.emit(router, "AdapterRemoved")
        .withArgs(vaultAssetAddress, adapterAddress);
      expect(await router.vaultAssetToAdapter(vaultAssetAddress)).to.equal(
        ZeroAddress
      );
    });

    it("non-admin cannot remove adapter", async function () {
      await expect(router.connect(user2Signer).removeAdapter(vaultAssetAddress))
        .to.be.reverted;
    });

    it("admin can set defaultDepositVaultAsset", async function () {
      // Add adapter first
      await router
        .connect(deployerSigner)
        .addAdapter(vaultAssetAddress, adapterAddress);
      await expect(
        router
          .connect(deployerSigner)
          .setDefaultDepositVaultAsset(vaultAssetAddress)
      )
        .to.emit(router, "DefaultDepositVaultAssetSet")
        .withArgs(vaultAssetAddress);
      expect(await router.defaultDepositVaultAsset()).to.equal(
        vaultAssetAddress
      );
    });

    it("non-admin cannot set defaultDepositVaultAsset", async function () {
      await expect(
        router
          .connect(user2Signer)
          .setDefaultDepositVaultAsset(vaultAssetAddress)
      ).to.be.reverted;
    });

    it("cannot set defaultDepositVaultAsset for unregistered asset", async function () {
      const nonVaultAsset = await dStableToken.getAddress();
      await expect(
        router
          .connect(deployerSigner)
          .setDefaultDepositVaultAsset(nonVaultAsset)
      ).to.be.revertedWithCustomError(router, "AdapterNotFound");
    });

    it("admin can grant and revoke COLLATERAL_EXCHANGER_ROLE", async function () {
      const exchangerRole = await router.COLLATERAL_EXCHANGER_ROLE();
      // Grant
      await router.connect(deployerSigner).addCollateralExchanger(user1Addr);
      expect(await router.hasRole(exchangerRole, user1Addr)).to.be.true;
      // Revoke
      await router.connect(deployerSigner).removeCollateralExchanger(user1Addr);
      expect(await router.hasRole(exchangerRole, user1Addr)).to.be.false;
    });

    it("non-admin cannot grant or revoke COLLATERAL_EXCHANGER_ROLE", async function () {
      await expect(
        router.connect(user2Signer).addCollateralExchanger(user1Addr)
      ).to.be.reverted;
      await expect(
        router.connect(user2Signer).removeCollateralExchanger(user1Addr)
      ).to.be.reverted;
    });
  });
});
