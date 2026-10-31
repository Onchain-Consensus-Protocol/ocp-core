// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {removedBBalance,removedBSupply} from "./MarketInvariantCheck.sol";
import {TopicMarketRightsToken} from "../src/TopicMarketRightsToken.sol";
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// Independent v1.9 actual-transfer and double-accounting regression tests.
contract TopicMarketFeeSafetyTest is TopicMarketBase {
    function testGenesisBuyCreatorSevenTenthsProtocolThreeTenthsAndDust() public {
        uint256 paid=1000003;_buy(alice,paid);
        assertEq(market.R(),paid*99/100);assertEq(market.B(),0);
        assertEq(market.creatorFees(),paid*7/1000);assertEq(market.protocolFees(),paid*3/1000);
        assertEq(market.dust(),paid-paid*99/100-0-paid*7/1000-paid*3/1000);_accounting();
    }
    function testGenesisSellFullGrossReserveAndCreatorFee() public {
        _buy(alice,1000003);uint256 qty=market.shares(alice);(uint256 gross,)=market.quoteGenesisSell(qty);uint256 beforeB=market.B();
        uint256 beforeWallet=usd.balanceOf(alice);uint256 beforeCreator=market.creatorFees();
        // Full reverse curve can retain at most one microUSDC rounding dust outside R.
        vm.prank(alice);market.genesisSell(qty,0,type(uint64).max,0);
        uint256 newB=market.B()-beforeB;uint256 creator=market.creatorFees()-beforeCreator;
        assertEq(newB,(0));assertEq(creator,gross*7/1000);
        assertEq(usd.balanceOf(alice)-beforeWallet,gross*99/100);
        assertEq(market.protocolFees(),uint256(1000003)*3/1000+gross*3/1000);assertEq(market.R(),0);_accounting();
    }
    function testFormalBuyThreeIndependentFeesAndNoBTokenDilution() public {
        _graduate();uint256 gross=market.quoteFormalBuy(true,W/3);uint256 Bbefore=market.B();
        uint256 supply=removedBSupply(market);uint256 contribution=market.totalContribution();uint256 creator=market.creatorFees();
        _formalBuy(bob,true,W/3);
        assertEq(market.cash(),gross*98/100);assertEq(market.lpFees(),gross/100);
        assertEq(market.B()-Bbefore,0);assertEq(oracle.fees(),gross*7/1000);
        assertEq(market.protocolFees(),14e6*3/1000+gross*3/1000);assertEq(market.creatorFees(),creator);
        assertEq(removedBSupply(market),supply);assertEq(market.totalContribution(),contribution);
        assertEq(removedBBalance(market,bob),0);_accounting();
    }
    function testFormalSellDeductsGrossExactlyAndAllocatesDistinctFees() public {
        _graduate();_formalBuy(bob,true,W/2);(uint256 gross,uint256 seller)=market.quoteFormalSell(true,W/4);
        uint256 protocolBefore=market.protocolFees();uint256 cash=market.cash();uint256 lpfee=market.lpFees();uint256 B=market.B();uint256 core=oracle.fees();
        uint256 oldWallet=usd.balanceOf(bob);uint256 supply=removedBSupply(market);uint256 creator=market.creatorFees();
        vm.prank(bob);market.formalSell(true,W/4,seller,type(uint64).max);
        assertEq(cash-market.cash(),gross);assertEq(usd.balanceOf(bob)-oldWallet,gross*98/100);
        assertEq(market.lpFees()-lpfee,gross/100);assertEq(market.B()-B,0);assertEq(oracle.fees()-core,gross*7/1000);
        assertEq(market.creatorFees(),creator);assertEq(market.protocolFees()-protocolBefore,gross*3/1000);assertEq(removedBSupply(market),supply);_accounting();
    }
    function testCoreFailureRollsBackNewBFeesAndAllFunds() public {
        _graduate();uint256 B=market.B();uint256 wallet=usd.balanceOf(bob);uint256 collateral=market.collateralCash();uint256 supply=removedBSupply(market);
        oracle.setRejectFee(true);vm.prank(bob);vm.expectRevert("MOCK_FEE");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
        assertEq(market.B(),B);assertEq(market.cash(),0);assertEq(market.lpFees(),0);assertEq(market.yes(bob),0);
        assertEq(usd.balanceOf(bob),wallet);assertEq(removedBSupply(market),supply);assertEq(market.collateralCash(),collateral);_accounting();
    }
    function testCoverUsesNetLPFeesOnceAndOnlyThenSplitsBResidual() public {
        _graduate();_formalBuy(bob,true,4*W);uint256 nav=market.cash()+market.lpFees()+market.inventoryY()/market.SCALE();
        uint256 basis=market.poolBasisWad()/market.SCALE();uint256 B=market.B();uint256 loss=basis>nav?basis-nav:0;
        uint256 cover=Math.min(B,loss);_finish(1);
        assertEq(market.coverPaid(),cover);assertEq(market.lpBudgetInitial(),nav+cover);assertEq(market.bBudgetInitial(),B-cover);
        assertEq(market.lpBudgetInitial()+market.bBudgetInitial(),nav+B);_accounting();
    }
    function testDisabledBClaimCannotExtractLPFeesOrCreatorFunds() public {
        _graduate(); uint256 oldCreator=market.creatorFees(); _formalBuy(bob,true,W); assertEq(market.creatorFees(),oldCreator);
        _finish(2); assertEq(market.coverPaid(),0); assertEq(market.bBudgetInitial(),0);
        vm.prank(carol); vm.expectRevert("B_REMOVED"); market.claimB();
        uint256 budgetLP=market.lpBudgetRemaining(); uint256 collateral=market.collateralCash(); market.claimFees();
        assertEq(market.lpBudgetRemaining(),budgetLP); assertEq(market.collateralCash(),collateral); _accounting();
    }
}
