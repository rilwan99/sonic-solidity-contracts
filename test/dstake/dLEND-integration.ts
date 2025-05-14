import { ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  DStakeToken,
  DStakeCollateralVault,
  DStakeRouter,
  IdStableConversionAdapter,
  ERC20,
  IERC20,
} from "../../typechain-types";
import {
  createDStakeFixture,
  SDUSD_CONFIG,
  SDS_CONFIG,
  DStakeFixtureConfig,
} from "./fixture";
import { ERC20StablecoinUpgradeable } from "../../typechain-types/contracts/dstable/ERC20StablecoinUpgradeable";
import { IStaticATokenLM } from "../../typechain-types/contracts/vaults/atoken_wrapper/interfaces/IStaticATokenLM";

const STAKE_CONFIGS: DStakeFixtureConfig[] = [SDUSD_CONFIG, SDS_CONFIG];

STAKE_CONFIGS.forEach((cfg) => {
  describe(`dStake Ecosystem - ${cfg.dStakeTokenSymbol} - Basic Deposit and dLEND Interaction Verification`, function () {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;

    let dStakeToken: DStakeToken;
    let collateralVault: DStakeCollateralVault;
    let router: DStakeRouter;
    let dStableToken: ERC20;
    let dStableDecimals: number;
    let vaultAssetToken: IERC20;
    let vaultAssetAddress: string;
    let adapter: IdStableConversionAdapter;
    let stable: ERC20StablecoinUpgradeable;

    beforeEach(async function () {
      const named = await getNamedAccounts();
      const userAddr = named.user1 || named.deployer;

      // Deploy ecosystem using fixture
      const fixture = await createDStakeFixture(cfg)();
      deployer = fixture.deployer;
      user = await ethers.getSigner(userAddr);

      dStakeToken = fixture.dStakeToken as unknown as DStakeToken;
      collateralVault =
        fixture.collateralVault as unknown as DStakeCollateralVault;
      router = fixture.router as unknown as DStakeRouter;
      dStableToken = fixture.dStableToken as unknown as ERC20;
      dStableDecimals = fixture.dStableInfo.decimals;
      vaultAssetToken = fixture.vaultAssetToken as unknown as IERC20;
      vaultAssetAddress = fixture.vaultAssetAddress;
      adapter = fixture.adapter as unknown as IdStableConversionAdapter;

      // Grant MINTER_ROLE to deployer so we can mint dStable for user
      stable = (await ethers.getContractAt(
        "ERC20StablecoinUpgradeable",
        await dStableToken.getAddress(),
        deployer
      )) as ERC20StablecoinUpgradeable;
      const minterRole = await stable.MINTER_ROLE();
      await stable.grantRole(minterRole, deployer.address);
    });

    it("should deposit dStable, mint shares, and supply to dLEND", async function () {
      // Define deposit amount
      const depositAmount = ethers.parseUnits("100", dStableDecimals);

      // Pre-deposit checks
      const initialTotalSupply = await dStakeToken.totalSupply();
      const initialTotalAssets = await dStakeToken.totalAssets();
      const collateralVaultAddr = await collateralVault.getAddress();
      const initialVaultAssetBalance =
        await vaultAssetToken.balanceOf(collateralVaultAddr);
      const initialUserDStableBalance = await dStableToken.balanceOf(
        user.address
      );

      expect(initialTotalSupply).to.equal(0n);
      expect(initialTotalAssets).to.equal(0n);
      expect(initialVaultAssetBalance).to.equal(0n);
      expect(initialUserDStableBalance).to.equal(0n);

      // Mint dStable to user and approve token to dStakeToken
      await stable.mint(user.address, depositAmount);
      await dStableToken
        .connect(user)
        .approve(await dStakeToken.getAddress(), depositAmount);

      // Perform deposit
      await expect(
        dStakeToken.connect(user).deposit(depositAmount, user.address)
      )
        .to.emit(dStakeToken, "Deposit")
        .withArgs(user.address, user.address, depositAmount, depositAmount);

      // Post-deposit checks
      const finalUserDStableBalance = await dStableToken.balanceOf(
        user.address
      );
      expect(finalUserDStableBalance).to.equal(0n);

      const userShares = await dStakeToken.balanceOf(user.address);
      expect(userShares).to.equal(depositAmount);

      const finalTotalSupply = await dStakeToken.totalSupply();
      expect(finalTotalSupply).to.equal(depositAmount);

      const finalTotalAssets = await dStakeToken.totalAssets();
      expect(finalTotalAssets).to.equal(depositAmount);

      // Verify supply to dLEND via adapter
      const [, expectedVaultAssetAmount] =
        await adapter.previewConvertToVaultAsset(depositAmount);
      const finalVaultAssetBalance =
        await vaultAssetToken.balanceOf(collateralVaultAddr);
      expect(finalVaultAssetBalance).to.equal(expectedVaultAssetAmount);

      // Verify AAVE aToken minted via wrapper
      const staticWrapper = (await ethers.getContractAt(
        "IStaticATokenLM",
        vaultAssetAddress
      )) as unknown as IStaticATokenLM;
      const aTokenAddress = await staticWrapper.aToken();
      const aTokenContract = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        aTokenAddress
      )) as unknown as IERC20;
      const aTokenBalance = await aTokenContract.balanceOf(vaultAssetAddress);
      expect(aTokenBalance).to.equal(depositAmount);
    });
  });
});
