// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {TopicMarketStockPriceSnapshot} from "../src/TopicMarketStockPriceSnapshot.sol";
import {SnapshotFeedMock} from "./TopicMarketPriceSnapshot.t.sol";
contract TopicMarketStockPriceSnapshotTest is Test {
    function testStockNativeUnitConversionAndImmutableSnapshotInputs() public {
        vm.warp(10000);
        SnapshotFeedMock eth=new SnapshotFeedMock(8,2000e8);
        SnapshotFeedMock stock=new SnapshotFeedMock(6,250e6);
        for(uint8 d=6;d<=18;d++) {
            TopicMarketStockPriceSnapshot p=new TopicMarketStockPriceSnapshot(address(eth),address(stock),d,60,60,address(0),0);
            assertEq(p.ethPrice6(),8*10**d);
            assertEq(p.collateralForUsd(500e18),2*10**d);
        }
        TopicMarketStockPriceSnapshot price=new TopicMarketStockPriceSnapshot(address(eth),address(stock),18,60,60,address(0),0);
        stock.set(8,200e6,10000,10000,8);assertEq(price.ethPrice6(),10e18);assertEq(price.collateralForUsd(500e18),25e17);
        vm.warp(10061);vm.expectRevert(bytes("STALE"));price.ethPrice6();
    }
    function testRejectsBadDataAndSequencerRecovery() public {
        vm.warp(10000);
        SnapshotFeedMock eth=new SnapshotFeedMock(8,2000e8);
        SnapshotFeedMock stock=new SnapshotFeedMock(8,250e8);
        SnapshotFeedMock seq=new SnapshotFeedMock(0,1);
        TopicMarketStockPriceSnapshot p=new TopicMarketStockPriceSnapshot(address(eth),address(stock),18,7200,7200,address(seq),60);
        vm.expectRevert(bytes("SEQUENCER_DOWN"));p.ethPrice6();
        seq.set(8,0,10000,10000,8);vm.warp(10060);vm.expectRevert(bytes("SEQUENCER_DOWN"));p.ethPrice6();
        vm.warp(10061);assertEq(p.ethPrice6(),8e18);
        stock.set(8,0,10000,10000,8);vm.expectRevert(bytes("ROUND"));p.ethPrice6();
        stock.set(8,250e8,10062,10062,8);vm.expectRevert(bytes("STALE"));p.ethPrice6();
    }
}
