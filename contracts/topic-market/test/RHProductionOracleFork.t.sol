// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TopicMarket,IToken6} from "../src/TopicMarket.sol";
import {TopicMarketStockFactory} from "../src/TopicMarketStockFactory.sol";
import {TopicMarketCoreDeployer,TopicMarketDeployer} from "../src/TopicMarketFactory.sol";
import {TopicMarketStockPriceSnapshot} from "../src/TopicMarketStockPriceSnapshot.sol";
import {ITopicMarketAggregator} from "../src/TopicMarketPriceSnapshot.sol";
import {TopicMarketAssetRouter,ITopicMarketRouterRegistry} from "../src/TopicMarketAssetRouter.sol";
import {TopicMarketV3Router02Exchange,ITopicMarketV3Router02} from "../src/TopicMarketV3Router02Exchange.sol";
interface IRHStockOracleStatus {
    function oraclePaused() external view returns(bool);
    function uiMultiplier() external view returns(uint256);
}
/// @notice Reads real official feed proxies; never mocks, writes feed storage, or replaces feed code.
/// @dev Address/heartbeat evidence: Chainlink's feeds-robinhood-mainnet.json, retrieved 2026-10-29.
/// Sequencer guard is explicitly disabled in this compatibility test, NOT endorsed for production.
contract RHProductionOracleForkTest is Test {
    address constant ETH_FEED=0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;
    address constant USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER=0xCaf681a66D020601342297493863E78C959E5cb2;
    address[5] stocks=[address(0x322F0929c4625eD5bAd873c95208D54E1c003b2d),0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3,0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa];
    address[5] feeds=[address(0x4A1166a659A55625345e9515b32adECea5547C38),0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15,0x6B22A786bAa607d76728168703a39Ea9C99f2cD0,0xF6f373a037c30F0e5010d854385cA89185AE638b,0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb];
    function setUp() public {
        string memory url=vm.envOr("RH_FORK_RPC",string(""));
        if(bytes(url).length==0){vm.skip(true);return;}
        vm.createSelectFork(url,vm.envOr("RH_ORACLE_FORK_BLOCK",uint256(99917547)));
        assertEq(block.chainid,4663);
    }
    function _read(address feed) private view returns(uint256 price) {
        assertGt(feed.code.length,0);ITopicMarketAggregator a=ITopicMarketAggregator(feed);
        assertEq(a.decimals(),8);
        (uint80 round,int256 answer,uint256 start,uint256 update,uint80 answered)=a.latestRoundData();
        assertGt(round,0);assertGt(answer,0);assertGe(answered,round);
        assertGt(start,0);assertGe(update,start);assertLe(update,block.timestamp);
        assertLe(block.timestamp-update,86400,"real feed stale at pinned block");
        return uint256(answer);
    }
    function testForkOfficialFeedsCreateFiveMarketsWithRealSnapshots() public {
        uint256 eth=_read(ETH_FEED);
        address predicted=vm.computeCreateAddress(address(this),vm.getNonce(address(this))+2);
        TopicMarketCoreDeployer cd=new TopicMarketCoreDeployer(predicted);
        TopicMarketDeployer md=new TopicMarketDeployer(predicted);
        TopicMarketStockFactory factory=new TopicMarketStockFactory(address(this),address(0xF0),cd,md);
        address[] memory stable=new address[](1);stable[0]=USDG;
        for(uint256 i;i<5;i++){
            uint256 stockPrice=_read(feeds[i]);
            assertFalse(IRHStockOracleStatus(stocks[i]).oraclePaused(),"issuer oracle pause");
            assertGt(IRHStockOracleStatus(stocks[i]).uiMultiplier(),0);
            uint8 decimals=IToken6(stocks[i]).decimals();
            TopicMarketStockPriceSnapshot oracle=new TopicMarketStockPriceSnapshot(ETH_FEED,feeds[i],decimals,86400,86400,address(0),0);
            // 官方tokenized-equity feed已包含倍率；独立计算只除一次股票代币价。
            uint256 expected=Math.mulDiv(eth,10**decimals,stockPrice);
            assertEq(oracle.ethPrice6(),expected);
            TopicMarketV3Router02Exchange exchange=new TopicMarketV3Router02Exchange(ITopicMarketV3Router02(ROUTER),stocks[i],USDG,i==0?3000:500);
            TopicMarketAssetRouter router=new TopicMarketAssetRouter(ITopicMarketRouterRegistry(address(factory)),exchange,stable);
            factory.registerStock(IToken6(stocks[i]),1e18,oracle,address(router));
            (address market,,)=factory.createMarket(stocks[i],"official feeds fork","yes","no","invalid",uint64(block.timestamp+6 hours));
            assertEq(factory.marketRecord(market).snapshot,expected);
            assertEq(TopicMarket(market).rTarget(),Math.mulDiv(expected,36,10));
            assertEq(TopicMarket(market).bTarget(),Math.mulDiv(expected,6,10));
            emit log_named_address("official stock feed",feeds[i]);
            emit log_named_uint("ETH in native stock units",expected);
        }
        assertEq(factory.stockCount(),5);assertEq(factory.marketCount(),5);
    }
    function testForkRealFeedsRejectStaleSnapshots() public {
        _read(ETH_FEED);
        uint256 originalTimestamp=vm.getBlockTimestamp();
        for(uint256 i;i<5;i++){
            _read(feeds[i]);
            TopicMarketStockPriceSnapshot oracle=new TopicMarketStockPriceSnapshot(ETH_FEED,feeds[i],IToken6(stocks[i]).decimals(),86400,86400,address(0),0);
            TopicMarketStockPriceSnapshot stockExpiry=new TopicMarketStockPriceSnapshot(ETH_FEED,feeds[i],IToken6(stocks[i]).decimals(),3 days,86400,address(0),0);
            vm.warp(originalTimestamp+86401);
            // 时间推进不会给分叉里的真实喂价造新轮次，因此必须拒绝过期值。
            vm.expectRevert(bytes("STALE"));oracle.ethPrice6();
            // 放宽ETH测试阈值以独立触发股票源过期；生产候选仍用目录86400秒。
            vm.expectRevert(bytes("STALE"));stockExpiry.ethPrice6();
            vm.warp(originalTimestamp);
        }
    }
}
