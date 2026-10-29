// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {MockUSDC} from "./TopicMarketBase.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";
import {IEarlyTerminationModule} from "ocp/interfaces/IEarlyTerminationModule.sol";
import {TopicMarketEarlyTerminationModule} from "../src/TopicMarketEarlyTerminationModule.sol";

/// @dev Alternate test policy, not a deployment candidate: 30-minute window and twice base bond.
contract ThirtyMinuteDoubleBondPolicy is IEarlyTerminationModule {
    bool private initialized;
    address public override core;
    uint256 public override bondAmount;
    uint256 public override proposalCount;
    IOCPCore.EarlyTerminationRequest private request;
    modifier onlyCore(){require(msg.sender==core && core!=address(0),"MODULE_ONLY_CORE");_;}
    function initialize(address core_,uint256 base) external override {
        require(!initialized,"MODULE_INITIALIZED");require(core_!=address(0),"MODULE_CORE");
        require(msg.sender==core_ || msg.sender==OCPCore(core_).factory(),"MODULE_INITIALIZER");
        initialized=true;core=core_;bondAmount=base;
    }
    function bondRequired() public view virtual override returns(uint256){return 2*bondAmount;}
    function pending() external view override returns(IOCPCore.EarlyTerminationRequest memory){return request;}
    function propose(address proposer,uint8 result,bytes32 reason)
        external override onlyCore returns(IOCPCore.EarlyTerminationRequest memory)
    {
        require(request.id==0,"EARLY_PENDING");require(proposer!=address(0),"ACTOR");
        require(result==1 || result==2,"EARLY_OUTCOME");require(reason!=bytes32(0),"Missing reason");
        require(OCPCore(core).totalPrincipal()>0,"NO_PRINCIPAL");
        require(block.timestamp+30 minutes<OCPCore(core).originalResolutionTime(),"EARLY_WINDOW");
        proposalCount+=1;
        request=IOCPCore.EarlyTerminationRequest(proposalCount,proposer,result,block.timestamp,
            block.timestamp+30 minutes,bondRequired(),reason);
        return request;
    }
    function consume() external override onlyCore returns(IOCPCore.EarlyTerminationRequest memory consumed){
        require(request.id!=0,"NO_EARLY_REQUEST");require(block.timestamp>=request.processAfter,"EARLY_PENDING_WINDOW");
        consumed=request;delete request;
    }
}

/// @dev Adversarial test policy: its quote changes during propose when proposalCount increases.
contract ChangingQuotePolicy is ThirtyMinuteDoubleBondPolicy {
    function bondRequired() public view override returns(uint256){return 2*bondAmount+proposalCount;}
}

