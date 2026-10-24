// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase, MockCore} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TopicMarketBoundaryTest is TopicMarketBase {
    function testBFirstThenLPLossWhenReserveExhausted() public {
        oracle = new MockCore();
        market = new TopicMarket(usd, oracle, creator, protocol, uint64(block.timestamp + 6 hours), 1e6, 1e18);
        oracle.bind(address(market));
        vm.prank(alice);
        usd.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usd.approve(address(market), type(uint256).max);
        _graduate();
        _formalBuy(bob, true, market.inventoryY());
        uint256 originalB = market.B();
        uint256 initial = market.initialCollateral();
        _finish(1);
        assertEq(market.coverPaid(), originalB);
        assertEq(market.bBudgetInitial(), 0);
        assertLt(market.lpBudgetInitial(), initial);
        _claimAll(alice);
        _claimAll(bob);
        _accounting();
    }

    function testBCompensatesNetOfRetainedLPFees() public {
        _graduate();
        _formalBuy(bob, true, market.inventoryY()/20);
        uint256 nav = market.cash() + market.lpFees() + market.inventoryY()/market.SCALE();
        uint256 expected = market.initialCollateral() - nav;
        uint256 z = market.B();
        _finish(1);
        assertEq(market.coverPaid(), expected);
        assertEq(market.lpBudgetInitial(), market.initialCollateral());
        assertEq(market.bBudgetInitial(), z - expected);
        _accounting();
    }

    function testInvalidDoesNotConsumeB() public {
        _graduate();
        _formalBuy(bob, true, 5e18);
        uint256 B = market.B();
        _finish(3);
        assertEq(market.coverPaid(), 0);
        assertEq(market.bBudgetInitial(), B);
        _accounting();
    }

    function testOversizedSellDoesNotGraduateAtIntermediatePoint() public {
        _buy(alice, 9e6);
        uint256 newR = 2e6;
        uint256 d = market.S() - Math.sqrt(newR * 1e30);
        vm.prank(alice);
        market.genesisSell(d, 0, type(uint64).max, 0);
        assertLt(market.R(), market.rTarget());
        assertGe(market.B(), market.bTarget());
        assertEq(uint256(market.phase()), 0);
        _accounting();
    }

    function testGenesisTransferDisabledEvenAtDeadline() public {
        _buy(alice, 1e6);
        vm.warp(market.genesisCutoff());
        vm.prank(alice);
        vm.expectRevert("TRANSFER_NOT_IN_DEMO");
        market.transferShares(bob, 1);
    }





    function testFeeRecipientMayCoincide() public {
        oracle = new MockCore();
        market = new TopicMarket(usd, oracle, creator, creator, uint64(block.timestamp + 6 hours), 1e6, 1e18);
        oracle.bind(address(market));
        vm.prank(alice);
        usd.approve(address(market), type(uint256).max);
        _buy(alice, 1e6);
        uint256 due = market.protocolFees() + market.creatorFees();
        vm.prank(creator);
        market.claimFees();
        assertEq(usd.balanceOf(creator), due);
        assertEq(market.protocolFees() + market.creatorFees(), 0);
        _accounting();
    }



    function testNoLPClaimsBeforeFinalResult() public {
        _graduate();
        vm.prank(alice);
        vm.expectRevert("PHASE");
        market.claimLP();
        vm.prank(alice);
        vm.expectRevert("PHASE");
        market.claimB();
    }

    function testExactCoreCutoffDoesNotMeanOracleFinal() public {
        _graduate();
        vm.warp(market.coreCutoff());
        vm.expectRevert("CORE_PENDING");
        market.finalize();
        assertGt(market.collateralCash(), 0);
        _accounting();
    }




}
