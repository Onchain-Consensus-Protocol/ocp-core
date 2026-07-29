// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../src/core/OCPVault.sol";
import "../src/factory/OCPVaultFactory.sol";
import "../src/interfaces/IPredictionMarket.sol";
import "../src/market/PredictionMarket.sol";

contract PredictionMarketTestToken is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "Blocked transfer");
        super._update(from, to, value);
    }
}

contract PredictionMarketTest is Test {
    PredictionMarketTestToken internal token;
    OCPVaultFactory internal vaultFactory;
    OCPVault internal vault;
    PredictionMarket internal market;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant YES_VOTER = address(0x1E5);
    address internal constant NO_VOTER = address(0xB0);
    address internal constant TREASURY = address(0x7EA5);

    uint256 internal constant USDC = 1e6;
    uint256 internal constant B = 1_000 * USDC;
    uint256 internal constant MIN_STAKE = 1 * USDC;

    uint256 internal deadline;

    function setUp() public {
        token = new PredictionMarketTestToken();
        vaultFactory = new OCPVaultFactory(address(token), TREASURY);
        deadline = block.timestamp + 7 days;

        address[5] memory users = [address(this), ALICE, BOB, YES_VOTER, NO_VOTER];
        for (uint256 i; i < users.length; ++i) {
            token.mint(users[i], 1_000_000 * USDC);
        }

        token.approve(address(vaultFactory), type(uint256).max);
        (address vaultAddress, address marketAddress) = vaultFactory.createMarket(
            address(token), deadline, MIN_STAKE, B, "Test", "YES / NO / INVALID"
        );
        vault = OCPVault(vaultAddress);
        market = PredictionMarket(marketAddress);

        _stake(YES_VOTER, IOCPVault.Side.YES, 100 * USDC);
        _stake(NO_VOTER, IOCPVault.Side.NO, 100 * USDC);
    }

    function test_constructorAndAtomicSubsidyActivation() public view {
        assertEq(market.vault(), address(vault));
        assertEq(market.collateral(), address(token));
        assertEq(market.factory(), address(vaultFactory));
        assertEq(market.officialLiquidityPool(), TREASURY);
        assertEq(market.feeBps(), 120);
        assertEq(market.vaultFeeBps(), 100);
        assertEq(market.protocolLpFeeBps(), 20);
        assertEq(market.liquidityParameter(), B);
        assertEq(market.conditionType(), 1);
        assertEq(market.conditionParams(), abi.encode("Test", "YES / NO / INVALID"));
        assertEq(market.resolutionTime(), vault.resolutionTime());
        assertTrue(market.activated());
        assertEq(market.subsidyProvider(), address(this));
        assertEq(market.subsidy(), market.requiredSubsidy());
        assertEq(token.balanceOf(address(market)), market.requiredSubsidy());
        assertEq(market.accruedFees(), 0);

        (uint256 yesPrice, uint256 noPrice) = market.getYesNoPrice();
        assertEq(yesPrice, 0.5e18);
        assertEq(noPrice, 0.5e18);
    }

    function test_buyYesUsesLmsrQuoteAndRaisesYesPrice() public {
        uint256 shares = 100 * USDC;
        (uint256 totalCost, uint256 fee) = market.quoteBuy(true, shares);

        assertApproxEqAbs(totalCost - fee, 51_249_480, 3);
        assertEq(fee, _ceilFee(totalCost - fee));

        uint256 paid = _buy(ALICE, true, shares);
        assertEq(paid, totalCost);
        assertEq(market.yesShares(ALICE), shares);
        assertEq(market.totalYesShares(), shares);
        uint256 gross = totalCost - fee;
        uint256 vaultFee = gross * 100 / 10_000;
        assertEq(vault.totalMarketFeesAccrued(), vaultFee);
        assertEq(market.accruedFees(), fee - vaultFee);

        (uint256 yesPrice, uint256 noPrice) = market.getYesNoPrice();
        assertApproxEqAbs(yesPrice, 0.524979187478939987e18, 3);
        assertEq(yesPrice + noPrice, 1e18);
        assertGe(
            token.balanceOf(address(market)) - market.accruedFees(), market.remainingLiability() + 2
        );
    }

    function test_buyNoMirrorsBuyYes() public {
        uint256 shares = 100 * USDC;
        _buy(ALICE, false, shares);

        (uint256 yesPrice, uint256 noPrice) = market.getYesNoPrice();
        assertLt(yesPrice, 0.5e18);
        assertGt(noPrice, 0.5e18);
        assertEq(market.noShares(ALICE), shares);
    }

    function test_lmsrDifferentialVectors() public {
        (uint256 costAtOneB, uint256 feeAtOneB) = market.quoteBuy(true, B);
        assertApproxEqAbs(costAtOneB - feeAtOneB, 620_114_507, 2);

        (uint256 costAtTenB, uint256 feeAtTenB) = market.quoteBuy(true, 10 * B);
        assertApproxEqAbs(costAtTenB - feeAtTenB, 9_306_898_219, 2);

        (uint256 costAtCutoff, uint256 feeAtCutoff) = market.quoteBuy(true, 42 * B);
        assertApproxEqAbs(costAtCutoff - feeAtCutoff, 41_306_852_820, 2);

        _buy(ALICE, true, B);
        (uint256 yesPrice,) = market.getYesNoPrice();
        assertApproxEqAbs(yesPrice, 0.731058578630004879e18, 3);
    }

    function test_roundTripCannotProfitAndFeesAreSeparated() public {
        uint256 aliceStart = token.balanceOf(ALICE);
        uint256 shares = 100 * USDC;
        (uint256 expectedBuyCost, uint256 buyFee) = market.quoteBuy(true, shares);
        _buy(ALICE, true, shares);

        (uint256 expectedPayout, uint256 sellFee) = market.quoteSell(true, shares);
        vm.prank(ALICE);
        uint256 payout = market.sellYes(shares, expectedPayout, block.timestamp);

        assertEq(payout, expectedPayout);
        assertEq(market.yesShares(ALICE), 0);
        assertEq(market.totalYesShares(), 0);
        assertLt(token.balanceOf(ALICE), aliceStart);
        assertGt(market.accruedFees(), 0);
        assertEq(
            market.totalTradingVolume(),
            (expectedBuyCost - buyFee) + (expectedPayout + sellFee)
        );

        (uint256 yesPrice, uint256 noPrice) = market.getYesNoPrice();
        assertEq(yesPrice, 0.5e18);
        assertEq(noPrice, 0.5e18);
    }

    function test_splitTradesCannotImproveOnBatchThroughRounding() public {
        uint256 totalShares = 1_000 * USDC;
        (uint256 batchBuyCost,) = market.quoteBuy(true, totalShares);

        uint256 splitBuyCost;
        for (uint256 i; i < 10; ++i) {
            splitBuyCost += _buy(ALICE, true, 100 * USDC);
        }
        assertGe(splitBuyCost, batchBuyCost);

        (uint256 batchSellPayout,) = market.quoteSell(true, totalShares);
        uint256 splitSellPayout;
        for (uint256 i; i < 10; ++i) {
            (uint256 payout,) = market.quoteSell(true, 100 * USDC);
            vm.prank(ALICE);
            splitSellPayout += market.sellYes(100 * USDC, payout, block.timestamp);
        }
        assertLe(splitSellPayout, batchSellPayout);
    }

    function test_slippageAndUserDeadlineProtectTrade() public {
        uint256 shares = 100 * USDC;
        (uint256 quote,) = market.quoteBuy(true, shares);

        vm.startPrank(ALICE);
        token.approve(address(market), quote);
        vm.expectRevert(PredictionMarket.Slippage.selector);
        market.buyYes(shares, quote - 1, block.timestamp);

        vm.expectRevert(PredictionMarket.DeadlineExpired.selector);
        market.buyYes(shares, quote, block.timestamp - 1);
        vm.stopPrank();

        assertEq(market.totalYesShares(), 0);
        assertEq(market.accruedFees(), 0);
    }

    function test_cannotSellAnotherUsersShares() public {
        _buy(ALICE, true, 100 * USDC);

        vm.prank(BOB);
        vm.expectRevert(PredictionMarket.InsufficientShares.selector);
        market.sellYes(1, 0, block.timestamp);
    }

    function test_vaultFeeDepositsPerTradeAndProtocolFeeWaitsForSettlement() public {
        _buy(ALICE, true, 100 * USDC);
        uint256 vaultFees = vault.totalMarketFeesAccrued();
        uint256 protocolFees = market.pendingProtocolLpFees();
        assertGt(vaultFees, 0);
        assertEq(market.pendingVaultFees(), 0);
        assertEq(market.feeEscrow(), protocolFees);
        assertEq(market.totalVaultFeesPaid(), vaultFees);

        vm.prank(TREASURY);
        vm.expectRevert(PredictionMarket.FeesNotSettled.selector);
        market.claimProtocolLpFees();

        vm.warp(deadline);
        market.resolve();
        assertEq(vault.marketFeesInSettlementPool(), vaultFees);
        assertEq(market.feeEscrow(), protocolFees);

        uint256 treasuryBefore = token.balanceOf(TREASURY);

        uint256 withdrawn = market.claimProtocolLpFees();

        assertEq(withdrawn, protocolFees);
        assertEq(token.balanceOf(TREASURY), treasuryBefore + protocolFees);
        assertEq(market.accruedFees(), 0);
        assertGe(token.balanceOf(address(market)), market.remainingLiability());

        vm.expectRevert(PredictionMarket.NoFees.selector);
        market.claimProtocolLpFees();
    }

    function test_vaultFeeDepositFailureRevertsEntireTrade() public {
        uint256 shares = 100 * USDC;
        (uint256 totalCost,) = market.quoteBuy(true, shares);
        uint256 aliceBefore = token.balanceOf(ALICE);
        token.setBlocked(address(vault), true);

        vm.startPrank(ALICE);
        token.approve(address(market), totalCost);
        vm.expectRevert("Blocked transfer");
        market.buyYes(shares, totalCost, block.timestamp);
        vm.stopPrank();

        assertEq(token.balanceOf(ALICE), aliceBefore);
        assertEq(market.yesShares(ALICE), 0);
        assertEq(market.totalYesShares(), 0);
        assertEq(market.feeEscrow(), 0);
        assertEq(vault.totalMarketFeesAccrued(), 0);
    }

    function test_emptyVaultStartsWithMarketAndFinalizesInvalidWithoutLockedFees() public {
        (, address emptyMarketAddress) = vaultFactory.createMarket(
            address(token), deadline, MIN_STAKE, B, "Empty", "YES / NO / INVALID"
        );
        PredictionMarket emptyMarket = PredictionMarket(emptyMarketAddress);
        OCPVault emptyVault = OCPVault(emptyMarket.vault());

        (uint256 totalCost, uint256 totalFee) = emptyMarket.quoteBuy(true, 100 * USDC);
        vm.startPrank(ALICE);
        token.approve(emptyMarketAddress, totalCost);
        emptyMarket.buyYes(100 * USDC, totalCost, block.timestamp);
        vm.stopPrank();

        uint256 vaultFee = emptyVault.totalMarketFeesAccrued();
        uint256 protocolFee = emptyMarket.pendingProtocolLpFees();
        assertEq(vaultFee + protocolFee, totalFee);
        assertEq(emptyMarket.feeEscrow(), protocolFee);
        assertEq(emptyVault.totalPrincipal(), 0);

        vm.warp(deadline);
        emptyMarket.resolve();

        assertEq(uint256(emptyVault.outcome()), uint256(IOCPVault.Outcome.INVALID));
        assertEq(uint256(emptyMarket.outcome()), uint256(IPredictionMarket.Outcome.INVALID));
        assertTrue(emptyVault.settlementReady());
        assertEq(emptyVault.marketFeesInSettlementPool(), vaultFee);
        assertEq(emptyVault.emptySettlementClaimable(), 0);
        assertEq(emptyVault.officialMarketFeesClaimable(), vaultFee);
        assertEq(emptyMarket.feeEscrow(), protocolFee);

        uint256 treasuryBefore = token.balanceOf(TREASURY);
        emptyVault.claimOfficialMarketFees();
        vm.prank(TREASURY);
        emptyMarket.claimProtocolLpFees();
        assertEq(token.balanceOf(TREASURY), treasuryBefore + vaultFee + protocolFee);

        vm.prank(ALICE);
        assertEq(emptyMarket.redeem(), 50 * USDC);
    }

    function test_atomicPairCreationRevertsWithoutSubsidyAllowance() public {
        OCPVaultFactory freshFactory =
            new OCPVaultFactory(address(token), TREASURY);
        vm.expectRevert();
        freshFactory.createMarket(
            address(token), deadline, MIN_STAKE, B, "No allowance", "Description"
        );
        assertEq(freshFactory.getVaults().length, 0);
        assertEq(freshFactory.getMarkets().length, 0);
    }

    function test_tradingClosesAtVaultDeadline() public {
        vm.warp(deadline);
        vm.expectRevert(PredictionMarket.MarketClosed.selector);
        market.buyYes(1 * USDC, type(uint256).max, block.timestamp);
    }

    function test_resolveYesRedeemAndRecoverExcessWithoutTouchingClaims() public {
        uint256 aliceYes = 100 * USDC;
        uint256 bobNo = 60 * USDC;
        _buy(ALICE, true, aliceYes);
        _buy(BOB, false, bobNo);
        _stake(YES_VOTER, IOCPVault.Side.YES, MIN_STAKE);

        vm.warp(deadline);
        market.resolve();
        assertEq(uint256(market.outcome()), uint256(IPredictionMarket.Outcome.YES));

        uint256 providerBefore = token.balanceOf(address(this));
        uint256 excess = market.withdrawSubsidy();
        assertGt(excess, 0);
        assertEq(token.balanceOf(address(this)), providerBefore + excess);
        assertEq(
            token.balanceOf(address(market)), market.accruedFees() + market.remainingLiability()
        );

        uint256 aliceBefore = token.balanceOf(ALICE);
        vm.prank(ALICE);
        uint256 alicePayout = market.redeem();
        assertEq(alicePayout, aliceYes);
        assertEq(token.balanceOf(ALICE), aliceBefore + aliceYes);

        vm.prank(BOB);
        uint256 bobPayout = market.redeem();
        assertEq(bobPayout, 0);
        assertEq(market.remainingLiability(), 0);

        vm.prank(ALICE);
        vm.expectRevert(PredictionMarket.NoShares.selector);
        market.redeem();
    }

    function test_resolveNoPaysOnlyNoShares() public {
        uint256 noShares = 75 * USDC;
        _buy(ALICE, false, noShares);
        _stake(NO_VOTER, IOCPVault.Side.NO, MIN_STAKE);
        vm.warp(deadline);
        market.resolve();

        vm.prank(ALICE);
        assertEq(market.redeem(), noShares);
        assertEq(uint256(market.outcome()), uint256(IPredictionMarket.Outcome.NO));
    }

    function test_invalidPaysFixedHalfPerShareNotEntireBalance() public {
        uint256 aliceYes = 101 * USDC + 1;
        uint256 bobNo = 80 * USDC;
        _buy(ALICE, true, aliceYes);
        _buy(BOB, false, bobNo);

        vm.warp(deadline);
        market.resolve();
        assertEq(uint256(market.outcome()), uint256(IPredictionMarket.Outcome.INVALID));

        uint256 balanceBefore = token.balanceOf(address(market));
        vm.prank(ALICE);
        uint256 alicePayout = market.redeem();
        vm.prank(BOB);
        uint256 bobPayout = market.redeem();

        assertEq(alicePayout, aliceYes / 2);
        assertEq(bobPayout, bobNo / 2);
        assertLt(alicePayout + bobPayout, balanceBefore);
        assertEq(market.remainingLiability(), 0);
    }

    function test_invalidOddBaseUnitsLeaveSafeDustForSubsidyProvider() public {
        _buy(ALICE, true, 1);
        _buy(BOB, false, 1);
        vm.warp(deadline);
        market.resolve();

        market.withdrawSubsidy();
        if (market.pendingProtocolLpFees() > 0) {
            vm.prank(TREASURY);
            market.claimProtocolLpFees();
        }

        vm.prank(ALICE);
        assertEq(market.redeem(), 0);
        vm.prank(BOB);
        assertEq(market.redeem(), 0);

        assertEq(market.remainingLiability(), 0);
        assertEq(token.balanceOf(address(market)), 1);
        assertEq(market.withdrawSubsidy(), 1);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_resolvedMarketCannotTradeEvenIfCalledAgain() public {
        vm.warp(deadline);
        market.resolve();

        vm.expectRevert(PredictionMarket.MarketClosed.selector);
        market.buyYes(1 * USDC, type(uint256).max, block.timestamp);
        market.resolve();
        assertTrue(market.resolved());
        assertTrue(vault.settlementReady());
    }

    function test_factoryIsOwnerControlledAndUsesCanonicalPairRegistry() public {
        vm.prank(ALICE);
        vm.expectRevert();
        vaultFactory.createMarket(
            address(token), deadline, MIN_STAKE, B, "Unauthorized", "Description"
        );

        assertTrue(vaultFactory.isMarket(address(market)));
        assertEq(vaultFactory.marketByVault(address(vault)), address(market));
        assertEq(vaultFactory.vaultByMarket(address(market)), address(vault));
        assertEq(vaultFactory.getMarkets()[0], address(market));
    }

    function test_prefundingNextCreateAddressCannotBlockFactory() public {
        address deployer = address(vaultFactory.marketDeployer());
        uint64 nextNonce = vm.getNonce(deployer);
        address predictedMarket = vm.computeCreateAddress(deployer, nextNonce);
        token.transfer(predictedMarket, 1);

        (, address created) = vaultFactory.createMarket(
            address(token), deadline, MIN_STAKE, B, "Second", "YES / NO / INVALID"
        );
        PredictionMarket secondMarket = PredictionMarket(created);

        assertEq(created, predictedMarket);
        assertEq(secondMarket.subsidy(), secondMarket.requiredSubsidy() + 1);
        assertTrue(secondMarket.activated());
    }

    function testFuzz_buyPricesAreMonotonicAndSolvent(uint96 rawShares) public {
        uint256 shares = bound(uint256(rawShares), 1_000, 100_000 * USDC);
        (uint256 beforeYes,) = market.getYesNoPrice();
        _buy(ALICE, true, shares);
        (uint256 afterYes, uint256 afterNo) = market.getYesNoPrice();

        assertGt(afterYes, beforeYes);
        assertEq(afterYes + afterNo, 1e18);
        assertGe(
            token.balanceOf(address(market)) - market.accruedFees(), market.remainingLiability() + 2
        );
    }

    function testFuzz_roundTripNeverProfits(uint96 rawShares) public {
        uint256 shares = bound(uint256(rawShares), 1_000, 10_000 * USDC);
        uint256 start = token.balanceOf(ALICE);
        _buy(ALICE, true, shares);
        (uint256 payout,) = market.quoteSell(true, shares);
        vm.prank(ALICE);
        market.sellYes(shares, payout, block.timestamp);
        assertLe(token.balanceOf(ALICE), start);
    }

    function testFuzz_lifecycleMarketMakerLossIsBounded(uint96 rawShares) public {
        uint256 shares = bound(uint256(rawShares), 1_000, 100_000 * USDC);
        uint256 lockedSubsidy = market.subsidy();

        _buy(ALICE, true, shares);
        _stake(YES_VOTER, IOCPVault.Side.YES, MIN_STAKE);
        vm.warp(deadline);
        market.resolve();

        vm.prank(ALICE);
        market.redeem();
        uint256 recovered = market.withdrawSubsidy();

        uint256 loss = lockedSubsidy > recovered ? lockedSubsidy - recovered : 0;
        assertLe(loss, market.initialCostX18() / 1e18);
    }

    function _buy(address user, bool isYes, uint256 shares) internal returns (uint256 totalCost) {
        (totalCost,) = market.quoteBuy(isYes, shares);
        vm.startPrank(user);
        token.approve(address(market), totalCost);
        if (isYes) {
            market.buyYes(shares, totalCost, block.timestamp);
        } else {
            market.buyNo(shares, totalCost, block.timestamp);
        }
        vm.stopPrank();
    }

    function _stake(address user, IOCPVault.Side side, uint256 amount) internal {
        vm.startPrank(user);
        token.approve(address(vault), amount);
        vault.stake(side, amount);
        vm.stopPrank();
    }

    function _ceilFee(uint256 gross) internal pure returns (uint256) {
        return (gross * 120 + 9_999) / 10_000;
    }
}
