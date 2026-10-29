// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface ITopicMarketPriceSnapshot {
    /// @notice ETH price denominated in USDC, with six decimals.
    function ethPrice6() external view returns (uint256);
}

interface IUsdCollateralSnapshot {
    function collateralForUsd(uint256 usdWad) external view returns (uint256);
}

interface ITopicMarketAggregator {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
    );
}

/// @notice Immutable ETH/USD divided by USDC/USD price reader. Consumers store its result at creation.
/// @dev Feed identity, chain compatibility and heartbeat values must be verified for deployment.
/// This reader does not implement an L2 sequencer-uptime policy.
contract TopicMarketPriceSnapshot is ITopicMarketPriceSnapshot {
    uint256 public constant MAX_PRICE6 = 1e18 / 4;
    ITopicMarketAggregator public immutable ethUsd;
    ITopicMarketAggregator public immutable usdcUsd;
    uint256 public immutable ethHeartbeat;
    uint256 public immutable usdcHeartbeat;
    uint256 public immutable ethNormalization;
    uint256 public immutable usdcNormalization;

    constructor(address ethUsd_, address usdcUsd_, uint256 ethHeartbeat_, uint256 usdcHeartbeat_) {
        require(ethUsd_.code.length > 0 && usdcUsd_.code.length > 0, "FEED_CODE");
        require(ethHeartbeat_ > 0 && usdcHeartbeat_ > 0, "HEARTBEAT");
        uint8 ethDecimals = ITopicMarketAggregator(ethUsd_).decimals();
        uint8 usdcDecimals = ITopicMarketAggregator(usdcUsd_).decimals();
        require(ethDecimals <= 18 && usdcDecimals <= 18, "FEED_DECIMALS");
        ethUsd = ITopicMarketAggregator(ethUsd_);
        usdcUsd = ITopicMarketAggregator(usdcUsd_);
        ethHeartbeat = ethHeartbeat_;
        usdcHeartbeat = usdcHeartbeat_;
        ethNormalization = 10 ** (18 - ethDecimals);
        usdcNormalization = 10 ** (18 - usdcDecimals);
    }

    function _read(ITopicMarketAggregator feed, uint256 heartbeat, uint256 normalization)
        private view returns (uint256)
    {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        require(roundId > 0 && answeredInRound >= roundId, "FEED_ROUND");
        require(answer > 0, "FEED_ANSWER");
        require(startedAt > 0 && updatedAt >= startedAt && updatedAt <= block.timestamp, "FEED_TIME");
        require(block.timestamp - updatedAt <= heartbeat, "FEED_STALE");
        require(uint256(answer) <= type(uint256).max / normalization, "FEED_RANGE");
        return uint256(answer) * normalization;
    }

    /// @notice USD面额按创建时价格换为固定抵押币数量，向上取整避免不足保证金。
    function collateralForUsd(uint256 usdWad) external view returns (uint256) {
        return Math.mulDiv(usdWad, 1e6, _read(usdcUsd, usdcHeartbeat, usdcNormalization), Math.Rounding.Ceil);
    }

    function ethPrice6() external view returns (uint256 price) {
        uint256 eth18 = _read(ethUsd, ethHeartbeat, ethNormalization);
        uint256 usdc18 = _read(usdcUsd, usdcHeartbeat, usdcNormalization);
        price = Math.mulDiv(eth18, 1e6, usdc18);
        require(price > 0 && price <= MAX_PRICE6, "PRICE_RANGE");
    }
}
