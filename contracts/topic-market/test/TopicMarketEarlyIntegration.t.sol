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
}
