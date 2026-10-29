// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script,console2} from "forge-std/Script.sol";
import {ITopicMarketPriceSnapshot} from "../src/TopicMarketPriceSnapshot.sol";
import {IToken6} from "../src/TopicMarket.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketStockPriceSnapshot} from "../src/TopicMarketStockPriceSnapshot.sol";
import {TopicMarketAssetRouter,ITopicMarketRouterRegistry,ITopicMarketAssetExchange} from "../src/TopicMarketAssetRouter.sol";
/// @notice Add one stock to the existing factory. Exchange must be an independently verified V3 adapter.
contract RegisterTopicMarketStock is Script {
    function run() external {
        require(block.chainid==vm.envUint("TOPIC_MARKET_CHAIN_ID"),"CHAIN");
        address deployer=vm.envAddress("TOPIC_MARKET_DEPLOYER");
        TopicMarketStockFactory factory=TopicMarketStockFactory(vm.envAddress("TOPIC_MARKET_STOCK_FACTORY"));
        require(address(factory).code.length>0 && factory.owner()==deployer,"OWNER");
        IToken6 stock=IToken6(vm.envAddress("TOPIC_MARKET_STOCK_TOKEN"));
        (ITopicMarketPriceSnapshot existing,,,,)=factory.stocks(address(stock));
        require(address(existing)==address(0),"REGISTERED");
        address stable=vm.envAddress("TOPIC_MARKET_STABLE_TOKEN");
        ITopicMarketAssetExchange exchange=ITopicMarketAssetExchange(vm.envAddress("TOPIC_MARKET_EXCHANGE"));
        require(stable.code.length>0 && address(exchange).code.length>0 && stable!=address(stock),"CONFIG");
        vm.startBroadcast(deployer);
        TopicMarketStockPriceSnapshot oracle=new TopicMarketStockPriceSnapshot(vm.envAddress("TOPIC_MARKET_ETH_USD_FEED"),vm.envAddress("TOPIC_MARKET_STOCK_USD_FEED"),stock.decimals(),vm.envUint("TOPIC_MARKET_ETH_HEARTBEAT"),vm.envUint("TOPIC_MARKET_STOCK_HEARTBEAT"),vm.envAddress("TOPIC_MARKET_SEQUENCER_FEED"),vm.envUint("TOPIC_MARKET_SEQUENCER_GRACE"));
        oracle.ethPrice6();
        address[] memory stablecoins=new address[](1);stablecoins[0]=stable;
        TopicMarketAssetRouter router=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(address(factory)),exchange,stablecoins);
        factory.registerStock(stock,vm.envUint("TOPIC_MARKET_STOCK_K_WAD"),oracle,address(router));
        vm.stopBroadcast();
        console2.log("Stock",address(stock));console2.log("Router",address(router));console2.log("Stock oracle",address(oracle));
    }
}
