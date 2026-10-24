// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";

/// @notice Research fixed-point kernel; inputs/outputs WAD. Not a full-domain accuracy certificate.
library TopicMarketMath {
    error ZeroDepth();
    uint256 internal constant WAD = 1e18;

    function sqrt(uint256 x) internal pure returns (uint256) {
        return Math.sqrt(x);
    }

    function cost(uint256 y, uint256 n, uint256 b) internal pure returns (uint256) {
        if (b == 0) revert ZeroDepth();
        uint256 hi = Math.max(y, n);
        uint256 diff = hi - Math.min(y, n);
        if (diff / b >= 60) return hi;
        uint256 ratio = Math.mulDiv(diff, WAD, b);
        // exp(-60) tail bounded by b*exp(-60); constructor bounds b<=1e30 WAD.
        if (ratio >= 60e18) return hi;
        uint256 ep = ud(ratio).exp().unwrap();
        uint256 en = Math.mulDiv(WAD, WAD, ep);
        return hi + Math.mulDiv(b, ud(WAD + en).ln().unwrap(), WAD);
    }

    function priceYes(uint256 y, uint256 n, uint256 b) internal pure returns (uint256) {
        if (b == 0) revert ZeroDepth();
        uint256 diff = y > n ? y - n : n - y;
        if (diff / b >= 60) return y > n ? WAD : 0;
        uint256 ratio = Math.mulDiv(diff, WAD, b);
        if (ratio >= 60e18) return y > n ? WAD : 0;
        uint256 ep = ud(ratio).exp().unwrap();
        uint256 small = Math.mulDiv(WAD, WAD, WAD + ep);
        return y >= n ? WAD - small : small;
    }
}
