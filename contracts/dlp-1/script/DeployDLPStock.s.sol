// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script,console2} from "forge-std/Script.sol";
import {DLPMarket,IToken6} from "../src/DLPMarket.sol";
import {DLPCoreDeployer,DLPMarketDeployer} from "../src/DLPFactory.sol";
import {DLPStockFactory} from "../src/DLPStockFactory.sol";
import {DLPStockPriceSnapshot} from "../src/DLPStockPriceSnapshot.sol";
import {DLPAssetRouter,IDLPRouterRegistry,IDLPAssetExchange} from "../src/DLPAssetRouter.sol";
/// @notice Configuration-only stock deployment recipe; no addresses or private keys are embedded.
/// @dev Oracle, router, core carrier, market carrier, factory: 5 sequential CREATE transactions.
/// An interrupted broadcast or intervening nonce change must be reconciled before retrying.
contract DeployDLPStock is Script {
    function run() external returns(DLPStockFactory factory) {
        require(block.chainid==vm.envUint("DLP_CHAIN_ID"),"CHAIN");
        address deployer=vm.envAddress("DLP_DEPLOYER");
        IToken6 stock=IToken6(vm.envAddress("DLP_STOCK_TOKEN"));
        address stable=vm.envAddress("DLP_STABLE_TOKEN");
        IDLPAssetExchange exchange=IDLPAssetExchange(vm.envAddress("DLP_EXCHANGE"));
        require(deployer!=address(0) && stable.code.length>0 && address(exchange).code.length>0 && stable!=address(stock),"CONFIG");
        vm.startBroadcast(deployer);
        DLPStockPriceSnapshot oracle=new DLPStockPriceSnapshot(vm.envAddress("DLP_ETH_USD_FEED"),vm.envAddress("DLP_STOCK_USD_FEED"),stock.decimals(),vm.envUint("DLP_ETH_HEARTBEAT"),vm.envUint("DLP_STOCK_HEARTBEAT"),vm.envAddress("DLP_SEQUENCER_FEED"),vm.envUint("DLP_SEQUENCER_GRACE"));
        oracle.ethPrice6();
        address predicted=vm.computeCreateAddress(deployer,vm.getNonce(deployer)+3);
        address[] memory stablecoins=new address[](1);stablecoins[0]=stable;
        DLPAssetRouter router=new DLPAssetRouter(IDLPRouterRegistry(predicted),exchange,stablecoins);
        DLPCoreDeployer cd=new DLPCoreDeployer(predicted);DLPMarketDeployer md=new DLPMarketDeployer(predicted);
        factory=new DLPStockFactory(stock,vm.envAddress("DLP_CORE_FALLBACK_RECIPIENT"),vm.envUint("DLP_STOCK_K_WAD"),oracle,cd,md,address(router));
        require(address(factory)==predicted,"FACTORY");
        require(address(cd).code.length<=24576 && address(factory).code.length<=24576 && address(router).code.length<=24576,"CODE_SIZE");
        require(type(DLPMarket).creationCode.length+224<=49152 && type(DLPMarketDeployer).creationCode.length+32<=49152,"INITCODE_SIZE");
        vm.stopBroadcast();
        console2.log("Stock factory",address(factory));console2.log("Router",address(router));console2.log("Stock oracle",address(oracle));
    }
}
