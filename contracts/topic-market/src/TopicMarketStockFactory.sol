// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarket,IToken6,ITopicMarketCore} from "./TopicMarket.sol";
import {VaultCoreAdapter} from "./VaultCoreAdapter.sol";
import {TopicMarketCoreDeployer,TopicMarketDeployer} from "./TopicMarketFactory.sol";
import {ITopicMarketPriceSnapshot} from "./TopicMarketPriceSnapshot.sol";
interface IStockRouterBinding { function factory() external view returns (address); }
interface IStockOracleUnits { function unit() external view returns (uint256); }
/// @notice One immutable collateral configuration and router per factory.
contract TopicMarketStockFactory {
    address public immutable trustedForwarder;
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
        ITopicMarketPriceSnapshot oracle_, TopicMarketCoreDeployer coreDeployer_, TopicMarketDeployer marketDeployer_, address forwarder_)
    {
        require(address(token_).code.length > 0 && token_.decimals() >= 6 && token_.decimals() <= 18, "TOKEN");
        require(protocol_ != address(0) && address(oracle_).code.length > 0, "CONFIG");
        require(k_ >= 1e12 && k_ <= 1e24, "PARAMS");
        require(address(coreDeployer_).code.length > 0 && address(marketDeployer_).code.length > 0, "DEPLOYERS");
        require(coreDeployer_.factory() == address(this) && marketDeployer_.factory() == address(this), "FACTORY_BINDING");
        require(forwarder_.code.length > 0, "FORWARDER");
        require(IStockRouterBinding(forwarder_).factory() == address(this), "ROUTER_BINDING");
        require(IStockOracleUnits(address(oracle_)).unit() == 10 ** token_.decimals(), "ORACLE_UNITS");
        trustedForwarder = forwarder_;
        token = token_; protocol = protocol_; k = k_; priceOracle = oracle_;
        coreDeployer = coreDeployer_; marketDeployer = marketDeployer_;
    }
    function isMarket(address market) external view returns (bool) { return records[market].creator != address(0); }
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
        require(price > 0 && price <= (1e30 / (10 ** (18-token.decimals()))) / 4, "PRICE");
        VaultCoreAdapter createdCore = coreDeployer.deploy(token, msg.sender, protocol, coreEnd);
        coreDeployer.configureCore(createdCore, trustedForwarder);
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
