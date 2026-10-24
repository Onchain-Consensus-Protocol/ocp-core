// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TopicMarketMath} from "../src/TopicMarketMath.sol";

contract TopicMarketMathHarness {
    function cost(uint256 y, uint256 n, uint256 b) external pure returns (uint256) {
        return TopicMarketMath.cost(y, n, b);
    }

    function price(uint256 y, uint256 n, uint256 b) external pure returns (uint256) {
        return TopicMarketMath.priceYes(y, n, b);
    }
}

contract TopicMarketMathTest is Test {
    TopicMarketMathHarness internal harness = new TopicMarketMathHarness();
    uint256 internal constant WAD = 1e18;

    function testIntegerSqrtEdges() public pure {
        assertEq(TopicMarketMath.sqrt(0), 0);
        assertEq(TopicMarketMath.sqrt(1), 1);
        assertEq(TopicMarketMath.sqrt(15), 3);
        assertEq(TopicMarketMath.sqrt(16), 4);
        assertEq(TopicMarketMath.sqrt(type(uint256).max), type(uint128).max);
    }

    function testReferenceCosts() public pure {
        // 以下为独立高精度实数参考值，容差仅覆盖这些样例，不构成全域证书。
        assertApproxEqAbs(TopicMarketMath.cost(0, 0, 150e18), 103972077083991796413, 15000);
        assertApproxEqAbs(TopicMarketMath.cost(1e18, 0, 1e18), 1313261687518222834, 100);
        assertApproxEqAbs(TopicMarketMath.cost(10e18, 0, 1e18), 10000045398899216864, 100);
        assertApproxEqAbs(TopicMarketMath.cost(0, 0, 1), 0, 1);
    }

    function testReferenceProbabilities() public pure {
        assertEq(TopicMarketMath.priceYes(0, 0, WAD), WAD / 2);
        assertApproxEqAbs(TopicMarketMath.priceYes(WAD, 0, WAD), 731058578630004879, 100);
        assertApproxEqAbs(TopicMarketMath.priceYes(0, WAD, WAD), 268941421369995120, 100);
    }

    function testExtremeDifferenceAndAbsoluteCoordinates() public pure {
        assertEq(TopicMarketMath.cost(type(uint256).max, 0, 1), type(uint256).max);
        assertEq(TopicMarketMath.cost(60e18, 0, WAD), 60e18);
        assertEq(TopicMarketMath.priceYes(60e18, 0, WAD), WAD);
        assertEq(TopicMarketMath.priceYes(0, 60e18, WAD), 0);
        assertEq(
            TopicMarketMath.cost(type(uint256).max - 1e18, type(uint256).max - 1e18, WAD),
            type(uint256).max - 1e18 + TopicMarketMath.cost(0, 0, WAD)
        );
    }

    function testRejectZeroDepth() public {
        vm.expectRevert(TopicMarketMath.ZeroDepth.selector);
        harness.cost(0, 0, 0);
        vm.expectRevert(TopicMarketMath.ZeroDepth.selector);
        harness.price(0, 0, 0);
    }

    function testCostOverflowReverts() public {
        vm.expectRevert();
        harness.cost(type(uint256).max, type(uint256).max, WAD);
    }

    function testFuzzSymmetryTranslationAndBounds(uint128 y0, uint128 n0, uint128 b0, uint128 shift0) public pure {
        uint256 y = bound(uint256(y0), 0, 1e30);
        uint256 n = bound(uint256(n0), 0, 1e30);
        uint256 b = bound(uint256(b0), 1e12, 1e28);
        uint256 shift = bound(uint256(shift0), 0, 1e30);
        uint256 c = TopicMarketMath.cost(y, n, b);
        uint256 hi = y > n ? y : n;
        assertEq(c, TopicMarketMath.cost(n, y, b));
        assertEq(TopicMarketMath.cost(y + shift, n + shift, b), c + shift);
        assertGe(c, hi);
        assertLe(c, hi + b);
        assertEq(TopicMarketMath.priceYes(y, n, b) + TopicMarketMath.priceYes(n, y, b), WAD);
    }

    function testFuzzCostMonotonicWithinNumericalTolerance(uint96 y0, uint96 n0, uint96 b0, uint96 delta0) public pure {
        uint256 y = bound(uint256(y0), 0, 1e27);
        uint256 n = bound(uint256(n0), 0, 1e27);
        uint256 b = bound(uint256(b0), 1e12, 1e25);
        uint256 delta = bound(uint256(delta0), 0, 1e25);
        uint256 tolerance = b / 1e14 + 100;
        assertGe(TopicMarketMath.cost(y + delta, n, b) + tolerance, TopicMarketMath.cost(y, n, b));
    }
}
