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

    function testFinalPureBuyerPays1000ForAbout522InitialLPPlusB() public {
        _buy(alice, 10000e6);
        _buy(bob, 10000e6);
        _buy(carol, 5666666667);
        assertEq(uint256(market.phase()), uint256(TopicMarket.Phase.GENESIS));
        uint256 oldS = market.S();
        uint256 oldR = market.R();
        assertEq(oldR, 24255000000);
        uint256 minted = market.quoteGenesisBuy(1000e6);
        _buy(dave, 1000e6);
        assertEq(uint256(market.phase()), uint256(TopicMarket.Phase.FORMAL));
        assertEq(market.graduationSupply(), oldS + minted);
        assertEq(market.initialCollateral(), oldR + 945e6);
        assertEq(market.shares(dave), minted);
        uint256 initialLPPrincipal = Math.mulDiv(market.initialCollateral(), minted, market.graduationSupply());
        uint256 reserveContribution = market.contribution(dave);
        assertEq(reserveContribution, 45e6);
        uint256 combined = initialLPPrincipal + reserveContribution;
        assertApproxEqAbs(combined, 522014743, 3);
        assertLt(combined, 525e6);
        // B is a risk claim, not cash paid to the buyer; this already generous valuation is below cost.
        assertGt(1000e6 - combined, 475e6);
        _accounting();
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
        assertGt(market.B(), 8e6);
        assertLt(market.B(), 9e6);
        vm.warp(market.genesisCutoff());
        market.closeExpired();
        vm.startPrank(creator);
        market.claimB();
        market.claimFees();
        vm.stopPrank();
        assertLe(usd.balanceOf(creator), start);
        assertApproxEqAbs(start - usd.balanceOf(creator), usd.balanceOf(protocol), 10);
        assertGt(usd.balanceOf(protocol), 0);
        assertEq(market.bToken().totalSupply(), 0);
        assertEq(usd.balanceOf(address(market)), market.accountedBalance());
        assertTrue(checkMarketInvariants(market));
    }

    function testClaimAllTransferFailureRollsBackAllRightsAndBudgets() public {
        _buy(alice, 27000e6);
        _formalBuy(alice, true, W);
        _finish(1);
        uint256 g = market.shares(alice);
        uint256 escrow = market.lpToken().balanceOf(address(market));
        uint256 b = market.bToken().balanceOf(alice);
        uint256 y = market.yes(alice);
        uint256 lpBudget = market.lpBudgetRemaining();
        uint256 bBudget = market.bBudgetRemaining();
        uint256 collateral = market.collateralCash();
        usd.setFail(true);
        vm.prank(alice);
        vm.expectRevert();
        market.claimAll();
        assertEq(market.shares(alice), g);
        assertEq(market.lpToken().balanceOf(address(market)), escrow);
        assertEq(market.lpToken().balanceOf(alice), 0);
        assertEq(market.bToken().balanceOf(alice), b);
        assertEq(market.yes(alice), y);
        assertEq(market.lpBudgetRemaining(), lpBudget);
        assertEq(market.bBudgetRemaining(), bBudget);
        assertEq(market.collateralCash(), collateral);
        usd.setFail(false);
        vm.prank(alice);
        market.claimAll();
        assertEq(market.shares(alice) + market.yes(alice), 0);
        assertEq(market.lpToken().balanceOf(alice) + market.bToken().balanceOf(alice), 0);
        _accounting();
    }
}
