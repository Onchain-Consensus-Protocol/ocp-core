// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "../src/core/OCPCore.sol";
import {IOCPCore} from "../src/interfaces/IOCPCore.sol";

contract FeeTestToken is IToken6 {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    mapping(address=>uint8) public rejection;
    function decimals() external pure returns(uint8){return 6;}
    function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
    function reject(address to,uint8 mode) external {rejection[to]=mode;}
    function approve(address to,uint256 amount) external returns(bool){allowance[msg.sender][to]=amount;return true;}
    function transfer(address to,uint256 amount) external returns(bool){
        if(rejection[to]==1)return false;
        if(rejection[to]==2)revert("BLOCKED");
        if(rejection[to]==4){while(true){}}
        balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;
        // Deliberately broken token: mutate then false. The isolated self-call must roll it all back.
        return rejection[to]!=3;
    }
    function transferFrom(address from,address to,uint256 amount) external returns(bool){allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;return true;}
}
contract GasBurningFeeAdapter {function claimFees() external pure {while(true){}}}
contract TopicMarketAutomaticFeesTest is Test {
    FeeTestToken internal token;
    TopicMarket internal market;
    VaultCoreAdapter internal adapter;
    OCPCore internal core;
    address internal alice=address(0xA11CE);
    address internal bob=address(0xB0B);
    address internal creator=address(0xC1);
    address internal protocol=address(0xC2);
    function setUp() public {
        token=new FeeTestToken();uint64 end=uint64(block.timestamp+6 hours);
        adapter=new VaultCoreAdapter(token,creator,protocol,end,500e6);
        core=OCPCore(address(adapter.vault()));
        market=new TopicMarket(token,adapter,creator,protocol,end,1e6,1e18);adapter.bind(address(market));
        token.mint(alice,1e12);token.mint(bob,1e12);
        vm.prank(alice);token.approve(address(market),type(uint256).max);
        vm.startPrank(bob);token.approve(address(market),type(uint256).max);token.approve(address(core),type(uint256).max);vm.stopPrank();
    }
    function _graduate() internal {vm.prank(alice);market.genesisBuy(14e6,0,type(uint64).max,0);}
    function _trade() internal {vm.prank(bob);market.formalBuy(true,1e18,type(uint256).max,type(uint64).max);}
    function _settle() internal {vm.warp(market.coreCutoff());adapter.finalizeMarket();}
    function testSingleFinalizePaysFixedGenesisAndFormalFeesAndCoreOfficialSeparately() public {
        _graduate();uint256 gross=market.quoteFormalBuy(true,1e18);_trade();
        assertEq(market.creatorFees(),14e6*7/1000);assertEq(market.protocolFees(),14e6*3/1000+gross*3/1000);
        assertEq(core.totalMarketFeesAccrued(),gross*7/1000);
        uint256 creatorDue=market.creatorFees();uint256 protocolDue=market.protocolFees();uint256 coreDue=core.totalMarketFeesAccrued();
        _settle();assertTrue(core.resolved());assertTrue(core.settlementReady());assertEq(uint256(market.phase()),3);
        assertEq(token.balanceOf(creator),creatorDue);assertEq(token.balanceOf(protocol),protocolDue+coreDue);
        assertEq(market.creatorFees()+market.protocolFees()+core.officialMarketFeesClaimable(),0);
        adapter.finalizeMarket();adapter.claimFees();assertEq(token.balanceOf(protocol),protocolDue+coreDue);
    }
    function testFrontendSettlementGasBudgetPaysBothBeneficiaries() public {
        _graduate();_trade();uint256 creatorDue=market.creatorFees();
        uint256 protocolDue=market.protocolFees()+core.totalMarketFeesAccrued();
        vm.warp(market.coreCutoff());adapter.finalizeMarket{gas:800000}();
        assertEq(uint256(market.phase()),3);assertTrue(core.resolved());
        assertEq(token.balanceOf(creator),creatorDue);assertEq(token.balanceOf(protocol),protocolDue);
        assertEq(market.creatorFees()+market.protocolFees()+core.officialMarketFeesClaimable(),0);
    }
    function testRejectedTransfersDoNotRollbackSettlementAndRemainPayableToFixedRecipients() public {
        _graduate();_trade();uint256 creatorDue=market.creatorFees();uint256 protocolDue=market.protocolFees();uint256 coreDue=core.totalMarketFeesAccrued();
        token.reject(creator,1);token.reject(protocol,2);_settle();
        assertEq(uint256(market.phase()),3);assertTrue(core.resolved());assertEq(market.creatorFees(),creatorDue);assertEq(market.protocolFees(),protocolDue);assertEq(core.officialMarketFeesClaimable(),coreDue);
        uint256 walletBefore=token.balanceOf(bob);token.reject(creator,0);token.reject(protocol,0);vm.prank(bob);adapter.claimFees();
        assertEq(token.balanceOf(creator),creatorDue);assertEq(token.balanceOf(protocol),protocolDue+coreDue);assertEq(token.balanceOf(bob),walletBefore);
    }
    function testMutationThenFalseTokenRollsBackItsSubcallAndPreservesDebt() public {
        _graduate();uint256 due=market.creatorFees();token.reject(creator,3);_settle();assertEq(token.balanceOf(creator),0);assertEq(market.creatorFees(),due);
        token.reject(creator,0);market.flushFees();assertEq(token.balanceOf(creator),due);assertEq(market.creatorFees(),0);
    }
    function testOneRecipientBlockedDoesNotPreventOtherBeneficiary() public {
        _graduate();uint256 due=market.protocolFees();token.reject(creator,2);_settle();assertEq(token.balanceOf(protocol),due);assertGt(market.creatorFees(),0);
    }
    function testGasBurningRecipientCannotRollbackFinalizationOrOtherPayment() public {
        _graduate();uint256 due=market.protocolFees();token.reject(creator,4);_settle();
        assertEq(uint256(market.phase()),3);assertTrue(core.resolved());assertGt(market.creatorFees(),0);assertEq(token.balanceOf(protocol),due);
    }
    function testLowGasOptionalRetryLeavesFeesAvailableAndExternalCallerCannotChooseRecipient() public {
        _graduate();uint256 due=market.creatorFees();market.flushFees{gas:200000}();assertEq(market.creatorFees(),due);
        vm.expectRevert("SELF_ONLY");market.executeFeeTransfer(bob,due);
        vm.expectRevert("SELF_ONLY");core.executeOfficialTransfer(1);
        market.flushFees();assertEq(token.balanceOf(creator),due);
    }
    function testGasBurningBatchItemDoesNotBlockLaterFixedRecipientPayment() public {
        _graduate();uint256 due=market.creatorFees();token.reject(creator,1);_settle();token.reject(creator,0);
        address[] memory batch=new address[](3);batch[0]=address(new GasBurningFeeAdapter());batch[1]=address(0xDEAD);batch[2]=address(adapter);
        adapter.batchClaimFees{gas:2000000}(batch);assertEq(token.balanceOf(creator),due);assertEq(market.creatorFees(),0);
    }
    function testDustCannotSweepUnmaterializedLPOrBOrOutcomeClaims() public {
        _graduate();vm.prank(bob);core.stake(IOCPCore.Side.YES,100e6);_trade();_settle();
        vm.expectRevert("OUTSTANDING_RIGHTS");market.collectDust();
        vm.prank(alice);market.claimLP();vm.expectRevert("OUTSTANDING_RIGHTS");market.collectDust();
        vm.prank(alice);market.claimB();vm.expectRevert("OUTSTANDING_RIGHTS");market.collectDust();
        vm.prank(bob);market.claimOutcome();
        uint256 residual=token.balanceOf(address(market));uint256 old=token.balanceOf(protocol);assertEq(market.collectDust(),residual);assertEq(token.balanceOf(protocol)-old,residual);assertEq(market.accountedBalance(),0);assertEq(token.balanceOf(address(market)),0);
        assertEq(market.collectDust(),0);
        vm.expectRevert("Outstanding liabilities");core.claimSurplus();vm.prank(bob);core.withdraw();
    }
    function testUnsuccessfulLaunchDustWaitsForBothGenesisAndBAndKeepsPendingFeesSeparate() public {
        vm.prank(alice);market.genesisBuy(100003,0,type(uint64).max,0);token.reject(protocol,1);
        vm.warp(market.genesisCutoff());market.closeExpired();uint256 due=market.protocolFees();
        vm.expectRevert("OUTSTANDING_RIGHTS");market.collectDust();vm.prank(alice);market.claimFailed();
        vm.expectRevert("OUTSTANDING_RIGHTS");market.collectDust();vm.prank(alice);market.claimB();
        uint256 residual=token.balanceOf(address(market))-due;market.collectDust();assertEq(market.protocolFees(),due+residual);
        token.reject(protocol,0);market.flushFees();assertEq(token.balanceOf(address(market)),0);
    }
    function testFuzzGenesisRawRoundingConservesEveryUnit(uint32 raw) public {
        uint256 amount=bound(raw,100,1e6);vm.prank(alice);market.genesisBuy(amount,0,type(uint64).max,0);
        assertEq(market.creatorFees(),amount*7/1000);assertEq(market.protocolFees(),amount*3/1000);
        assertEq(market.R()+market.B()+market.creatorFees()+market.protocolFees()+market.dust(),amount);
    }
}
