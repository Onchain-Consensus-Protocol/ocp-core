// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarket, IToken6, ITopicMarketCore} from "./TopicMarket.sol";
import {VaultCoreAdapter} from "./VaultCoreAdapter.sol";
import {ITopicMarketPriceSnapshot} from "./TopicMarketPriceSnapshot.sol";

/// @notice Dedicated creation-code carrier. Only the immutable factory can deploy or bind.
contract TopicMarketCoreDeployer {
    address public immutable factory;
    constructor(address factory_) { require(factory_ != address(0), "FACTORY"); factory = factory_; }
    modifier onlyFactory() { require(msg.sender == factory, "ONLY_FACTORY"); _; }
    function deploy(IToken6 token, address creator, address protocol, uint64 end)
        external onlyFactory returns (VaultCoreAdapter)
    { return new VaultCoreAdapter(token, creator, protocol, end); }
    function configureCore(VaultCoreAdapter adapter, address forwarder) external onlyFactory { adapter.configureForwarder(forwarder); }
    function bindCore(VaultCoreAdapter adapter, address market) external onlyFactory { adapter.bind(market); }
}

/// @dev Inert runtime starts with STOP, followed by immutable creation-code bytes.
contract TopicMarketCreationCodeStore {
    constructor(bytes memory payload) {
        bytes memory runtime = abi.encodePacked(bytes1(0), payload);
        assembly { return(add(runtime, 32), mload(runtime)) }
    }
}

/// @notice Creation code is split into inert <=24KB stores rather than embedded in runtime.
contract TopicMarketDeployer {
    address public immutable factory;
    address public immutable codeA;
    address public immutable codeB;
    uint256 public immutable lengthA;
    uint256 public immutable lengthB;
    constructor(address factory_) {
        require(factory_ != address(0), "FACTORY"); factory = factory_;
        bytes memory creation = type(TopicMarket).creationCode;
        uint256 first = creation.length > 24000 ? 24000 : creation.length;
        uint256 second = creation.length - first;
        require(second <= 24000, "INITCODE_SIZE");
        bytes memory a = new bytes(first); bytes memory b = new bytes(second);
        // Copy complete memory words, including only the allocated trailing padding.
        // The stored runtime uses the exact byte-array length, so padding never becomes code.
        assembly {
            let source := add(creation, 32)
            let firstData := add(a, 32)
            for { let i := 0 } lt(i, first) { i := add(i, 32) } {
                mstore(add(firstData, i), mload(add(source, i)))
            }
            let secondData := add(b, 32)
            let secondSource := add(source, first)
            for { let i := 0 } lt(i, second) { i := add(i, 32) } {
                mstore(add(secondData, i), mload(add(secondSource, i)))
            }
        }
        codeA = address(new TopicMarketCreationCodeStore(a)); codeB = address(new TopicMarketCreationCodeStore(b));
        lengthA = first; lengthB = second;
    }
    function deploy(IToken6 token, ITopicMarketCore core, address creator, address protocol,
        uint64 coreEnd, uint256 price, uint256 k) external returns (TopicMarket market)
    {
        require(msg.sender == factory, "ONLY_FACTORY");
        uint256 aLength = lengthA; uint256 bLength = lengthB;
        bytes memory creation = new bytes(aLength + bLength);
        address a = codeA; address b = codeB;
        assembly {
            extcodecopy(a, add(creation, 32), 1, aLength)
            extcodecopy(b, add(add(creation, 32), aLength), 1, bLength)
        }
        bytes memory initcode = abi.encodePacked(creation, abi.encode(token, core, creator, protocol, coreEnd, price, k));
        address deployed;
        assembly { deployed := create(0, add(initcode, 32), mload(initcode)) }
        require(deployed != address(0), "MARKET_DEPLOY_FAILED");
        market = TopicMarket(deployed);
    }
}

