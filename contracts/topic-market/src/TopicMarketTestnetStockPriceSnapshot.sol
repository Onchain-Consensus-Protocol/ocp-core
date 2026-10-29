// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ITopicMarketPriceSnapshot,IUsdCollateralSnapshot} from "./TopicMarketPriceSnapshot.sol";

/// @notice Fixed TEST price of 400 USD per canonical Robinhood testnet TSLA token.
/// @dev Not a market oracle or an ETH price. No owner, updates, rounds or freshness promises.
/// Graduation R/B targets belong to the separate testnet Factory profile, not to this reader.
contract TopicMarketTestnetStockPriceSnapshot is ITopicMarketPriceSnapshot,IUsdCollateralSnapshot {
    address public constant TESTNET_TSLA=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    uint256 public constant TESTNET_CHAIN_ID=46630;
    bool public constant testOnly=true;
    bool public constant fixedTestnetUsdPrice=true;
    uint256 public constant unit=1e18;
    uint256 public constant usdPriceWad=400e18;

    constructor(){
        _checkChain();
        require(TESTNET_TSLA.code.length>0,"TOKEN_CODE");
        require(IERC20Metadata(TESTNET_TSLA).decimals()==18,"TOKEN_DECIMALS");
    }
    function _checkChain() private view {require(block.chainid==TESTNET_CHAIN_ID,"TESTNET_ONLY");}

    /// @notice Explicitly unavailable: fixed graduation targets do not imply an ETH/TSLA price.
    function ethPrice6() external view override returns(uint256){
        _checkChain();
        revert("FIXED_TEST_TARGETS");
    }
    /// @notice Round up USD WAD to TSLA raw units; 500 USD equals exactly 1.25 TSLA.
    function collateralForUsd(uint256 usdWad) external view override returns(uint256){
        _checkChain();
        return Math.mulDiv(usdWad,unit,usdPriceWad,Math.Rounding.Ceil);
    }
}
