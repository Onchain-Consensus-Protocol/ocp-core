// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketStockFactory} from "./TopicMarketStockFactory.sol";
import {TopicMarketCoreDeployer,TopicMarketDeployer} from "./TopicMarketFactory.sol";

/// @notice Robinhood testnet-only TSLA graduation profile, not an ETH/TSLA price source.
contract TopicMarketTestnetStockFactory is TopicMarketStockFactory {
    address public constant TESTNET_TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    bool public constant fixedTestnetGraduation = true;
    uint256 public constant testRTarget = 36e14; // 0.0036 TSLA
    uint256 public constant testBTarget = 6e14;  // 0.0006 TSLA
    constructor(address owner_,address protocol_,TopicMarketCoreDeployer cd_,TopicMarketDeployer md_)
        TopicMarketStockFactory(owner_,protocol_,cd_,md_)
    {
        require(block.chainid == 46630, "TESTNET_ONLY");
    }
    function _graduationBasis(address stock, StockConfig memory config) internal view override returns(uint256) {
        require(block.chainid == 46630 && stock == TESTNET_TSLA && config.decimals == 18, "TESTNET_TSLA_ONLY");
        // 零仅是“固定测试门槛、不使用ETH价格快照”的显式标记，不是ETH行情。
        // Market构造时独立再次检查chainId及真实TSLA地址，然后直接写固定R/B。
        return 0;
    }
}
