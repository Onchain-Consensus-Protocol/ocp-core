// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {IntegrationStock} from "./TopicMarketStockIntegration.t.sol";
import {TopicMarketTestnetStockFactory} from "../src/TopicMarketTestnetStockFactory.sol";
import {TopicMarketCoreDeployer} from "../src/deployers/TopicMarketCoreDeployer.sol";
import {TopicMarketDeployer} from "../src/deployers/TopicMarketDeployer.sol";
import {ITopicMarketPriceSnapshot} from "../src/interfaces/ITopicMarketPriceSnapshot.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {OCPCore} from "ocp/core/OCPCore.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
contract TestnetUsdOnlySnapshot is ITopicMarketPriceSnapshot {
    uint256 public constant unit=1e18;
    function ethPrice6() external pure returns(uint256){revert("NO_TEST_ETH_PRICE");}
    function collateralForUsd(uint256 amount) external pure returns(uint256){return amount/250;}
}
contract TestnetRouterBinding {address public immutable factory;constructor(address f){factory=f;}}
contract TopicMarketTestnetTargetsTest is Test {
    address constant STOCK=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant USER=address(0xA1);
    TopicMarketTestnetStockFactory factory;
    TestnetUsdOnlySnapshot oracle;
    function setUp() public {
        vm.chainId(46630);vm.warp(100000);
        IntegrationStock token=new IntegrationStock(18);vm.etch(STOCK,address(token).code);
        oracle=new TestnetUsdOnlySnapshot();
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+3);
        TestnetRouterBinding router=new TestnetRouterBinding(predicted);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        factory=new TopicMarketTestnetStockFactory(address(this),address(0xF0),cd,md);
        assertEq(address(factory),predicted);
        factory.registerStock(IToken6(STOCK),1e18,oracle,address(router));
    }
    function create() private returns(TopicMarket m,OCPCore vault){
        (address market,,address v)=factory.createMarket(STOCK,"test topic","yes","no","invalid",uint64(block.timestamp+6 hours));
        return (TopicMarket(market),OCPCore(v));
    }
    function testFixedTargetsIgnoreUnavailableEthPriceAndKeepUsdBondSeparate() public {
        (TopicMarket m,OCPCore vault)=create();
        assertEq(m.rTarget(),36e14);assertEq(m.bTarget(),6e14);
        assertEq(vault.earlyTerminationBondRequired(),2e18); // 500USD /250USD per TSLA
        assertTrue(factory.fixedTestnetGraduation());assertEq(factory.marketRecord(address(m)).snapshot,0);
    }
    function testSmallFundedOrdersStillRequireBothTargetsAndGraduate() public {
        (TopicMarket m,)=create();IntegrationStock(STOCK).mint(USER,1e18);
        vm.startPrank(USER);IntegrationStock(STOCK).approve(address(m),1e18);
        m.genesisBuy(5e15,0,type(uint64).max,0); // R target reached, B not yet reached.
        assertGt(m.R(),m.rTarget());assertLt(m.B(),m.bTarget());assertEq(uint256(m.phase()),0);
        m.genesisBuy(8333333333333334,0,type(uint64).max,0);
        vm.stopPrank();assertEq(uint256(m.phase()),1);assertGe(m.B(),m.bTarget());assertGe(m.initialCollateral(),m.rTarget());
        assertTrue(checkMarketInvariants(m));
    }
    function testProfileRejectsMainnetEvenWithCorrectBindings() public {
        vm.chainId(4663);
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+2);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        vm.expectRevert("TESTNET_ONLY");new TopicMarketTestnetStockFactory(address(this),address(0xF0),cd,md);
    }
    function testAlreadyDeployedProfileCannotBeUsedUnderMainnetChainId() public {
        vm.chainId(4663);vm.expectRevert("TESTNET_TSLA_ONLY");
        factory.createMarket(STOCK,"bad chain","y","n","i",uint64(block.timestamp+6 hours));
    }
    function testEveryMarketGetsIndependentCloneFromSameSharedImplementation() public {
        (TopicMarket a,OCPCore va)=create();(TopicMarket b,OCPCore vb)=create();
        address ma=va.earlyTerminationModule();address mb=vb.earlyTerminationModule();
        assertTrue(ma!=mb);assertTrue(address(a)!=address(b));assertEq(ma.code.length,45);assertEq(mb.code.length,45);
        address implementation=factory.coreDeployer().earlyTerminationImplementation();
        bytes memory code=ma.code;
        address embedded;assembly {embedded := shr(96,mload(add(code,42)))}
        assertEq(embedded,implementation);assertEq(keccak256(ma.code),keccak256(mb.code));
    }
}
