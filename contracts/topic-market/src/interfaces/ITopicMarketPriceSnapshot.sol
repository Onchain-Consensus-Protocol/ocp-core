// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Legacy selector: ETH value in collateral native units, as defined by each reader.
interface ITopicMarketPriceSnapshot {
    function ethPrice6() external view returns(uint256);
}
interface IUsdCollateralSnapshot {
    function collateralForUsd(uint256 usdWad) external view returns(uint256);
}
interface ITopicMarketAggregator {
    function decimals() external view returns(uint8);
    function latestRoundData() external view returns(
        uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound
    );
}
