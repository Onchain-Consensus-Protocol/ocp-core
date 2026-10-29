// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script,console2} from "forge-std/Script.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {TopicMarketCoreDeployer,TopicMarketDeployer} from "../src/TopicMarketFactory.sol";
import {TopicMarketTestnetStockFactory} from "../src/TopicMarketTestnetStockFactory.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
/// @notice Deploy the shared factory once; use RegisterTopicMarketStock for each stock.
/// @dev Two carriers then factory: three sequential CREATE transactions. Reconcile interrupted nonces.
contract DeployTopicMarketStock is Script {
    function run() external returns(TopicMarketStockFactory factory) {
        require(block.chainid==vm.envUint("TOPIC_MARKET_CHAIN_ID"),"CHAIN");
        bool fixedTargets=vm.envOr("TOPIC_MARKET_FIXED_TEST_TARGETS",block.chainid==46630);
        require(!fixedTargets || block.chainid==46630,"TESTNET_ONLY");
        require(block.chainid!=46630 || fixedTargets,"TESTNET_PROFILE_REQUIRED");
        address deployer=vm.envAddress("TOPIC_MARKET_DEPLOYER");
        vm.startBroadcast(deployer);
        address predicted=vm.computeCreateAddress(deployer,vm.getNonce(deployer)+2);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);
        TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        if(fixedTargets) factory=new TopicMarketTestnetStockFactory(vm.envAddress("TOPIC_MARKET_OWNER"),vm.envAddress("TOPIC_MARKET_CORE_FALLBACK_RECIPIENT"),cd,md);
        else factory=new TopicMarketStockFactory(vm.envAddress("TOPIC_MARKET_OWNER"),vm.envAddress("TOPIC_MARKET_CORE_FALLBACK_RECIPIENT"),cd,md);
        require(address(factory)==predicted,"FACTORY");
        require(address(cd).code.length<=24576 && address(md).code.length<=24576 && address(factory).code.length<=24576,"CODE_SIZE");
        require(type(TopicMarket).creationCode.length+224<=49152 && type(TopicMarketDeployer).creationCode.length+32<=49152,"INITCODE_SIZE");
        vm.stopBroadcast();
        console2.log("Shared stock factory",address(factory));
        console2.log("Core deployer",address(cd));console2.log("Market deployer",address(md));
    }
}
