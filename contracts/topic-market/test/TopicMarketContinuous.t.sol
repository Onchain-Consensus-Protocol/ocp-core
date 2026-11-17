// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
contract TopicMarketContinuousTest is TopicMarketBase {
    function _solvent() internal view {
        assertEq(market.inventoryY()+market.inventoryN()+market.collateralCash(),0);
        uint256 maxLiability=Math.ceilDiv(Math.max(market.yesSupply(),market.noSupply()),market.SCALE());
        assertGe(market.cash(),maxLiability);_accounting();
    }
    function testExtremeOneSidedIssuanceBeyondInitialCapitalHasBoundedLPWorstLoss() public {
        _graduate();usd.mint(bob,5000e6);uint256 capital=market.initialCollateral();uint256 lp=market.liquiditySupply();uint256 b=market.bWad();uint256 k=market.k();
        assertEq(market.yesSupply()+market.noSupply(),0);assertEq(market.cash(),capital);
        _formalBuy(bob,true,b*80);assertEq(market.yes(bob),b*80);assertEq(market.priceYes(),1e18);_solvent();
        assertEq(market.bWad(),b);assertEq(market.k(),k);assertEq(market.liquiditySupply(),lp);
        uint256 bound=capital-Math.ceilDiv(Math.mulDiv(b,693147180559945310,1e18),market.SCALE());
        for(uint8 result=1;result<=3;result++)assertGe(market.previewSettlement(result),bound);
        uint256 snap=vm.snapshotState();
        for(uint8 result=1;result<=3;result++){
            uint256 debt=result==1?market.yesSupply()/market.SCALE():result==2?0:market.yesSupply()/(2*market.SCALE());
            uint256 nav=market.cash()+market.lpFees()-debt;_finish(result);
            assertEq(market.collateralCash(),debt);assertEq(market.lpBudgetInitial(),nav);
            _claimAll(alice);_claimAll(bob);assertEq(market.yesSupply()+market.noSupply(),0);_accounting();
            assertTrue(vm.revertToState(snap));snap=vm.snapshotState();
        }
    }
    function testPairRedemptionBeyondOriginalCapitalTranslatesQWithoutChangingPrice() public {
        _graduate();usd.mint(bob,5000e6);uint256 b=market.bWad();_formalBuy(bob,true,b*4);_formalBuy(bob,false,b*3);_solvent();
        uint256 paid=market.initialCollateral()*2;uint256 price=market.priceYes();uint256 cash=market.cash();uint256 y=market.yesSupply();uint256 n=market.noSupply();
        vm.prank(bob);market.redeemPairs(paid);assertEq(market.cash(),cash-paid);assertEq(market.yesSupply(),y-paid*market.SCALE());assertEq(market.noSupply(),n-paid*market.SCALE());assertEq(market.priceYes(),price);_solvent();
        uint256 wallet=usd.balanceOf(bob);uint256 qty=market.yes(bob);vm.prank(bob);market.formalSell(true,qty,0,type(uint64).max);assertGt(usd.balanceOf(bob),wallet);_solvent();
        qty=market.no(bob);vm.prank(bob);market.formalSell(false,qty,0,type(uint64).max);assertEq(market.yesSupply()+market.noSupply(),0);_solvent();
    }
    function testNoFreePairCreationOrNakedSell() public {
        _graduate();uint256 cash=market.cash();vm.prank(bob);vm.expectRevert("HOLDINGS");market.redeemPairs(1);
        vm.prank(bob);vm.expectRevert("HOLDINGS");market.formalSell(true,1e18,0,type(uint64).max);
        uint256 tooLarge=market.MAX_OUTCOME_SUPPLY()+1;vm.expectRevert("AMOUNT");market.quoteFormalBuy(true,tooLarge);
        assertEq(market.cash(),cash);assertEq(market.yesSupply()+market.noSupply(),0);_solvent();
    }
    function testFractionalHoldingsAllResultsAndClaimOrdersNeverConsumeOthersReserve() public {
        _graduate();_formalBuy(bob,true,1e18+700000000017);_formalBuy(carol,false,2e18+1300000000091);_formalBuy(dave,true,3e18+700000000113);
        uint256 snap=vm.snapshotState();
        for(uint8 result=1;result<=3;result++)for(uint8 order;order<2;order++){
            _finish(result);if(order==0)_claimAll(alice);
            _claimAll(dave);_claimAll(carol);_claimAll(bob);if(order==1)_claimAll(alice);
            assertEq(market.yesSupply()+market.noSupply()+market.liquiditySupply(),0);assertLe(market.collateralCash(),3);_accounting();
            assertTrue(vm.revertToState(snap));snap=vm.snapshotState();
        }
    }
    function testFuzzInterleavedMintBurnAndPairsStaySolvent(uint256 seed,uint8 result) public {
        _graduate();usd.mint(bob,10000e6);uint256 wallet=usd.balanceOf(bob);uint256 lp=market.liquiditySupply();
        for(uint256 i;i<32;i++){
            seed=uint256(keccak256(abi.encode(seed,i)));bool side=seed%2==0;uint256 qty=1e17+(seed>>16)%1e18;
            uint256 held=side?market.yes(bob):market.no(bob);
            if(seed%3==0&&held>1e14){vm.prank(bob);market.formalSell(side,held/2,0,type(uint64).max);}else _formalBuy(bob,side,qty);
            uint256 pair=Math.min(market.yes(bob),market.no(bob))/(4*market.SCALE());if(pair>0){vm.prank(bob);market.redeemPairs(pair);}
            _solvent();assertEq(market.liquiditySupply(),lp);
        }
        uint256 y=market.yes(bob);uint256 n=market.no(bob);if(y>0){vm.prank(bob);market.formalSell(true,y,0,type(uint64).max);}if(n>0){vm.prank(bob);market.formalSell(false,n,0,type(uint64).max);}
        assertLe(usd.balanceOf(bob),wallet);_solvent();_finish(uint8(bound(result,1,3)));_claimAll(alice);_accounting();
    }
}
