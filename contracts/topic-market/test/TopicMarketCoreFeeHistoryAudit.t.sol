// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./TopicMarketBase.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";

/// @notice Gross reward histories are tested independently of the separate withdrawal-fee draft.
contract TopicMarketCoreFeeHistoryAuditTest is Test {
    uint256 constant Q = 1e30;
    address constant PROJECT = address(0xF0);
    MockUSDC token;
    OCPCore vault;
    uint256 end;
    struct Model {
        uint256[4] stakes;
        uint8[4] sides;
        uint256[4][3] numerator;
        uint256[3] allocated;
        uint256 fees;
    }
    function setUp() public {
        vm.warp(100000); end = block.timestamp + 6 hours;
        token = new MockUSDC();
        vault = new OCPCore(address(this), address(token), end, 0, PROJECT, 500e6);
        vault.bindMarket(address(this)); token.approve(address(vault), type(uint256).max);
    }
    function _user(uint256 i) private pure returns (address) {return address(uint160(i + 1));}
    function _stake(address user, IOCPCore.Side side, uint256 amount) private {
        token.mint(user, amount); vm.startPrank(user);
        token.approve(address(vault), amount); vault.stake(side, amount); vm.stopPrank();
    }
    function _fee(uint256 amount) private {token.mint(address(this), amount); vault.depositMarketFee(amount);}
    function _finish(uint8 expected) private {
        vm.warp(end); vault.finalize(); assertEq(uint256(vault.outcome()), expected);
    }
    function _reward(address user, uint256 gross) private {
        uint256 pool = vault.marketFeeUserPoolRemaining();
        uint256 recipients = token.balanceOf(user) + token.balanceOf(PROJECT);
        assertEq(vault.claimableMarketFees(user), gross); vault.claimMarketFeesFor(user);
        assertEq(pool - vault.marketFeeUserPoolRemaining(), gross);
        // Net plus project fee equals the same gross liability, with or without withdrawal fees.
        assertEq(token.balanceOf(user) + token.balanceOf(PROJECT) - recipients, gross);
        assertEq(vault.claimableMarketFees(user), 0);
        vm.expectRevert("Fees already claimed"); vault.claimMarketFeesFor(user);
    }
    function _withdraw(address user) private {
        vm.prank(user); vault.withdraw();
        vm.prank(user); vm.expectRevert("Already claimed"); vault.withdraw();
    }
    function testInvalidRewardsFollowFeeArrivalNotClaimOrder() public {
        address a = _user(0); address b = _user(1);
        _stake(a, IOCPCore.Side.YES, 100e6); _fee(10e6);
        _stake(b, IOCPCore.Side.NO, 100e6); _fee(10e6);
        (uint256 ay,,uint256 ai) = vault.conditionalMarketFees(a);
        (,uint256 bn,uint256 bi) = vault.conditionalMarketFees(b);
        assertEq(ay,20e6); assertEq(bn,10e6); assertEq(ai,15e6); assertEq(bi,5e6);
        _finish(3); _reward(b,5e6); _reward(a,15e6);
        assertEq(vault.marketFeeUserPoolRemaining(),0); assertEq(vault.officialMarketFeesClaimable(),0);
        _withdraw(a); _withdraw(b); assertEq(vault.remainingSettlementPool(),0);
    }
    // Formerly promised six against four. Normal rewards follow history; only the last claim sweeps dust.
    function _lateJoinRegression(IOCPCore.Side side, bool invalid) private {
        _stake(_user(0),side,1); _stake(_user(1),side,1); _fee(1);
        for(uint256 i=2;i<6;i++) _stake(_user(i),side,1);
        if(invalid) _stake(address(10),IOCPCore.Side.INVALID,6);
        _fee(3); _finish(invalid?3:uint8(side)+1);
        uint256 promised;
        for(uint256 i;i<6;i++) {
            uint256 expected=i<2?1:0;
            assertEq(vault.claimableMarketFees(_user(i)),expected); promised+=expected;
        }
        assertEq(promised,2); assertEq(vault.marketFeeUserPoolRemaining(),4);
        // Include late zero-entitlement users first, then check principal succeeds for everyone.
        uint256 paid;
        for(uint256 i=6;i>0;i--) {
            address user=_user(i-1);
            uint256 pool=vault.marketFeeUserPoolRemaining();
            uint256 expected=i==1?pool:i<=2?1:0;
            assertEq(vault.claimableMarketFees(user),expected);
            _withdraw(user); paid+=pool-vault.marketFeeUserPoolRemaining();
            assertEq(vault.claimableMarketFees(user),0);
        }
        if(invalid) _withdraw(address(10));
        assertEq(vault.remainingSettlementPool(),0); assertEq(vault.remainingMarketFeeClaims(),0);
        assertEq(paid,4); assertEq(vault.marketFeeUserPoolRemaining(),0);
        assertEq(vault.officialMarketFeesClaimable(),0); assertEq(token.balanceOf(address(vault)),0);
    }
    function testLateJoinRoundingFixedYes() public {_lateJoinRegression(IOCPCore.Side.YES,false);}
    function testLateJoinRoundingFixedNo() public {_lateJoinRegression(IOCPCore.Side.NO,false);}
    function testLateJoinRoundingFixedInvalid() public {_lateJoinRegression(IOCPCore.Side.YES,true);}
    // Formerly promised 24 against 20; top-ups must preserve fractions without creating new rewards.
    function _topUpRegression(IOCPCore.Side side, bool invalid) private {
        for(uint256 i;i<8;i++) _stake(_user(i),side,2);
        _fee(8);
        for(uint256 i;i<8;i++) _stake(_user(i),side,1);
        if(invalid) _stake(address(10),IOCPCore.Side.INVALID,24);
        _fee(12); _finish(invalid?3:uint8(side)+1);
        uint256 promised;
        for(uint256 i;i<8;i++) {assertEq(vault.claimableMarketFees(_user(i)),2); promised+=2;}
        assertEq(promised,16); assertEq(vault.marketFeeUserPoolRemaining(),20);
        for(uint256 i;i<8;i++) {
            _reward(_user(i),i==7?vault.marketFeeUserPoolRemaining():2); _withdraw(_user(i));
        }
        if(invalid) _withdraw(address(10));
        assertEq(vault.remainingSettlementPool(),0); assertEq(vault.remainingMarketFeeClaims(),0);
        assertEq(vault.marketFeeUserPoolRemaining(),0); assertEq(vault.officialMarketFeesClaimable(),0);
        assertEq(token.balanceOf(address(vault)),0);
    }
    function testTopUpRoundingFixedYes() public {_topUpRegression(IOCPCore.Side.YES,false);}
    function testTopUpRoundingFixedNo() public {_topUpRegression(IOCPCore.Side.NO,false);}
    function testTopUpRoundingFixedInvalid() public {_topUpRegression(IOCPCore.Side.YES,true);}
    function testFractionalHistorySurvivesRepeatedCheckpoints() public {
        _stake(_user(0),IOCPCore.Side.YES,1); _stake(_user(1),IOCPCore.Side.YES,1); _fee(1);
        // Each has 0.5 before these checkpoints, and 0.5 more after the next fee.
        _stake(_user(0),IOCPCore.Side.YES,1); _stake(_user(1),IOCPCore.Side.YES,1); _fee(1);
        _finish(1); _reward(_user(0),1); _reward(_user(1),1);
        assertEq(vault.marketFeeUserPoolRemaining(),0);
        _withdraw(_user(0)); _withdraw(_user(1)); assertEq(vault.remainingSettlementPool(),0);
    }
    function testAllSixClaimOrdersKeepNonLastHistoryAndLastSweepsDust() public {
        _stake(_user(0),IOCPCore.Side.YES,33);
        _stake(_user(1),IOCPCore.Side.YES,2); _stake(_user(2),IOCPCore.Side.YES,2); _fee(4);
        _stake(_user(1),IOCPCore.Side.YES,6); _fee(2);
        _stake(_user(0),IOCPCore.Side.YES,10); _stake(_user(1),IOCPCore.Side.YES,11); _fee(5);
        _finish(1);
        uint256[3] memory expected=[uint256(8),2,0]; uint256 snapshot=vm.snapshotState();
        for(uint256 permutation;permutation<6;permutation++) {
            if(permutation>0) assertTrue(vm.revertToState(snapshot));
            uint256[3] memory order; order[0]=permutation/2; uint256 j=1;
            for(uint256 i;i<3;i++) if(i!=order[0]) order[j++]=i;
            if(permutation%2==1) (order[1],order[2])=(order[2],order[1]);
            uint256 totalPaid;
            for(uint256 i;i<3;i++) {
                uint256 gross=i==2?vault.marketFeeUserPoolRemaining():expected[order[i]];
                _reward(_user(order[i]),gross); totalPaid+=gross;
                for(uint256 k=i+1;k<3;k++) {
                    uint256 preview=i==1?vault.marketFeeUserPoolRemaining():expected[order[k]];
                    assertEq(vault.claimableMarketFees(_user(order[k])),preview);
                }
            }
            assertEq(totalPaid,11);
            assertEq(vault.marketFeeUserPoolRemaining(),0); assertEq(vault.remainingMarketFeeClaims(),0);
            for(uint256 i;i<3;i++) _withdraw(_user(order[i]));
            assertEq(vault.remainingSettlementPool(),0); assertEq(token.balanceOf(address(vault)),0);
        }
    }
    function testLastLateZeroHistoryUserReceivesOnlyTheFinalDust() public {
        _stake(_user(0),IOCPCore.Side.YES,1); _stake(_user(1),IOCPCore.Side.YES,1); _fee(1);
        _stake(_user(2),IOCPCore.Side.YES,1); _finish(1);
        _reward(_user(0),0); _reward(_user(1),0); assertEq(vault.remainingMarketFeeClaims(),1);
        (uint256 historical,,)=vault.conditionalMarketFees(_user(2));
        assertEq(historical,0); assertEq(vault.claimableMarketFees(_user(2)),1);
        _reward(_user(2),1);
        assertEq(vault.marketFeeUserPoolRemaining(),0); assertEq(vault.officialMarketFeesClaimable(),0);
        for(uint256 i;i<3;i++) _withdraw(_user(i));
        assertEq(vault.remainingSettlementPool(),0);
        assertEq(token.balanceOf(address(vault)),0);
    }
    function _selectedHistory(IOCPCore.Side side) private {
        _fee(7);
        IOCPCore.Side opposite=side==IOCPCore.Side.YES?IOCPCore.Side.NO:IOCPCore.Side.YES;
        _stake(_user(0),opposite,100); _fee(10);
        _stake(_user(1),side,200); _fee(12);
        _stake(_user(1),side,100); // Adding stake after all fee arrivals cannot backfill them.
        _finish(uint8(side)+1);
        assertEq(vault.officialMarketFeesClaimable(),17); _reward(_user(1),12);
        assertEq(vault.claimableMarketFees(_user(0)),0);
        vm.expectRevert("Not fee eligible"); vault.claimMarketFeesFor(_user(0));
        uint256 before=token.balanceOf(PROJECT); vault.claimOfficialMarketFees();
        assertEq(token.balanceOf(PROJECT)-before,17);
        _withdraw(_user(0)); _withdraw(_user(1));
        assertEq(vault.remainingSettlementPool(),0); assertEq(vault.marketFeeUserPoolRemaining(),0);
    }
    function testYesSelectsOneHistoryAndNoParticipantFeesGoToOfficial() public {_selectedHistory(IOCPCore.Side.YES);}
    function testNoSelectsOneHistoryAndNoParticipantFeesGoToOfficial() public {_selectedHistory(IOCPCore.Side.NO);}
    function testInvalidNoEligibleCapitalFeesGoToOfficial() public {
        _fee(7); _stake(address(10),IOCPCore.Side.INVALID,100); _fee(10);
        _stake(_user(0),IOCPCore.Side.YES,100); _fee(12); _finish(3);
        assertEq(vault.officialMarketFeesClaimable(),17); _reward(_user(0),12);
        _withdraw(address(10)); _withdraw(_user(0));
        assertEq(vault.remainingSettlementPool(),0); assertEq(vault.marketFeeUserPoolRemaining(),0);
    }
    // Independent reference sums a user's scaled entitlement at EVERY fee arrival.
    // It has no user debts, last-index fields or checkpoint calls.
    function _modelFee(Model memory model,uint256 amount) private pure {
        uint256[3] memory totals;
        for(uint256 i;i<4;i++) if(model.sides[i]<2) {
            totals[model.sides[i]]+=model.stakes[i]; totals[2]+=model.stakes[i];
        }
        for(uint256 history;history<3;history++) {
            if(totals[history]==0) continue;
            uint256 increment=amount*Q/totals[history]; model.allocated[history]+=amount;
            for(uint256 i;i<4;i++) if(history==2 ? model.sides[i]<2 : model.sides[i]==history) {
                model.numerator[history][i]+=model.stakes[i]*increment;
            }
        }
        model.fees+=amount;
    }
    function testFuzzPerArrivalReferenceNeverOvercommitsOrBackfills(uint256 seed) public {
        Model memory model; model.sides=[uint8(0),1,0,2];
        for(uint256 i;i<4;i++) {
            uint256 initial=(seed>>(i*16))%13+1; model.stakes[i]=initial;
            _stake(_user(i),IOCPCore.Side(model.sides[i]),initial);
        }
        for(uint256 step;step<12;step++) {
            uint256 bits=uint256(keccak256(abi.encode(seed,step)));
            uint256 fee=bits%31+1; _fee(fee); _modelFee(model,fee);
            uint256 userIndex=(bits>>8)%4; uint256 added=(bits>>16)%13+1;
            _stake(_user(userIndex),IOCPCore.Side(model.sides[userIndex]),added); model.stakes[userIndex]+=added;
        }
        uint256 yes=model.stakes[0]+model.stakes[2]; uint256 no=model.stakes[1];
        uint256 total=yes+no+model.stakes[3]; uint8 outcome=yes>total-yes?1:no>total-no?2:3;
        _finish(outcome); uint256 selected=outcome-1; uint256 promised;
        assertEq(vault.marketFeeUserPoolRemaining(),model.allocated[selected]);
        assertEq(vault.officialMarketFeesClaimable(),model.fees-model.allocated[selected]);
        for(uint256 i;i<4;i++) {
            (uint256 y,uint256 n,uint256 invalid)=vault.conditionalMarketFees(_user(i));
            assertEq(y,model.numerator[0][i]/Q); assertEq(n,model.numerator[1][i]/Q); assertEq(invalid,model.numerator[2][i]/Q);
            bool eligible=outcome==3?model.sides[i]<2:model.sides[i]==selected;
            uint256 expected=eligible?model.numerator[selected][i]/Q:0;
            uint256 preview=eligible && vault.remainingMarketFeeClaims()==1
                ? vault.marketFeeUserPoolRemaining():expected;
            assertEq(vault.claimableMarketFees(_user(i)),preview); promised+=expected;
        }
        // INVALID capital never earns any of the three conditional fee histories.
        assertEq(model.numerator[0][3]+model.numerator[1][3]+model.numerator[2][3],0);
        assertLe(promised,model.allocated[selected]);
        uint256 paid;
        for(uint256 step;step<4;step++) {
            uint256 i=seed%2==0?step:3-step; bool eligible=outcome==3?model.sides[i]<2:model.sides[i]==selected;
            if(eligible) {
                uint256 gross=vault.remainingMarketFeeClaims()==1
                    ? vault.marketFeeUserPoolRemaining():model.numerator[selected][i]/Q;
                _reward(_user(i),gross); paid+=gross;
            }
            _withdraw(_user(i));
        }
        assertEq(vault.remainingSettlementPool(),0); assertEq(vault.remainingMarketFeeClaims(),0);
        assertEq(paid,model.allocated[selected]); assertEq(vault.marketFeeUserPoolRemaining(),0);
        assertEq(token.balanceOf(address(vault)),vault.marketFeeUserPoolRemaining()+vault.officialMarketFeesClaimable());
    }
}
