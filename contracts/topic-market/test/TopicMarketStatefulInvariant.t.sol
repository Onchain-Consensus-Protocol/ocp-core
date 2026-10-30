// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockUSDC} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";

contract TopicMarketStatefulHandler is Test {
    MockUSDC public immutable usd;
    TopicMarket public immutable market;
    VaultCoreAdapter public immutable adapter;
    OCPCore public immutable vault;
    address[4] public actors;
    uint256 public successes;
    uint256 public genesisSuccesses;
    uint256 public formalSuccesses;
    uint256 public stakeSuccesses;
    uint256 public claimSuccesses;
    uint256 public timeSuccesses;
    uint256 public rightSuccesses;

    constructor(MockUSDC u,TopicMarket m,VaultCoreAdapter a) {
        usd=u;market=m;adapter=a;vault=OCPCore(address(a.vault()));
        actors=[address(0xA1),address(0xB1),address(0xC1),address(0xD1)];
        for(uint256 i;i<4;i++) {
            vm.startPrank(actors[i]);
            u.approve(address(m),type(uint256).max);
            u.approve(address(vault),type(uint256).max);
            vm.stopPrank();
        }
    }
    function _ok() private {successes++;}
    function genesisBuy(uint256 who,uint256 raw) public {
        address a=actors[who%4];uint256 wallet=usd.balanceOf(a);
        if(wallet==0)return;
        uint256 amount=bound(raw,1,wallet>20e6?20e6:wallet);
        vm.prank(a);
        try market.genesisBuy(amount,0,type(uint64).max,0){_ok();genesisSuccesses++;}catch{}
    }
    function genesisSell(uint256 who,uint256 raw) public {
        address a=actors[who%4];uint256 g=market.shares(a);if(g==0)return;
        vm.prank(a);
        try market.genesisSell(bound(raw,1,g),0,type(uint64).max,0){_ok();genesisSuccesses++;}catch{}
    }
    function formalTrade(uint256 who,bool yesSide,bool buy,uint256 raw) public {
        address a=actors[who%4];
        uint256 cap=buy?(yesSide?market.inventoryY():market.inventoryN()):(yesSide?market.yes(a):market.no(a));
        if(cap==0)return;
        uint256 amount=bound(raw,1,cap>2e18?2e18:cap);
        vm.prank(a);
        if(buy){try market.formalBuy(yesSide,amount,usd.balanceOf(a),type(uint64).max){_ok();formalSuccesses++;}catch{}}
        else{try market.formalSell(yesSide,amount,0,type(uint64).max){_ok();formalSuccesses++;}catch{}}
    }
    function rights(uint256 who,uint256 to,bool lp,uint256 raw) public {
        address a=actors[who%4];address b=actors[to%4];
        if(lp){
            try market.materializeLP(a){_ok();rightSuccesses++;}catch{}
            uint256 balance=market.lpToken().balanceOf(a);if(balance==0)return;
            vm.prank(a);try market.lpToken().transfer(b,bound(raw,1,balance)) returns(bool ok){if(ok){_ok();rightSuccesses++;}}catch{}
        }else{
            uint256 balance=market.bToken().balanceOf(a);if(balance==0)return;
            vm.prank(a);try market.bToken().transfer(b,bound(raw,1,balance)) returns(bool ok){if(ok){_ok();rightSuccesses++;}}catch{}
        }
    }
    function stake(uint256 who,uint256 side,uint256 raw) public {
        address a=actors[who%4];uint256 balance=usd.balanceOf(a);if(balance==0)return;
        uint256 amount=bound(raw,1,balance>10e6?10e6:balance);
        vm.prank(a);try vault.stake(IOCPCore.Side(side%3),amount){_ok();stakeSuccesses++;}catch{}
    }
    function advance(uint256 raw) public {
        uint256 end=market.coreCutoff();
        if(block.timestamp<end){vm.warp(block.timestamp+bound(raw,1,3600));_ok();timeSuccesses++;}
        if(block.timestamp>=market.genesisCutoff()&&market.phase()==TopicMarket.Phase.GENESIS){try market.closeExpired(){_ok();}catch{}}
        if(block.timestamp>=market.formalCutoff()&&market.phase()==TopicMarket.Phase.FORMAL){try market.closeExpired(){_ok();}catch{}}
        if(block.timestamp>=end){try adapter.finalizeMarket(){_ok();}catch{}}
    }
    function claims(uint256 who) public {
        address a=actors[who%4];
        vm.prank(a);try market.claimAll(){_ok();claimSuccesses++;}catch{}
        vm.prank(a);try vault.withdraw(){_ok();claimSuccesses++;}catch{}
        try vault.claimMarketFeesFor(a){_ok();claimSuccesses++;}catch{}
    }
}

