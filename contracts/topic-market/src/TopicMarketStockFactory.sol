// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IUsdCollateralSnapshot} from "./interfaces/ITopicMarketPriceSnapshot.sol";
import {TopicMarket,IToken6,ITopicMarketCore} from "./TopicMarket.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VaultCoreAdapter} from "./VaultCoreAdapter.sol";
import {TopicMarketCoreDeployer} from "./deployers/TopicMarketCoreDeployer.sol";
import {TopicMarketDeployer} from "./deployers/TopicMarketDeployer.sol";
import {ITopicMarketPriceSnapshot} from "./interfaces/ITopicMarketPriceSnapshot.sol";
interface IStockRouterBinding { function factory() external view returns (address); }
interface IStockOracleUnits { function unit() external view returns (uint256); }
/// @notice Shared factory with append-only stock configurations and independent markets.
contract TopicMarketStockFactory is Ownable2Step {
    struct StockConfig {
        ITopicMarketPriceSnapshot priceOracle;
        address trustedForwarder;
        uint256 k;
        uint8 decimals;
        bool enabled;
    }
    mapping(address => StockConfig) public stocks;
    address[] public stockTokens;
    mapping(address => address) public marketCollateral;
    event StockRegistered(address indexed stock, address indexed oracle, address indexed router, uint256 k);
    event StockEnabled(address indexed stock, bool enabled);
    address public immutable protocol;
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
    constructor(address owner_, address protocol_, TopicMarketCoreDeployer coreDeployer_,
        TopicMarketDeployer marketDeployer_) Ownable(owner_)
    {
        require(protocol_ != address(0), "CONFIG");
        require(address(coreDeployer_).code.length > 0 && address(marketDeployer_).code.length > 0, "DEPLOYERS");
        require(coreDeployer_.factory() == address(this) && marketDeployer_.factory() == address(this), "FACTORY_BINDING");
        protocol = protocol_; coreDeployer = coreDeployer_; marketDeployer = marketDeployer_;
    }
    modifier nonReentrant() { require(entered == 1, "REENTER"); entered = 2; _; entered = 1; }

    /// @notice Register once. Owner must independently verify token, feeds and V3 route provenance.
    function registerStock(IToken6 token_, uint256 k_, ITopicMarketPriceSnapshot oracle_, address forwarder_)
        external onlyOwner nonReentrant
    {
        address stock = address(token_);
        // 配置只追加、不覆盖；重新启用也沿用原配置，避免改变历史资产身份。
        require(address(stocks[stock].priceOracle) == address(0), "REGISTERED");
        require(stock.code.length > 0, "TOKEN");
        uint8 decimals_ = token_.decimals();
        require(decimals_ >= 6 && decimals_ <= 18, "TOKEN");
        require(address(oracle_).code.length > 0, "CONFIG");
        require(k_ >= 1e12 && k_ <= 1e24, "PARAMS");
        require(forwarder_.code.length > 0, "FORWARDER");
        require(forwarder_ != protocol, "FEE_RECIPIENT_FORWARDER");
        require(IStockRouterBinding(forwarder_).factory() == address(this), "ROUTER_BINDING");
        require(IStockOracleUnits(address(oracle_)).unit() == 10 ** decimals_, "ORACLE_UNITS");
        stocks[stock] = StockConfig(oracle_, forwarder_, k_, decimals_, true);
        stockTokens.push(stock);
        emit StockRegistered(stock, address(oracle_), forwarder_, k_);
        emit StockEnabled(stock, true);
    }
    function setStockEnabled(address stock, bool enabled) external onlyOwner nonReentrant {
        require(address(stocks[stock].priceOracle) != address(0), "UNKNOWN_STOCK");
        // 下架仅限制新市场；不删除市场登记、不改变旧市场路由和领取权限。
        stocks[stock].enabled = enabled;
        emit StockEnabled(stock, enabled);
    }
    function stockCount() external view returns (uint256) { return stockTokens.length; }
    function isMarket(address market) external view returns (bool) { return records[market].creator != address(0); }
    function marketCount() external view returns (uint256) { return markets.length; }
    function marketRecord(address market) external view returns (MarketRecord memory) { return records[market]; }
    function _length(string calldata value, uint256 maximum) private pure {
        require(bytes(value).length > 0 && bytes(value).length <= maximum, "METADATA_LENGTH");
    }
    function createMarket(address stock, string calldata topic, string calldata yesRule, string calldata noRule,
        string calldata invalidRule, uint64 coreEnd) external nonReentrant returns (address market, address adapter, address vault)
    {
        StockConfig memory config = stocks[stock];
        require(config.enabled, "STOCK_DISABLED");
        IToken6 token = IToken6(stock);
        require(token.decimals() == config.decimals, "TOKEN_DECIMALS");
        _length(topic, 512); _length(yesRule, 2048); _length(noRule, 2048); _length(invalidRule, 2048);
        require(block.timestamp <= type(uint64).max - 4 hours, "TIME");
        require(uint256(coreEnd) > block.timestamp + 4 hours, "DEADLINES");
        uint256 price = _graduationBasis(stock, config);
        require(price <= (1e30 / (10 ** (18-config.decimals))) / 4, "PRICE");
        VaultCoreAdapter createdCore = coreDeployer.deploy(token, msg.sender, protocol, coreEnd,
            IUsdCollateralSnapshot(address(config.priceOracle)).collateralForUsd(500e18));
        coreDeployer.configureCore(createdCore, config.trustedForwarder);
        TopicMarket createdMarket = marketDeployer.deploy(token, ITopicMarketCore(address(createdCore)), msg.sender,
            protocol, coreEnd, price, config.k);
        market = address(createdMarket); adapter = address(createdCore); vault = address(createdCore.vault());
        coreDeployer.bindCore(createdCore, market);
        MarketRecord storage record = records[market];
        record.creator = msg.sender; record.adapter = adapter; record.vault = vault;
        record.createdAt = uint64(block.timestamp); record.formalCutoff = coreEnd - 1 hours;
        record.coreCutoff = coreEnd; record.topicCutoff = coreEnd; record.snapshot = price;
        record.topic = topic; record.yesRule = yesRule; record.noRule = noRule; record.invalidRule = invalidRule;
        marketCollateral[market] = stock;
        markets.push(market);
        _emitCreated(market);
    }
    /// @dev Production basis is the real ETH/collateral snapshot. Testnet profiles override only this hook.
    function _graduationBasis(address, StockConfig memory config) internal view virtual returns (uint256) {
        uint256 value = config.priceOracle.ethPrice6();
        require(value > 0, "PRICE");
        return value;
    }

    function _emitCreated(address market) private {
        MarketRecord storage r = records[market];
        emit MarketCreated(market, r.creator, r.adapter, r.vault, r.createdAt,
            r.coreCutoff - 2 hours, r.formalCutoff, r.coreCutoff, r.topicCutoff, r.snapshot);
    }
}
