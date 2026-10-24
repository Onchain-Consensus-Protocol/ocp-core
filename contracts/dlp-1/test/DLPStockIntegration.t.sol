// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DLPStockFactory} from "../src/DLPStockFactory.sol";
import {DLPCoreDeployer,DLPMarketDeployer} from "../src/DLPFactory.sol";
import {DLPAssetRouter,IDLPAssetExchange,IDLPRouterRegistry} from "../src/DLPAssetRouter.sol";
import {DLPStockPriceSnapshot} from "../src/DLPStockPriceSnapshot.sol";
import {DLPMarket,IToken6} from "../src/DLPMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";
import {IOCPVault} from "ocp/interfaces/IOCPVault.sol";
import {SnapshotFeedMock} from "./DLPPriceSnapshot.t.sol";
contract IntegrationStock is ERC20 {
    uint8 private immutable precision;
    constructor(uint8 d) ERC20("Simulated stock","STOCK") {precision=d;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 value) external {_mint(to,value);}
}
contract FixedStockExchange is IDLPAssetExchange {
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
contract DLPStockIntegrationTest is Test {
    IntegrationStock c;IntegrationStock u;FixedStockExchange ex;DLPAssetRouter router;DLPStockFactory factory;
    DLPMarket m;VaultCoreAdapter adapter;OCPVault vault;
    address alice=address(0xA1);address bob=address(0xB1);address fallback_=address(0xF0);
    function setUp() public {
        vm.warp(100000);c=new IntegrationStock(18);u=new IntegrationStock(6);ex=new FixedStockExchange(address(c),address(u));
        SnapshotFeedMock eth=new SnapshotFeedMock(8,2000e8);SnapshotFeedMock stock=new SnapshotFeedMock(8,250e8);
        DLPStockPriceSnapshot price=new DLPStockPriceSnapshot(address(eth),address(stock),18,7200,7200,address(0),0);
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+3);
        address[] memory stable=new address[](1);stable[0]=address(u);
        router=new DLPAssetRouter(IDLPRouterRegistry(predicted),ex,stable);
        DLPCoreDeployer cd=new DLPCoreDeployer(predicted);DLPMarketDeployer md=new DLPMarketDeployer(predicted);
        factory=new DLPStockFactory(IToken6(address(c)),fallback_,1e18/250,price,cd,md,address(router));
        assertEq(address(factory),predicted);
        vm.prank(alice);(address mm,address aa,address vv)=factory.createMarket("Stock-backed topic", "yes", "no", "invalid", uint64(block.timestamp + 6 hours));
        m=DLPMarket(mm);adapter=VaultCoreAdapter(aa);vault=OCPVault(vv);
        c.mint(address(ex),100000e18);u.mint(address(ex),100000000e6);
        u.mint(alice,100000e6);c.mint(alice,1000e18);c.mint(bob,1000e18);
        vm.startPrank(alice);u.approve(address(router),type(uint256).max);c.approve(address(router),type(uint256).max);c.approve(address(m),type(uint256).max);c.approve(address(vault),type(uint256).max);vm.stopPrank();
        vm.startPrank(bob);c.approve(address(m),type(uint256).max);c.approve(address(vault),type(uint256).max);vm.stopPrank();
    }
    function req(DLPAssetRouter.Action action) internal view returns(DLPAssetRouter.Request memory r){
        r.market=address(m);r.action=action;r.paymentAsset=address(u);r.deadline=type(uint64).max;
    }
    function buy(uint256 dollars) internal {
        DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.GenesisBuy);r.inputAmount=dollars;r.minCollateral=dollars*1e12/250;
        vm.prank(alice);router.execute(r);
    }
    function graduate() internal {buy(27000e6);assertEq(uint8(m.phase()),1);}
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
        DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.GenesisSell);r.quantity=m.shares(alice)/2;
        uint256 before=u.balanceOf(alice);vm.prank(alice);router.execute(r);assertGt(u.balanceOf(alice),before);
        assertEq(c.allowance(address(router),address(m)),0);assertEq(c.allowance(address(router),address(ex)),0);
        assertTrue(m.checkInvariants());
    }
    function testFullFormalCoreAndBurnClaimsThroughStableRoute() public {
        graduate();DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.CoreStake);r.inputAmount=250e6;r.side=0;
        vm.prank(alice);router.execute(r);
        (uint256 yes,,)=vault.stakeOf(alice);assertEq(yes,1e18);(uint256 routerStake,,)=vault.stakeOf(address(router));assertEq(routerStake,0);
        r=req(DLPAssetRouter.Action.FormalBuy);r.quantity=1e18;r.inputAmount=500e6;r.businessLimit=2e18;
        vm.prank(alice);router.execute(r);assertEq(m.yes(alice),1e18);assertEq(m.yes(address(router)),0);
        r=req(DLPAssetRouter.Action.FormalSell);r.quantity=5e17;vm.prank(alice);router.execute(r);assertEq(m.yes(alice),5e17);
        vm.warp(m.coreCutoff());adapter.finalizeMarket();
        r=req(DLPAssetRouter.Action.ClaimMarket);uint256 before=u.balanceOf(alice);vm.prank(alice);router.execute(r);assertGt(u.balanceOf(alice),before);
        assertEq(m.bToken().balanceOf(alice),0);assertEq(m.lpToken().balanceOf(alice),0);
        r=req(DLPAssetRouter.Action.ClaimCore);vm.prank(alice);router.execute(r);assertTrue(m.checkInvariants());
        vm.prank(alice);vm.expectRevert();router.execute(r);
    }
    function testOutputSwapFailureRollsBackBurnAndAllowsNativeClaim() public {
        buy(1000e6);vm.warp(m.genesisCutoff());m.closeExpired();
        uint256 g=m.shares(alice);uint256 b=m.bToken().balanceOf(alice);ex.setFail(true);
        DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.ClaimMarket);vm.prank(alice);vm.expectRevert();router.execute(r);
        assertEq(m.shares(alice),g);assertEq(m.bToken().balanceOf(alice),b);
        uint256 before=c.balanceOf(alice);vm.prank(alice);m.claimAll();assertGt(c.balanceOf(alice),before);
    }
    function testCannotBypassSideLockOrClaimOthersWithSuffix() public {
        graduate();vm.prank(alice);vault.stake(IOCPVault.Side.NO,1e18);
        DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.CoreStake);r.inputAmount=250e6;r.side=0;
        vm.prank(alice);vm.expectRevert();router.execute(r);
        vm.prank(bob);(bool ok,)=address(vault).call(abi.encodePacked(abi.encodeWithSelector(vault.stake.selector,IOCPVault.Side.YES,1e18),alice));assertTrue(ok);
        (uint256 aY,uint256 aN,)=vault.stakeOf(alice);assertEq(aY,0);assertEq(aN,1e18);
    }
    function testCoreRouterStakeDoesNotInheritOldFeesAndCannotSwitchDirectly() public {
        graduate();
        uint256 cost=m.quoteFormalBuy(true,1e18);
        vm.prank(bob);m.formalBuy(true,1e18,cost,type(uint64).max);
        uint256 oldFee=c.balanceOf(address(vault));assertGt(oldFee,0);
        DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.CoreStake);r.inputAmount=250e6;r.side=0;
        vm.prank(alice);router.execute(r);
        assertEq(vault.claimableMarketFees(alice),0);
        vm.prank(alice);vm.expectRevert();vault.stake(IOCPVault.Side.NO,1e18);
        cost=m.quoteFormalBuy(true,1e18);vm.prank(bob);m.formalBuy(true,1e18,cost,type(uint64).max);
        vm.warp(m.coreCutoff());adapter.finalizeMarket();
        assertGt(vault.claimableMarketFees(alice),0);
        assertLt(vault.claimableMarketFees(alice),c.balanceOf(address(vault)));
    }
    function testNativeCollateralCanBuyAndClaimViaRouter() public {
        DLPAssetRouter.Request memory r=req(DLPAssetRouter.Action.GenesisBuy);r.paymentAsset=address(c);r.inputAmount=1e18;
        vm.prank(alice);router.execute(r);assertGt(m.shares(alice),0);
        vm.warp(m.genesisCutoff());m.closeExpired();
        r=req(DLPAssetRouter.Action.ClaimMarket);r.paymentAsset=address(c);
        uint256 before=c.balanceOf(alice);vm.prank(alice);router.execute(r);assertEq(c.balanceOf(alice)-before,99e16);
    }

}
