// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import "../src/core/OCPVault.sol";
import "../src/factory/OCPVaultFactory.sol";
import "../src/market/PredictionMarket.sol";
import "./PredictionMarket.t.sol";

contract PredictionMarketHandler is Test {
    PredictionMarket public immutable market;
    PredictionMarketTestToken public immutable token;
    address[4] public actors;

    constructor(PredictionMarket market_, PredictionMarketTestToken token_) {
        market = market_;
        token = token_;
        actors = [address(0xA1), address(0xA2), address(0xA3), address(0xA4)];
        for (uint256 i; i < actors.length; ++i) {
            token.mint(actors[i], 10_000_000e6);
            vm.prank(actors[i]);
            token.approve(address(market), type(uint256).max);
        }
    }

    function buy(uint256 actorSeed, bool isYes, uint96 rawShares) external {
        address actor = actors[actorSeed % actors.length];
        uint256 shares = bound(uint256(rawShares), 1_000, 10_000e6);
        (uint256 totalCost,) = market.quoteBuy(isYes, shares);
        if (token.balanceOf(actor) < totalCost) return;

        vm.prank(actor);
        if (isYes) {
            market.buyYes(shares, totalCost, block.timestamp);
        } else {
            market.buyNo(shares, totalCost, block.timestamp);
        }
    }

    function sell(uint256 actorSeed, bool isYes, uint96 rawShares) external {
        address actor = actors[actorSeed % actors.length];
        uint256 owned = isYes ? market.yesShares(actor) : market.noShares(actor);
        if (owned == 0) return;
        uint256 shares = bound(uint256(rawShares), 1, owned);

        try market.quoteSell(isYes, shares) returns (uint256 payout, uint256) {
            vm.prank(actor);
            if (isYes) {
                market.sellYes(shares, payout, block.timestamp);
            } else {
                market.sellNo(shares, payout, block.timestamp);
            }
        } catch {
            // 极小份额可能因保守取整不足一个抵押品最小单位而不可卖。
        }
    }

    function sumUserShares(bool isYes) external view returns (uint256 sum) {
        for (uint256 i; i < actors.length; ++i) {
            sum += isYes ? market.yesShares(actors[i]) : market.noShares(actors[i]);
        }
    }
}

contract PredictionMarketInvariantTest is StdInvariant, Test {
    PredictionMarketTestToken internal token;
    PredictionMarket internal market;
    PredictionMarketHandler internal handler;

    function setUp() public {
        token = new PredictionMarketTestToken();
        OCPVaultFactory vaultFactory =
            new OCPVaultFactory(address(token), address(0xFEE));

        uint256 deadline = block.timestamp + 365 days;
        token.mint(address(this), 1_000_000e6);
        token.approve(address(vaultFactory), type(uint256).max);
        (address vaultAddress, address marketAddress) = vaultFactory.createMarket(
            address(token), deadline, 1e6, 1_000e6, "Invariant", "YES / NO / INVALID"
        );
        OCPVault vault = OCPVault(vaultAddress);
        address yesVoter = address(0x1E5);
        address noVoter = address(0xB0);
        token.mint(yesVoter, 1e6);
        token.mint(noVoter, 1e6);
        vm.startPrank(yesVoter);
        token.approve(vaultAddress, 1e6);
        vault.stake(IOCPVault.Side.YES, 1e6);
        vm.stopPrank();
        vm.startPrank(noVoter);
        token.approve(vaultAddress, 1e6);
        vault.stake(IOCPVault.Side.NO, 1e6);
        vm.stopPrank();

        market = PredictionMarket(marketAddress);

        handler = new PredictionMarketHandler(market, token);
        targetContract(address(handler));
    }

    function invariant_coreBalanceAlwaysCoversEveryPossibleWinner() public view {
        uint256 coreBalance = token.balanceOf(address(market)) - market.accruedFees();
        uint256 maxBinaryLiability = Math.max(market.totalYesShares(), market.totalNoShares());
        assertGe(coreBalance, maxBinaryLiability + 2);
    }

    function invariant_aggregateSharesEqualAllUserPositions() public view {
        assertEq(handler.sumUserShares(true), market.totalYesShares());
        assertEq(handler.sumUserShares(false), market.totalNoShares());
    }

    function invariant_pricesAreComplementary() public view {
        (uint256 yesPrice, uint256 noPrice) = market.getYesNoPrice();
        assertEq(yesPrice + noPrice, 1e18);
        assertLe(yesPrice, 1e18);
        assertLe(noPrice, 1e18);
    }
}
