// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketCoreDeployer,TopicMarketDeployer} from "../src/TopicMarketFactory.sol";
import {TopicMarketAssetRouter,ITopicMarketRouterRegistry} from "../src/TopicMarketAssetRouter.sol";
import {TopicMarketV3Router02Exchange,ITopicMarketV3Router02} from "../src/TopicMarketV3Router02Exchange.sol";
import {TopicMarketV3Exchange,ITopicMarketV3SwapRouter} from "../src/TopicMarketV3Exchange.sol";
import {ITopicMarketPriceSnapshot} from "../src/TopicMarketPriceSnapshot.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";

/// @dev Local test-only threshold configuration. This deliberately does NOT validate production feeds.
contract ForkOnlySnapshot is ITopicMarketPriceSnapshot {
    uint256 public constant unit=1e18;
    function ethPrice6() external pure returns(uint256){return 1e18;}
}
contract RHMainnetForkTest is Test {
    address constant USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER02=0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant TSLA=0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant AAPL=0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address constant GOOGL=0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3;
    address constant SPCX=0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa;
    address alice=address(0xA11CE);
    function setUp() public {
        string memory url=vm.envOr("RH_FORK_RPC",string(""));
        if(bytes(url).length==0){vm.skip(true);return;}
        uint256 pin=vm.envOr("RH_FORK_BLOCK",uint256(94363412));
        vm.createSelectFork(url,pin);
        assertEq(block.number,pin);assertGt(USDG.code.length,0);assertGt(ROUTER02.code.length,0);
        // Only a local fork storage balance is seeded. No real tokens are minted or transferred.
        deal(USDG,alice,100000e6);
    }
    function request(address market,TopicMarketAssetRouter.Action action) private view returns(TopicMarketAssetRouter.Request memory r){
        r.market=market;r.action=action;r.paymentAsset=USDG;r.deadline=uint64(block.timestamp+1 days);
    }
    function testForkTSLARealSwapsAndFullLifecycle() public {_flow(TSLA,3000);}
    function testForkNVDARealSwapsAndFullLifecycle() public {_flow(NVDA,500);}
    function testForkAAPLRealSwapsAndFullLifecycle() public {_flow(AAPL,500);}
    function testForkGOOGLRealSwapsAndFullLifecycle() public {_flow(GOOGL,500);}
    function testForkSPCXRealSwapsAndFullLifecycle() public {_flow(SPCX,500);}
    function _flow(address stock,uint24 fee) private {
        TopicMarketV3Router02Exchange exchange=new TopicMarketV3Router02Exchange(ITopicMarketV3Router02(ROUTER02),stock,USDG,fee);
        vm.startPrank(alice);IERC20(USDG).approve(address(exchange),1000e6);
        uint256 received=exchange.swapExactInput(USDG,stock,1000e6,1,uint64(block.timestamp+1 hours));assertGt(received,0);
        IERC20(stock).approve(address(exchange),received);
        uint256 returned=exchange.swapExactInput(stock,USDG,received,1,uint64(block.timestamp+1 hours));
        assertGt(returned,950e6);assertLt(returned,1000e6);vm.stopPrank();
        emit log_named_address("stock",stock);emit log_named_uint("1000 USDG stock out raw",received);emit log_named_uint("roundtrip USDG returned raw",returned);
        ForkOnlySnapshot oracle=new ForkOnlySnapshot();
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+3);
        address[] memory stable=new address[](1);stable[0]=USDG;
        TopicMarketAssetRouter router=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(predicted),exchange,stable);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        TopicMarketStockFactory factory=new TopicMarketStockFactory(address(this),address(0xF0),cd,md);
        factory.registerStock(IToken6(stock),1e18,oracle,address(router));
        vm.prank(alice);(address mm,address aa,address vv)=factory.createMarket(stock,"fork only", "yes", "no", "invalid", uint64(block.timestamp + 6 hours));
        TopicMarket m=TopicMarket(mm);OCPVault vault=OCPVault(vv);
        vm.prank(alice);IERC20(USDG).approve(address(router),type(uint256).max);
        TopicMarketAssetRouter.Request memory r=request(mm,TopicMarketAssetRouter.Action.GenesisBuy);r.inputAmount=15000e6;r.minCollateral=14e18;
        vm.prank(alice);router.execute(r);assertEq(uint8(m.phase()),1);assertGt(m.shares(alice)+m.lpToken().balanceOf(alice),0);assertEq(m.shares(address(router)),0);
        r=request(mm,TopicMarketAssetRouter.Action.CoreStake);r.inputAmount=100e6;r.side=0;
        vm.prank(alice);router.execute(r);(uint256 yes,,)=vault.stakeOf(alice);assertGt(yes,0);
        r=request(mm,TopicMarketAssetRouter.Action.FormalBuy);r.inputAmount=1000e6;r.quantity=1e17;r.businessLimit=10e18;
        vm.prank(alice);router.execute(r);assertEq(m.yes(alice),1e17);
        r=request(mm,TopicMarketAssetRouter.Action.FormalSell);r.quantity=5e16;r.minOutput=1;
        vm.prank(alice);router.execute(r);assertEq(m.yes(alice),5e16);
        vm.warp(m.coreCutoff());VaultCoreAdapter(aa).finalizeMarket();
        // A failing final stablecoin slippage limit must restore all burnt rights and budgets.
        bytes32 protectedState=_claimState(m,stock,address(router),address(exchange));
        uint256 b=m.bToken().balanceOf(alice);uint256 lp=m.lpToken().balanceOf(alice);uint256 pending=m.shares(alice);
        r=request(mm,TopicMarketAssetRouter.Action.ClaimMarket);r.minOutput=type(uint256).max;
        vm.prank(alice);vm.expectRevert();router.execute(r);
        assertEq(m.bToken().balanceOf(alice),b);assertEq(m.lpToken().balanceOf(alice),lp);assertEq(m.shares(alice),pending);assertEq(_claimState(m,stock,address(router),address(exchange)),protectedState);
        r.minOutput=1;uint256 before=IERC20(USDG).balanceOf(alice);vm.prank(alice);router.execute(r);assertGt(IERC20(USDG).balanceOf(alice),before);
        r=request(mm,TopicMarketAssetRouter.Action.ClaimCore);r.minOutput=1;vm.prank(alice);router.execute(r);
        assertEq(IERC20(stock).balanceOf(address(router)),0);assertEq(IERC20(USDG).balanceOf(address(router)),0);
        assertEq(IERC20(stock).allowance(address(router),mm),0);assertTrue(m.checkInvariants());
        vm.prank(alice);vm.expectRevert();router.execute(r);
    }
    function _claimState(TopicMarket m,address stock,address router,address exchange) private view returns(bytes32) {
        return keccak256(abi.encode(m.lpBudgetRemaining(),m.bBudgetRemaining(),m.yes(alice),m.no(alice),IERC20(stock).balanceOf(address(m)),IERC20(stock).balanceOf(router),IERC20(stock).balanceOf(exchange),IERC20(stock).balanceOf(alice),IERC20(USDG).balanceOf(alice),IERC20(USDG).balanceOf(router),IERC20(stock).allowance(router,exchange)));
    }
    function testForkClassicRouterAbiIsRejectedAndFundsRestored() public {
        TopicMarketV3Exchange oldExchange=new TopicMarketV3Exchange(ITopicMarketV3SwapRouter(ROUTER02),TSLA,USDG,3000);
        uint256 before=IERC20(USDG).balanceOf(alice);
        vm.startPrank(alice);IERC20(USDG).approve(address(oldExchange),100e6);
        vm.expectRevert();oldExchange.swapExactInput(USDG,TSLA,100e6,1,uint64(block.timestamp+1 hours));vm.stopPrank();
        assertEq(IERC20(USDG).balanceOf(alice),before);assertEq(IERC20(USDG).balanceOf(address(oldExchange)),0);
    }
}