/// @notice Zero-principal topic launch; gas is paid by the caller. Immutable configuration.
/// @dev Deploy both carriers using the predicted factory CREATE address, then deploy this factory.
contract TopicMarketFactory {
    IToken6 public immutable token;
    address public immutable protocol;
    uint256 public immutable k;
    ITopicMarketPriceSnapshot public immutable priceOracle;
    TopicMarketCoreDeployer public immutable coreDeployer;
    TopicMarketDeployer public immutable marketDeployer;
    uint256 private entered = 1;
    struct MarketRecord {
        address creator;
        address adapter;
        address vault;
        uint64 createdAt;
        uint64 formalCutoff;
        uint64 coreCutoff;
        uint64 topicCutoff;
        uint256 snapshot;
        string topic;
        string yesRule;
        string noRule;
        string invalidRule;
    }
    mapping(address => MarketRecord) private records;
    address[] public markets;
    event MarketCreated(address indexed market, address indexed creator, address adapter,
        address vault, uint64 createdAt, uint64 genesisCutoff, uint64 formalCutoff, uint64 coreCutoff, uint64 topicCutoff, uint256 snapshot);
    constructor(IToken6 token_, address protocol_, uint256 k_,
        ITopicMarketPriceSnapshot oracle_, TopicMarketCoreDeployer coreDeployer_, TopicMarketDeployer marketDeployer_)
    {
        require(address(token_).code.length > 0 && token_.decimals() == 6, "TOKEN");
        require(protocol_ != address(0) && address(oracle_).code.length > 0, "CONFIG");
        require(k_ >= 1e12 && k_ <= 1e24, "PARAMS");
        require(address(coreDeployer_).code.length > 0 && address(marketDeployer_).code.length > 0, "DEPLOYERS");
        require(coreDeployer_.factory() == address(this) && marketDeployer_.factory() == address(this), "FACTORY_BINDING");
        token = token_; protocol = protocol_; k = k_; priceOracle = oracle_;
        coreDeployer = coreDeployer_; marketDeployer = marketDeployer_;
    }
    function marketCount() external view returns (uint256) { return markets.length; }
    function marketRecord(address market) external view returns (MarketRecord memory) { return records[market]; }
    function _length(string calldata value, uint256 maximum) private pure {
        require(bytes(value).length > 0 && bytes(value).length <= maximum, "METADATA_LENGTH");
    }
    function createMarket(string calldata topic, string calldata yesRule, string calldata noRule,
        string calldata invalidRule, uint64 coreEnd) external returns (address market, address adapter, address vault)
    {
        require(entered == 1, "REENTER"); entered = 2;
        _length(topic, 512); _length(yesRule, 2048); _length(noRule, 2048); _length(invalidRule, 2048);
        require(block.timestamp <= type(uint64).max - 4 hours, "TIME");
        require(uint256(coreEnd) > block.timestamp + 4 hours, "DEADLINES");
        uint256 price = priceOracle.ethPrice6();
        require(price > 0 && price <= 1e18 / 4, "PRICE");
        VaultCoreAdapter createdCore = coreDeployer.deploy(token, msg.sender, protocol, coreEnd);
        TopicMarket createdMarket = marketDeployer.deploy(token, ITopicMarketCore(address(createdCore)), msg.sender,
            protocol, coreEnd, price, k);
        market = address(createdMarket); adapter = address(createdCore); vault = address(createdCore.vault());
        coreDeployer.bindCore(createdCore, market);
        MarketRecord storage record = records[market];
        record.creator = msg.sender; record.adapter = adapter; record.vault = vault;
        record.createdAt = uint64(block.timestamp); record.formalCutoff = coreEnd - 1 hours;
        record.coreCutoff = coreEnd; record.topicCutoff = coreEnd; record.snapshot = price;
        record.topic = topic; record.yesRule = yesRule; record.noRule = noRule; record.invalidRule = invalidRule;
        markets.push(market);
        _emitCreated(market);
        entered = 1;
    }
    function _emitCreated(address market) private {
        MarketRecord storage r = records[market];
        emit MarketCreated(market, r.creator, r.adapter, r.vault, r.createdAt,
            r.coreCutoff - 2 hours, r.formalCutoff, r.coreCutoff, r.topicCutoff, r.snapshot);
    }
}
