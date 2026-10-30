// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketCoreDeployer} from "../src/deployers/TopicMarketCoreDeployer.sol";
import {TopicMarketDeployer} from "../src/deployers/TopicMarketDeployer.sol";
import {TopicMarketAssetRouter,ITopicMarketRouterRegistry} from "../src/TopicMarketAssetRouter.sol";
import {TopicMarketV3Router02Exchange,ITopicMarketV3Router02} from "../src/TopicMarketV3Router02Exchange.sol";
import {ITopicMarketPriceSnapshot} from "../src/interfaces/ITopicMarketPriceSnapshot.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";

/// @dev Fork-only threshold fixture: this does not exercise or validate production price feeds.
contract SharedForkOnlySnapshot is ITopicMarketPriceSnapshot {
    uint256 public constant unit=1e18;
    function ethPrice6() external pure returns(uint256){return 1e18;}
    function collateralForUsd(uint256 usdWad) external pure returns(uint256){return usdWad;}
}

/// @notice One local factory, five live mainnet stock tokens and real V3 pools at a pinned block.
/// @dev Fork storage seeds only USDG. No public-chain deployment or transaction is performed.
contract RHSharedFactoryForkTest is Test {
    address constant USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER02=0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant TSLA=0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant AAPL=0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address constant GOOGL=0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3;
    address constant SPCX=0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa;
    address constant ALICE=address(0xA11CE);
    address[5] stocks=[TSLA,NVDA,AAPL,GOOGL,SPCX];
    TopicMarketStockFactory factory;
    TopicMarketAssetRouter[5] routers;
    TopicMarketV3Router02Exchange[5] exchanges;
    TopicMarket[5] markets;
    VaultCoreAdapter[5] adapters;
    OCPCore[5] vaults;

    function setUp() public {
        string memory url=vm.envOr("RH_FORK_RPC",string(""));
        if(bytes(url).length==0){vm.skip(true);return;}
        uint256 pin=vm.envOr("RH_FORK_BLOCK",uint256(99917547));
        vm.createSelectFork(url,pin);
        assertEq(block.number,pin);assertEq(block.chainid,4663);
        assertGt(USDG.code.length,0);assertGt(ROUTER02.code.length,0);
        deal(USDG,ALICE,200000e6);
    }

    function _request(uint256 i,TopicMarketAssetRouter.Action action)
        private view returns(TopicMarketAssetRouter.Request memory r)
    {
        r.market=address(markets[i]);r.action=action;r.paymentAsset=USDG;
        r.deadline=uint64(block.timestamp+1 days);
    }

    function _deployAll() private {
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+2);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);
        TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        factory=new TopicMarketStockFactory(address(this),address(0xF0),cd,md);
        assertEq(address(factory),predicted);
        SharedForkOnlySnapshot oracle=new SharedForkOnlySnapshot();
        address[] memory stable=new address[](1);stable[0]=USDG;
        uint64 cutoff=uint64(block.timestamp+6 hours);
        // Register all stocks before any lifecycle action: these are genuinely concurrent markets.
        for(uint256 i;i<5;i++){
            assertGt(stocks[i].code.length,0);assertEq(IToken6(stocks[i]).decimals(),18);
            exchanges[i]=new TopicMarketV3Router02Exchange(ITopicMarketV3Router02(ROUTER02),stocks[i],USDG,i==0?3000:500);
            routers[i]=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(address(factory)),exchanges[i],stable);
            factory.registerStock(IToken6(stocks[i]),1e18,oracle,address(routers[i]));
        }
        for(uint256 i;i<5;i++){
            vm.prank(ALICE);
            (address mm,address aa,address vv)=factory.createMarket(stocks[i],"shared fork only","yes","no","invalid",cutoff);
            markets[i]=TopicMarket(mm);adapters[i]=VaultCoreAdapter(aa);vaults[i]=OCPCore(vv);
            assertTrue(factory.isMarket(mm));assertEq(factory.marketCollateral(mm),stocks[i]);
            assertEq(address(markets[i].token()),stocks[i]);assertEq(address(vaults[i].stakeToken()),stocks[i]);
            assertTrue(markets[i].isTrustedForwarder(address(routers[i])));
            assertTrue(vaults[i].isTrustedForwarder(address(routers[i])));
            vm.prank(ALICE);IERC20(USDG).approve(address(routers[i]),type(uint256).max);
        }
        assertEq(factory.stockCount(),5);assertEq(factory.marketCount(),5);
    }

    // Covers the untouched markets' collateral custody, rights, budgets, stakes and route balances.
    // ALICE's shared USDG and DEX pool reserves intentionally change when any real swap executes.
    function _assetState(uint256 i) private view returns(bytes32){
        TopicMarket m=markets[i];IERC20 token=IERC20(stocks[i]);
        (uint256 yes,uint256 no,uint256 invalid)=vaults[i].stakeOf(ALICE);
        bytes32 custody=keccak256(abi.encode(token.balanceOf(address(m)),token.balanceOf(address(vaults[i])),
            token.balanceOf(address(routers[i])),token.balanceOf(address(exchanges[i])),token.balanceOf(ALICE),
            IERC20(USDG).balanceOf(address(routers[i])),IERC20(USDG).balanceOf(address(exchanges[i]))));
        bytes32 ledger=keccak256(abi.encode(m.accountedBalance(),m.R(),m.B(),m.cash(),m.collateralCash(),
            m.lpFees(),m.lpBudgetRemaining(),m.bBudgetRemaining(),vaults[i].resolved(),vaults[i].settlementReady()));
        OCPCore core=vaults[i];
        bytes32 requests=keccak256(abi.encode(core.earlyTerminationModule(),core.pendingEarlyTermination(),
            core.earlyTerminationRequestCount(),core.pendingBondEscrow(),core.totalEarlyBondRefunds(),
            core.claimableEarlyBond(ALICE),core.exitPenaltyPool(),core.failedProposalBondPool(),core.effectiveResolutionTime()));
        bytes32 fees=keccak256(abi.encode(core.totalMarketFeesAccrued(),core.marketFeeUserPoolRemaining(),
            core.officialMarketFeesClaimable(),core.historicalFeePoolRemaining(),core.forfeitedBonusPoolRemaining(),
            core.accYesFeePerStake(),core.accNoFeePerStake(),core.accInvalidFeePerStake()));
        return keccak256(abi.encode(custody,ledger,requests,fees,m.phase(),m.shares(ALICE),m.yes(ALICE),m.no(ALICE),
            m.bToken().balanceOf(ALICE),m.lpToken().balanceOf(ALICE),yes,no,invalid));
    }
    function _otherStates(uint256 active) private view returns(bytes32[5] memory states){
        for(uint256 i;i<5;i++)if(i!=active)states[i]=_assetState(i);
    }
    function _assertOthers(uint256 active,bytes32[5] memory states) private view {
        for(uint256 i;i<5;i++)if(i!=active)assertEq(_assetState(i),states[i],"cross-asset state changed");
    }
    function _execute(uint256 i,TopicMarketAssetRouter.Request memory r) private {
        bytes32[5] memory states=_otherStates(i);
        vm.prank(ALICE);routers[i].execute(r);
        _assertOthers(i,states);
    }

    function testForkSharedFactoryFiveConcurrentStockLifecycles() public {
        _deployAll();
        factory.setStockEnabled(TSLA,false);
        assertTrue(factory.isMarket(address(markets[0])));
        vm.prank(ALICE);vm.expectRevert(bytes("STOCK_DISABLED"));
        factory.createMarket(TSLA,"disabled","yes","no","invalid",uint64(block.timestamp+6 hours));
        assertEq(factory.marketCount(),5);
        // A registered market from this factory still rejects another stock's trusted router.
        TopicMarketAssetRouter.Request memory wrong=_request(1,TopicMarketAssetRouter.Action.GenesisBuy);
        wrong.inputAmount=100e6;
        bytes32 beforeWrong=_assetState(1);bytes32[5] memory otherWrong=_otherStates(1);
        uint256 usdBefore=IERC20(USDG).balanceOf(ALICE);
        vm.prank(ALICE);vm.expectRevert(bytes("FORWARDER"));routers[0].execute(wrong);
        assertEq(IERC20(USDG).balanceOf(ALICE),usdBefore);
        assertEq(_assetState(1),beforeWrong);_assertOthers(1,otherWrong);
        // Interleave phases across all five stocks instead of finishing one before starting another.
        for(uint256 i;i<5;i++){
            TopicMarketAssetRouter.Request memory r=_request(i,TopicMarketAssetRouter.Action.GenesisBuy);
            r.inputAmount=15000e6;r.minCollateral=14e18;
            _execute(i,r);assertEq(uint8(markets[i].phase()),1);
            assertGt(markets[i].shares(ALICE)+markets[i].lpToken().balanceOf(ALICE),0);
            assertEq(markets[i].shares(address(routers[i])),0);
        }
        for(uint256 i;i<5;i++){
            TopicMarketAssetRouter.Request memory r=_request(i,TopicMarketAssetRouter.Action.CoreStake);
            r.inputAmount=100e6;r.side=0;_execute(i,r);
            (uint256 yes,,)=vaults[i].stakeOf(ALICE);assertGt(yes,0);
            r=_request(i,TopicMarketAssetRouter.Action.FormalBuy);
            r.inputAmount=1000e6;r.quantity=1e17;r.businessLimit=10e18;
            _execute(i,r);assertEq(markets[i].yes(ALICE),1e17);
        }
        for(uint256 i=5;i>0;i--){
            uint256 j=i-1;TopicMarketAssetRouter.Request memory r=_request(j,TopicMarketAssetRouter.Action.FormalSell);
            r.quantity=5e16;r.minOutput=1;_execute(j,r);assertEq(markets[j].yes(ALICE),5e16);
        }
        // One common cutoff and one warp; each independent vault/market must settle correctly.
        vm.warp(markets[0].coreCutoff());
        for(uint256 i;i<5;i++){
            assertEq(markets[i].coreCutoff(),markets[0].coreCutoff());
            bytes32[5] memory states=_otherStates(i);adapters[i].finalizeMarket();_assertOthers(i,states);
            assertEq(uint8(markets[i].phase()),3);assertTrue(vaults[i].settlementReady());
        }
        for(uint256 i;i<5;i++)_claim(i);
        assertEq(factory.stockCount(),5);assertEq(factory.marketCount(),5);
        emit log_named_uint("shared factory stock count",factory.stockCount());
        emit log_named_uint("concurrent markets settled",factory.marketCount());
    }

    function _claim(uint256 i) private {
        TopicMarket m=markets[i];TopicMarketAssetRouter.Request memory r=_request(i,TopicMarketAssetRouter.Action.ClaimMarket);
        // Failed stablecoin conversion restores the full local market and every other asset.
        bytes32 beforeState=_assetState(i);bytes32[5] memory states=_otherStates(i);
        uint256 usdBefore=IERC20(USDG).balanceOf(ALICE);r.minOutput=type(uint256).max;
        vm.prank(ALICE);vm.expectRevert();routers[i].execute(r);
        assertEq(_assetState(i),beforeState);assertEq(IERC20(USDG).balanceOf(ALICE),usdBefore);_assertOthers(i,states);
        r.minOutput=1;_execute(i,r);assertGt(IERC20(USDG).balanceOf(ALICE),usdBefore);
        assertEq(m.bToken().balanceOf(ALICE),0);assertEq(m.lpToken().balanceOf(ALICE),0);
        assertEq(m.shares(ALICE),0);assertEq(m.yes(ALICE),0);
        r=_request(i,TopicMarketAssetRouter.Action.ClaimCore);r.minOutput=1;_execute(i,r);
        vm.prank(ALICE);vm.expectRevert();routers[i].execute(r);
        assertEq(IERC20(stocks[i]).balanceOf(address(routers[i])),0);
        assertEq(IERC20(USDG).balanceOf(address(routers[i])),0);
        assertEq(IERC20(stocks[i]).balanceOf(address(exchanges[i])),0);
        assertEq(IERC20(USDG).balanceOf(address(exchanges[i])),0);
        assertEq(IERC20(stocks[i]).allowance(address(routers[i]),address(m)),0);
        assertEq(IERC20(stocks[i]).allowance(address(routers[i]),address(exchanges[i])),0);
        assertTrue(checkMarketInvariants(m));
        emit log_named_address("settled stock",stocks[i]);
    }
}
