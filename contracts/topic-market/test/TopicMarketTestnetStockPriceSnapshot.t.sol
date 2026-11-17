// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {TopicMarketTestnetStockPriceSnapshot} from "../src/TopicMarketTestnetStockPriceSnapshot.sol";

/// @dev Metadata fixture only. These unit tests do not establish any public-chain token or feed state.
contract TestnetPriceMetadataFixture {
    uint8 private immutable precision;
    constructor(uint8 d){precision=d;}
    function decimals() external view returns(uint8){return precision;}
}
contract TopicMarketTestnetStockPriceSnapshotTest is Test {
    address constant TSLA=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    function setUp() public {
        vm.chainId(46630);
        TestnetPriceMetadataFixture metadata=new TestnetPriceMetadataFixture(18);
        vm.etch(TSLA,address(metadata).code);
    }
    function testFixedTestPriceAndFiveHundredUsdBondAreSeparateFromEth() public {
        TopicMarketTestnetStockPriceSnapshot p=new TopicMarketTestnetStockPriceSnapshot();
        assertTrue(p.testOnly());assertTrue(p.fixedTestnetUsdPrice());assertEq(p.TESTNET_TSLA(),TSLA);
        assertEq(p.TESTNET_CHAIN_ID(),46630);assertEq(p.unit(),1e18);assertEq(p.usdPriceWad(),400e18);
        assertEq(p.collateralForUsd(500e18),125e16);assertEq(p.collateralForUsd(400e18),1e18);
        vm.expectRevert(bytes("FIXED_TEST_TARGETS"));p.ethPrice6();
    }
    function testZeroAndCeilingAtRawUnitBoundaries() public {
        TopicMarketTestnetStockPriceSnapshot p=new TopicMarketTestnetStockPriceSnapshot();
        assertEq(p.collateralForUsd(0),0);
        assertEq(p.collateralForUsd(1),1);assertEq(p.collateralForUsd(399),1);
        assertEq(p.collateralForUsd(400),1);assertEq(p.collateralForUsd(401),2);
        assertEq(p.collateralForUsd(500e18+1),125e16+1);
    }
    function testConstructorRejectsOtherChainsBeforeTokenRead() public {
        vm.chainId(4663);vm.expectRevert(bytes("TESTNET_ONLY"));new TopicMarketTestnetStockPriceSnapshot();
        vm.chainId(1);vm.expectRevert(bytes("TESTNET_ONLY"));new TopicMarketTestnetStockPriceSnapshot();
    }
    function testAlreadyDeployedReaderRejectsCrossChainUse() public {
        TopicMarketTestnetStockPriceSnapshot p=new TopicMarketTestnetStockPriceSnapshot();
        vm.chainId(4663);vm.expectRevert(bytes("TESTNET_ONLY"));p.collateralForUsd(500e18);
        vm.expectRevert(bytes("TESTNET_ONLY"));p.ethPrice6();
    }
    function testCanonicalTokenMustHaveCodeAndEighteenDecimals() public {
        vm.etch(TSLA,hex"");vm.expectRevert(bytes("TOKEN_CODE"));new TopicMarketTestnetStockPriceSnapshot();
        TestnetPriceMetadataFixture six=new TestnetPriceMetadataFixture(6);vm.etch(TSLA,address(six).code);
        vm.expectRevert(bytes("TOKEN_DECIMALS"));new TopicMarketTestnetStockPriceSnapshot();
    }
    function testFixedPriceHasNoImpliedFreshnessDeadline() public {
        TopicMarketTestnetStockPriceSnapshot p=new TopicMarketTestnetStockPriceSnapshot();
        vm.warp(block.timestamp+365 days);assertEq(p.collateralForUsd(500e18),125e16);
    }
    function testFuzzCeilingMatchesIndependentIntegerDivisionWithoutProductOverflow(uint256 usdWad) public {
        TopicMarketTestnetStockPriceSnapshot p=new TopicMarketTestnetStockPriceSnapshot();
        uint256 expected=usdWad/400+(usdWad%400==0?0:1);
        assertEq(p.collateralForUsd(usdWad),expected);
    }
    function testMaximumUsdWadDoesNotOverflowIntermediateProduct() public {
        TopicMarketTestnetStockPriceSnapshot p=new TopicMarketTestnetStockPriceSnapshot();uint256 amount=type(uint256).max;
        assertEq(p.collateralForUsd(amount),amount/400+(amount%400==0?0:1));
    }
}
