// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {DLPBase} from "./DLPBase.sol";
import {DLPMarket} from "../src/DLPMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";
import {IOCPVault} from "ocp/interfaces/IOCPVault.sol";

contract DLPIntegrationV20Test is DLPBase {
    VaultCoreAdapter internal adapter;
    OCPVault internal vault;

    function setUp() public override {
        super.setUp();
        uint64 end = uint64(block.timestamp + 6 hours);
        adapter = new VaultCoreAdapter(usd, creator, protocol, end);
        vault = OCPVault(address(adapter.vault()));
        market = new DLPMarket(usd, adapter, creator, protocol, end, 1e6, W);
        adapter.bind(address(market));
        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i; i < users.length; ++i) {
            vm.startPrank(users[i]);
            usd.approve(address(market), type(uint256).max);
            usd.approve(address(vault), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _scenario(uint8 result) internal {
        _buy(alice, 2e6);
        _buy(carol, 12e6);
        _formalBuy(bob, true, W);
        _formalBuy(dave, false, W / 2);
        vm.prank(bob);
        vault.stake(result == 1 ? IOCPVault.Side.YES : result == 2 ? IOCPVault.Side.NO : IOCPVault.Side.INVALID, 3e6);
        _formalBuy(dave, true, W / 3);
    }

    function _assertAccountClaim(address who, uint8 result) internal {
        (uint256 o, uint256 l, uint256 b, uint256 f) = market.previewAccount(who, result);
        uint256 before = usd.balanceOf(who);
        vm.prank(who);
        uint256 paid = market.claimAll();
        assertEq(paid, o + l + b + f);
        assertEq(usd.balanceOf(who) - before, paid);
        assertEq(market.shares(who), 0);
        assertEq(market.lpToken().balanceOf(who), 0);
        assertEq(market.bToken().balanceOf(who), 0);
        assertEq(market.yes(who) + market.no(who), 0);
        vm.prank(who);
        vm.expectRevert();
        market.claimAll();
    }

    function _previewMatches(uint8 result) internal {
        _scenario(result);
        assertGt(market.shares(alice), 0);
        assertEq(market.lpToken().balanceOf(alice), 0);
        (uint256 lp, uint256 b, uint256 cover) = market.previewSettlement(result);
        (, uint256 aliceLP,,) = market.previewAccount(alice, result);
        assertGt(aliceLP, 0);
        vm.warp(market.coreCutoff());
        vm.prank(dave);
        adapter.finalizeMarket();
        assertEq(market.outcome(), result);
        assertEq(market.lpBudgetInitial(), lp);
        assertEq(market.bBudgetInitial(), b);
        assertEq(market.coverPaid(), cover);
        // Include unmaterialized LP, B-only rights, and both outcome positions.
        _assertAccountClaim(carol, result);
        _assertAccountClaim(dave, result);
        _assertAccountClaim(alice, result);
        _assertAccountClaim(bob, result);
        _accounting();
    }

    function testPreviewAndUnifiedClaimsYes() public { _previewMatches(1); }
    function testPreviewAndUnifiedClaimsNo() public { _previewMatches(2); }
    function testPreviewAndUnifiedClaimsInvalid() public { _previewMatches(3); }

    function testUnifiedFailureClaimBurnsBAndGWithFrozenBudget() public {
        _buy(alice, 1e6);
        _buy(bob, 2e6);
        vm.warp(market.genesisCutoff());
        market.closeExpired();
        uint256 frozenR = market.failedRInitial();
        uint256 frozenB = market.bBudgetInitial();
        uint256 before = usd.balanceOf(alice) + usd.balanceOf(bob);
        _assertAccountClaim(bob, 3);
        _assertAccountClaim(alice, 3);
        uint256 paid = usd.balanceOf(alice) + usd.balanceOf(bob) - before;
        assertLe(paid, frozenR + frozenB);
        assertLe(frozenR + frozenB - paid, 3);
        assertEq(market.bToken().totalSupply(), 0);
        _accounting();
    }

    function testUnifiedFinalizeAfterVaultFirstAndRepeatedCall() public {
        _scenario(1);
        vm.warp(market.coreCutoff());
        vault.finalize();
        adapter.finalizeMarket();
        uint256 lp = market.lpBudgetInitial();
        adapter.finalizeMarket();
        assertEq(market.lpBudgetInitial(), lp);
        assertEq(uint256(market.phase()), uint256(DLPMarket.Phase.SETTLED));
    }

    function testUnifiedFinalizeAfterBothAlreadyFinalized() public {
        _scenario(2);
        vm.warp(market.coreCutoff());
        vault.finalize();
        market.finalize();
        adapter.finalizeMarket();
        assertEq(market.outcome(), 2);
        _accounting();
    }

    function testUnifiedFinalizeBeforeGraduationAndBeforeDeadlineReverts() public {
        vm.expectRevert();
        adapter.finalizeMarket();
        _graduate();
        vm.warp(market.coreCutoff() - 1);
        vm.expectRevert();
        adapter.finalizeMarket();
        assertFalse(vault.resolved());
        assertEq(uint256(market.phase()), uint256(DLPMarket.Phase.FORMAL));
    }

    function testClaimAllBeforeTerminalOrWithoutRightsReverts() public {
        _graduate();
        vm.prank(alice);
        vm.expectRevert();
        market.claimAll();
        vm.warp(market.coreCutoff());
        adapter.finalizeMarket();
        vm.prank(dave);
        vm.expectRevert();
        market.claimAll();
    }
}
