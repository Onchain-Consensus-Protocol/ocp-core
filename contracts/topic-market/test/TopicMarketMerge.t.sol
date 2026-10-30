// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {TopicMarketRightsToken} from "../src/TopicMarketRightsToken.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev 历史文件名保留；锁池模型不再使用内部merge，也不允许底层退出。
contract TopicMarketMergeTest is TopicMarketBase {
    function _three() internal { _buy(alice,3e6); _buy(bob,4e6); _buy(carol,7e6); }
    function _sell(address who,bool side,uint256 qty) internal {
        vm.prank(who); market.formalSell(side,qty,0,type(uint64).max);
    }
    function _both(address who) internal { _formalBuy(who,true,W/10); _formalBuy(who,false,8*W/100); }
    function _capacityInvariant() internal view {
        (uint256 y,uint256 n)=market.coordinates();
        uint256 extY=market.yes(alice)+market.yes(bob)+market.yes(carol)+market.yes(dave);
        uint256 extN=market.no(alice)+market.no(bob)+market.no(carol)+market.no(dave);
        assertEq(y,extY+market.redeemedPairs()*market.SCALE());
        assertEq(n,extN+market.redeemedPairs()*market.SCALE());
        assertEq(market.collateralCash()+market.redeemedPairs(),market.initialCollateral());
        _accounting();
    }
    function testLockedPoolActualBuyThenFullHoldingSellYesAndNo() public {
        _three(); _both(dave);
        assertEq(market.yes(dave),W/10); assertEq(market.no(dave),8*W/100);
        _capacityInvariant();
        (uint256 gross,,uint256 merge6)=market.quoteFormalSellDetailed(true,market.yes(dave));
        assertEq(merge6,0); assertLe(gross,market.cash());
        _sell(dave,true,market.yes(dave)); _capacityInvariant();
        _sell(dave,false,market.no(dave)); _capacityInvariant();
        assertEq(market.yes(dave)+market.no(dave),0); assertLe(market.cash(),10);
    }
    function testOnlyYesHoldingCanSellWithoutPersonalNo() public {
        _three(); _formalBuy(dave,true,W/10); assertEq(market.no(dave),0);
        uint256 wallet=usd.balanceOf(dave); _sell(dave,true,W/10);
        assertGt(usd.balanceOf(dave),wallet); assertEq(market.no(dave),0); _capacityInvariant();
    }
    function testPairsRedeemedThenAllRemainingHoldingsSell() public {
        _three(); _both(dave);
        uint256 col=market.collateralCash(); uint256 basis=market.poolBasisWad(); uint256 b=market.bWad();
        vm.prank(dave); market.redeemPairs(20000); _capacityInvariant();
        assertEq(market.collateralCash(),col-20000); assertEq(market.poolBasisWad(),basis); assertEq(market.bWad(),b);
        _sell(dave,true,market.yes(dave)); _capacityInvariant();
        _sell(dave,false,market.no(dave)); _capacityInvariant();
        assertEq(market.yes(dave)+market.no(dave),0);
    }
    function testCoreFeeRejectAtomicallyRollsBackSell() public {
        _three(); _both(dave); oracle.setRejectFee(true);
        uint256 cash=market.cash(); uint256 inv=market.inventoryY(); uint256 qty=market.yes(dave);
        uint256 wallet=usd.balanceOf(dave); uint256 fees=market.lpFees(); uint256 sent=market.coreFeesSent();
        vm.prank(dave); vm.expectRevert("MOCK_FEE"); market.formalSell(true,qty,0,type(uint64).max);
        assertEq(market.cash(),cash); assertEq(market.inventoryY(),inv); assertEq(market.yes(dave),qty);
        assertEq(usd.balanceOf(dave),wallet); assertEq(market.lpFees(),fees); assertEq(market.coreFeesSent(),sent);
        _capacityInvariant(); oracle.setRejectFee(false); _sell(dave,true,qty); _capacityInvariant();
    }
    function testPairWaitCoreAndTerminalRejection() public {
        _three(); _both(dave); vm.warp(market.formalCutoff()); market.closeExpired();
        vm.prank(dave); market.redeemPairs(10000); _capacityInvariant();
        _finish(3); vm.prank(dave); vm.expectRevert("PHASE"); market.redeemPairs(1);
        _claimAll(alice); _claimAll(bob); _claimAll(carol); _claimAll(dave); _accounting();
    }
    function testThreeOutcomeBudgetsAndAllClaimsAfterPairAndSells() public {
        _three(); _both(dave); vm.prank(dave); market.redeemPairs(10000);
        _sell(dave,true,W/100); _capacityInvariant();
        uint256 snap=vm.snapshotState();
        for(uint8 result=1;result<=3;result++){
            uint256 iv=result==1?market.inventoryY()/market.SCALE():result==2?market.inventoryN()/market.SCALE()
                :(market.inventoryY()+market.inventoryN())/(2*market.SCALE());
            uint256 nav=market.cash()+market.lpFees()+iv; uint256 basis=market.poolBasisWad()/market.SCALE();
            uint256 reserve=market.B(); uint256 cover=Math.min(reserve,basis>nav?basis-nav:0);
            _finish(result);
            assertEq(market.coverPaid(),cover); assertEq(market.lpBudgetInitial(),nav+cover);
            assertEq(market.bBudgetInitial(),reserve-cover);
            _claimAll(alice); _claimAll(bob); _claimAll(carol); _claimAll(dave); _accounting();
            assertEq(market.lpToken().totalSupply(),0); assertEq(market.bToken().totalSupply(),0);
            assertLe(market.collateralCash(),4); assertLe(market.lpBudgetRemaining(),3); assertLe(market.bBudgetRemaining(),3);
            assertTrue(vm.revertToState(snap)); snap=vm.snapshotState();
        }
    }
    function testFuzzFullHoldingSellCapacityAndCashAfterPair(uint96 raw,uint8 result) public {
        result=uint8(bound(result,1,3)); _three();
        uint256 y=bound(raw, W/100, W/5); uint256 n=bound(uint256(raw)^12345, W/100, W/5);
        _formalBuy(dave,true,y); _formalBuy(dave,false,n);
        uint256 pair6=Math.min(y,n)/(2*market.SCALE());
        vm.prank(dave); market.redeemPairs(pair6); _capacityInvariant();
        uint256 held=market.yes(dave); (uint256 gross,)=market.quoteFormalSell(true,held); assertLe(gross,market.cash());
        _sell(dave,true,held); _capacityInvariant();
        held=market.no(dave); (gross,)=market.quoteFormalSell(false,held); assertLe(gross,market.cash());
        _sell(dave,false,held); _capacityInvariant();
        _finish(result); _claimAll(alice); _claimAll(bob); _claimAll(carol); _claimAll(dave); _accounting();
    }
    function testFuzzTradesLPBTransfersPartialBurnAllClaims(uint256 seed,uint8 result) public {
        result=uint8(bound(result,1,3)); _three();
        address[4] memory actors=[alice,bob,carol,dave];
        TopicMarketRightsToken lpRights=market.lpToken(); TopicMarketRightsToken bRights=market.bToken();
        for(uint256 i;i<4;i++) market.materializeLP(actors[i]);
        for(uint256 i;i<20;i++){
            seed=uint256(keccak256(abi.encode(seed,i))); address a=actors[seed%4]; address to=actors[(seed>>8)%4];
            uint256 op=(seed>>4)%5; bool side=(seed&256)!=0;
            if(op==0){_formalBuy(a,side,W/(1000+seed%100));}
            else if(op==1){uint256 held=side?market.yes(a):market.no(a); if(held>1e13) _sell(a,side,held/2);}
            else if(op==2){uint256 held=market.lpToken().balanceOf(a); if(held>0){vm.prank(a);lpRights.transfer(to,held/2);}}
            else if(op==3){uint256 held=market.bToken().balanceOf(a); if(held>0){vm.prank(a);bRights.transfer(to,held/2);}}
            else {uint256 pairs=Math.min(market.yes(a),market.no(a))/(2*market.SCALE());if(pairs>0){vm.prank(a);market.redeemPairs(pairs);}}
            _capacityInvariant();
        }
        _finish(result); uint256 lpDen=market.lpSnapshot(); uint256 bDen=market.bSnapshotWad();
        for(uint256 i;i<4;i++){
            address a=actors[i]; uint256 held=market.lpToken().balanceOf(a);
            if(held>1){uint256 qty=held/3; uint256 expected=Math.mulDiv(market.lpBudgetInitial(),qty,lpDen);
                vm.prank(a); assertEq(market.claimLP(qty),expected);}
            held=market.bToken().balanceOf(a);
            if(held>1){uint256 qty=held/3; uint256 expected=Math.mulDiv(market.bBudgetInitial(),qty,bDen);
                vm.prank(a); assertEq(market.claimB(qty),expected);}
            _claimAll(a); _accounting();
        }
        assertEq(market.lpSnapshot(),lpDen); assertEq(market.bSnapshotWad(),bDen);
        assertEq(market.lpToken().totalSupply(),0); assertEq(market.bToken().totalSupply(),0);
        assertLe(market.collateralCash(),4); assertLe(market.lpBudgetRemaining(),8); assertLe(market.bBudgetRemaining(),8);
    }
}
