// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ITopicMarketPriceSnapshot} from "../src/interfaces/ITopicMarketPriceSnapshot.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketCoreDeployer} from "../src/deployers/TopicMarketCoreDeployer.sol";
import {TopicMarketDeployer} from "../src/deployers/TopicMarketDeployer.sol";
import {TopicMarketAssetRouter,ITopicMarketAssetExchange,ITopicMarketRouterRegistry} from "../src/TopicMarketAssetRouter.sol";
import {TopicMarketStockPriceSnapshot} from "../src/TopicMarketStockPriceSnapshot.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";
import {SnapshotFeedMock} from "./TopicMarketPriceSnapshot.t.sol";
contract IntegrationStock is ERC20 {
    uint8 private immutable precision;
    constructor(uint8 d) ERC20("Simulated stock","STOCK") {precision=d;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 value) external {_mint(to,value);}
}
contract FixedStockExchange is ITopicMarketAssetExchange {
    address public immutable stock;address public immutable usd;bool public fail;
    constructor(address c,address u){stock=c;usd=u;}
    function setFail(bool f) external {fail=f;}
    function swapExactInput(address input,address output,uint256 value,uint256 minimum,uint64 deadline) external returns(uint256 out){
        require(!fail && block.timestamp<=deadline,"SWAP_UNAVAILABLE");
        require((input==stock&&output==usd)||(input==usd&&output==stock),"PAIR");
        ERC20(input).transferFrom(msg.sender,address(this),value);
        out=input==usd?value*1e12/250:value*250/1e12;
        require(out>=minimum,"SLIPPAGE");ERC20(output).transfer(msg.sender,out);
    }
}
contract TopicMarketStockIntegrationTest is Test {
    struct CreatedPayload {address adapter;address vault;uint64 createdAt;uint64 genesis;uint64 formal;uint64 core;uint64 topic;uint256 snapshot;}
    function testCreatedEventUsesDerivedGenesisCutoff() public {
        vm.recordLogs();
        factory.createMarket(address(c),"Event timing", "yes", "no", "invalid", uint64(block.timestamp+6 hours));
        Vm.Log[] memory logs=vm.getRecordedLogs();
        bytes32 signature=keccak256("MarketCreated(address,address,address,address,uint64,uint64,uint64,uint64,uint64,uint256)");
        bool found;
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(factory)&&logs[i].topics[0]==signature){
            CreatedPayload memory e=abi.decode(logs[i].data,(CreatedPayload));
            assertEq(e.genesis,e.formal-1 hours);assertEq(e.genesis,e.core-2 hours);
            assertEq(e.genesis,block.timestamp+4 hours);assertEq(e.topic,e.core);found=true;
        }
        assertTrue(found);
    }

    IntegrationStock c;IntegrationStock u;FixedStockExchange ex;TopicMarketAssetRouter router;TopicMarketStockFactory factory;
    TopicMarket m;VaultCoreAdapter adapter;OCPCore vault;
    address alice=address(0xA1);address bob=address(0xB1);address fallback_=address(0xF0);
    function setUp() public {
        vm.warp(100000);c=new IntegrationStock(18);u=new IntegrationStock(6);ex=new FixedStockExchange(address(c),address(u));
        SnapshotFeedMock eth=new SnapshotFeedMock(8,2000e8);SnapshotFeedMock stock=new SnapshotFeedMock(8,250e8);
        TopicMarketStockPriceSnapshot price=new TopicMarketStockPriceSnapshot(address(eth),address(stock),18,7200,7200,address(0),0);
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+3);
        address[] memory stable=new address[](1);stable[0]=address(u);
        router=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(predicted),ex,stable);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        factory=new TopicMarketStockFactory(address(this),fallback_,cd,md);
        assertEq(address(factory),predicted);
        factory.registerStock(IToken6(address(c)),1e18/250,price,address(router));
        vm.prank(alice);(address mm,address aa,address vv)=factory.createMarket(address(c),"Stock-backed topic", "yes", "no", "invalid", uint64(block.timestamp + 6 hours));
        m=TopicMarket(mm);adapter=VaultCoreAdapter(aa);vault=OCPCore(vv);
        c.mint(address(ex),100000e18);u.mint(address(ex),100000000e6);
        u.mint(alice,100000e6);c.mint(alice,1000e18);c.mint(bob,1000e18);
        vm.startPrank(alice);u.approve(address(router),type(uint256).max);c.approve(address(router),type(uint256).max);c.approve(address(m),type(uint256).max);c.approve(address(vault),type(uint256).max);vm.stopPrank();
        vm.startPrank(bob);c.approve(address(m),type(uint256).max);c.approve(address(vault),type(uint256).max);vm.stopPrank();
    }
    function req(TopicMarketAssetRouter.Action action) internal view returns(TopicMarketAssetRouter.Request memory r){
        r.market=address(m);r.action=action;r.paymentAsset=address(u);r.deadline=type(uint64).max;
    }
    function buy(uint256 dollars) internal {
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.GenesisBuy);r.inputAmount=dollars;r.minCollateral=dollars*1e12/250;
        vm.prank(alice);router.execute(r);
    }
    function graduate() internal {buy(27000e6);assertEq(uint8(m.phase()),1);}
    function testFixedFiveHundredUsdBondUsesCreationTokenSnapshot() public {
        assertEq(vault.earlyTerminationBondRequired(),2e18); // 500 USD / 250 USD per token
        (ITopicMarketPriceSnapshot price,,,,)=factory.stocks(address(c));
        SnapshotFeedMock stock=SnapshotFeedMock(address(TopicMarketStockPriceSnapshot(address(price)).stockUsd()));
        stock.set(8,500e8,block.timestamp,block.timestamp,8);
        (, , address nextVault)=factory.createMarket(address(c),"new price","yes","no","invalid",uint64(block.timestamp+6 hours));
        assertEq(OCPCore(nextVault).earlyTerminationBondRequired(),1e18);
        assertEq(vault.earlyTerminationBondRequired(),2e18); // Existing market never reprices.
    }
    function testRealFactoryRegistrationForwarderAndUnits() public view {
        assertTrue(factory.isMarket(address(m)));assertEq(m.rTarget(),288e17);assertEq(m.bTarget(),48e17);
        assertTrue(m.isTrustedForwarder(address(router)));assertTrue(vault.isTrustedForwarder(address(router)));
        assertEq(address(m.token()),address(c));assertEq(address(vault.stakeToken()),address(c));
        assertLe(address(m).code.length,24576);
    }
    function testStableBuysAndSalesKeepRightsOnUserAndPreserveDust() public {
        c.mint(address(router),7);u.mint(address(router),9);
        buy(1000e6);assertGt(m.shares(alice),0);assertEq(m.shares(address(router)),0);assertGt(m.bToken().balanceOf(alice),0);
        assertEq(c.balanceOf(address(router)),7);assertEq(u.balanceOf(address(router)),9);
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.GenesisSell);r.quantity=m.shares(alice)/2;
        uint256 before=u.balanceOf(alice);vm.prank(alice);router.execute(r);assertGt(u.balanceOf(alice),before);
        assertEq(c.allowance(address(router),address(m)),0);assertEq(c.allowance(address(router),address(ex)),0);
        assertTrue(checkMarketInvariants(m));
    }
    function testFullFormalCoreAndBurnClaimsThroughStableRoute() public {
        factory.setStockEnabled(address(c),false);
        graduate();TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.CoreStake);r.inputAmount=250e6;r.side=0;
        vm.prank(alice);router.execute(r);
        (uint256 yes,,)=vault.stakeOf(alice);assertEq(yes,1e18);(uint256 routerStake,,)=vault.stakeOf(address(router));assertEq(routerStake,0);
        r=req(TopicMarketAssetRouter.Action.FormalBuy);r.quantity=1e18;r.inputAmount=500e6;r.businessLimit=2e18;
        vm.prank(alice);router.execute(r);assertEq(m.yes(alice),1e18);assertEq(m.yes(address(router)),0);
        r=req(TopicMarketAssetRouter.Action.FormalSell);r.quantity=5e17;vm.prank(alice);router.execute(r);assertEq(m.yes(alice),5e17);
        vm.warp(m.coreCutoff());adapter.finalizeMarket();
        r=req(TopicMarketAssetRouter.Action.ClaimMarket);uint256 before=u.balanceOf(alice);vm.prank(alice);router.execute(r);assertGt(u.balanceOf(alice),before);
        assertEq(m.bToken().balanceOf(alice),0);assertEq(m.lpToken().balanceOf(alice),0);
        r=req(TopicMarketAssetRouter.Action.ClaimCore);vm.prank(alice);router.execute(r);assertTrue(checkMarketInvariants(m));
        vm.prank(alice);vm.expectRevert();router.execute(r);
    }
    function testOutputSwapFailureRollsBackBurnAndAllowsNativeClaim() public {
        factory.setStockEnabled(address(c),false);
        buy(1000e6);vm.warp(m.genesisCutoff());m.closeExpired();
        uint256 g=m.shares(alice);uint256 b=m.bToken().balanceOf(alice);ex.setFail(true);
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.ClaimMarket);vm.prank(alice);vm.expectRevert();router.execute(r);
        assertEq(m.shares(alice),g);assertEq(m.bToken().balanceOf(alice),b);
        uint256 before=c.balanceOf(alice);vm.prank(alice);m.claimAll();assertGt(c.balanceOf(alice),before);
    }
    function testCannotBypassSideLockOrClaimOthersWithSuffix() public {
        graduate();vm.prank(alice);vault.stake(IOCPCore.Side.NO,1e18);
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.CoreStake);r.inputAmount=250e6;r.side=0;
        vm.prank(alice);vm.expectRevert();router.execute(r);
        vm.prank(bob);(bool ok,)=address(vault).call(abi.encodePacked(abi.encodeWithSelector(vault.stake.selector,IOCPCore.Side.YES,1e18),alice));assertTrue(ok);
        (uint256 aY,uint256 aN,)=vault.stakeOf(alice);assertEq(aY,0);assertEq(aN,1e18);
    }
    function testCoreRouterStakeDoesNotInheritOldFeesAndCannotSwitchDirectly() public {
        graduate();
        uint256 cost=m.quoteFormalBuy(true,1e18);
        vm.prank(bob);m.formalBuy(true,1e18,cost,type(uint64).max);
        uint256 oldFee=c.balanceOf(address(vault));assertGt(oldFee,0);
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.CoreStake);r.inputAmount=250e6;r.side=0;
        vm.prank(alice);router.execute(r);
        assertEq(vault.claimableMarketFees(alice),0);
        vm.prank(alice);vm.expectRevert();vault.stake(IOCPCore.Side.NO,1e18);
        cost=m.quoteFormalBuy(true,1e18);vm.prank(bob);m.formalBuy(true,1e18,cost,type(uint64).max);
        vm.warp(m.coreCutoff());adapter.finalizeMarket();
        assertGt(vault.claimableMarketFees(alice),0);
        assertLt(vault.claimableMarketFees(alice),c.balanceOf(address(vault)));
    }
    function testNativeCollateralCanBuyAndClaimViaRouter() public {
        factory.setStockEnabled(address(c),false);
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.GenesisBuy);r.paymentAsset=address(c);r.inputAmount=1e18;
        vm.prank(alice);router.execute(r);assertGt(m.shares(alice),0);
        vm.warp(m.genesisCutoff());m.closeExpired();
        r=req(TopicMarketAssetRouter.Action.ClaimMarket);r.paymentAsset=address(c);
        uint256 before=c.balanceOf(alice);vm.prank(alice);router.execute(r);assertEq(c.balanceOf(alice)-before,99e16);
    }

    function testStockDisableReenablePreservesMarketsAndConfig() public {
        (ITopicMarketPriceSnapshot price,address route,uint256 coefficient,,)=factory.stocks(address(c));
        factory.setStockEnabled(address(c),false);
        assertTrue(factory.isMarket(address(m)));
        assertEq(factory.marketCollateral(address(m)),address(c));
        vm.expectRevert(bytes("STOCK_DISABLED"));
        factory.createMarket(address(c),"disabled","yes","no","invalid",uint64(block.timestamp+6 hours));
        vm.expectRevert(bytes("REGISTERED"));
        factory.registerStock(IToken6(address(c)),coefficient,price,route);
        factory.setStockEnabled(address(c),true);
        (address next,,)=factory.createMarket(address(c),"reenabled","yes","no","invalid",uint64(block.timestamp+6 hours));
        assertTrue(factory.isMarket(next));assertEq(factory.marketCount(),2);assertEq(factory.stockCount(),1);
        assertEq(TopicMarket(next).trustedForwarder(),route);
    }
    function testOwnerOnlyAndTwoStepTransfer() public {
        vm.startPrank(alice);
        vm.expectRevert();factory.setStockEnabled(address(c),false);
        vm.expectRevert();factory.registerStock(IToken6(address(c)),1e18,ITopicMarketPriceSnapshot(address(0)),address(router));
        vm.expectRevert();factory.transferOwnership(alice);
        vm.stopPrank();
        factory.transferOwnership(alice);assertEq(factory.owner(),address(this));
        vm.prank(bob);vm.expectRevert();factory.acceptOwnership();
        vm.prank(alice);factory.acceptOwnership();assertEq(factory.owner(),alice);
        vm.expectRevert();factory.setStockEnabled(address(c),false);
        vm.prank(alice);factory.setStockEnabled(address(c),false);
    }
    function testUnknownStockRejected() public {
        vm.expectRevert(bytes("UNKNOWN_STOCK"));factory.setStockEnabled(address(u),true);
        vm.expectRevert(bytes("STOCK_DISABLED"));
        factory.createMarket(address(u),"unknown","yes","no","invalid",uint64(block.timestamp+6 hours));
    }
    function testSecondStockDifferentDecimalsHasIndependentRouteAndFunds() public {
        IntegrationStock second=new IntegrationStock(6);
        FixedStockExchange secondExchange=new FixedStockExchange(address(second),address(u));
        address[] memory stable=new address[](1);stable[0]=address(u);
        TopicMarketAssetRouter secondRouter=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(address(factory)),secondExchange,stable);
        SnapshotFeedMock eth=new SnapshotFeedMock(8,2000e8);
        SnapshotFeedMock stock=new SnapshotFeedMock(8,100e8);
        TopicMarketStockPriceSnapshot price=new TopicMarketStockPriceSnapshot(address(eth),address(stock),6,7200,7200,address(0),0);
        factory.registerStock(IToken6(address(second)),1e16,price,address(secondRouter));
        (address mm,address aa,address vv)=factory.createMarket(address(second),"second stock","yes","no","invalid",uint64(block.timestamp+6 hours));
        TopicMarket other=TopicMarket(mm);
        assertEq(factory.stockCount(),2);assertEq(factory.marketCount(),2);
        assertEq(address(other.token()),address(second));assertEq(address(OCPCore(vv).stakeToken()),address(second));
        assertEq(other.trustedForwarder(),address(secondRouter));assertEq(VaultCoreAdapter(aa).trustedForwarder(),address(secondRouter));
        assertEq(factory.marketRecord(mm).snapshot,20e6);assertEq(factory.marketCollateral(mm),address(second));
        second.mint(alice,100e6);
        TopicMarketAssetRouter.Request memory r=req(TopicMarketAssetRouter.Action.GenesisBuy);
        r.market=mm;r.paymentAsset=address(second);r.inputAmount=1e6;
        vm.prank(alice);second.approve(address(secondRouter),type(uint256).max);
        vm.prank(alice);vm.expectRevert(bytes("FORWARDER"));router.execute(r);
        uint256 firstBalance=c.balanceOf(address(m));
        factory.setStockEnabled(address(c),false);
        vm.prank(alice);secondRouter.execute(r);
        assertGt(other.shares(alice),0);assertEq(c.balanceOf(address(m)),firstBalance);
        assertTrue(checkMarketInvariants(other));assertTrue(checkMarketInvariants(m));
        buy(1000e6);assertGt(m.shares(alice),0);
    }
    function testRegistrationRejectsWrongFactoryAndOracleUnits() public {
        IntegrationStock second=new IntegrationStock(6);
        (ITopicMarketPriceSnapshot wrongUnits,,,,)=factory.stocks(address(c));
        vm.expectRevert(bytes("ORACLE_UNITS"));
        factory.registerStock(IToken6(address(second)),1e16,wrongUnits,address(router));
        address[] memory stable=new address[](1);stable[0]=address(u);
        TopicMarketAssetRouter wrongRouter=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(address(123)),ex,stable);
        vm.expectRevert(bytes("ROUTER_BINDING"));
        factory.registerStock(IToken6(address(second)),1e16,wrongUnits,address(wrongRouter));
        assertEq(factory.stockCount(),1);
    }

}
