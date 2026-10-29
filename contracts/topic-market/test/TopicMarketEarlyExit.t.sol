// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./TopicMarketBase.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {TopicMarketEarlyTerminationModule} from "../src/TopicMarketEarlyTerminationModule.sol";

/// @dev Independent raw-unit cash tests; principal, penalties, fee histories and bond escrow differ.
contract TopicMarketEarlyExitTest is Test {
    address constant ALICE=address(0xA1);
    address constant BOB=address(0xB1);
    address constant CAROL=address(0xC1);
    address constant DAVE=address(0xD1);
    address constant PROJECT=address(0xF0);
    uint256 constant FIXED_BOND=100;
    bytes32 constant REASON=keccak256("early result request");
    MockUSDC token;
    OCPCore vault;
    uint256 end;
    function setUp() public {
        vm.warp(100000);end=block.timestamp+6 hours;
        token=new MockUSDC();vault=new OCPCore(address(this),address(token),end,0,PROJECT,FIXED_BOND);
        _configureModule();
        vault.bindMarket(address(this));token.approve(address(vault),type(uint256).max);
    }
    function _configureModule() private {
        TopicMarketEarlyTerminationModule implementation=new TopicMarketEarlyTerminationModule();
        address module=Clones.clone(address(implementation));
        TopicMarketEarlyTerminationModule(module).initialize(address(vault),vault.earlyTerminationBondRequired());
        vault.configureEarlyTerminationModule(module);
    }
    function _prepare(address user,uint256 amount) private {
        token.mint(user,amount);vm.prank(user);token.approve(address(vault),type(uint256).max);
    }
    function _stake(address user,IOCPCore.Side side,uint256 amount) private {
        _prepare(user,amount);vm.prank(user);vault.stake(side,amount);
    }
    function _fee(uint256 amount) private {token.mint(address(this),amount);vault.depositMarketFee(amount);}
    function _exit(address user,uint256 refund,uint256 penalty) private {
        (uint256 expectedRefund,uint256 expectedPenalty)=vault.previewExitStake(user);
        assertEq(expectedRefund,refund);assertEq(expectedPenalty,penalty);
        uint256 balance=token.balanceOf(user);uint256 custody=token.balanceOf(address(vault));
        uint256 weight=vault.totalPrincipal();uint256 oldPenalty=vault.exitPenaltyPool();
        vm.prank(user);(uint256 paid,uint256 forfeited)=vault.exitStake();
        assertEq(paid,refund);assertEq(forfeited,penalty);
        assertEq(token.balanceOf(user)-balance,refund,"exit refund is not charged another fee");
        assertEq(custody-token.balanceOf(address(vault)),refund);
        assertEq(vault.totalPrincipal(),weight-refund-penalty,"penalty has no vote weight");
        assertEq(vault.exitPenaltyPool(),oldPenalty+penalty);
        (uint256 y,uint256 n,uint256 invalid)=vault.stakeOf(user);assertEq(y+n+invalid,0);
        (,bool hasPosition)=vault.sideOf(user);assertFalse(hasPosition);
        (y,n,invalid)=vault.conditionalMarketFees(user);assertEq(y+n+invalid,0,"retired history is unavailable");
    }
    function _finish(uint8 expected) private {vm.warp(end);vault.finalize();assertEq(uint8(vault.outcome()),expected);}
    function _withdraw(address user) private returns(uint256 gross){
        uint256 before_=token.balanceOf(user)+token.balanceOf(PROJECT);
        vm.prank(user);vault.withdraw();gross=token.balanceOf(user)+token.balanceOf(PROJECT)-before_;
        vm.prank(user);vm.expectRevert("Already claimed");vault.withdraw();
    }
    function _propose(address user,uint8 result) private returns(uint256 id,uint256 deadline,uint256 bond){
        bond=vault.earlyTerminationBondRequired();assertGt(bond,0);_prepare(user,bond);
        uint256 before_=token.balanceOf(user);uint256 principal=vault.totalPrincipal();
        vm.prank(user);id=vault.proposeEarlyTermination(result,REASON);
        assertEq(before_-token.balanceOf(user),bond);assertEq(vault.totalPrincipal(),principal);
        IOCPCore.EarlyTerminationRequest memory request=vault.pendingEarlyTermination();
        assertEq(request.id,id);assertEq(request.proposer,user);assertEq(request.requestedOutcome,result);assertEq(request.proposedAt,block.timestamp);
        assertEq(request.processAfter,block.timestamp+1 hours);assertEq(request.bond,bond);assertEq(request.reasonHash,REASON);
        deadline=request.processAfter;
    }
    function testAllSidesExitRoundsPenaltyUpAndCannotExitTwice() public {
        uint256 snapshot=vm.snapshotState();
        for(uint8 side;side<3;side++){
            _stake(ALICE,IOCPCore.Side(side),101);_fee(12);_exit(ALICE,90,11);
            vm.prank(ALICE);vm.expectRevert("No stake");vault.exitStake();
            assertEq(vault.totalStakeYes()+vault.totalStakeNo()+vault.totalStakeInvalid(),0);
            assertTrue(vm.revertToState(snapshot));snapshot=vm.snapshotState();
        }
    }
    function testOneRawUnitExitReturnsZeroAndRetainsOnePenalty() public {
        _stake(ALICE,IOCPCore.Side.NO,1);_exit(ALICE,0,1);
        _stake(BOB,IOCPCore.Side.YES,1);_finish(1);
        assertEq(_withdraw(BOB),2);assertEq(token.balanceOf(address(vault)),0);
    }
    function testNoExitThenYesReentryCannotRecoverOldConditionalFeeHistory() public {
        _stake(BOB,IOCPCore.Side.YES,300);_stake(ALICE,IOCPCore.Side.NO,300);_fee(60);
        (,uint256 oldNo,uint256 oldInvalid)=vault.conditionalMarketFees(ALICE);
        assertEq(oldNo,60);assertEq(oldInvalid,30);_exit(ALICE,270,30);
        assertEq(vault.forfeitedMarketFees(1),60);assertEq(vault.forfeitedMarketFees(2),30);
        _stake(ALICE,IOCPCore.Side.YES,100);_stake(CAROL,IOCPCore.Side.NO,100);
        (uint256 y,uint256 n,uint256 invalid)=vault.conditionalMarketFees(ALICE);assertEq(y+n+invalid,0);
        _fee(40);(y,n,invalid)=vault.conditionalMarketFees(ALICE);
        assertEq(y,10);assertEq(n,0);assertEq(invalid,8);
        _finish(1);assertEq(vault.claimableMarketFees(ALICE),10);
        assertEq(_withdraw(ALICE),142);assertEq(_withdraw(BOB),488);assertEq(_withdraw(CAROL),0);
        assertEq(token.balanceOf(address(vault)),0);
    }
    function testReentryMayShareRedistributedBonusButDoesNotRestoreOwnHistory() public {
        _stake(ALICE,IOCPCore.Side.YES,100);_fee(20);_exit(ALICE,90,10);
        _stake(ALICE,IOCPCore.Side.YES,100);
        (uint256 y,uint256 n,uint256 invalid)=vault.conditionalMarketFees(ALICE);assertEq(y+n+invalid,0);
        _finish(1);assertEq(vault.claimableMarketFees(ALICE),20,"new final winner may receive bonus");
        assertEq(_withdraw(ALICE),130);assertEq(token.balanceOf(address(vault)),0);
    }
    function _winnerRedistribution(IOCPCore.Side winner) private {
        _stake(ALICE,winner,300);_fee(60);_exit(ALICE,270,30);
        IOCPCore.Side losing=winner==IOCPCore.Side.YES?IOCPCore.Side.NO:IOCPCore.Side.YES;
        _stake(BOB,winner,200);_stake(CAROL,losing,100);_fee(30);_finish(uint8(winner)+1);
        assertEq(vault.totalPrincipal(),300);assertEq(vault.claimableMarketFees(BOB),90);
        assertEq(vault.claimableMarketFees(CAROL),0);assertEq(_withdraw(CAROL),0);
        assertEq(_withdraw(BOB),420);assertEq(token.balanceOf(address(vault)),0);
    }
    function testYesWinnerGetsExitPenaltyAndSelectedForfeitedFees() public {_winnerRedistribution(IOCPCore.Side.YES);}
    function testNoWinnerGetsExitPenaltyAndSelectedForfeitedFees() public {_winnerRedistribution(IOCPCore.Side.NO);}
    function testInvalidPenaltyIncludesInvalidCapitalButForfeitedFeesExcludeIt() public {
        _stake(ALICE,IOCPCore.Side.NO,300);_fee(60);_exit(ALICE,270,30);
        _stake(BOB,IOCPCore.Side.YES,100);_stake(CAROL,IOCPCore.Side.NO,100);_stake(DAVE,IOCPCore.Side.INVALID,100);
        _fee(30);_finish(3);
        assertEq(vault.claimableMarketFees(BOB),45);assertEq(vault.claimableMarketFees(CAROL),45);
        assertEq(vault.claimableMarketFees(DAVE),0);
        assertEq(_withdraw(DAVE),110);assertEq(_withdraw(BOB),155);assertEq(_withdraw(CAROL),155);
        assertEq(token.balanceOf(address(vault)),0);
    }
    function testFixedProposalBondIgnoresPrincipalSizeAndEmptyCapitalCannotPropose() public {
        assertEq(vault.earlyTerminationBondRequired(),FIXED_BOND);_prepare(ALICE,FIXED_BOND);
        vm.prank(ALICE);vm.expectRevert(bytes("NO_PRINCIPAL"));vault.proposeEarlyTermination(1,REASON);
        _stake(ALICE,IOCPCore.Side.YES,1);assertEq(vault.earlyTerminationBondRequired(),FIXED_BOND);
        _propose(ALICE,1);assertEq(vault.totalStakeYes(),1);
    }
    function testZeroConfiguredBondDisablesProposalWithoutDisablingStakeExit() public {
        vault=new OCPCore(address(this),address(token),end,0,PROJECT,0);_configureModule();vault.bindMarket(address(this));
        _stake(ALICE,IOCPCore.Side.YES,100);assertEq(vault.earlyTerminationBondRequired(),0);
        vm.prank(ALICE);vm.expectRevert();vault.proposeEarlyTermination(1,REASON);
        _exit(ALICE,90,10);
    }
    function testMatchingProposalFreezesThenPullRefundsBondOnce() public {
        _stake(ALICE,IOCPCore.Side.YES,300);_stake(BOB,IOCPCore.Side.NO,100);
        (,uint256 deadline,uint256 bond)=_propose(ALICE,1);assertEq(bond,FIXED_BOND);
        vm.expectRevert(bytes("EARLY_PENDING"));vault.proposeEarlyTermination(2,REASON);
        vm.expectRevert(bytes("EARLY_PENDING_WINDOW"));vault.processEarlyTermination();
        vm.warp(deadline);assertTrue(vault.processEarlyTermination());assertTrue(vault.resolved());
        assertEq(uint8(vault.outcome()),1);assertEq(vault.totalPrincipal(),400);
        assertEq(vault.settlementPool(),400,"bond not paid as principal reward");
        assertEq(vault.claimableEarlyBond(ALICE),FIXED_BOND);
        uint256 before_=token.balanceOf(ALICE);vm.prank(ALICE);assertEq(vault.claimEarlyTerminationBond(),FIXED_BOND);
        assertEq(token.balanceOf(ALICE)-before_,FIXED_BOND);assertEq(vault.claimableEarlyBond(ALICE),0);
        vm.prank(ALICE);vm.expectRevert();vault.claimEarlyTerminationBond();
        vm.expectRevert();vault.processEarlyTermination();
        assertEq(_withdraw(ALICE),400);assertEq(_withdraw(BOB),0);assertEq(token.balanceOf(address(vault)),0);
    }
    function testRejectedProposalSlashesBondResumesAndDoesNotChangeVoteWeight() public {
        _stake(ALICE,IOCPCore.Side.YES,300);_stake(BOB,IOCPCore.Side.NO,100);
        (,uint256 deadline,uint256 bond)=_propose(ALICE,2);
        vm.warp(deadline);assertFalse(vault.processEarlyTermination());assertFalse(vault.resolved());
        assertEq(vault.failedProposalBondPool(),bond);assertEq(vault.claimableEarlyBond(ALICE),0);
        assertEq(vault.totalPrincipal(),400);assertEq(vault.totalStakeYes(),300);assertEq(vault.totalStakeNo(),100);
        _stake(BOB,IOCPCore.Side.NO,250);_fee(65);_finish(2);
        assertEq(_withdraw(ALICE),0);assertEq(_withdraw(BOB),650+bond+65);
        assertEq(token.balanceOf(address(vault)),0);
    }
    function testExpiredPendingBlocksNewStakeExitAndFeeUntilLateExecutorProcesses() public {
        _stake(ALICE,IOCPCore.Side.YES,300);_stake(BOB,IOCPCore.Side.NO,100);
        (,uint256 deadline,)=_propose(ALICE,2);_prepare(CAROL,10);token.mint(address(this),10);
        vm.warp(deadline+10 minutes);
        vm.prank(CAROL);vm.expectRevert(bytes("PROCESS_EARLY_REQUEST"));vault.stake(IOCPCore.Side.NO,10);
        vm.prank(ALICE);vm.expectRevert(bytes("PROCESS_EARLY_REQUEST"));vault.exitStake();
        vm.expectRevert(bytes("PROCESS_EARLY_REQUEST"));vault.depositMarketFee(10);
        assertEq(vault.totalPrincipal(),400);assertFalse(vault.processEarlyTermination());
        vm.prank(CAROL);vault.stake(IOCPCore.Side.NO,10);vault.depositMarketFee(10);
        assertEq(vault.totalPrincipal(),410);
    }
    function testChallengeWindowAllowsVotesToChangeAndRequestedResultMustMatchAtExecution() public {
        _stake(ALICE,IOCPCore.Side.YES,300);_stake(BOB,IOCPCore.Side.NO,100);
        (,uint256 deadline,)=_propose(ALICE,1);_stake(BOB,IOCPCore.Side.NO,300);
        vm.warp(deadline);assertFalse(vault.processEarlyTermination());assertFalse(vault.resolved());
        assertGt(vault.failedProposalBondPool(),0);_finish(2);
    }
    function testLateExecutorProcessesEarlierDueSuccessAtFixedEffectiveCutoff() public {
        _stake(ALICE,IOCPCore.Side.YES,300);_stake(BOB,IOCPCore.Side.NO,100);
        (,uint256 deadline,uint256 bond)=_propose(ALICE,1);assertLt(deadline,end);
        vm.warp(end+1);assertTrue(vault.processEarlyTermination());assertTrue(vault.resolved());
        assertEq(uint8(vault.outcome()),1);assertEq(vault.terminatedEarlyAt(),deadline,"earlier fixed due takes priority");
        assertEq(vault.effectiveResolutionTime(),deadline);
        assertEq(vault.claimableEarlyBond(ALICE),bond);assertEq(vault.failedProposalBondPool(),0);
        vm.prank(ALICE);vault.claimEarlyTerminationBond();assertEq(_withdraw(ALICE),400);assertEq(_withdraw(BOB),0);
        assertEq(token.balanceOf(address(vault)),0);
    }
    function testTooLateToOpenFullChallengeWindowAndBadOutcomeRejected() public {
        _stake(ALICE,IOCPCore.Side.YES,101);_prepare(ALICE,FIXED_BOND);assertEq(vault.earlyTerminationBondRequired(),FIXED_BOND);
        vm.prank(ALICE);vm.expectRevert(bytes("EARLY_OUTCOME"));vault.proposeEarlyTermination(0,REASON);
        vm.warp(end-1 hours+1);vm.prank(ALICE);vm.expectRevert(bytes("EARLY_WINDOW"));vault.proposeEarlyTermination(1,REASON);
    }
    function testLateFailedRequestSlashesBondThenFinalizesAtOriginalCutoff() public {
        _stake(ALICE,IOCPCore.Side.YES,300);_stake(BOB,IOCPCore.Side.NO,100);
        _propose(ALICE,2);vm.warp(end+1);
        assertTrue(vault.processEarlyTermination());assertTrue(vault.resolved());assertEq(uint8(vault.outcome()),1);
        assertEq(vault.terminatedEarlyAt(),0);assertEq(vault.effectiveResolutionTime(),end);
        assertEq(vault.claimableEarlyBond(ALICE),0);assertEq(vault.settledPenaltyAmount(),FIXED_BOND);
        assertEq(_withdraw(ALICE),400+FIXED_BOND);assertEq(_withdraw(BOB),0);
        assertEq(token.balanceOf(address(vault)),0);
    }
}
