// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";

contract TopicMarketNoDonationTest is TopicMarketBase {
    OCPCore private vault;
    function setUp() public override {
        super.setUp();
        uint64 end = uint64(block.timestamp + 6 hours);
        VaultCoreAdapter adapter = new VaultCoreAdapter(usd, creator, protocol, end, 500e6);
        vault = OCPCore(address(adapter.vault()));
        market = new TopicMarket(usd, adapter, creator, protocol, end, 1e6, 1e18);
        adapter.bind(address(market));
        vm.prank(alice); usd.approve(address(market), type(uint256).max);
        vm.prank(bob); usd.approve(address(market), type(uint256).max);
        vm.prank(bob); usd.approve(address(vault), type(uint256).max);
        vm.prank(carol); usd.approve(address(vault), type(uint256).max);
    }
    function testRemovedDonationSelectorCannotPullFunds() public {
        _graduate();
        uint256 userBefore = usd.balanceOf(bob);
        uint256 vaultBefore = usd.balanceOf(address(vault));
        vm.prank(bob);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("donate(uint256)", 1e6));
        assertFalse(ok);
        assertEq(usd.balanceOf(bob), userBefore);
        assertEq(usd.balanceOf(address(vault)), vaultBefore);
        assertEq(vault.totalPrincipal(), 0);
        (ok,) = address(vault).staticcall(abi.encodeWithSignature("totalDonations()"));
        assertFalse(ok);
    }
    function testInvalidSettlementStillAccountsPrincipalAndMarketFeesSeparately() public {
        _graduate();
        vm.prank(bob); vault.stake(IOCPCore.Side.YES, 1e6);
        vm.prank(carol); vault.stake(IOCPCore.Side.NO, 1e6);
        _formalBuy(bob, true, W);
        uint256 fees = vault.totalMarketFeesAccrued();
        assertGt(fees, 0);
        vm.warp(market.coreCutoff());
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPCore.Outcome.INVALID));
        assertEq(vault.settlementPool(), vault.totalPrincipal());
        assertEq(vault.marketFeeUserPoolRemaining() + vault.officialMarketFeesClaimable(), fees);
        vm.prank(bob); vault.withdraw();
        vm.prank(carol); vault.withdraw();
        assertEq(vault.remainingSettlementPool(), 0);
        assertEq(vault.marketFeeUserPoolRemaining(), 0);
        assertEq(usd.balanceOf(address(vault)), vault.officialMarketFeesClaimable());
    }
}
