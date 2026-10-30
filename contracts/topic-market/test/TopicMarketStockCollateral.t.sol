// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {checkMarketInvariants} from "./MarketInvariantCheck.sol";
import {Test} from "forge-std/Test.sol";
import {TopicMarket, IToken6} from "../src/TopicMarket.sol";
import {MockCore} from "./TopicMarketBase.sol";

contract StockCollateralMock is IToken6 {
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(uint8 d) { decimals = d; }
    function mint(address a, uint256 n) external { balanceOf[a] += n; }
    function approve(address a, uint256 n) external returns(bool) { allowance[msg.sender][a] = n; return true; }
    function transfer(address a, uint256 n) external returns(bool) { balanceOf[msg.sender] -= n; balanceOf[a] += n; return true; }
    function transferFrom(address a,address b,uint256 n) external returns(bool) { allowance[a][msg.sender] -= n; balanceOf[a] -= n; balanceOf[b] += n; return true; }
}
contract ForwardedStockCore is MockCore {
    address public immutable trustedForwarder;
    constructor(address f) { trustedForwarder=f; }
}
contract TopicMarketStockCollateralTest is Test {
    function _market(uint8 d) internal returns(StockCollateralMock t, MockCore c, TopicMarket m) {
        t = new StockCollateralMock(d); c = new MockCore();
        m = new TopicMarket(t, c, address(0xc), address(0xf), uint64(block.timestamp+6 hours), 10**d, 1e18);
        c.bind(address(m)); t.mint(address(this),1000*10**d); t.approve(address(m),type(uint256).max);
    }
    function testEquivalentWholeTokenCurveAcrossDecimals() public {
        (, ,TopicMarket six) = _market(6);
        uint256 referenceSupply = six.quoteGenesisBuy(10e6);
        for(uint8 d=6; d<=18; d++) {
            (, ,TopicMarket m) = _market(d);
            uint256 unit=10**d;
            assertEq(m.SCALE(),10**(18-d));
            assertEq(m.LIMIT(),1e12*unit);
            assertEq(m.quoteGenesisBuy(10*unit),referenceSupply);
            m.genesisBuy(10*unit,referenceSupply,type(uint64).max,0);
            assertEq(m.R(),945*unit/100);
            assertEq(m.bToken().totalSupply(),45e16);
            assertTrue(checkMarketInvariants(m));
            m.genesisSell(m.S(),0,type(uint64).max,0);
            assertEq(m.S(),0); assertEq(m.R(),0); assertTrue(checkMarketInvariants(m));
        }
    }
    function testStock18GraduationFormalAndSettlement() public {
        (StockCollateralMock t,MockCore c,TopicMarket m)=_market(18);
        m.genesisBuy(14e18,0,type(uint64).max,1);
        assertEq(m.poolBasisWad(),1323e16);
        assertEq(m.inventoryY(),1323e16);
        uint256 paid=m.quoteFormalBuy(true,1e18);
        m.formalBuy(true,1e18,paid,type(uint64).max);
        assertEq(m.yes(address(this)),1e18);
        m.formalSell(true,5e17,0,type(uint64).max);
        assertTrue(checkMarketInvariants(m));
        vm.warp(m.coreCutoff()); c.resolve(1); m.finalize();
        (uint256 a,uint256 b,uint256 cc,)=m.previewAccount(address(this),1);
        uint256 before=t.balanceOf(address(this)); m.claimAll();
        assertEq(t.balanceOf(address(this))-before,a+b+cc);
        assertTrue(checkMarketInvariants(m));
    }
    function testStock18FailureAndFullRefundRights() public {
        (StockCollateralMock t,,TopicMarket m)=_market(18);
        m.genesisBuy(1e18,0,type(uint64).max,0);
        vm.warp(m.genesisCutoff());m.closeExpired();
        uint256 before=t.balanceOf(address(this)); m.claimAll();
        assertEq(t.balanceOf(address(this))-before,99e16);
        assertTrue(checkMarketInvariants(m));
    }
    function testForwardedOwnershipAndRouterPayout() public {
        StockCollateralMock t=new StockCollateralMock(18);
        ForwardedStockCore c=new ForwardedStockCore(address(this));
        TopicMarket m=new TopicMarket(t, c, address(1), address(2), uint64(block.timestamp+6 hours), 1e18, 1e18);
        c.bind(address(m)); t.mint(address(this),1e18); t.approve(address(m),1e18);
        address user=address(0xa11ce);
        (bool ok,)=address(m).call(abi.encodePacked(abi.encodeCall(m.genesisBuy,(1e18,0,type(uint64).max,0)),user));
        assertTrue(ok); assertGt(m.shares(user),0); assertEq(m.shares(address(this)),0);
        assertEq(m.bToken().balanceOf(user),45e15);
        vm.warp(m.genesisCutoff());m.closeExpired();
        uint256 before=t.balanceOf(address(this));
        (ok,)=address(m).call(abi.encodePacked(abi.encodeCall(m.claimAll,()),user));
        assertTrue(ok);assertEq(t.balanceOf(address(this))-before,99e16);
        assertEq(t.balanceOf(user),0);assertEq(m.shares(user),0);
    }
    function testUntrustedSuffixCannotImpersonate() public {
        (StockCollateralMock t,,TopicMarket m)=_market(18);
        (bool ok,)=address(m).call(abi.encodePacked(abi.encodeCall(m.genesisBuy,(1e18,0,type(uint64).max,0)),address(0xa11ce)));
        assertTrue(ok);assertGt(m.shares(address(this)),0);assertEq(m.shares(address(0xa11ce)),0);
        assertGt(t.balanceOf(address(m)),0);
    }
    function testQuoteBoundsAcrossPrecisions() public {
        for(uint8 d=6;d<=18;d++) {
            (,,TopicMarket m)=_market(d);
            assertGt(m.quoteGenesisBuy(m.LIMIT()),0);
            uint256 tooMuch=m.LIMIT()+1;vm.expectRevert("AMOUNT");m.quoteGenesisBuy(tooMuch);
        }
    }
    function testUnsupportedCollateralDecimalsRejected() public {
        MockCore c=new MockCore();
        for(uint8 d=5;d<=19;d+=14) {
            StockCollateralMock t=new StockCollateralMock(d);
            vm.expectRevert("DECIMALS");
            new TopicMarket(t, c, address(1), address(2), uint64(block.timestamp+6 hours), 1e6, 1e18);
        }
    }
}
