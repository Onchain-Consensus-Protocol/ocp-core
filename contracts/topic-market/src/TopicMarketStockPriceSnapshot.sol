// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ITopicMarketPriceSnapshot,ITopicMarketAggregator} from "./TopicMarketPriceSnapshot.sol";

/// @notice ETH/stock snapshot in collateral native units. Legacy ethPrice6 selector is retained only for compatibility.
/// @dev Feed addresses/market-hours policy must be verified for each real asset; no token ticker is trusted.
contract TopicMarketStockPriceSnapshot is ITopicMarketPriceSnapshot {
    ITopicMarketAggregator public immutable ethUsd;
    ITopicMarketAggregator public immutable stockUsd;
    ITopicMarketAggregator public immutable sequencer;
    uint256 public immutable ethHeartbeat;
    uint256 public immutable stockHeartbeat;
    uint256 public immutable grace;
    uint256 public immutable unit;
    uint256 public immutable maximum;
    uint256 private immutable ethFactor;
    uint256 private immutable stockFactor;
    constructor(address eth_,address stock_,uint8 collateralDecimals,uint256 ethAge,uint256 stockAge,address sequencer_,uint256 grace_) {
        require(eth_.code.length>0 && stock_.code.length>0,"FEEDS");
        require(collateralDecimals>=6 && collateralDecimals<=18 && ethAge>0 && stockAge>0,"CONFIG");
        uint8 ed=ITopicMarketAggregator(eth_).decimals();uint8 sd=ITopicMarketAggregator(stock_).decimals();
        require(ed<=18 && sd<=18,"DECIMALS");
        require(sequencer_==address(0) || (sequencer_.code.length>0 && grace_>0),"SEQUENCER");
        ethUsd=ITopicMarketAggregator(eth_);stockUsd=ITopicMarketAggregator(stock_);sequencer=ITopicMarketAggregator(sequencer_);
        ethHeartbeat=ethAge;stockHeartbeat=stockAge;grace=grace_;unit=10**collateralDecimals;
        maximum=1e30/(10**(18-collateralDecimals))/4;ethFactor=10**(18-ed);stockFactor=10**(18-sd);
    }
    function _read(ITopicMarketAggregator feed,uint256 age,uint256 factor) private view returns(uint256) {
        (uint80 round,int256 answer,uint256 start,uint256 update,uint80 answered)=feed.latestRoundData();
        require(round>0 && answered>=round && answer>0,"ROUND");
        require(start>0 && update>=start && update<=block.timestamp && block.timestamp-update<=age,"STALE");
        require(uint256(answer)<=type(uint256).max/factor,"RANGE");
        return uint256(answer)*factor;
    }
    function collateralForUsd(uint256 usdWad) external view returns(uint256) {
        // 与毕业价格相同的feed状态/时效约束，按股票代币价格而非一股价格换算。
        _checkSequencer();
        return Math.mulDiv(usdWad, unit, _read(stockUsd,stockHeartbeat,stockFactor), Math.Rounding.Ceil);
    }
    function _checkSequencer() private view {
        if(address(sequencer)!=address(0)) {
            (,int256 answer,uint256 start,uint256 update,)=sequencer.latestRoundData();
            require(answer==0 && start>0 && start<=block.timestamp && update>=start && update<=block.timestamp && block.timestamp-start>grace,"SEQUENCER_DOWN");
        }
    }
    function ethPrice6() external view returns(uint256 value) {
        _checkSequencer();
        value=Math.mulDiv(_read(ethUsd,ethHeartbeat,ethFactor),unit,_read(stockUsd,stockHeartbeat,stockFactor));
        require(value>0 && value<=maximum,"PRICE");
    }
}
