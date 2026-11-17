// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {assertSelectorRemoved} from "./MarketInvariantCheck.sol";
import {TopicMarketAssetRouter} from "../src/TopicMarketAssetRouter.sol";
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Focused regression for the two authorized changes: single R and mandatory fee attempts.
contract TopicMarketSinglePoolTest is TopicMarketBase {
    function testRetiredSelectorsAreAbsentRatherThanZeroValuedCompatibility() public {
        assertSelectorRemoved(address(market),abi.encodeWithSignature("B()"));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("bToken()"));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("bTarget()"));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("bBudgetRemaining()"));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("contribution(address)",alice));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB()"));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB(uint256)",1));
        assertSelectorRemoved(address(market),abi.encodeWithSignature("singlePool()"));
    }
    function testRouterCurrentInterfaceActionsHaveNoRetiredPlaceholder() public {
        assertEq(uint8(TopicMarketAssetRouter.Action.ClaimFailed),8);
        assertEq(uint8(TopicMarketAssetRouter.Action.ClaimCore),9);
        assertEq(uint8(TopicMarketAssetRouter.Action.RedeemPairs),10);
    }
    function testNoBDeploymentAndGenesisRightsBecomeOnlyProportionalLP() public {
        _buy(alice,1e6);uint256 aliceG=market.shares(alice);
        uint256 bobG=market.quoteGenesisBuy(33e5);_buy(bob,33e5);
        assertEq(market.initialCollateral(),4257000);assertEq(market.rTarget(),4200000);assertEq(market.graduationSupply(),aliceG+bobG);assertEq(market.liquiditySupply(),aliceG+bobG);
        assertEq(market.bWad(),market.initialCollateral()*market.SCALE());
        market.materializeLP(alice);market.materializeLP(bob);
        assertEq(market.lpToken().balanceOf(alice),aliceG);assertEq(market.lpToken().balanceOf(bob),bobG);
        _accounting();
    }
    function testOnlyRThresholdCanGraduateIncludingExactRawBoundary() public {
        uint256 target=market.rTarget();uint256 first=Math.ceilDiv(target*100,99)-1;
        _buy(alice,first);assertEq(market.R(),target-1);assertEq(uint256(market.phase()),0);
        _buy(bob,2);assertEq(uint256(market.phase()),1);assertEq(market.initialCollateral(),target);
        assertEq(market.bWad(),target*market.SCALE());_accounting();
    }
    function testFormalFeeIsOnePercentForLPAndNeverChangesDepthOrB() public {
        _graduate();uint256 depth=market.bWad();uint256 gross=market.quoteFormalBuy(true,W);
        _formalBuy(bob,true,W);assertEq(market.lpFees(),gross/100);assertEq(market.cash(),market.initialCollateral()+gross*98/100);
        assertEq(market.coreFeesSent(),gross*7/1000);
        (uint256 sellGross,)=market.quoteFormalSell(true,W);vm.prank(bob);market.formalSell(true,W,0,type(uint64).max);
        assertEq(market.lpFees(),gross/100+sellGross/100);assertEq(market.bWad(),depth);_accounting();
    }
    function testThreeResultsPayOnlyActualLPAssetsAndOutcomesWithoutDoubleBacking() public {
        _buy(alice,1e6);_buy(bob,13e6);_formalBuy(carol,true,W);_formalBuy(carol,false,W/2);
        uint256 snapshot=vm.snapshotState();
        for(uint8 result=1;result<=3;result++){
            uint256 inventoryValue=result==1?market.yesSupply()/market.SCALE():result==2?market.noSupply()/market.SCALE():(market.yesSupply()+market.noSupply())/(2*market.SCALE());
            uint256 nav=market.cash()+market.lpFees()-inventoryValue;
            _finish(result);assertEq(market.lpBudgetInitial(),nav);
            _claimAll(alice);_claimAll(bob);_claimAll(carol);assertEq(market.liquiditySupply(),0);assertEq(market.yesSupply()+market.noSupply(),0);_accounting();
            assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB()"));assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB(uint256)",1));
            assertTrue(vm.revertToState(snapshot));snapshot=vm.snapshotState();
        }
    }
    function testUnsuccessfulLaunchRefundsOnlyNinetyNinePercentRAndNoSecondClaim() public {
        _buy(alice,1e6);_buy(bob,2e6);uint256 r=market.R();assertEq(r,2970000);
        vm.warp(market.genesisCutoff());market.closeExpired();
        uint256 before=usd.balanceOf(alice)+usd.balanceOf(bob);_claimAll(alice);_claimAll(bob);
        uint256 paid=usd.balanceOf(alice)+usd.balanceOf(bob)-before;assertLe(paid,r);assertLe(r-paid,1);
        vm.prank(alice);vm.expectRevert("CLAIMED");market.claimFailed();
        vm.prank(alice);assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB()"));_accounting();
    }
}
