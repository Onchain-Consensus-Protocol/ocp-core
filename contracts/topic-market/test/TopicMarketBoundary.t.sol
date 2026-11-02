// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {assertSelectorRemoved} from "./MarketInvariantCheck.sol";
import {TopicMarketBase, MockCore} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TopicMarketBoundaryTest is TopicMarketBase {
    function testLPLossHasNoExternalBFirstLossBuffer() public {
        oracle = new MockCore();
        market = new TopicMarket(usd, oracle, creator, protocol, uint64(block.timestamp + 6 hours), 1e6, 1e18);
        oracle.bind(address(market));
        vm.prank(alice);
        usd.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usd.approve(address(market), type(uint256).max);
        _graduate();
        _formalBuy(bob, true, market.poolBasisWad());

        uint256 initial = market.initialCollateral();
        _finish(1);
        assertLt(market.lpBudgetInitial(), initial);
        _claimAll(alice);
        _claimAll(bob);
        _accounting();
    }

    function testLPReceivesNetAssetsWithoutSyntheticBCompensation() public {
        _graduate(); _formalBuy(bob,true,market.poolBasisWad()/20);
        uint256 nav=market.cash()+market.lpFees()-market.yesSupply()/market.SCALE();
        _finish(1); assertEq(market.lpBudgetInitial(),nav); _accounting();
    }

    function testInvalidSettlementHasNoBAndPreservesSinglePoolAccounting() public {
        _graduate();
        _formalBuy(bob, true, 5e18);

        _finish(3);
        _accounting();
    }

    function testOversizedSellDoesNotGraduateAtIntermediatePoint() public {
        _buy(alice, 4e6);
        uint256 newR = 2e6;
        uint256 d = market.S() - Math.sqrt(newR * 1e30);
        vm.prank(alice);
        market.genesisSell(d, 0, type(uint64).max, 0);
        assertLt(market.R(), market.rTarget());

        assertEq(uint256(market.phase()), 0);
        _accounting();
    }

    function testGenesisTransferDisabledEvenAtDeadline() public {
        _buy(alice, 1e6);
        vm.warp(market.genesisCutoff());
        vm.prank(alice);
        vm.expectRevert();
        IRemovedMarketAPI(address(market)).transferShares(bob, 1);
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
        assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB()"));
    }

    function testExactCoreCutoffDoesNotMeanOracleFinal() public {
        _graduate();
        vm.warp(market.coreCutoff());
        vm.expectRevert("CORE_PENDING");
        market.finalize();
        assertGt(market.cash(), 0);
        _accounting();
    }




}

interface IRemovedMarketAPI {
    function quoteAddLP(uint256) external;
    function quoteExit(uint256) external;
    function addLP(uint256,uint256,uint256,uint256,uint64) external;
    function exitLP(uint256,uint256,uint256,uint256) external;
    function transferShares(address,uint256) external;
    function transferOutcome(address,bool,uint256) external;
}
