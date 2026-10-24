// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script,console2} from "forge-std/Script.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {TopicMarketCoreDeployer,TopicMarketDeployer} from "../src/TopicMarketFactory.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketStockPriceSnapshot} from "../src/TopicMarketStockPriceSnapshot.sol";
import {TopicMarketAssetRouter,ITopicMarketRouterRegistry,ITopicMarketAssetExchange} from "../src/TopicMarketAssetRouter.sol";
/// @notice Configuration-only stock deployment recipe; no addresses or private keys are embedded.
/// @dev Oracle, router, core carrier, market carrier, factory: 5 sequential CREATE transactions.
/// An interrupted broadcast or intervening nonce change must be reconciled before retrying.
contract DeployTopicMarketStock is Script {
    function run() external returns(TopicMarketStockFactory factory) {
        require(block.chainid==vm.envUint("TOPIC_MARKET_CHAIN_ID"),"CHAIN");
        address deployer=vm.envAddress("TOPIC_MARKET_DEPLOYER");
        IToken6 stock=IToken6(vm.envAddress("TOPIC_MARKET_STOCK_TOKEN"));
        address stable=vm.envAddress("TOPIC_MARKET_STABLE_TOKEN");
        ITopicMarketAssetExchange exchange=ITopicMarketAssetExchange(vm.envAddress("TOPIC_MARKET_EXCHANGE"));
        require(deployer!=address(0) && stable.code.length>0 && address(exchange).code.length>0 && stable!=address(stock),"CONFIG");
        vm.startBroadcast(deployer);
        TopicMarketStockPriceSnapshot oracle=new TopicMarketStockPriceSnapshot(vm.envAddress("TOPIC_MARKET_ETH_USD_FEED"),vm.envAddress("TOPIC_MARKET_STOCK_USD_FEED"),stock.decimals(),vm.envUint("TOPIC_MARKET_ETH_HEARTBEAT"),vm.envUint("TOPIC_MARKET_STOCK_HEARTBEAT"),vm.envAddress("TOPIC_MARKET_SEQUENCER_FEED"),vm.envUint("TOPIC_MARKET_SEQUENCER_GRACE"));
        oracle.ethPrice6();
        address predicted=vm.computeCreateAddress(deployer,vm.getNonce(deployer)+3);
        address[] memory stablecoins=new address[](1);stablecoins[0]=stable;
        TopicMarketAssetRouter router=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(predicted),exchange,stablecoins);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        factory=new TopicMarketStockFactory(stock,vm.envAddress("TOPIC_MARKET_CORE_FALLBACK_RECIPIENT"),vm.envUint("TOPIC_MARKET_STOCK_K_WAD"),oracle,cd,md,address(router));
        require(address(factory)==predicted,"FACTORY");
        require(address(cd).code.length<=24576 && address(factory).code.length<=24576 && address(router).code.length<=24576,"CODE_SIZE");
        require(type(TopicMarket).creationCode.length+224<=49152 && type(TopicMarketDeployer).creationCode.length+32<=49152,"INITCODE_SIZE");
        vm.stopBroadcast();
        console2.log("Stock factory",address(factory));console2.log("Router",address(router));console2.log("Stock oracle",address(oracle));
    }
}
