// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {TopicMarketBase,MockCore} from "./TopicMarketBase.sol";
import {TopicMarketStockCollateralTest,StockCollateralMock} from "./TopicMarketStockCollateral.t.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {TopicMarketMath} from "../src/TopicMarketMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TopicMarketGraduationDepthTest is TopicMarketBase {
    function testBuyGraduationUsesActualOvershootCapital() public {
        _buy(alice,30e6);
        assertEq(market.bWad(),market.initialCollateral()*market.SCALE());
        assertEq(market.bWad(),market.poolBasisWad());
        assertEq(market.priceYes(),W/2);
        assertGt(market.initialCollateral(),market.rTarget());
        _accounting();
    }
    function testSellGraduationUsesRemainingRNotBOrThreshold() public {
        _buy(alice,9e6);
        uint256 target=Math.mulDiv(market.bTarget()-market.B(),1000,45,Math.Rounding.Ceil)+3;
        uint256 quantity=market.S()-Math.sqrt((market.R()-target)*1e30)+1;
        vm.prank(alice);market.genesisSell(quantity,0,type(uint64).max,1);
        assertEq(market.bWad(),market.initialCollateral()*market.SCALE());
        assertEq(market.priceYes(),W/2);_accounting();
    }
    function testPriceImpactAndRoundtripKeepDepthAndFunds() public {
        _graduate();uint256 depth=market.bWad();uint256 amount=depth/100;
        uint256 before=usd.balanceOf(bob);_formalBuy(bob,true,amount);
        assertApproxEqAbs(market.priceYes(),502499979166874997,100);
        assertEq(market.bWad(),depth);
        vm.prank(bob);market.formalSell(true,amount,0,type(uint64).max);
        assertEq(market.priceYes(),W/2);assertEq(market.bWad(),depth);
        assertLt(usd.balanceOf(bob),before);_accounting();
    }
    function testInventoryBoundaryRemainsExplicit() public {
        _graduate();uint256 cap=market.inventoryY();_formalBuy(bob,true,cap);
        assertApproxEqAbs(market.priceYes(),731058578630004879,100);
        vm.expectRevert("INVENTORY");market.quoteFormalBuy(true,1);_accounting();
    }
    function testMaximumCapitalTinyAndLargeRoundtripsNoFreeValue() public {
        uint256 paid=market.LIMIT();usd.mint(alice,paid);_buy(alice,paid);
        uint256 depth=market.bWad();assertGt(depth,1e29);assertLe(depth,1e30);
        assertEq(depth,market.initialCollateral()*market.SCALE());
        uint256 guard=Math.max(1e12,depth/1e14+100);
        assertGt(market.quoteFormalBuy(true,1),0);
        uint256[3] memory amounts=[guard*1000,1e24,depth/100];
        usd.mint(bob,paid);
        for(uint256 i;i<amounts.length;i++){
            uint256 before=usd.balanceOf(bob);_formalBuy(bob,true,amounts[i]);
            vm.prank(bob);market.formalSell(true,amounts[i],0,type(uint64).max);
            assertLe(usd.balanceOf(bob),before);assertEq(market.bWad(),depth);_accounting();
        }
    }
}
contract TopicMarketDepthDecimalsTest is TopicMarketStockCollateralTest {
    function testDepthUnitsSixEightEighteenAndAllSettlementOutcomes() public {
        uint8[3] memory precisions=[uint8(6),8,18];
        for(uint256 d;d<3;d++)for(uint8 outcome=1;outcome<=3;outcome++){
            (StockCollateralMock t,MockCore c,TopicMarket m)=_market(precisions[d]);
            uint256 unit=10**precisions[d];m.genesisBuy(14*unit,0,type(uint64).max,1);
            assertEq(m.bWad(),1323e16);assertEq(m.bWad(),m.initialCollateral()*m.SCALE());
            uint256 paid=m.quoteFormalBuy(true,1e18);m.formalBuy(true,1e18,paid,type(uint64).max);
            assertEq(m.bWad(),1323e16);assertTrue(checkMarketInvariants(m));
            vm.warp(m.coreCutoff());c.resolve(outcome);m.finalize();
            uint256 before=t.balanceOf(address(this));(uint256 y,uint256 lp,uint256 reserve,)=m.previewAccount(address(this),outcome);
            m.claimAll();assertEq(t.balanceOf(address(this))-before,y+lp+reserve);
            assertEq(t.balanceOf(address(m)),m.accountedBalance());assertTrue(checkMarketInvariants(m));
            assertEq(m.lpBudgetRemaining(),0);assertEq(m.bBudgetRemaining(),0);
        }
    }
}
