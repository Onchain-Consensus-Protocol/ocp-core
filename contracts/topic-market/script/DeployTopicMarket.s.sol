// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script, console2} from "forge-std/Script.sol";
import {TopicMarket, IToken6} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";
import {TopicMarketFactory, TopicMarketCoreDeployer, TopicMarketDeployer} from "../src/TopicMarketFactory.sol";
import {TopicMarketPriceSnapshot} from "../src/TopicMarketPriceSnapshot.sol";

/// @notice Explicit configuration only; no network, token, key or oracle defaults.
/// @dev Run a simulation first. This script never creates a topic or stakes user funds.
contract DeployTopicMarket is Script {
    function run() external returns (TopicMarketFactory factory) {
        require(block.chainid == vm.envUint("TOPIC_MARKET_CHAIN_ID"), "WRONG_CHAIN");
        address deployer = vm.envAddress("TOPIC_MARKET_DEPLOYER");
        IToken6 token = IToken6(vm.envAddress("TOPIC_MARKET_TOKEN"));
        address protocol = vm.envAddress("TOPIC_MARKET_CORE_FALLBACK_RECIPIENT");
        address ethFeed = vm.envAddress("TOPIC_MARKET_ETH_USD_FEED");
        address usdcFeed = vm.envAddress("TOPIC_MARKET_USDC_USD_FEED");
        uint256 ethHeartbeat = vm.envUint("TOPIC_MARKET_ETH_HEARTBEAT");
        uint256 usdcHeartbeat = vm.envUint("TOPIC_MARKET_USDC_HEARTBEAT");
        uint256 k = vm.envUint("TOPIC_MARKET_K_WAD");
        require(deployer != address(0), "DEPLOYER");
        require(type(TopicMarket).creationCode.length + 7 * 32 <= 49152, "MARKET_INITCODE");
        require(type(TopicMarketDeployer).creationCode.length + 32 <= 49152, "CARRIER_INITCODE");
        vm.startBroadcast(deployer);
        TopicMarketPriceSnapshot oracle = new TopicMarketPriceSnapshot(ethFeed, usdcFeed, ethHeartbeat, usdcHeartbeat);
        oracle.ethPrice6(); // Reject misconfigured/stale feeds before deployment can continue.
        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 2);
        TopicMarketCoreDeployer coreDeployer = new TopicMarketCoreDeployer(predicted);
        TopicMarketDeployer marketDeployer = new TopicMarketDeployer(predicted);
        factory = new TopicMarketFactory(token, protocol, k, oracle, coreDeployer, marketDeployer);
        require(address(factory) == predicted, "FACTORY_ADDRESS");
        require(address(factory).code.length <= 24576 && address(coreDeployer).code.length <= 24576, "CODE_SIZE");
        vm.stopBroadcast();
        console2.log("Factory", address(factory));
        console2.log("Oracle", address(oracle));
        console2.log("Core deployer", address(coreDeployer));
        console2.log("Market deployer", address(marketDeployer));
    }
}
