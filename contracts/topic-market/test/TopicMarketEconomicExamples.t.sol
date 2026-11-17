// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {TopicMarketBase, MockCore} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Reproduces economic properties of the agreed mechanism; these are not accounting fixes.
contract TopicMarketEconomicExamplesTest is TopicMarketBase {
    function setUp() public override {
        super.setUp();
        oracle = new MockCore();
        market = new TopicMarket(usd, oracle, creator, protocol, uint64(block.timestamp + 6 hours), 2000e6, W);
        oracle.bind(address(market));
        address[5] memory users = [alice, bob, carol, dave, creator];
        for (uint256 i; i < users.length; ++i) {
            usd.mint(users[i], 30000e6);
            vm.prank(users[i]);
            usd.approve(address(market), type(uint256).max);
        }
    }

    function testFinalBuyerReceivesOnlyProportionalLPWithoutExtraBClaim() public {
        _buy(alice,3000e6); _buy(bob,3000e6); _buy(carol,2000e6);
        assertEq(uint256(market.phase()),0); uint256 oldS=market.S(); uint256 oldR=market.R();
        uint256 minted=market.quoteGenesisBuy(1000e6); _buy(dave,1000e6);
        assertEq(uint256(market.phase()),1); assertEq(market.graduationSupply(),oldS+minted);
        assertEq(market.initialCollateral(),oldR+990e6); assertEq(market.shares(dave),minted);
        uint256 lpValue=Math.mulDiv(market.initialCollateral(),minted,market.graduationSupply());
        assertGt(lpValue,450e6); assertLt(lpValue,550e6); _accounting();
    }

    function testCreatorSelfTradeStillPaysProtocolShareAfterRecoveringOwnFeesAndB() public {
        uint256 start = usd.balanceOf(creator);
        _buy(creator, 100e6);
        uint256 supply = market.shares(creator);
        assertEq(supply, market.S());
        vm.prank(creator);
        market.genesisSell(supply, 0, type(uint64).max, 0);
        assertEq(market.S(), 0);
        assertEq(market.R(), 0);
        vm.warp(market.genesisCutoff());
        market.closeExpired();
        vm.startPrank(creator);
        market.claimFees();
        vm.stopPrank();
        assertLe(usd.balanceOf(creator), start);
        assertApproxEqAbs(start - usd.balanceOf(creator), usd.balanceOf(protocol), 10);
        assertGt(usd.balanceOf(protocol), 0);
        assertEq(usd.balanceOf(address(market)), market.accountedBalance());
        assertTrue(checkMarketInvariants(market));
    }

    function testClaimAllTransferFailureRollsBackAllRightsAndBudgets() public {
        _buy(alice, 27000e6);
        _formalBuy(alice, true, W);
        _finish(1);
        uint256 g = market.shares(alice);
        uint256 escrow = market.lpToken().balanceOf(address(market));

        uint256 y = market.yes(alice);
        uint256 lpBudget = market.lpBudgetRemaining();

        uint256 collateral = market.collateralCash();
        usd.setFail(true);
        vm.prank(alice);
        vm.expectRevert();
        market.claimAll();
        assertEq(market.shares(alice), g);
        assertEq(market.lpToken().balanceOf(address(market)), escrow);
        assertEq(market.lpToken().balanceOf(alice), 0);
        assertEq(market.yes(alice), y);
        assertEq(market.lpBudgetRemaining(), lpBudget);
        assertEq(market.collateralCash(), collateral);
        usd.setFail(false);
        vm.prank(alice);
        market.claimAll();
        assertEq(market.shares(alice) + market.yes(alice), 0);
        assertEq(market.lpToken().balanceOf(alice) + 0, 0);
        _accounting();
    }
}
