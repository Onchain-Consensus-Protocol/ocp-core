// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./TopicMarketBase.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {TopicMarketEarlyTerminationModule} from "../src/TopicMarketEarlyTerminationModule.sol";

/// @dev Independent fixture. Fixed raw bond is configuration, not a percentage or a USD price assertion.
contract TopicMarketExitAtomicityTest is Test {
    address constant PROJECT=address(0xF0);
    uint256 constant BOND=100;
    bytes32 constant REASON=keccak256("atomicity request");
    address[3] users=[address(0xA1),address(0xB1),address(0xC1)];
    MockUSDC token;
    OCPCore vault;
    uint256 end;
    uint256 funded;
    function setUp() public {
        vm.warp(100000);end=block.timestamp+6 hours;token=new MockUSDC();
        vault=new OCPCore(address(this),address(token),end,0,PROJECT,BOND);
        TopicMarketEarlyTerminationModule implementation=new TopicMarketEarlyTerminationModule();
        address module=Clones.clone(address(implementation));
        TopicMarketEarlyTerminationModule(module).initialize(address(vault),vault.earlyTerminationBondRequired());
        vault.configureEarlyTerminationModule(module);
        vault.bindMarket(address(this));token.approve(address(vault),type(uint256).max);
    }
    function _mint(address user,uint256 amount) private {
        token.mint(user,amount);funded+=amount;
    }
    function _stake(uint256 user,IOCPCore.Side side,uint256 amount) private {
        _mint(users[user],amount);vm.startPrank(users[user]);
        token.approve(address(vault),type(uint256).max);vault.stake(side,amount);vm.stopPrank();
    }
    function _fee(uint256 amount) private {_mint(address(this),amount);vault.depositMarketFee(amount);}
    function _principal(uint256 user) private view returns(uint256){
        (uint256 y,uint256 n,uint256 invalid)=vault.stakeOf(users[user]);return y+n+invalid;
    }
    function _propose(uint8 result) private returns(uint256 due){
        _mint(users[0],BOND);vm.startPrank(users[0]);token.approve(address(vault),type(uint256).max);
        vault.proposeEarlyTermination(result,REASON);vm.stopPrank();
        IOCPCore.EarlyTerminationRequest memory request=vault.pendingEarlyTermination();due=request.processAfter;
    }
    function _conservation() private view {
        uint256 held=token.balanceOf(address(vault))+token.balanceOf(PROJECT)+token.balanceOf(address(this));
        for(uint256 i;i<3;i++)held+=token.balanceOf(users[i]);
        assertEq(held,funded,"every funded raw unit remains assigned to a holder");
        uint256 liabilities;
        if(vault.settlementReady()){
            liabilities=vault.remainingSettlementPool()+vault.marketFeeUserPoolRemaining()
                +vault.officialMarketFeesClaimable()+vault.totalEarlyBondRefunds();
        }else{
            IOCPCore.EarlyTerminationRequest memory request=vault.pendingEarlyTermination();
            liabilities=vault.totalPrincipal()+vault.totalMarketFeesAccrued()+vault.exitPenaltyPool()
                +vault.failedProposalBondPool()+request.bond+vault.totalEarlyBondRefunds();
        }
        assertEq(token.balanceOf(address(vault)),liabilities,"no hidden deficit or unassigned custody");
    }
    function _exitHash(uint256 user) private view returns(bytes32){
        (uint256 y,uint256 n,uint256 invalid)=vault.stakeOf(users[user]);
        (uint256 fy,uint256 fn,uint256 fi)=vault.conditionalMarketFees(users[user]);
        bytes32 position=keccak256(abi.encode(y,n,invalid,fy,fn,fi,token.balanceOf(users[user]),token.balanceOf(address(vault))));
        bytes32 funds=keccak256(abi.encode(vault.totalPrincipal(),vault.totalStakeYes(),vault.totalStakeNo(),vault.totalStakeInvalid(),vault.exitPenaltyPool()));
        return keccak256(abi.encode(position,funds,vault.forfeitedMarketFees(0),vault.forfeitedMarketFees(1),vault.forfeitedMarketFees(2),
            vault.forfeitedFeeRemainders(0),vault.forfeitedFeeRemainders(1),vault.forfeitedFeeRemainders(2)));
    }
    function testRejectedExitTransferRollsBackAllHistoryWeightsAndPenaltyThenRecovers() public {
        _stake(0,IOCPCore.Side.NO,101);_stake(1,IOCPCore.Side.YES,99);_fee(17);
        bytes32 before_=_exitHash(0);token.setFail(true);
        vm.prank(users[0]);vm.expectRevert();vault.exitStake();
        assertEq(_exitHash(0),before_,"failed refund cannot erase stake or move reward history");_conservation();
        token.setFail(false);uint256 balance=token.balanceOf(users[0]);
        vm.prank(users[0]);(uint256 refund,uint256 penalty)=vault.exitStake();
        assertEq(refund,90);assertEq(penalty,11);assertEq(token.balanceOf(users[0])-balance,90);
        assertEq(_principal(0),0);assertEq(vault.totalPrincipal(),99);assertEq(vault.exitPenaltyPool(),11);_conservation();
    }
    function testProposalCanFinalizeWithoutTransferAndRejectedPullRefundPreservesDebt() public {
        _stake(0,IOCPCore.Side.YES,300);_stake(1,IOCPCore.Side.NO,100);_fee(20);
        uint256 due=_propose(1);_conservation();vm.warp(due);token.setFail(true);
        assertTrue(vault.processEarlyTermination());assertTrue(vault.resolved());assertTrue(vault.settlementReady());
        assertEq(vault.terminatedEarlyAt(),due);assertEq(vault.claimableEarlyBond(users[0]),BOND);
        assertEq(vault.totalEarlyBondRefunds(),BOND);_conservation();
        uint256 custody=token.balanceOf(address(vault));
        vm.prank(users[0]);vm.expectRevert();vault.claimEarlyTerminationBond();
        assertEq(vault.claimableEarlyBond(users[0]),BOND);assertEq(vault.totalEarlyBondRefunds(),BOND);
        assertEq(token.balanceOf(address(vault)),custody);_conservation();
        token.setFail(false);uint256 balance=token.balanceOf(users[0]);
        vm.prank(users[0]);assertEq(vault.claimEarlyTerminationBond(),BOND);
        assertEq(token.balanceOf(users[0])-balance,BOND);assertEq(vault.totalEarlyBondRefunds(),0);
        vm.prank(users[0]);vm.expectRevert();vault.claimEarlyTerminationBond();
        _claimEverything();
    }
    function testEveryoneExitsDuringPendingRequestThenSlashedBondAndEmptyFallbackRemainClaimable() public {
        _stake(0,IOCPCore.Side.YES,101);_stake(1,IOCPCore.Side.NO,99);_fee(20);
        uint256 due=_propose(1);
        vm.prank(users[0]);vault.exitStake();vm.prank(users[1]);vault.exitStake();
        assertEq(vault.totalPrincipal(),0);assertEq(vault.exitPenaltyPool(),21);_conservation();
        vm.warp(due);assertFalse(vault.processEarlyTermination());assertFalse(vault.resolved());
        assertEq(vault.failedProposalBondPool(),BOND);assertEq(vault.claimableEarlyBond(users[0]),0);_conservation();
        vm.warp(end);vault.finalize();assertEq(uint8(vault.outcome()),3);_conservation();
        assertEq(vault.remainingSettlementPool(),121);assertEq(vault.officialMarketFeesClaimable(),20);
        assertEq(vault.marketFeeUserPoolRemaining(),0);uint256 before_=token.balanceOf(PROJECT);
        assertEq(vault.claimEmptySettlement(),121);assertEq(vault.claimOfficialMarketFees(),20);
        assertEq(token.balanceOf(PROJECT)-before_,141);assertEq(token.balanceOf(address(vault)),0);_conservation();
        vm.expectRevert();vault.claimEmptySettlement();vm.expectRevert();vault.claimOfficialMarketFees();
    }
    function _claimEverything() private {
        for(uint256 i;i<3;i++){
            if(vault.claimableEarlyBond(users[i])>0){vm.prank(users[i]);vault.claimEarlyTerminationBond();}
            if(_principal(i)>0){
                vm.prank(users[i]);vault.withdraw();_conservation();
                vm.prank(users[i]);vm.expectRevert("Already claimed");vault.withdraw();
            }else{
                assertEq(vault.claimableMarketFees(users[i]),0);
            }
        }
        if(vault.totalPrincipal()==0 && vault.remainingSettlementPool()>0)vault.claimEmptySettlement();
        if(vault.officialMarketFeesClaimable()>0)vault.claimOfficialMarketFees();
        assertEq(vault.remainingSettlementPool(),0);assertEq(vault.marketFeeUserPoolRemaining(),0);
        assertEq(vault.totalEarlyBondRefunds(),0);assertEq(token.balanceOf(address(vault)),0);_conservation();
    }
    function _forceResult(uint8 result) private {
        uint256 user=uint256(result)-1;
        if(_principal(user)>0){vm.prank(users[user]);vault.exitStake();}
        _stake(user,IOCPCore.Side(user),1e9);_conservation();
    }
    function testFuzzStakeAppendFeeExitReentryRemainSolventAcrossAllThreeResults(uint256 seed) public {
        _stake(0,IOCPCore.Side.YES,101);_stake(1,IOCPCore.Side.NO,99);_stake(2,IOCPCore.Side.INVALID,77);
        _propose(2);
        for(uint256 step;step<24;step++){
            uint256 bits=uint256(keccak256(abi.encode(seed,step)));uint256 user=bits%3;uint256 action=(bits>>8)%4;
            if(action==0){_fee((bits>>16)%31+1);}
            else if(action==1 && _principal(user)>0){
                vm.prank(users[user]);vault.exitStake();
                (uint256 y,uint256 n,uint256 invalid)=vault.conditionalMarketFees(users[user]);
                assertEq(y+n+invalid,0,"exited history cannot be claimed or reused");
                vm.prank(users[user]);vm.expectRevert("No stake");vault.exitStake();
            }else{
                (IOCPCore.Side side,bool positioned)=vault.sideOf(users[user]);
                if(!positioned)side=IOCPCore.Side((bits>>24)%3);
                _stake(user,side,(bits>>32)%101+1);
            }
            _conservation();
        }
        uint256 snapshot=vm.snapshotState();
        for(uint8 result=1;result<=3;result++){
            _forceResult(result);vm.warp(end);vault.finalize();
            assertEq(uint8(vault.outcome()),result);_conservation();_claimEverything();
            assertTrue(vm.revertToState(snapshot));snapshot=vm.snapshotState();
        }
    }
}