contract TopicMarketStatefulInvariantTest is StdInvariant,Test {
    MockUSDC internal usd;
    TopicMarket internal market;
    VaultCoreAdapter internal adapter;
    OCPCore internal vault;
    TopicMarketStatefulHandler internal handler;
    uint256 internal constant INITIAL=4000e6;
    address internal constant CREATOR=address(0xC0);
    address internal constant PROTOCOL=address(0xF0);

    function setUp() public {
        vm.warp(100000);
        usd=new MockUSDC();
        adapter=new VaultCoreAdapter(usd,CREATOR,PROTOCOL,uint64(block.timestamp+6 hours),500e6);
        vault=OCPCore(address(adapter.vault()));
        market=new TopicMarket(usd, adapter, CREATOR, PROTOCOL, uint64(block.timestamp+6 hours), 1e6, 1e18);
        adapter.bind(address(market));
        address[4] memory users=[address(0xA1),address(0xB1),address(0xC1),address(0xD1)];
        for(uint256 i;i<4;i++)usd.mint(users[i],1000e6);
        handler=new TopicMarketStatefulHandler(usd,market,adapter);
        // Guaranteed nonempty successful buy/sell path before randomized transitions.
        handler.genesisBuy(0,1e6);
        handler.genesisSell(0,market.shares(users[0])/2);
        bytes4[] memory selectors=new bytes4[](7);
        selectors[0]=handler.genesisBuy.selector;selectors[1]=handler.genesisSell.selector;
        selectors[2]=handler.formalTrade.selector;selectors[3]=handler.rights.selector;
        selectors[4]=handler.stake.selector;selectors[5]=handler.advance.selector;selectors[6]=handler.claims.selector;
        targetSelector(FuzzSelector({addr:address(handler),selectors:selectors}));
        targetContract(address(handler));
    }
    function invariantMarketSolventAndRightsConserved() public view {
        assertGe(usd.balanceOf(address(market)),market.accountedBalance());
        assertTrue(checkMarketInvariants(market));
        uint256 lp=market.lpToken().balanceOf(address(market));
        uint256 b;uint256 unmaterialized;uint256 y=market.inventoryY();uint256 n=market.inventoryN();
        for(uint256 i;i<4;i++){
            address a=handler.actors(i);
            lp+=market.lpToken().balanceOf(a);b+=market.bToken().balanceOf(a);
            unmaterialized+=market.shares(a);y+=market.yes(a);n+=market.no(a);
        }
        assertEq(lp,market.lpToken().totalSupply());assertEq(b,market.bToken().totalSupply());
        assertEq(y,market.yesSupply());assertEq(n,market.noSupply());
        TopicMarket.Phase phase=market.phase();
        if(phase==TopicMarket.Phase.FORMAL||phase==TopicMarket.Phase.WAIT_CORE||phase==TopicMarket.Phase.SETTLED){
            assertEq(unmaterialized,market.unmaterializedLP());
            assertEq(lp,market.liquiditySupply());
        }else{assertEq(unmaterialized,market.S());}
        assertGe(handler.successes(),2);assertGe(handler.genesisSuccesses(),2);
    }
    function invariantUSDCNeverCreatedOrLostAcrossEscrows() public view {
        uint256 total=usd.balanceOf(address(market))+usd.balanceOf(address(vault))+usd.balanceOf(address(adapter))
            +usd.balanceOf(CREATOR)+usd.balanceOf(PROTOCOL)+usd.balanceOf(address(handler));
        for(uint256 i;i<4;i++)total+=usd.balanceOf(handler.actors(i));
        assertEq(total,INITIAL);
    }
}
