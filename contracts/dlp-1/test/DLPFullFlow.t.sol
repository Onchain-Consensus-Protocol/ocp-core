// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {DLPBase} from "./DLPBase.sol";
import {SnapshotFeedMock} from "./DLPPriceSnapshot.t.sol";
import {DLPPriceSnapshot} from "../src/DLPPriceSnapshot.sol";
import {DLPMarket} from "../src/DLPMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {DLPFactory,DLPCoreDeployer,DLPMarketDeployer} from "../src/DLPFactory.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";
import {IOCPVault} from "ocp/interfaces/IOCPVault.sol";

contract DLPFullFlowTest is DLPBase {
    DLPFactory internal factory;
    VaultCoreAdapter internal adapter;
    OCPVault internal vault;
    function setUp() public override {
        super.setUp();
        SnapshotFeedMock eth = new SnapshotFeedMock(8,2000e8);
        SnapshotFeedMock stable = new SnapshotFeedMock(8,1e8);
        DLPPriceSnapshot reader = new DLPPriceSnapshot(address(eth),address(stable),3600,3600);
        address predicted = vm.computeCreateAddress(address(this),vm.getNonce(address(this))+2);
        DLPCoreDeployer cd = new DLPCoreDeployer(predicted);
        DLPMarketDeployer md = new DLPMarketDeployer(predicted);
        factory = new DLPFactory(usd,protocol,W,reader,cd,md);
        vm.prank(creator);
        (address m,address a,address v) = factory.createMarket("Demo parity topic", "Yes criteria", "No criteria", "Invalid criteria", uint64(block.timestamp + 6 hours));
        market = DLPMarket(m); adapter = VaultCoreAdapter(a); vault = OCPVault(v);
        address[4] memory users = [alice,bob,carol,dave];
        for(uint256 i;i<4;++i){
            usd.mint(users[i],50000e6);
            vm.startPrank(users[i]);
            usd.approve(m,type(uint256).max);usd.approve(v,type(uint256).max);
            vm.stopPrank();
        }
    }
    function _run(uint8 expected) internal {
        assertEq(market.rTarget(),7200e6);assertEq(market.bTarget(),1200e6);
        vm.prank(alice);vm.expectRevert();vault.stake(IOCPVault.Side.YES,1e6);
        _buy(alice,26000e6);assertEq(adapter.openedAt(),0);
        _buy(bob,1000e6);assertEq(adapter.openedAt(),block.timestamp);
        assertLe(address(market).code.length,24576);
        _formalBuy(carol,true,100*W);
        vm.prank(alice);vault.stake(IOCPVault.Side.YES,expected==1?3e6:1e6);
        vm.prank(bob);vault.stake(IOCPVault.Side.NO,expected==2?3e6:1e6);
        _formalBuy(dave,false,50*W);
        vm.warp(market.formalCutoff());market.closeExpired();
        vm.expectRevert();_formalBuy(carol,true,W);
        vm.prank(carol);vault.stake(IOCPVault.Side.INVALID,1e6);
        vm.warp(market.coreCutoff());adapter.finalizeMarket();
        assertEq(market.outcome(),expected);assertEq(uint8(vault.outcome()),expected);
        address[4] memory users=[alice,bob,carol,dave];
        for(uint256 i;i<4;++i){
            (uint256 o,uint256 lp,uint256 b,uint256 f)=market.previewAccount(users[i],expected);
            uint256 before=usd.balanceOf(users[i]);
            vm.prank(users[i]);uint256 paid=market.claimAll();
            assertEq(paid,o+lp+b+f);assertEq(usd.balanceOf(users[i])-before,paid);
            vm.prank(users[i]);vm.expectRevert();market.claimAll();
        }
        vm.prank(alice);vault.withdraw();vm.prank(bob);vault.withdraw();vm.prank(carol);vault.withdraw();
        uint256 held=usd.balanceOf(address(market))+usd.balanceOf(address(vault))+usd.balanceOf(address(adapter));
        for(uint256 i;i<4;++i)held+=usd.balanceOf(users[i]);
        held+=usd.balanceOf(creator)+usd.balanceOf(protocol);
        assertEq(held,204000e6);assertEq(usd.balanceOf(address(adapter)),0);
        _accounting();
    }
    function testFactoryToClaimYes() public {_run(1);}
    function testFactoryToClaimNo() public {_run(2);}
    function testFactoryToClaimInvalid() public {_run(3);}
}
