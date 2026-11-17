// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IToken6} from "../TopicMarket.sol";
import {TopicMarketEarlyTerminationModule} from "../TopicMarketEarlyTerminationModule.sol";
import {VaultCoreAdapter} from "../VaultCoreAdapter.sol";
import {TopicMarketCreationCode} from "./TopicMarketCreationCode.sol";

/// @notice Creation-code carrier; only the immutable factory can deploy, configure or bind.
contract TopicMarketCoreDeployer {
    address public immutable earlyTerminationImplementation;
    address public immutable factory;
    address public immutable codeA;
    address public immutable codeB;
    uint256 public immutable lengthA;
    uint256 public immutable lengthB;
    constructor(address factory_) {
        require(factory_!=address(0),"FACTORY");factory=factory_;
        earlyTerminationImplementation=address(new TopicMarketEarlyTerminationModule());
        (codeA,codeB,lengthA,lengthB)=TopicMarketCreationCode.store(type(VaultCoreAdapter).creationCode);
    }
    modifier onlyFactory(){require(msg.sender==factory,"ONLY_FACTORY");_;}
    function deploy(IToken6 token,address creator,address protocol,uint64 end,uint256 bondAmount)
        external onlyFactory returns(VaultCoreAdapter adapter)
    {
        address deployed=TopicMarketCreationCode.deploy(codeA,codeB,lengthA,lengthB,abi.encode(token,creator,protocol,end,bondAmount));
        require(deployed!=address(0),"CORE_DEPLOY_FAILED");adapter=VaultCoreAdapter(deployed);
    }
    function configureCore(VaultCoreAdapter adapter,address forwarder) external onlyFactory {adapter.configureForwarder(forwarder);}
    function bindCore(VaultCoreAdapter adapter,address market) external onlyFactory {adapter.bind(market);}
}
