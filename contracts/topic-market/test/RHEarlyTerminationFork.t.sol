// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketCoreDeployer} from "../src/deployers/TopicMarketCoreDeployer.sol";
import {TopicMarketDeployer} from "../src/deployers/TopicMarketDeployer.sol";
import {TopicMarketStockPriceSnapshot} from "../src/TopicMarketStockPriceSnapshot.sol";
import {ITopicMarketAggregator} from "../src/interfaces/ITopicMarketPriceSnapshot.sol";
import {TopicMarketAssetRouter,ITopicMarketRouterRegistry} from "../src/TopicMarketAssetRouter.sol";
import {TopicMarketV3Router02Exchange,ITopicMarketV3Router02} from "../src/TopicMarketV3Router02Exchange.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";
import {IEarlyTerminationModule} from "ocp/interfaces/IEarlyTerminationModule.sol";

/// @notice Real stock tokens, V3 swaps and feed proxies on a local mainnet fork.
/// @dev Only USDG wallet storage is seeded. No stock mint, feed mock, code replacement or public tx.
/// Sequencer=0 is an explicit test limitation, not an approved production safety policy.
contract RHEarlyTerminationForkTest is Test {
    address constant USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER=0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant ETH_FEED=0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;
    address constant ALICE=address(0xA11CE);
    address constant BOB=address(0xB0B);
    bytes32 constant REASON=keccak256("fork early termination");
    address[2] stocks=[address(0x322F0929c4625eD5bAd873c95208D54E1c003b2d),0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC];
    address[2] feeds=[address(0x4A1166a659A55625345e9515b32adECea5547C38),0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15];
    TopicMarketStockFactory factory;
    TopicMarketStockPriceSnapshot[2] oracles;
    TopicMarketV3Router02Exchange[2] exchanges;
    TopicMarketAssetRouter[2] routers;
    TopicMarket[2] markets;
    VaultCoreAdapter[2] adapters;
    OCPCore[2] cores;
    uint256[2] bonds;
    function setUp() public {
        string memory rpc=vm.envOr("RH_FORK_RPC",string(""));
        if(bytes(rpc).length==0){vm.skip(true);return;}
        uint256 pin=vm.envOr("RH_FORK_BLOCK",uint256(100224815));vm.createSelectFork(rpc,pin);
        assertEq(block.chainid,4663);assertEq(block.number,pin);
        deal(USDG,ALICE,500000e6);deal(USDG,BOB,10000e6);
    }
    function _request(uint256 i,TopicMarketAssetRouter.Action action) private view returns(TopicMarketAssetRouter.Request memory r){
        r.market=address(markets[i]);r.action=action;r.paymentAsset=USDG;r.deadline=uint64(block.timestamp+1 days);
    }
    function _route(uint256 i,address user,TopicMarketAssetRouter.Request memory r) private {vm.prank(user);routers[i].execute(r);}
    function _read(address feed) private view returns(uint256 price,uint8 decimals){
        ITopicMarketAggregator a=ITopicMarketAggregator(feed);decimals=a.decimals();assertLe(decimals,18);
        (uint80 round,int256 answer,uint256 start,uint256 update,uint80 answered)=a.latestRoundData();
        assertGt(round,0);assertGe(answered,round);assertGt(answer,0);assertGt(start,0);
        assertGe(update,start);assertLe(update,block.timestamp);assertLe(block.timestamp-update,86400);return(uint256(answer),decimals);
    }
    function _deploy() private {
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+2);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        factory=new TopicMarketStockFactory(address(this),address(0xF0),cd,md);assertEq(address(factory),predicted);
        (uint256 eth,uint8 ed)=_read(ETH_FEED);address[] memory stable=new address[](1);stable[0]=USDG;
        for(uint256 i;i<2;i++){
            assertEq(IToken6(stocks[i]).decimals(),18);(uint256 stock,uint8 sd)=_read(feeds[i]);
            bonds[i]=Math.mulDiv(500e18,1e18,stock*10**(18-sd),Math.Rounding.Ceil);
            uint256 snapshot=Math.mulDiv(eth*10**(18-ed),1e18,stock*10**(18-sd));
            oracles[i]=new TopicMarketStockPriceSnapshot(ETH_FEED,feeds[i],18,86400,86400,address(0),0);
            assertEq(oracles[i].collateralForUsd(500e18),bonds[i]);assertEq(oracles[i].ethPrice6(),snapshot);
            exchanges[i]=new TopicMarketV3Router02Exchange(ITopicMarketV3Router02(ROUTER),stocks[i],USDG,i==0?3000:500);
            routers[i]=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(address(factory)),exchanges[i],stable);
            factory.registerStock(IToken6(stocks[i]),1e18,oracles[i],address(routers[i]));
            vm.prank(ALICE);(address mm,address aa,address cc)=factory.createMarket(stocks[i],"real feed early fork","yes","no","invalid",uint64(block.timestamp+6 hours));
            markets[i]=TopicMarket(mm);adapters[i]=VaultCoreAdapter(aa);cores[i]=OCPCore(cc);
            assertEq(factory.marketRecord(mm).snapshot,snapshot);assertEq(cores[i].earlyTerminationBondRequired(),bonds[i]);
            IEarlyTerminationModule module=IEarlyTerminationModule(cores[i].earlyTerminationModule());
            assertEq(module.core(),cc);assertEq(module.bondAmount(),bonds[i]);
            vm.prank(ALICE);IERC20(USDG).approve(address(routers[i]),type(uint256).max);
            vm.prank(BOB);IERC20(USDG).approve(address(routers[i]),type(uint256).max);
            TopicMarketAssetRouter.Request memory r=_request(i,TopicMarketAssetRouter.Action.GenesisBuy);r.inputAmount=50000e6;
            _route(i,ALICE,r);assertEq(uint8(markets[i].phase()),1);_accounting(i);
        }
        assertTrue(cores[0].earlyTerminationModule()!=cores[1].earlyTerminationModule());
        assertEq(factory.stockCount(),2);assertEq(factory.marketCount(),2);
    }
    function _accounting(uint256 i) private view {
        OCPCore c=cores[i];uint256 required;
        if(c.settlementReady())required=c.remainingSettlementPool()+c.marketFeeUserPoolRemaining()+c.officialMarketFeesClaimable()+c.totalEarlyBondRefunds();
        else required=c.totalPrincipal()+c.totalMarketFeesAccrued()+c.exitPenaltyPool()+c.failedProposalBondPool()+c.pendingBondEscrow()+c.totalEarlyBondRefunds();
        assertEq(IERC20(stocks[i]).balanceOf(address(c)),required,"Core exact accounting");
        assertEq(IERC20(stocks[i]).balanceOf(c.earlyTerminationModule()),0);assertEq(IERC20(USDG).balanceOf(c.earlyTerminationModule()),0);
    }
    function _positions(OCPCore c) private view returns(bytes32){
        (uint256 ay,uint256 an,uint256 ai)=c.stakeOf(ALICE);(uint256 by,uint256 bn,uint256 bi)=c.stakeOf(BOB);
        (uint256 fy,uint256 fn,uint256 fi)=c.conditionalMarketFees(ALICE);
        return keccak256(abi.encode(ay,an,ai,by,bn,bi,fy,fn,fi));
    }
    function _state(uint256 i) private view returns(bytes32){
        OCPCore c=cores[i];TopicMarket m=markets[i];IEarlyTerminationModule module=IEarlyTerminationModule(c.earlyTerminationModule());
        bytes32 governance=keccak256(abi.encode(c.pendingEarlyTermination(),c.earlyTerminationRequestCount(),module.pending(),module.proposalCount(),
            c.pendingBondEscrow(),c.totalEarlyBondRefunds(),c.claimableEarlyBond(ALICE),c.claimableEarlyBond(BOB),c.effectiveResolutionTime()));
        bytes32 money=keccak256(abi.encode(IERC20(stocks[i]).balanceOf(address(c)),IERC20(stocks[i]).balanceOf(address(m)),c.totalPrincipal(),c.totalMarketFeesAccrued(),
            c.exitPenaltyPool(),c.failedProposalBondPool(),c.marketFeeUserPoolRemaining(),c.remainingSettlementPool(),c.officialMarketFeesClaimable()));
        return keccak256(abi.encode(governance,money,_positions(c),c.resolved(),c.settlementReady(),m.phase(),m.R(),m.B(),m.accountedBalance(),m.yes(ALICE),m.lpBudgetRemaining(),m.bBudgetRemaining()));
    }
    function _stake(uint256 i,address user,uint256 dollars,uint8 side) private {
        TopicMarketAssetRouter.Request memory r=_request(i,TopicMarketAssetRouter.Action.CoreStake);r.inputAmount=dollars;r.side=side;_route(i,user,r);_accounting(i);
    }
    function _buy() private {
        TopicMarketAssetRouter.Request memory r=_request(0,TopicMarketAssetRouter.Action.FormalBuy);
        r.inputAmount=1000e6;r.quantity=1e17;r.businessLimit=100e18;_route(0,ALICE,r);_accounting(0);
    }
    function _propose() private returns(uint256){
        assertEq(cores[0].earlyTerminationBondRequired(),bonds[0]);uint256 before_=IERC20(stocks[0]).balanceOf(address(cores[0]));
        vm.prank(ALICE);cores[0].proposeEarlyTermination(1,REASON);IOCPCore.EarlyTerminationRequest memory r=cores[0].pendingEarlyTermination();
        assertEq(r.bond,bonds[0]);assertEq(r.processAfter,block.timestamp+1 hours);
        assertEq(IERC20(stocks[0]).balanceOf(address(cores[0]))-before_,bonds[0]);_accounting(0);return r.processAfter;
    }
    function _frozen() private {
        assertTrue(cores[0].earlyTerminationProcessingDue());assertFalse(adapters[0].tradingAllowed());
        vm.prank(ALICE);vm.expectRevert(bytes("PROCESS_EARLY_REQUEST"));cores[0].stake(IOCPCore.Side.YES,1);
        vm.prank(BOB);vm.expectRevert(bytes("PROCESS_EARLY_REQUEST"));cores[0].exitStake();
        TopicMarketAssetRouter.Request memory r=_request(0,TopicMarketAssetRouter.Action.FormalBuy);
        r.inputAmount=1000e6;r.quantity=1e17;r.businessLimit=100e18;uint256 before_=IERC20(USDG).balanceOf(ALICE);
        vm.prank(ALICE);vm.expectRevert(bytes("CORE_FROZEN"));routers[0].execute(r);
        assertEq(IERC20(USDG).balanceOf(ALICE),before_);_accounting(0);
    }
    function _claimCore(address user) private {
        TopicMarketAssetRouter.Request memory r=_request(0,TopicMarketAssetRouter.Action.ClaimCore);
        bytes32 before_=_state(0);uint256 usd=IERC20(USDG).balanceOf(user);r.minOutput=type(uint256).max;
        vm.prank(user);vm.expectRevert();routers[0].execute(r);assertEq(_state(0),before_);assertEq(IERC20(USDG).balanceOf(user),usd);
        r.minOutput=1;_route(0,user,r);assertGt(IERC20(USDG).balanceOf(user),usd);_accounting(0);
        vm.prank(user);vm.expectRevert();routers[0].execute(r);
    }
    function testForkRealFeedsV3ExitFailedThenSuccessfulEarlyTerminationAndClaims() public {
        _deploy();_stake(1,ALICE,500e6,0);bytes32 isolated=_state(1);
        _stake(0,ALICE,500e6,0);_stake(0,BOB,1500e6,1);_buy();
        (,uint256 oldNo,)=cores[0].conditionalMarketFees(BOB);assertGt(oldNo,0);
        vm.startPrank(ALICE);IERC20(USDG).approve(address(exchanges[0]),5000e6);
        uint256 stockOut=exchanges[0].swapExactInput(USDG,stocks[0],5000e6,1,uint64(block.timestamp+1 hours));
        IERC20(stocks[0]).approve(address(cores[0]),type(uint256).max);vm.stopPrank();assertGt(stockOut,2*bonds[0]);
        uint256 due=_propose();vm.warp(due);_frozen();adapters[0].finalizeMarket();
        assertFalse(cores[0].resolved());assertEq(uint8(markets[0].phase()),1);assertEq(cores[0].failedProposalBondPool(),bonds[0]);
        assertEq(cores[0].pendingBondEscrow(),0);assertEq(cores[0].claimableEarlyBond(ALICE),0);assertTrue(adapters[0].tradingAllowed());assertEq(_state(1),isolated);
        (,uint256 bobPrincipal,)=cores[0].stakeOf(BOB);uint256 penalty=Math.ceilDiv(bobPrincipal,10);uint256 bobBalance=IERC20(stocks[0]).balanceOf(BOB);
        vm.prank(BOB);(uint256 refund,uint256 charged)=cores[0].exitStake();
        assertEq(refund,bobPrincipal-penalty);assertEq(charged,penalty);assertEq(IERC20(stocks[0]).balanceOf(BOB)-bobBalance,refund);
        assertEq(cores[0].exitPenaltyPool(),penalty);assertEq(cores[0].forfeitedMarketFees(1),oldNo);_accounting(0);
        _stake(0,BOB,500e6,0);(uint256 y,uint256 n,uint256 invalid)=cores[0].conditionalMarketFees(BOB);assertEq(y+n+invalid,0);
        _buy();(y,n,)=cores[0].conditionalMarketFees(BOB);assertGt(y,0);assertEq(n,0);
        due=_propose();vm.warp(due+15 minutes);_frozen();uint256 custody=IERC20(stocks[0]).balanceOf(address(cores[0]));
        adapters[0].finalizeMarket();assertTrue(cores[0].resolved());assertEq(uint8(cores[0].outcome()),1);assertEq(uint8(markets[0].phase()),3);
        assertEq(markets[0].outcome(),1);assertEq(cores[0].effectiveResolutionTime(),due);
        assertEq(IERC20(stocks[0]).balanceOf(address(cores[0])),custody,"freeze has no token transfer");
        assertEq(cores[0].pendingBondEscrow(),0);assertEq(cores[0].claimableEarlyBond(ALICE),bonds[0]);
        assertEq(cores[0].settlementPool()+cores[0].totalMarketFeesAccrued()+bonds[0],custody);
        assertEq(cores[0].earlyTerminationRequestCount(),2);assertEq(_state(1),isolated);_accounting(0);
        uint256 balance=IERC20(stocks[0]).balanceOf(ALICE);vm.prank(ALICE);cores[0].claimEarlyTerminationBond();
        assertEq(IERC20(stocks[0]).balanceOf(ALICE)-balance,bonds[0]);_accounting(0);
        vm.prank(ALICE);vm.expectRevert();cores[0].claimEarlyTerminationBond();
        TopicMarketAssetRouter.Request memory claim=_request(0,TopicMarketAssetRouter.Action.ClaimMarket);claim.minOutput=1;
        uint256 usd=IERC20(USDG).balanceOf(ALICE);_route(0,ALICE,claim);assertGt(IERC20(USDG).balanceOf(ALICE),usd);
        assertEq(markets[0].shares(ALICE)+markets[0].yes(ALICE)+markets[0].bToken().balanceOf(ALICE)+markets[0].lpToken().balanceOf(ALICE),0);
        _claimCore(ALICE);_claimCore(BOB);assertEq(IERC20(stocks[0]).balanceOf(address(cores[0])),0);
        assertTrue(checkMarketInvariants(markets[0]));assertEq(_state(1),isolated);assertTrue(adapters[1].tradingAllowed());
        assertEq(IERC20(stocks[0]).balanceOf(address(routers[0])),0);assertEq(IERC20(USDG).balanceOf(address(routers[0])),0);
        assertEq(IERC20(stocks[0]).balanceOf(address(exchanges[0])),0);assertEq(IERC20(USDG).balanceOf(address(exchanges[0])),0);
        emit log_named_uint("500 USD real TSLA bond raw",bonds[0]);emit log_named_uint("exit penalty raw",penalty);
    }
}
