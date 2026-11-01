// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {assertSelectorRemoved} from "./MarketInvariantCheck.sol";
import {TopicMarketBase, MockCore} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {TopicMarketRightsToken} from "../src/TopicMarketRightsToken.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TopicMarketFeesV19Test is TopicMarketBase {
    function testGenesisCreatorAndProtocolSplitOnePercentOnBuyAndSell() public {
        _buy(alice,100000);
        assertEq(market.creatorFees(),700); assertEq(market.protocolFees(),300);
        uint256 qty=market.shares(alice); (uint256 gross,uint256 seller)=market.quoteGenesisSell(qty);
         uint256 fee=market.creatorFees(); uint256 wallet=usd.balanceOf(alice);
        vm.prank(alice); market.genesisSell(qty,seller,type(uint64).max,0);
        assertEq(market.creatorFees()-fee,gross*7/1000); assertEq(market.protocolFees(),300+gross*3/1000);

        assertEq(usd.balanceOf(alice)-wallet,Math.mulDiv(gross,99,100)); _accounting();
    }
    function testFormalBuyExactSplitAndNoNewBToken() public {
        _graduate(); uint256 amount=W; uint256 paid=market.quoteFormalBuy(true,amount);
         uint256 lp0=market.lpFees(); uint256 creator0=market.creatorFees(); uint256 dust0=market.dust();
          uint256 balance=usd.balanceOf(address(market));
        _formalBuy(bob,true,amount);
        uint256 net=Math.mulDiv(paid,98,100); uint256 lp=paid/100; uint256 core=paid*7/1000;
        assertEq(market.cash(),net); assertEq(market.lpFees()-lp0,lp);
        assertEq(market.coreFeesSent(),core); assertEq(market.creatorFees(),creator0); assertEq(market.protocolFees(),14e6*3/1000+paid*3/1000);
        assertEq(market.dust()-dust0,paid-net-lp-core-paid*3/1000);
        assertEq(usd.balanceOf(address(market))-balance,paid-core);
        _accounting();
    }
    function testFormalSellExactSplitWithProtocolAndNoCreatorRevenue() public {
        _graduate(); _formalBuy(bob,true,W);
        (uint256 gross,uint256 seller)=market.quoteFormalSell(true,W);
        uint256 protocolBefore=market.protocolFees();  uint256 fee0=market.lpFees(); uint256 core0=market.coreFeesSent(); uint256 creator0=market.creatorFees();
        uint256 cash0=market.cash(); uint256 wallet=usd.balanceOf(bob); uint256 dust0=market.dust();
        vm.prank(bob); market.formalSell(true,W,seller,type(uint64).max);
        assertEq(seller,Math.mulDiv(gross,98,100)); assertEq(usd.balanceOf(bob)-wallet,seller);
        assertEq(cash0-market.cash(),gross);
        assertEq(market.lpFees()-fee0,gross/100); assertEq(market.coreFeesSent()-core0,gross*7/1000);
        assertEq(market.creatorFees(),creator0); assertEq(market.protocolFees()-protocolBefore,gross*3/1000); assertEq(market.dust()-dust0,gross-seller-gross/100-gross*7/1000-gross*3/1000); _accounting();
    }
    function testFormalRevenueCreatesOnlyLPFeesAndNoTransferableB() public {
        _graduate(); _formalBuy(bob,true,W);
        vm.prank(dave); assertSelectorRemoved(address(market),abi.encodeWithSignature("claimB()"));
        _finish(3); _claimAll(alice); _claimAll(bob); _accounting();
    }
    function testLPBearsActualNetAssetValueWithoutBFirstLossCover() public {
        _graduate(); _formalBuy(bob,true,market.inventoryY());
        uint256 nav=market.cash()+market.lpFees()+market.inventoryY()/market.SCALE();
        _finish(1); assertEq(market.lpBudgetInitial(),nav);
        _claimAll(alice); _claimAll(bob); _accounting();
    }
    function testCoreFeeFailureRollsBackFormalBAccrualAndLPFee() public {
        _graduate(); _formalBuy(bob,true,W); oracle.setRejectFee(true);
          uint256 fee0=market.lpFees(); uint256 cash=market.cash();
        vm.prank(bob); vm.expectRevert("MOCK_FEE"); market.formalSell(true,W,0,type(uint64).max);
        assertEq(market.lpFees(),fee0); assertEq(market.cash(),cash);
        assertEq(market.yes(bob),W); _accounting();
    }
    function testProtocolAccruesAndCreatorStopsAfterGenesis() public {
        _graduate(); uint256 creatorEarned=market.creatorFees(); _formalBuy(bob,false,W);
        vm.prank(bob); market.formalSell(false,W,0,type(uint64).max);
        assertEq(market.creatorFees(),creatorEarned); assertGt(market.protocolFees(),0);
        uint256 before=usd.balanceOf(creator); vm.prank(creator); market.claimFees();
        assertEq(usd.balanceOf(creator)-before,creatorEarned); _accounting();
    }
    function testFuzzFormalBuySellAllBucketsConserved(uint96 raw) public {
        _graduate(); uint256 qty=bound(uint256(raw),W/100,3*W);

        uint256 buyGross=market.quoteFormalBuy(true,qty); _formalBuy(bob,true,qty);
        (uint256 sellGross,uint256 seller)=market.quoteFormalSell(true,qty);
        vm.prank(bob); market.formalSell(true,qty,seller,type(uint64).max);
        assertEq(market.lpFees(),buyGross/100+sellGross/100);
        assertEq(market.coreFeesSent(),buyGross*7/1000+sellGross*7/1000);
        _accounting();
        _finish(3); _claimAll(alice); _claimAll(bob); _accounting();
    }
}
