// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase, MockUSDC} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {VaultCoreAdapter, ILegacyVault} from "../src/VaultCoreAdapter.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";
import {IOCPVault} from "ocp/interfaces/IOCPVault.sol";

contract TopicMarketRealCoreTest is TopicMarketBase {
    OCPVault internal vault;
    VaultCoreAdapter internal adapter;

    function setUp() public override {
        super.setUp();
        uint64 end = uint64(block.timestamp + 6 hours);
        adapter = new VaultCoreAdapter(usd, creator, protocol, end);
        vault = OCPVault(address(adapter.vault()));
        market = new TopicMarket(usd, adapter, creator, protocol, end, 1e6, 1e18);
        adapter.bind(address(market));
        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i; i < 4; i++) {
            vm.prank(users[i]);
            usd.approve(address(market), type(uint256).max);
            vm.prank(users[i]);
            usd.approve(address(vault), type(uint256).max);
        }
    }

    function _stake(address a, IOCPVault.Side side, uint256 amount) private {
        vm.prank(a);
        vault.stake(side, amount);
    }

    function testRealCoreLockedBeforeGraduationAndOpenAfter() public {
        vm.prank(bob);
        vm.expectRevert("Staking not open");
        vault.stake(IOCPVault.Side.YES, 1e6);
        uint256 t = block.timestamp;
        _graduate();
        assertEq(adapter.openedAt(), t);
        _stake(bob, IOCPVault.Side.YES, 3e6);
        assertEq(vault.totalPrincipal(), 3e6);
        _accounting();
    }

    function testRealCoreOneHourAfterFormalAndYesFinal() public {
        _graduate();
        _formalBuy(bob, true, 1e18);
        _stake(bob, IOCPVault.Side.YES, 3e6);
        _stake(carol, IOCPVault.Side.NO, 1e6);
        vm.warp(market.formalCutoff());
        market.closeExpired();
        _stake(bob, IOCPVault.Side.YES, 1e6);
        vm.expectRevert("CORE_PENDING");
        market.finalize();
        vm.warp(market.coreCutoff());
        vm.prank(bob);
        vm.expectRevert("Staking ended");
        vault.stake(IOCPVault.Side.YES, 1e6);
        vault.finalize();
        assertEq(uint256(vault.outcome()), 1);
        market.finalize();
        _claimAll(alice);
        _claimAll(bob);
        _accounting();
        uint256 before = usd.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(usd.balanceOf(bob) - before, 5e6);
    }

    function testRealCoreNoOutcome() public {
        _graduate();
        _stake(carol, IOCPVault.Side.NO, 3e6);
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        assertEq(market.outcome(), 2);
        _claimAll(alice);
        _accounting();
    }

    function testRealCoreInvalidOutcome() public {
        _graduate();
        _stake(carol, IOCPVault.Side.INVALID, 3e6);
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        assertEq(market.outcome(), 3);
        _claimAll(alice);
        _accounting();
    }



    function testRealCoreFailureNeverOpensStaking() public {
        _buy(alice, 1e6);
        vm.warp(market.genesisCutoff());
        market.closeExpired();
        assertEq(adapter.openedAt(), 0);
        vm.prank(bob);
        vm.expectRevert("Staking not open");
        vault.stake(IOCPVault.Side.YES, 1e6);
        _claimAll(alice);
        _accounting();
    }

    function testAdapterCannotBindTwiceOrForgeOutcome() public {
        vm.expectRevert(bytes("BIND"));
        adapter.bind(address(this));
        uint64 end = market.coreCutoff();
        vm.prank(bob);
        vm.expectRevert(bytes("OPEN"));
        adapter.open(end);
    }



    function testAdapterFactoryCannotEnableLegacyEarlyTermination() public {
        _graduate();
        assertEq(vault.factory(), address(adapter));
        assertFalse(vault.earlyTerminationEnabled());
        vm.prank(creator);
        vm.expectRevert("Only factory");
        vault.enableEarlyTermination();
        (bool ok,) = address(adapter).call(abi.encodeWithSignature("enableEarlyTermination()"));
        assertFalse(ok);
        assertFalse(vault.earlyTerminationEnabled());
        _stake(bob, IOCPVault.Side.YES, 1e6);
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        _claimAll(alice);
        _accounting();
    }

    function testRealCoreFeeConditionalHistoricalSnapshotsAndInvalid() public {
        _graduate();
        _stake(bob, IOCPVault.Side.YES, 10e6);
        _stake(carol, IOCPVault.Side.NO, 30e6);
        _stake(dave, IOCPVault.Side.INVALID, 100e6);
        uint256 originalProtocol = market.protocolFees();
        uint256 gross = market.quoteFormalBuy(true, 1e18);
        _formalBuy(alice, true, 1e18);
        uint256 fee = gross / 100;
        assertEq(market.protocolFees(), originalProtocol);
        assertEq(market.coreFeesSent(), fee);
        assertEq(vault.totalMarketFeesAccrued(), fee);
        assertEq(vault.totalPrincipal(), 140e6); // 手续费不能改变多数分母
        (uint256 by,, uint256 bi) = vault.conditionalMarketFees(bob);
        (, uint256 cn, uint256 ci) = vault.conditionalMarketFees(carol);
        (uint256 dy, uint256 dn, uint256 di) = vault.conditionalMarketFees(dave);
        assertLe(fee - by, 1);
        assertLe(fee - cn, 1);
        assertApproxEqAbs(bi, fee / 4, 1);
        assertApproxEqAbs(ci, fee * 3 / 4, 1);
        assertEq(dy + dn + di, 0);
        _stake(alice, IOCPVault.Side.YES, 1e6);
        (uint256 lateY,, uint256 lateI) = vault.conditionalMarketFees(alice);
        assertEq(lateY + lateI, 0);
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        assertEq(uint256(vault.outcome()), 3);
        assertEq(vault.claimableMarketFees(dave), 0);
        uint256 before = usd.balanceOf(alice) + usd.balanceOf(bob) + usd.balanceOf(carol);
        vm.prank(bob);
        vault.withdraw();
        vm.prank(carol);
        vault.withdraw();
        vm.prank(alice); vault.withdraw();
        assertEq(usd.balanceOf(alice) + usd.balanceOf(bob) + usd.balanceOf(carol) - before, 41e6 + fee);
        assertEq(vault.marketFeeUserPoolRemaining(), 0);
        _accounting();
    }

    function testRealCoreNoStakeFeeFallsBackWithoutLateBackfill() public {
        _graduate();
        _formalBuy(alice, true, 1e18);
        uint256 earlyFee = market.coreFeesSent();
        _stake(bob, IOCPVault.Side.YES, 1e6);
        _formalBuy(alice, false, 1e18);
        uint256 total = market.coreFeesSent();
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        assertEq(vault.officialMarketFeesClaimable(), earlyFee);
        assertEq(vault.claimableMarketFees(bob), total - earlyFee);
        uint256 before = usd.balanceOf(protocol);
        vault.claimOfficialMarketFees();
        assertEq(usd.balanceOf(protocol) - before, earlyFee);
        assertEq(usd.balanceOf(address(adapter)), 0);
        assertEq(usd.allowance(address(market), address(adapter)), 0);
        assertEq(usd.allowance(address(adapter), address(vault)), 0);
        _accounting();
    }

    function testRealCoreNoSideFeeFinalAndNoBackfill() public {
        _graduate();
        _stake(carol, IOCPVault.Side.NO, 3e6);
        _stake(bob, IOCPVault.Side.YES, 1e6);
        _formalBuy(alice, true, 1e18);
        uint256 total = market.coreFeesSent();
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        assertEq(uint256(vault.outcome()), 2);
        assertEq(vault.claimableMarketFees(carol), total);
        assertEq(vault.claimableMarketFees(bob), 0);
        uint256 before = usd.balanceOf(carol);
        vm.prank(carol);
        vault.withdraw();
        assertEq(usd.balanceOf(carol) - before, 4e6 + total);
        _claimAll(alice);
        _accounting();
    }

    function testRealCoreAdapterRejectsUnboundFeeCaller() public {
        _graduate();
        vm.prank(bob);
        vm.expectRevert("FEE_MARKET");
        adapter.depositMarketFee(100);
        assertTrue(vault.isAuthorizedMarket(address(adapter)));
        assertEq(vault.market(), address(market));
        assertEq(vault.marketCoordinator(), address(adapter));
    }

    function _paritySetup() internal {
        usd = new MockUSDC();
        uint64 end = uint64(block.timestamp+6 hours);
        adapter = new VaultCoreAdapter(usd,bob,carol,end);
        vault = OCPVault(address(adapter.vault()));
        market = new TopicMarket(usd, adapter, bob, carol, end, 2000e6, 1e18);
        adapter.bind(address(market));
        address[3] memory users=[alice,bob,carol];
        for(uint256 j;j<3;++j){
            usd.mint(users[j],10000e6);
            vm.prank(users[j]); usd.approve(address(market),type(uint256).max);
            vm.prank(users[j]); usd.approve(address(vault),type(uint256).max);
        }
        _buy(alice,9000e6); _buy(bob,9000e6); _buy(carol,9000e6);
    }
    function _parityLog(string memory step) internal {
        emit log_string(string.concat("PARITY ",step));
        emit log_named_uint("collateral6",market.collateralCash()); emit log_named_uint("cash6",market.cash());
        emit log_named_uint("inventoryYWad",market.inventoryY()); emit log_named_uint("inventoryNWad",market.inventoryN());
        emit log_named_uint("basisWad",market.poolBasisWad()); emit log_named_uint("bWad",market.bWad());
        emit log_named_uint("liquiditySupplyWad",market.liquiditySupply()); emit log_named_uint("lpFees6",market.lpFees());
        emit log_named_uint("B6",market.B()); emit log_named_uint("coreFeesSent6",market.coreFeesSent());
        emit log_named_uint("coreFeesEscrow6",vault.totalMarketFeesAccrued());
        emit log_named_uint("merged6",market.mergedPairs()); emit log_named_uint("redeemed6",market.redeemedPairs());
        if(!market.liquidityClosed() && market.phase()!=TopicMarket.Phase.SETTLED){emit log_named_uint("priceYesWad",market.priceYes());}
        address[3] memory users=[alice,bob,carol];
        for(uint256 j;j<3;++j){
            emit log_named_uint("account",j); emit log_named_uint("wallet6",usd.balanceOf(users[j]));
            emit log_named_uint("lpWad",market.shares(users[j])+market.lpToken().balanceOf(users[j])); emit log_named_uint("yesWad",market.yes(users[j]));
            emit log_named_uint("noWad",market.no(users[j])); emit log_named_uint("zWad",market.bToken().balanceOf(users[j]));
        }
        _accounting();
    }





 function testDemoParityLockedTokensBurn() public {
  _paritySetup();_parityLog("graduated");
  _formalBuy(carol,true,80e18);_parityLog("buy_yes_80");
  market.materializeLP(alice);vm.startPrank(alice);market.lpToken().transfer(bob,10e18);vm.stopPrank();_parityLog("transfer_lp_10");
  vm.startPrank(alice);market.bToken().transfer(carol,100e18);vm.stopPrank();_parityLog("transfer_b_100");
  vm.prank(carol);market.formalSell(true,30e18,0,type(uint64).max);_parityLog("sell_yes_30");
  _stake(bob,IOCPVault.Side.YES,100e6);
  vm.warp(market.coreCutoff());vault.finalize();market.finalize();_parityLog("finalized");
  vm.prank(bob);market.claimLP(1e18);_parityLog("burn_lp_1");
  vm.prank(carol);market.claimB(50e18);_parityLog("burn_b_50");
  vm.startPrank(bob);market.lpToken().transfer(carol,2e18);vm.stopPrank();_parityLog("transfer_after_settle");
  _claimAll(alice);_claimAll(bob);_claimAll(carol);
  vm.prank(bob);vault.withdraw();
  vm.prank(bob);market.claimFees();
  vm.prank(carol);vm.expectRevert("NO_FEES");market.claimFees();
  if(vault.officialMarketFeesClaimable()>0)vault.claimOfficialMarketFees();
  _parityLog("all_claimed");
  assertEq(market.lpToken().totalSupply(),0);assertEq(market.bToken().totalSupply(),0);
  assertLe(market.lpBudgetRemaining(),3);assertLe(market.bBudgetRemaining(),3);
 }
}
