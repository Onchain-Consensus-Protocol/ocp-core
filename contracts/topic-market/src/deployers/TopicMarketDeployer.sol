// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarket,IToken6,ITopicMarketCore} from "../TopicMarket.sol";
import {TopicMarketCreationCode} from "./TopicMarketCreationCode.sol";

/// @notice Market creation-code carrier; only the immutable factory may deploy.
contract TopicMarketDeployer {
    address public immutable factory;
    address public immutable codeA;
    address public immutable codeB;
    uint256 public immutable lengthA;
    uint256 public immutable lengthB;
    constructor(address factory_) {
        require(factory_!=address(0),"FACTORY");factory=factory_;
        (codeA,codeB,lengthA,lengthB)=TopicMarketCreationCode.store(type(TopicMarket).creationCode);
    }
    function deploy(IToken6 token,ITopicMarketCore core,address creator,address protocol,uint64 coreEnd,uint256 price,uint256 k)
        external returns(TopicMarket market)
    {
        require(msg.sender==factory,"ONLY_FACTORY");
        address deployed=TopicMarketCreationCode.deploy(codeA,codeB,lengthA,lengthB,abi.encode(token,core,creator,protocol,coreEnd,price,k));
        require(deployed!=address(0),"MARKET_DEPLOY_FAILED");market=TopicMarket(deployed);
    }
}
