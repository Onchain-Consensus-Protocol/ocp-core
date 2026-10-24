// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {DLPPriceSnapshot} from "../src/DLPPriceSnapshot.sol";

contract SnapshotFeedMock {
    uint8 public immutable decimals;
    uint80 public roundId = 7;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound = 7;
    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }
    function set(uint80 round_, int256 answer_, uint256 start_, uint256 update_, uint80 answered_) external {
        roundId = round_; answer = answer_; startedAt = start_; updatedAt = update_; answeredInRound = answered_;
    }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

contract DLPPriceSnapshotTest is Test {
    SnapshotFeedMock internal eth;
    SnapshotFeedMock internal usdc;
    DLPPriceSnapshot internal reader;
    function setUp() public {
        vm.warp(10_000);
        eth = new SnapshotFeedMock(8, 2000e8);
        usdc = new SnapshotFeedMock(8, 1e8);
        reader = new DLPPriceSnapshot(address(eth), address(usdc), 3600, 7200);
    }
    function testConvertsUsdToUsdcAndAccountsForDepeg() public {
        assertEq(reader.ethPrice6(), 2000e6);
        usdc.set(8, 0.8e8, block.timestamp, block.timestamp, 8);
        assertEq(reader.ethPrice6(), 2500e6);
    }
    function testMixedDecimalsNormalize() public {
        SnapshotFeedMock eth18 = new SnapshotFeedMock(18, 2000e18);
        SnapshotFeedMock usdc6 = new SnapshotFeedMock(6, 1e6);
        DLPPriceSnapshot mixed = new DLPPriceSnapshot(address(eth18), address(usdc6), 60, 60);
        assertEq(mixed.ethPrice6(), 2000e6);
    }
    function testHeartbeatBoundaryAndIndependentStaleness() public {
        vm.warp(13_600);
        assertEq(reader.ethPrice6(), 2000e6);
        vm.warp(13_601);
        vm.expectRevert("FEED_STALE"); reader.ethPrice6();
        eth.set(8, 2000e8, block.timestamp, block.timestamp, 8);
        vm.warp(17_201);
        eth.set(9, 2000e8, block.timestamp, block.timestamp, 9);
        vm.expectRevert("FEED_STALE"); reader.ethPrice6();
    }
    function testRejectsFutureAndZeroAndInvertedTimes() public {
        eth.set(7, 2000e8, 10_000, 10_001, 7);
        vm.expectRevert("FEED_TIME"); reader.ethPrice6();
        eth.set(7, 2000e8, 0, 0, 7);
        vm.expectRevert("FEED_TIME"); reader.ethPrice6();
        eth.set(7, 2000e8, 10_000, 9999, 7);
        vm.expectRevert("FEED_TIME"); reader.ethPrice6();
    }
    function testRejectsNonpositiveAnswersOnEitherFeed() public {
        eth.set(7, -1, 10_000, 10_000, 7);
        vm.expectRevert("FEED_ANSWER"); reader.ethPrice6();
        eth.set(7, 2000e8, 10_000, 10_000, 7);
        usdc.set(7, 0, 10_000, 10_000, 7);
        vm.expectRevert("FEED_ANSWER"); reader.ethPrice6();
    }
    function testRejectsIncompleteRounds() public {
        eth.set(0, 2000e8, 10_000, 10_000, 7);
        vm.expectRevert("FEED_ROUND"); reader.ethPrice6();
        eth.set(8, 2000e8, 10_000, 10_000, 7);
        vm.expectRevert("FEED_ROUND"); reader.ethPrice6();
    }
    function testRejectsMissingCodeDecimalsAndZeroHeartbeat() public {
        vm.expectRevert("FEED_CODE"); new DLPPriceSnapshot(address(1), address(usdc), 1, 1);
        SnapshotFeedMock bad = new SnapshotFeedMock(19, 1);
        vm.expectRevert("FEED_DECIMALS"); new DLPPriceSnapshot(address(eth), address(bad), 1, 1);
        vm.expectRevert("HEARTBEAT"); new DLPPriceSnapshot(address(eth), address(usdc), 0, 1);
    }
    function testRejectsPriceOutsideMarketBounds() public {
        eth.set(7, 1, 10_000, 10_000, 7);
        usdc.set(7, 1e18, 10_000, 10_000, 7);
        vm.expectRevert("PRICE_RANGE"); reader.ethPrice6();
        eth.set(7, 3e19, 10_000, 10_000, 7);
        usdc.set(7, 1e8, 10_000, 10_000, 7);
        vm.expectRevert("PRICE_RANGE"); reader.ethPrice6();
    }
    function testRejectsNormalizationOverflow() public {
        eth.set(7, type(int256).max, 10_000, 10_000, 7);
        vm.expectRevert("FEED_RANGE"); reader.ethPrice6();
    }
}
