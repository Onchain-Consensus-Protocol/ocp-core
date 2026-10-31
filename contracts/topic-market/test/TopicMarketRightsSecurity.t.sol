// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {MockUSDC, MockCore} from "./TopicMarketBase.sol";

interface ISecurityRights {
    function balanceOf(address) external view returns(uint256);
    function totalSupply() external view returns(uint256);
    function transfer(address,uint256) external returns(bool);
    function approve(address,uint256) external returns(bool);
    function transferFrom(address,address,uint256) external returns(bool);
}
interface ISecurityMarket {
    function lpToken() external view returns(address);
    function bToken() external view returns(address);
    function materializeLP(address) external returns(uint256);
    function claimLP(uint256) external returns(uint256);
    function claimB(uint256) external returns(uint256);
}

/// Independent adversarial suite; does not change market source or the common fixture.
contract TopicMarketRightsSecurityTest is Test {
    MockUSDC usd; MockCore oracle; TopicMarket m; ISecurityMarket rights; ISecurityRights cachedLP; ISecurityRights cachedB;
    address a=address(0x701); address b=address(0x702); address c=address(0x703); address thief=address(0x704);
    function setUp() public {
        vm.warp(100000); usd=new MockUSDC(); oracle=new MockCore();
        m=new TopicMarket(usd, oracle, address(0xC0), address(0xF0), uint64(block.timestamp+6 hours), 1e6, 1e18);
        oracle.bind(address(m)); rights=ISecurityMarket(address(m)); cachedLP=ISecurityRights(rights.lpToken()); cachedB=ISecurityRights(rights.bToken());
        for(uint i=0;i<4;i++){address u=i==0?a:i==1?b:i==2?c:thief;usd.mint(u,1000e6);vm.prank(u);usd.approve(address(m),type(uint256).max);}
    }
    function buy(address u,uint256 paid) internal {vm.prank(u);m.genesisBuy(paid,0,type(uint64).max,0);}
    function graduateTwo() internal {buy(a,1e6);buy(b,13e6);}
    function finish(uint8 outcome) internal {vm.warp(m.coreCutoff());oracle.resolve(outcome);m.finalize();}
    function lp() internal view returns(ISecurityRights){return cachedLP;}
    function bt() internal view returns(ISecurityRights){return cachedB;}
    function invariantMoney() internal view {assertEq(usd.balanceOf(address(m)),m.accountedBalance());assertTrue(checkMarketInvariants(m));}

    function testUnmaterializedRightsCannotInflateFirstLPClaim() public {
        graduateTwo(); uint256 denominator=m.S(); uint256 aliceG=m.shares(a); uint256 bobG=m.shares(b);
        vm.prank(thief);rights.materializeLP(b);
        assertEq(lp().balanceOf(thief),0);assertEq(lp().balanceOf(b),bobG);assertEq(m.shares(b),0);
        assertEq(lp().balanceOf(address(m)),aliceG); assertEq(lp().totalSupply(),denominator);
        finish(1);uint256 budget=m.lpBudgetInitial();uint256 before=usd.balanceOf(b);
        vm.prank(b);rights.claimLP(bobG);
        assertEq(usd.balanceOf(b)-before,Math.mulDiv(budget,bobG,denominator));assertGt(m.lpBudgetRemaining(),0);
        vm.prank(thief);rights.materializeLP(a);vm.prank(a);rights.claimLP(aliceG);
        // Fixed per-burn flooring keeps exact budget dust; no remaining holder can overclaim.
        assertEq(m.lpBudgetRemaining(),budget-Math.mulDiv(budget,bobG,denominator)-Math.mulDiv(budget,aliceG,denominator));
        assertLt(m.lpBudgetRemaining(),2);assertEq(lp().totalSupply(),0);invariantMoney();
    }
    function testMaterializeReplayCannotMintOrStealEscrow() public {
        graduateTwo();uint256 amount=m.shares(a);uint256 supply=lp().totalSupply();
        vm.prank(thief);rights.materializeLP(a);assertEq(lp().balanceOf(a),amount);assertEq(lp().balanceOf(thief),0);
        uint256 escrow=lp().balanceOf(address(m));
        vm.prank(thief);(bool ok,)=address(m).call(abi.encodeWithSignature("materializeLP(address)",a));
        ok;assertEq(lp().balanceOf(a),amount);assertEq(lp().totalSupply(),supply);assertEq(lp().balanceOf(address(m)),escrow);invariantMoney();
    }
    function testLPApprovalDoesNotCreateBOrGrantClaimForOwner() public {
        graduateTwo(); rights.materializeLP(a); uint256 amount=lp().balanceOf(a)/2;
        vm.prank(a); lp().approve(thief,amount); vm.prank(thief); lp().transferFrom(a,c,amount);
        assertEq(lp().balanceOf(c),amount); assertEq(rights.bToken(),address(0));
        vm.prank(thief); vm.expectRevert("B_REMOVED"); rights.claimB(1);
        finish(1); uint256 oldA=usd.balanceOf(a); uint256 oldThief=usd.balanceOf(thief);
        vm.prank(thief); vm.expectRevert(); rights.claimLP(1);
        assertEq(usd.balanceOf(a),oldA); assertEq(usd.balanceOf(thief),oldThief);
        vm.prank(c); rights.claimLP(amount); assertEq(lp().balanceOf(c),0); invariantMoney();
    }
    function testOnlyMarketCanMintOrBurnTheSingleLPRightsToken() public {
        graduateTwo(); rights.materializeLP(a); assertEq(rights.bToken(),address(0));
        uint256 supply=lp().totalSupply(); uint256 balance=lp().balanceOf(a);
        vm.prank(thief); (bool mintOK,)=address(lp()).call(abi.encodeWithSignature("mint(address,uint256)",thief,1)); assertFalse(mintOK);
        vm.prank(thief); (bool burnOK,)=address(lp()).call(abi.encodeWithSignature("burn(address,uint256)",a,1)); assertFalse(burnOK);
        assertEq(lp().totalSupply(),supply); assertEq(lp().balanceOf(a),balance); invariantMoney();
    }
    function testUSDCFailureRollsBackLPBurnAndBudget() public {
        graduateTwo();rights.materializeLP(a);finish(1);uint256 amount=lp().balanceOf(a)/2;
        uint256 supply=lp().totalSupply();uint256 bal=lp().balanceOf(a);uint256 budget=m.lpBudgetRemaining();
        usd.setFail(true);vm.prank(a);vm.expectRevert();rights.claimLP(amount);
        assertEq(lp().totalSupply(),supply);assertEq(lp().balanceOf(a),bal);assertEq(m.lpBudgetRemaining(),budget);
        usd.setFail(false);vm.prank(a);rights.claimLP(amount);assertEq(lp().balanceOf(a),bal-amount);invariantMoney();
    }
    function testGenesisFailureRefundRollbackProtectsSingleGRight() public {
        buy(a,1e6); uint256 amount=m.shares(a); vm.warp(m.genesisCutoff()); m.closeExpired();
        assertEq(lp().totalSupply(),0); assertEq(rights.bToken(),address(0)); vm.expectRevert(); rights.materializeLP(a);
        uint256 budget=m.failedRRemaining(); usd.setFail(true); vm.prank(a); vm.expectRevert(); m.claimFailed();
        assertEq(m.shares(a),amount); assertEq(m.failedRRemaining(),budget); usd.setFail(false);
        vm.prank(a); m.claimFailed(); assertEq(m.shares(a),0); assertEq(m.failedRRemaining(),0); invariantMoney();
    }
    function testFormerBClaimersCannotExtractSinglePoolFunds() public {
        graduateTwo(); finish(2); uint256 budget=m.lpBudgetRemaining(); uint256 wallet=usd.balanceOf(c);
        for(uint256 i;i<3;i++){address user=i==0?a:i==1?b:c; vm.prank(user); vm.expectRevert("B_REMOVED"); rights.claimB(i+1);}
        assertEq(m.lpBudgetRemaining(),budget); assertEq(usd.balanceOf(c),wallet); assertEq(m.bBudgetRemaining(),0); invariantMoney();
    }
    function testNoPhantomBClaimEvenWhenSinglePoolHasTradingLoss() public {
        graduateTwo(); vm.prank(b); m.formalBuy(true,5e18,type(uint256).max,type(uint64).max); finish(1);
        assertEq(m.bBudgetInitial(),0); assertEq(rights.bToken(),address(0)); uint256 before=usd.balanceOf(a);
        vm.prank(a); vm.expectRevert("B_REMOVED"); rights.claimB(type(uint256).max);
        assertEq(usd.balanceOf(a),before); invariantMoney();
    }
    function testZeroQuantityClaimsRejectedAndBurnNotReusable() public {
        graduateTwo();rights.materializeLP(a);finish(3);
        vm.prank(a);vm.expectRevert();rights.claimLP(0);vm.prank(a);vm.expectRevert();rights.claimB(0);
        uint256 amount=lp().balanceOf(a);vm.prank(a);rights.claimLP(amount);
        vm.prank(a);vm.expectRevert();rights.claimLP(amount);assertEq(lp().balanceOf(a),0);invariantMoney();
    }
}
