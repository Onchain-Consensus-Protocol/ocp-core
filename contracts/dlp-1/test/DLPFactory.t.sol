// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {DLPFactory, DLPCoreDeployer, DLPMarketDeployer} from "../src/DLPFactory.sol";
import {DLPMarket, IToken6, IDLPCore} from "../src/DLPMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {IDLPPriceSnapshot} from "../src/DLPPriceSnapshot.sol";
import {MockUSDC} from "./DLPBase.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";
import {IOCPVault} from "ocp/interfaces/IOCPVault.sol";

contract FactoryPriceMock is IDLPPriceSnapshot {
    uint256 public price = 1e6;
    function set(uint256 value) external { price = value; }
    function ethPrice6() external view returns (uint256) { return price; }
}
contract DLPFactoryTest is Test {
    MockUSDC usd; FactoryPriceMock oracle; DLPFactory factory;
    DLPCoreDeployer coreDeployer; DLPMarketDeployer marketDeployer;
    address alice = address(0xA1); address protocol = address(0xF0);
    function setUp() public {
        vm.warp(100000); usd = new MockUSDC(); oracle = new FactoryPriceMock();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        coreDeployer = new DLPCoreDeployer(predicted);
        marketDeployer = new DLPMarketDeployer(predicted);
        factory = new DLPFactory(usd, protocol, 1e18, oracle, coreDeployer, marketDeployer);
        assertEq(address(factory), predicted);
    }
    function create() internal returns (DLPMarket market, VaultCoreAdapter adapter, OCPVault vault) {
        vm.prank(alice);
        (address m, address a, address v) = factory.createMarket("Will this launch?", "YES definition", "NO definition", "INVALID definition", uint64(block.timestamp + 6 hours));
        return (DLPMarket(m), VaultCoreAdapter(a), OCPVault(v));
    }
    function testZeroPrincipalAtomicCreateAndMetadata() public {
        (DLPMarket m, VaultCoreAdapter a, OCPVault v) = create();
        assertEq(usd.balanceOf(alice), 0); assertEq(usd.balanceOf(address(m)), 0);
        assertEq(m.creator(), alice); assertEq(m.protocol(), protocol);
        assertEq(address(m.token()), address(usd)); assertEq(address(m.core()), address(a));
        assertEq(a.market(), address(m)); assertEq(v.market(), address(m));
        assertEq(v.permissionlessCreator(), alice); assertFalse(v.earlyTerminationEnabled());
        assertEq(m.coreCutoff(), block.timestamp + 6 hours);
        assertEq(m.formalCutoff(), block.timestamp + 5 hours);
        assertEq(m.genesisCutoff(), block.timestamp + 3 hours);
        assertEq(m.rTarget(), 3.6e6); assertEq(m.bTarget(), .6e6);
        assertEq(factory.marketCount(), 1); assertEq(factory.markets(0), address(m));
        DLPFactory.MarketRecord memory r = factory.marketRecord(address(m));
        assertEq(r.creator, alice); assertEq(r.adapter, address(a)); assertEq(r.vault, address(v));
        assertEq(r.snapshot, 1e6); assertEq(r.createdAt, block.timestamp);
        assertEq(r.topic, "Will this launch?"); assertEq(r.yesRule, "YES definition");
        assertEq(r.noRule, "NO definition"); assertEq(r.invalidRule, "INVALID definition");
    }
    function testCoreCannotStakeUntilGraduationThenOpensAtomically() public {
        (DLPMarket m, VaultCoreAdapter a, OCPVault v) = create();
        usd.mint(alice, 20e6); vm.startPrank(alice);
        usd.approve(address(v), type(uint256).max); usd.approve(address(m), type(uint256).max);
        vm.expectRevert("Staking not open"); v.stake(IOCPVault.Side.YES, 1e6);
        m.genesisBuy(14e6, 0, type(uint64).max, 0);
        v.stake(IOCPVault.Side.YES, 1e6); vm.stopPrank();
        assertEq(a.openedAt(), block.timestamp); assertEq(a.deadline(), m.coreCutoff());
    }
    function testSnapshotIsFixedPerMarket() public {
        (DLPMarket first,,) = create(); oracle.set(2000e6);
        (DLPMarket second,,) = create();
        assertEq(first.rTarget(), 3.6e6); assertEq(second.rTarget(), 7200e6);
        assertEq(factory.marketCount(), 2);
    }
    function testRejectInvalidMetadataBeforeDeployment() public {
        vm.expectRevert("METADATA_LENGTH"); factory.createMarket("", "yes", "no", "invalid", uint64(block.timestamp + 6 hours));
        vm.expectRevert("METADATA_LENGTH"); factory.createMarket(string(new bytes(513)), "yes", "no", "invalid", uint64(block.timestamp + 6 hours));
        vm.expectRevert("METADATA_LENGTH"); factory.createMarket("topic", string(new bytes(2049)), "no", "invalid", uint64(block.timestamp + 6 hours));
        vm.expectRevert("METADATA_LENGTH"); factory.createMarket("topic", "yes", "", "invalid", uint64(block.timestamp + 6 hours));
        vm.expectRevert("METADATA_LENGTH"); factory.createMarket("topic", "yes", "no", "", uint64(block.timestamp + 6 hours));
        assertEq(factory.marketCount(), 0);
    }
    function testMetadataMaximumAccepted() public {
        factory.createMarket(string(new bytes(512)), string(new bytes(2048)), string(new bytes(2048)), string(new bytes(2048)), uint64(block.timestamp + 6 hours));
        assertEq(factory.marketCount(), 1);
    }
    function testInvalidPriceDoesNotRegisterOrDeployMarket() public {
        oracle.set(0); vm.expectRevert("PRICE"); factory.createMarket("topic", "yes", "no", "invalid", uint64(block.timestamp + 6 hours));
        assertEq(factory.marketCount(), 0);
    }
    function testCarriersOnlyAllowFactory() public {
        vm.expectRevert("ONLY_FACTORY"); coreDeployer.deploy(usd, alice, protocol, uint64(block.timestamp + 6 hours));
        vm.expectRevert("ONLY_FACTORY"); coreDeployer.bindCore(VaultCoreAdapter(address(1)), address(2));
        vm.expectRevert("ONLY_FACTORY"); marketDeployer.deploy(usd, IDLPCore(address(1)), alice, protocol, uint64(block.timestamp + 6 hours), 1e6, 1e18);
    }
    function testCarrierRuntimeAndCodeStoreSizes() public view {
        assertLe(type(DLPMarket).creationCode.length + 7 * 32, 49152);
        assertLe(type(DLPMarketDeployer).creationCode.length + 32, 49152);
        assertLe(address(factory).code.length, 24576);
        assertLe(address(coreDeployer).code.length, 24576);
        assertLe(address(marketDeployer).code.length, 24576);
        assertLe(marketDeployer.codeA().code.length, 24576);
        assertLe(marketDeployer.codeB().code.length, 24576);
        assertEq(marketDeployer.lengthA() + marketDeployer.lengthB(), type(DLPMarket).creationCode.length);
    }
    function testRejectMismatchedFactoryCarriers() public {
        vm.expectRevert("FACTORY_BINDING");
        new DLPFactory(usd, protocol, 1e18, oracle, coreDeployer, marketDeployer);
    }
}
