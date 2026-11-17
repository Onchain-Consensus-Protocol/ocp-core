// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";

contract TopicMarketEarlyIntegrationTest is TopicMarketBase {
    VaultCoreAdapter adapter;
    OCPCore vault;
    bytes32 constant REASON=keccak256("public outcome request");
    function setUp() public override {
        super.setUp();uint64 end=uint64(block.timestamp+6 hours);
        adapter=new VaultCoreAdapter(usd,creator,protocol,end,500e6);
        vault=OCPCore(address(adapter.vault()));
        market=new TopicMarket(usd,adapter,creator,protocol,end,1e6,1e18);adapter.bind(address(market));
        address[4] memory users=[alice,bob,carol,dave];
        for(uint256 i;i<4;i++){vm.startPrank(users[i]);usd.approve(address(market),type(uint256).max);usd.approve(address(vault),type(uint256).max);vm.stopPrank();}
        _graduate();
    }
    function _stake(address user,IOCPCore.Side side,uint256 amount) private {vm.prank(user);vault.stake(side,amount);}
    function testEarlySuccessFreezesFormalAndSettlesBeforeOriginalCutoff() public {
        _stake(bob,IOCPCore.Side.YES,300e6);_stake(carol,IOCPCore.Side.NO,100e6);
        _formalBuy(bob,true,W);vm.prank(dave);vault.proposeEarlyTermination(1,REASON);
        IOCPCore.EarlyTerminationRequest memory request=vault.pendingEarlyTermination();
        vm.warp(request.processAfter);
        vm.prank(bob);vm.expectRevert("CORE_FROZEN");market.formalSell(true,W,0,type(uint64).max);
        vm.prank(bob);vm.expectRevert("CORE_FROZEN");market.redeemPairs(1);
        vm.prank(carol);vm.expectRevert("PROCESS_EARLY_REQUEST");vault.stake(IOCPCore.Side.NO,1e6);
        adapter.finalizeMarket();
        assertTrue(vault.resolved());assertEq(uint256(vault.outcome()),1);
        assertEq(uint256(market.phase()),uint256(TopicMarket.Phase.SETTLED));assertEq(market.outcome(),1);
        assertLt(block.timestamp,market.coreCutoff());assertEq(vault.effectiveResolutionTime(),request.processAfter);
        assertEq(vault.claimableEarlyBond(dave),500e6);
        vm.prank(bob);vault.withdraw();_claimAll(alice);_claimAll(bob);_accounting();
    }
    function testRejectedRequestDoesNotRollbackSlashAndFormalResumes() public {
        _stake(bob,IOCPCore.Side.YES,300e6);_stake(carol,IOCPCore.Side.NO,100e6);
        vm.prank(dave);vault.proposeEarlyTermination(2,REASON);
        IOCPCore.EarlyTerminationRequest memory request=vault.pendingEarlyTermination();vm.warp(request.processAfter);
        adapter.finalizeMarket();
        assertFalse(vault.resolved());assertEq(vault.failedProposalBondPool(),500e6);
        assertEq(vault.pendingEarlyTermination().id,0);assertEq(uint256(market.phase()),1);
        _formalBuy(bob,true,W);_accounting();
    }
    function testDirectCoreResolutionAlsoLocksFormalUntilMarketFinalized() public {
        _stake(bob,IOCPCore.Side.YES,1e6);vm.prank(dave);vault.proposeEarlyTermination(1,REASON);
        vm.warp(vault.pendingEarlyTermination().processAfter);vault.processEarlyTermination();
        vm.prank(bob);vm.expectRevert("CORE_FROZEN");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
        market.finalize();assertEq(uint256(market.phase()),3);_accounting();
    }
    function testLateExecutorKeepsEarlierLogicalCutoffAcrossModules() public {
        _stake(bob,IOCPCore.Side.NO,1e6);vm.prank(dave);vault.proposeEarlyTermination(2,REASON);
        uint256 due=vault.pendingEarlyTermination().processAfter;vm.warp(market.coreCutoff()+1);
        adapter.finalizeMarket();assertEq(vault.effectiveResolutionTime(),due);assertEq(market.outcome(),2);_accounting();
    }
    function testLastAllowedProposalHasFullWindowAndCannotReachCoreDeadline() public {
        _stake(bob,IOCPCore.Side.YES,300e6);
        uint256 snapshot=vm.snapshotState();
        vm.warp(market.formalCutoff()-1);
        vm.prank(dave);vault.proposeEarlyTermination(1,REASON);
        assertEq(vault.pendingEarlyTermination().processAfter,market.coreCutoff()-1);
        assertTrue(vm.revertToState(snapshot));
        vm.warp(market.formalCutoff());
        vm.prank(dave);vm.expectRevert("EARLY_WINDOW");vault.proposeEarlyTermination(1,REASON);
        vm.warp(market.formalCutoff()+1);
        vm.prank(dave);vm.expectRevert("EARLY_WINDOW");vault.proposeEarlyTermination(1,REASON);
    }
    function testWindowBoundarySynchronizesCoreExitAndMarketTrade() public {
        _stake(bob,IOCPCore.Side.YES,300e6);_stake(carol,IOCPCore.Side.NO,100e6);
        vm.prank(dave);vault.proposeEarlyTermination(1,REASON);
        uint256 due=vault.pendingEarlyTermination().processAfter;
        vm.warp(due-1);_formalBuy(bob,true,W);
        vm.prank(carol);vault.exitStake();
        vm.warp(due);
        vm.prank(bob);vm.expectRevert("PROCESS_EARLY_REQUEST");vault.exitStake();
        vm.prank(bob);vm.expectRevert("CORE_FROZEN");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
        adapter.finalizeMarket();assertTrue(vault.resolved());assertEq(market.outcome(),1);_accounting();
    }
    function testRejectedRequestAfterFormalCutoffNeverReopensFormalInEitherPhase() public {
        _stake(bob,IOCPCore.Side.YES,300e6);_stake(carol,IOCPCore.Side.NO,100e6);
        vm.warp(market.formalCutoff()-30 minutes);
        vm.prank(dave);vault.proposeEarlyTermination(2,REASON);
        uint256 due=vault.pendingEarlyTermination().processAfter;
        uint256 snapshot=vm.snapshotState();
        for(uint256 i;i<2;i++){
            vm.warp(due);
            if(i==1)market.closeExpired();
            adapter.finalizeMarket();
            assertFalse(vault.resolved());assertEq(vault.failedProposalBondPool(),500e6);
            assertEq(uint256(market.phase()),i==0?1:2);
            vm.prank(bob);vm.expectRevert("FORMAL_CLOSED");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
            _stake(carol,IOCPCore.Side.NO,1e6);vm.prank(carol);vault.exitStake();
            _accounting();
            if(i==0){assertTrue(vm.revertToState(snapshot));}
        }
    }
    function testDelayedRejectionAtAndAfterCoreCutoffSettlesBothAndCannotResetClaims() public {
        _stake(bob,IOCPCore.Side.YES,200e6);_stake(dave,IOCPCore.Side.YES,100e6);_stake(carol,IOCPCore.Side.NO,100e6);
        vm.warp(market.formalCutoff()-1);
        vm.prank(dave);vault.proposeEarlyTermination(2,REASON);
        uint256 snapshot=vm.snapshotState();
        for(uint256 i;i<2;i++){
            vm.warp(market.coreCutoff()+i);
            vm.prank(bob);vm.expectRevert("Staking ended");vault.exitStake();
            adapter.finalizeMarket();
            assertTrue(vault.resolved());assertEq(market.outcome(),1);
            assertEq(uint256(market.phase()),3);assertEq(vault.effectiveResolutionTime(),market.coreCutoff());
            assertEq(vault.settledPenaltyAmount(),500e6);
            assertEq(vault.failedProposalBondPool(),0);assertEq(vault.settlementPool(),900e6);
            assertEq(vault.pendingEarlyTermination().id,0);
            vm.prank(bob);vault.withdraw();
            market.materializeLP(alice);
            uint256 halfLP=market.lpToken().balanceOf(alice)/2;
            vm.prank(alice);market.claimLP(halfLP);
            uint256 remainingLP=market.lpBudgetRemaining();
            uint256 remainingCore=vault.remainingSettlementPool();
            assertGt(remainingLP,0);assertGt(remainingCore,0);
            adapter.finalizeMarket();adapter.finalizeMarket();
            assertEq(market.lpBudgetRemaining(),remainingLP);
            assertEq(vault.remainingSettlementPool(),remainingCore);_accounting();
            vm.prank(dave);vault.withdraw();_claimAll(alice);
            assertEq(vault.remainingSettlementPool(),0);assertEq(market.lpBudgetRemaining(),0);
            if(i==0){assertTrue(vm.revertToState(snapshot));}
        }
    }
    function testMarketFirstAndDirectCoreFinalizationHaveSafeOrdering() public {
        _stake(bob,IOCPCore.Side.YES,300e6);
        vm.prank(dave);vault.proposeEarlyTermination(1,REASON);
        vm.warp(market.coreCutoff());
        vm.expectRevert("CORE_PENDING");market.finalize();
        vault.finalize();assertTrue(vault.resolved());
        assertEq(vault.effectiveResolutionTime(),vault.originalResolutionTime()-5 hours);
        vm.prank(bob);vm.expectRevert("CORE_FROZEN");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
        market.closeExpired();market.finalize();adapter.finalizeMarket();
        assertEq(market.outcome(),1);assertEq(uint256(market.phase()),3);_accounting();
    }
    function testRejectedDueBeforeAtAndAfterFormalCutoffUsesOriginalTradingDeadline() public {
        _stake(bob,IOCPCore.Side.YES,300e6);
        uint256 snapshot=vm.snapshotState();
        for(uint256 i;i<3;i++){
            uint256 due=market.formalCutoff()-1+i;
            vm.warp(due-1 hours);vm.prank(dave);vault.proposeEarlyTermination(2,REASON);
            vm.warp(due);
            vm.prank(bob);vm.expectRevert("CORE_FROZEN");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
            adapter.finalizeMarket();assertFalse(vault.resolved());
            assertEq(vault.failedProposalBondPool(),500e6);
            _stake(carol,IOCPCore.Side.NO,1e6);
            if(i==0){_formalBuy(bob,true,W);}else{
                vm.prank(bob);vm.expectRevert("FORMAL_CLOSED");market.formalBuy(true,W,type(uint256).max,type(uint64).max);
            }
            _accounting();
            if(i<2){assertTrue(vm.revertToState(snapshot));snapshot=vm.snapshotState();}
        }
    }
}
