// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase} from "./TopicMarketBase.sol";
import {TopicMarketRightsToken} from "../src/TopicMarketRightsToken.sol";

contract TopicMarketLiquidityAddTest is TopicMarketBase {
    function testAllBottomLiquidityAPIsLockedBeforeAndAfterGraduation() public {
        vm.expectRevert(); IRemovedMarketAPI(address(market)).quoteAddLP(1);
        vm.expectRevert(); IRemovedMarketAPI(address(market)).quoteExit(1);
        _graduate();
        uint256 col=market.collateralCash(); uint256 supply=market.yesSupply();
        uint256 depth=market.bWad(); uint256 basis=market.poolBasisWad();
        vm.expectRevert(); IRemovedMarketAPI(address(market)).quoteAddLP(1);
        vm.expectRevert(); IRemovedMarketAPI(address(market)).quoteExit(1);
        vm.prank(alice); vm.expectRevert(); IRemovedMarketAPI(address(market)).addLP(1,0,0,0,type(uint64).max);
        uint256 held=market.shares(alice);
        vm.prank(alice); vm.expectRevert(); IRemovedMarketAPI(address(market)).exitLP(held,0,0,0);
        assertEq(market.collateralCash(),col); assertEq(market.yesSupply(),supply);
        assertEq(market.bWad(),depth); assertEq(market.poolBasisWad(),basis); _accounting();
    }
    function testTransferAllLPDoesNotWithdrawUnderlyingOrEnableRestart() public {
        _graduate(); market.materializeLP(alice);
        TopicMarketRightsToken rights=market.lpToken();
        uint256 lp=rights.balanceOf(alice); uint256 col=market.collateralCash();
        vm.prank(alice); rights.transfer(dave,lp);
        assertEq(market.lpToken().balanceOf(alice),0); assertEq(market.lpToken().balanceOf(dave),lp);
        assertEq(market.liquiditySupply(),lp); assertFalse(market.liquidityClosed());
        assertEq(market.collateralCash(),col); assertEq(market.yes(dave)+market.no(dave),0);
        vm.prank(dave); vm.expectRevert(); IRemovedMarketAPI(address(market)).exitLP(lp,0,0,0);
        vm.warp(market.formalCutoff()); market.closeExpired();
        vm.expectRevert(); IRemovedMarketAPI(address(market)).quoteAddLP(lp);
        _accounting();
    }
}

interface IRemovedMarketAPI {
    function quoteAddLP(uint256) external;
    function quoteExit(uint256) external;
    function addLP(uint256,uint256,uint256,uint256,uint64) external;
    function exitLP(uint256,uint256,uint256,uint256) external;
    function transferShares(address,uint256) external;
    function transferOutcome(address,bool,uint256) external;
}