contract TopicMarketEarlyModuleTest is Test {
    address constant ALICE=address(0xA1);
    address constant BOB=address(0xB1);
    address constant PROJECT=address(0xF0);
    bytes32 constant REASON=keccak256("module policy test");
    MockUSDC token;
    OCPCore vault;
    TopicMarketEarlyTerminationModule implementation;
    uint256 end;
    function setUp() public {
        vm.warp(100000);end=block.timestamp+6 hours;token=new MockUSDC();
        vault=_core();implementation=new TopicMarketEarlyTerminationModule();
    }
    function _core() private returns(OCPCore){return new OCPCore(address(this),address(token),end,0,PROJECT,100);}
    function _clone(OCPCore target,uint256 base) private returns(TopicMarketEarlyTerminationModule module){
        module=TopicMarketEarlyTerminationModule(Clones.clone(address(implementation)));
        module.initialize(address(target),base);
    }
    function _bind(OCPCore target,IEarlyTerminationModule module) private {
        target.configureEarlyTerminationModule(address(module));target.bindMarket(address(this));
    }
    function _fund(OCPCore target,address user,uint256 amount) private {
        token.mint(user,amount);vm.prank(user);token.approve(address(target),type(uint256).max);
    }
    function _stake(OCPCore target,address user,IOCPCore.Side side,uint256 amount) private {
        _fund(target,user,amount);vm.prank(user);target.stake(side,amount);
    }
    function testImplementationCannotInitializeAndFactoryCloneInitializesOnce() public {
        vm.expectRevert(bytes("MODULE_INITIALIZED"));implementation.initialize(address(vault),100);
        TopicMarketEarlyTerminationModule module=TopicMarketEarlyTerminationModule(Clones.clone(address(implementation)));
        vm.prank(ALICE);vm.expectRevert(bytes("MODULE_INITIALIZER"));module.initialize(address(vault),100);
        assertFalse(module.initialized());module.initialize(address(vault),100);
        assertTrue(module.initialized());assertEq(module.core(),address(vault));assertEq(module.bondAmount(),100);
        assertEq(module.bondRequired(),100);
        vm.expectRevert(bytes("MODULE_INITIALIZED"));module.initialize(address(vault),100);
    }
    function testCoreItselfMayInitializeItsClone() public {
        TopicMarketEarlyTerminationModule module=TopicMarketEarlyTerminationModule(Clones.clone(address(implementation)));
        vm.prank(address(vault));module.initialize(address(vault),100);
        assertEq(module.core(),address(vault));assertEq(module.bondAmount(),100);
    }
    function testOnlyCoreCanRecordAndConsumeProposal() public {
        TopicMarketEarlyTerminationModule module=_clone(vault,100);_bind(vault,module);
        _stake(vault,ALICE,IOCPCore.Side.YES,100);
        vm.expectRevert(bytes("MODULE_ONLY_CORE"));module.propose(ALICE,1,REASON);
        vm.expectRevert(bytes("MODULE_ONLY_CORE"));module.consume();
        vm.prank(address(vault));IOCPCore.EarlyTerminationRequest memory proposal=module.propose(ALICE,1,REASON);
        assertEq(proposal.id,1);assertEq(module.proposalCount(),1);
        vm.prank(address(vault));vm.expectRevert(bytes("EARLY_PENDING_WINDOW"));module.consume();
        vm.warp(proposal.processAfter);vm.prank(address(vault));module.consume();
        assertEq(module.pending().id,0);
        vm.prank(address(vault));vm.expectRevert(bytes("NO_EARLY_REQUEST"));module.consume();
    }
    function testCoreConfigurationRequiresFactoryCodeCorrectCoreAndBaseBond() public {
        TopicMarketEarlyTerminationModule module=_clone(vault,100);
        vm.prank(ALICE);vm.expectRevert(bytes("Only factory"));vault.configureEarlyTerminationModule(address(module));
        vm.expectRevert(bytes("EARLY_MODULE_CODE"));vault.configureEarlyTerminationModule(ALICE);
        OCPCore other=_core();TopicMarketEarlyTerminationModule wrongCore=_clone(other,100);
        vm.expectRevert(bytes("EARLY_MODULE_CORE"));vault.configureEarlyTerminationModule(address(wrongCore));
        TopicMarketEarlyTerminationModule wrongBond=_clone(vault,101);
        vm.expectRevert(bytes("EARLY_MODULE_BOND"));vault.configureEarlyTerminationModule(address(wrongBond));
        vault.configureEarlyTerminationModule(address(module));assertEq(vault.earlyTerminationModule(),address(module));
        vm.expectRevert(bytes("EARLY_MODULE_CONFIG"));vault.configureEarlyTerminationModule(address(module));
    }
    function testMarketBindingPermanentlyClosesModuleConfiguration() public {
        TopicMarketEarlyTerminationModule module=_clone(vault,100);vault.bindMarket(address(this));
        vm.expectRevert(bytes("EARLY_MODULE_CONFIG"));vault.configureEarlyTerminationModule(address(module));
    }
    function testSeparateClonesCannotConsumeOrChangeOtherCoreRequestOrEscrow() public {
        OCPCore other=_core();TopicMarketEarlyTerminationModule a=_clone(vault,100);TopicMarketEarlyTerminationModule b=_clone(other,100);
        _bind(vault,a);_bind(other,b);assertTrue(address(a)!=address(b));
        _stake(vault,ALICE,IOCPCore.Side.YES,100);_stake(other,BOB,IOCPCore.Side.NO,100);
        _fund(vault,ALICE,100);vm.prank(ALICE);vault.proposeEarlyTermination(1,REASON);
        _fund(other,BOB,100);vm.prank(BOB);other.proposeEarlyTermination(2,REASON);
        IOCPCore.EarlyTerminationRequest memory first=a.pending();IOCPCore.EarlyTerminationRequest memory second=b.pending();
        assertEq(first.id,1);assertEq(second.id,1);assertEq(vault.pendingBondEscrow(),100);assertEq(other.pendingBondEscrow(),100);
        vm.prank(address(other));vm.expectRevert(bytes("MODULE_ONLY_CORE"));a.consume();
        vm.warp(first.processAfter);assertTrue(vault.processEarlyTermination());
        assertTrue(vault.resolved());assertFalse(other.resolved());assertEq(a.pending().id,0);assertEq(b.pending().id,1);
        assertEq(vault.claimableEarlyBond(ALICE),100);assertEq(other.claimableEarlyBond(BOB),0);
        assertEq(other.pendingBondEscrow(),100);assertEq(token.balanceOf(address(other)),200);
        assertTrue(other.processEarlyTermination());assertEq(uint8(other.outcome()),2);
        assertEq(other.claimableEarlyBond(BOB),100);assertEq(vault.claimableEarlyBond(ALICE),100);
    }
    function _alternate() private returns(ThirtyMinuteDoubleBondPolicy module){
        module=new ThirtyMinuteDoubleBondPolicy();module.initialize(address(vault),100);_bind(vault,module);
        _stake(vault,ALICE,IOCPCore.Side.YES,300);_stake(vault,BOB,IOCPCore.Side.NO,100);
        _fund(vault,ALICE,200);
    }
    function testNewMarketAlternatePolicyChangesBondAndWindowWithoutChangingCore() public {
        ThirtyMinuteDoubleBondPolicy module=_alternate();
        assertEq(vault.earlyTerminationBondAmount(),100);assertEq(module.bondAmount(),100);
        assertEq(module.bondRequired(),200);assertEq(vault.earlyTerminationBondRequired(),200);
        // Cheatcode warp changes time within one test transaction; read through VM to avoid optimizer timestamp folding.
        uint256 start=vm.getBlockTimestamp();vm.prank(ALICE);vault.proposeEarlyTermination(1,REASON);
        IOCPCore.EarlyTerminationRequest memory proposal=vault.pendingEarlyTermination();
        assertEq(proposal.processAfter,start+30 minutes);assertEq(proposal.bond,200);
        assertEq(vault.pendingBondEscrow(),200);assertEq(token.balanceOf(address(vault)),600);assertEq(vault.totalPrincipal(),400);
        vm.warp(proposal.processAfter);assertTrue(vault.processEarlyTermination());assertEq(uint8(vault.outcome()),1);
        assertEq(vault.terminatedEarlyAt(),start+30 minutes);assertEq(vault.pendingBondEscrow(),0);
        assertEq(vault.claimableEarlyBond(ALICE),200);assertEq(vault.settlementPool(),400);
        uint256 balance=token.balanceOf(ALICE);vm.prank(ALICE);assertEq(vault.claimEarlyTerminationBond(),200);
        assertEq(token.balanceOf(ALICE)-balance,200);
        vm.prank(ALICE);vault.withdraw();vm.prank(BOB);vault.withdraw();assertEq(token.balanceOf(address(vault)),0);
    }
    function testAlternateModuleCannotOverrideCoreMajorityWithRequestedNo() public {
        ThirtyMinuteDoubleBondPolicy module=_alternate();vm.prank(ALICE);vault.proposeEarlyTermination(2,REASON);
        vm.warp(module.pending().processAfter);assertFalse(vault.processEarlyTermination());
        assertFalse(vault.resolved());assertEq(vault.failedProposalBondPool(),200);assertEq(vault.claimableEarlyBond(ALICE),0);
        assertEq(vault.totalStakeYes(),300);assertEq(vault.totalStakeNo(),100);assertEq(vault.totalPrincipal(),400);
    }
    function testCoreUsesQuoteCachedBeforeProposeAndRollsBackChangedPolicyQuote() public {
        ChangingQuotePolicy module=new ChangingQuotePolicy();module.initialize(address(vault),100);_bind(vault,module);
        _stake(vault,ALICE,IOCPCore.Side.YES,300);_fund(vault,ALICE,200);
        assertEq(vault.earlyTerminationBondRequired(),200);uint256 wallet=token.balanceOf(ALICE);
        vm.prank(ALICE);vm.expectRevert(bytes("EARLY_BOND_CONFIG"));vault.proposeEarlyTermination(1,REASON);
        assertEq(token.balanceOf(ALICE),wallet);assertEq(token.balanceOf(address(vault)),300);
        assertEq(module.proposalCount(),0);assertEq(module.pending().id,0);
        assertEq(vault.pendingBondEscrow(),0);assertEq(vault.earlyTerminationBondRequired(),200);
    }
}
