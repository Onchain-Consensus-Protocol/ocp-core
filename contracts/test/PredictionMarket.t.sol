// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

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
    address internal constant OUTSIDER = address(0xBAD);

    uint256 internal constant USDC = 1e6;
    uint256 internal constant B = 1_000 * USDC;
    uint256 internal constant MIN_STAKE = 1 * USDC;
    uint256 internal constant FEE_INDEX_PRECISION = 1e30;

    struct LifecycleFees {
        uint256 buyYes;
        uint256 buyNo;
        uint256 sellYes;
        uint256 secondBuyNo;
    }

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

    function test_e2eYesRealTradesStakeTopUpSettlementAndAllFeeClaims() public {
        _assertCanonicalPair();
        LifecycleFees memory fees = _runFirstTradeStage();

        // Alice 此时才进入 YES，不能追溯领取第一阶段手续费。
        _stake(ALICE, IOCPVault.Side.YES, 101 * USDC);
        fees = _runSecondTradeStage(fees);

        uint256 earlyIndex =
            _indexDelta(fees.buyYes, 100 * USDC) + _indexDelta(fees.buyNo, 100 * USDC);
        uint256 finalIndex = earlyIndex + _indexDelta(fees.sellYes, 201 * USDC)
            + _indexDelta(fees.secondBuyNo, 201 * USDC);
        uint256 expectedYesVoter = _rewardFromIndex(100 * USDC, finalIndex);
        uint256 expectedAlice = _rewardFromIndex(101 * USDC, finalIndex)
            - _rewardFromIndex(101 * USDC, earlyIndex);
        (uint256 yesVoterYes,,) = vault.conditionalMarketFees(YES_VOTER);
        (uint256 aliceYes,,) = vault.conditionalMarketFees(ALICE);
        assertEq(yesVoterYes, expectedYesVoter);
        assertEq(aliceYes, expectedAlice);
        _assertTradeFeeAccounting(fees);

        vm.warp(deadline);
        market.resolve();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));
        assertEq(uint256(market.outcome()), uint256(IPredictionMarket.Outcome.YES));
        _assertSettlementBuckets();

        vm.expectRevert("Not fee eligible");
        vault.claimMarketFeesFor(NO_VOTER);

        _claimForAndAssertRecipient(YES_VOTER, expectedYesVoter);
        _claimForAndAssertRecipient(ALICE, expectedAlice);

        uint256 principalPool = vault.settlementPool();
        uint256 firstPrincipal = _withdrawDelta(YES_VOTER);
        uint256 secondPrincipal = _withdrawDelta(ALICE);
        assertEq(firstPrincipal, Math.mulDiv(principalPool, 100 * USDC, 201 * USDC));
        assertEq(secondPrincipal, principalPool - firstPrincipal);
        assertEq(_withdrawDelta(NO_VOTER), 0);
        vm.expectRevert("Fees already claimed");
        vault.claimMarketFeesFor(ALICE);

        _claimAllOfficialFeesAndAssertVaultConservation(expectedYesVoter + expectedAlice);
        _assertPmRedemption(IPredictionMarket.Outcome.YES);
    }

    function test_e2eNoRealTradesStakeTopUpSettlementAndAllFeeClaims() public {
        _assertCanonicalPair();
        LifecycleFees memory fees = _runFirstTradeStage();

        // Bob 此时才进入 NO，不能追溯领取第一阶段手续费。
        _stake(BOB, IOCPVault.Side.NO, 101 * USDC);
        fees = _runSecondTradeStage(fees);

        uint256 earlyIndex =
            _indexDelta(fees.buyYes, 100 * USDC) + _indexDelta(fees.buyNo, 100 * USDC);
        uint256 finalIndex = earlyIndex + _indexDelta(fees.sellYes, 201 * USDC)
            + _indexDelta(fees.secondBuyNo, 201 * USDC);
        uint256 expectedNoVoter = _rewardFromIndex(100 * USDC, finalIndex);
        uint256 expectedBob = _rewardFromIndex(101 * USDC, finalIndex)
            - _rewardFromIndex(101 * USDC, earlyIndex);
        (, uint256 noVoterNo,) = vault.conditionalMarketFees(NO_VOTER);
        (, uint256 bobNo,) = vault.conditionalMarketFees(BOB);
        assertEq(noVoterNo, expectedNoVoter);
        assertEq(bobNo, expectedBob);
        _assertTradeFeeAccounting(fees);

        vm.warp(deadline);
        market.resolve();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.NO));
        assertEq(uint256(market.outcome()), uint256(IPredictionMarket.Outcome.NO));
        _assertSettlementBuckets();

        vm.expectRevert("Not fee eligible");
        vault.claimMarketFeesFor(YES_VOTER);
        _claimForAndAssertRecipient(NO_VOTER, expectedNoVoter);
        _claimForAndAssertRecipient(BOB, expectedBob);

        uint256 principalPool = vault.settlementPool();
        uint256 firstPrincipal = _withdrawDelta(NO_VOTER);
        uint256 secondPrincipal = _withdrawDelta(BOB);
        assertEq(firstPrincipal, Math.mulDiv(principalPool, 100 * USDC, 201 * USDC));
        assertEq(secondPrincipal, principalPool - firstPrincipal);
        assertEq(_withdrawDelta(YES_VOTER), 0);
        vm.expectRevert("Fees already claimed");
        vault.claimMarketFeesFor(BOB);

        _claimAllOfficialFeesAndAssertVaultConservation(expectedNoVoter + expectedBob);
        _assertPmRedemption(IPredictionMarket.Outcome.NO);
    }

    function test_e2eInvalidRealTradesStakeTopUpSettlementAndAllFeeClaims() public {
        _assertCanonicalPair();
        LifecycleFees memory fees = _runFirstTradeStage();

        _stake(ALICE, IOCPVault.Side.YES, 100 * USDC);
        _stake(BOB, IOCPVault.Side.INVALID, 100 * USDC);
        fees = _runSecondTradeStage(fees);

        uint256 earlyIndex =
            _indexDelta(fees.buyYes, 200 * USDC) + _indexDelta(fees.buyNo, 200 * USDC);
        uint256 finalIndex = earlyIndex + _indexDelta(fees.sellYes, 300 * USDC)
            + _indexDelta(fees.secondBuyNo, 300 * USDC);
        uint256 expectedYesVoter = _rewardFromIndex(100 * USDC, finalIndex);
        uint256 expectedNoVoter = expectedYesVoter;
        uint256 expectedAlice = _rewardFromIndex(100 * USDC, finalIndex)
            - _rewardFromIndex(100 * USDC, earlyIndex);
        (,, uint256 yesVoterInvalid) = vault.conditionalMarketFees(YES_VOTER);
        (,, uint256 noVoterInvalid) = vault.conditionalMarketFees(NO_VOTER);
        (,, uint256 aliceInvalid) = vault.conditionalMarketFees(ALICE);
        (,, uint256 bobInvalid) = vault.conditionalMarketFees(BOB);
        assertEq(yesVoterInvalid, expectedYesVoter);
        assertEq(noVoterInvalid, expectedNoVoter);
        assertEq(aliceInvalid, expectedAlice);
        assertEq(bobInvalid, 0);
        _assertTradeFeeAccounting(fees);

        vm.warp(deadline);
        market.resolve();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.INVALID));
        assertEq(uint256(market.outcome()), uint256(IPredictionMarket.Outcome.INVALID));
        _assertSettlementBuckets();

        vm.expectRevert("Not fee eligible");
        vault.claimMarketFeesFor(BOB);
        _claimForAndAssertRecipient(YES_VOTER, expectedYesVoter);
        _claimForAndAssertRecipient(NO_VOTER, expectedNoVoter);
        _claimForAndAssertRecipient(ALICE, expectedAlice);

        uint256 principalPool = vault.settlementPool();
        assertEq(_withdrawDelta(YES_VOTER), 100 * USDC);
        assertEq(_withdrawDelta(NO_VOTER), 100 * USDC);
        assertEq(_withdrawDelta(ALICE), 100 * USDC);
        assertEq(_withdrawDelta(BOB), principalPool - 300 * USDC);
        vm.expectRevert("Fees already claimed");
        vault.claimMarketFeesFor(YES_VOTER);

        _claimAllOfficialFeesAndAssertVaultConservation(
            expectedYesVoter + expectedNoVoter + expectedAlice
        );
        _assertPmRedemption(IPredictionMarket.Outcome.INVALID);
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

    function _assertCanonicalPair() internal view {
        assertTrue(vaultFactory.isVault(address(vault)));
        assertTrue(vaultFactory.isMarket(address(market)));
        assertEq(vaultFactory.marketByVault(address(vault)), address(market));
        assertEq(vaultFactory.vaultByMarket(address(market)), address(vault));
        assertEq(vault.market(), address(market));
        assertEq(market.vault(), address(vault));
    }

    function _runFirstTradeStage() internal returns (LifecycleFees memory fees) {
        fees.buyYes = _buyAndRecordVaultFee(ALICE, true, 120 * USDC);
        fees.buyNo = _buyAndRecordVaultFee(BOB, false, 90 * USDC);
    }

    function _runSecondTradeStage(LifecycleFees memory fees)
        internal
        returns (LifecycleFees memory)
    {
        fees.sellYes = _sellAndRecordVaultFee(ALICE, true, 40 * USDC);
        fees.secondBuyNo = _buyAndRecordVaultFee(BOB, false, 30 * USDC);
        return fees;
    }

    function _buyAndRecordVaultFee(address user, bool isYes, uint256 shares)
        internal
        returns (uint256 vaultFee)
    {
        (uint256 totalCost, uint256 quotedFee) = market.quoteBuy(isYes, shares);
        uint256 gross = totalCost - quotedFee;
        vaultFee = gross * 100 / 10_000;
        assertEq(quotedFee, _ceilFee(gross));

        uint256 accruedBefore = vault.totalMarketFeesAccrued();
        uint256 protocolBefore = market.pendingProtocolLpFees();
        assertEq(_buy(user, isYes, shares), totalCost);
        assertEq(vault.totalMarketFeesAccrued() - accruedBefore, vaultFee);
        assertEq(
            market.pendingProtocolLpFees() - protocolBefore, quotedFee - vaultFee
        );
        assertEq(token.allowance(address(market), address(vault)), 0);
    }

    function _sellAndRecordVaultFee(address user, bool isYes, uint256 shares)
        internal
        returns (uint256 vaultFee)
    {
        (uint256 quotedPayout, uint256 quotedFee) = market.quoteSell(isYes, shares);
        uint256 gross = quotedPayout + quotedFee;
        vaultFee = gross * 100 / 10_000;
        assertEq(quotedFee, _ceilFee(gross));

        uint256 accruedBefore = vault.totalMarketFeesAccrued();
        uint256 protocolBefore = market.pendingProtocolLpFees();
        vm.prank(user);
        uint256 payout = isYes
            ? market.sellYes(shares, quotedPayout, block.timestamp)
            : market.sellNo(shares, quotedPayout, block.timestamp);
        assertEq(payout, quotedPayout);
        assertEq(vault.totalMarketFeesAccrued() - accruedBefore, vaultFee);
        assertEq(
            market.pendingProtocolLpFees() - protocolBefore, quotedFee - vaultFee
        );
        assertEq(token.allowance(address(market), address(vault)), 0);
    }

    function _indexDelta(uint256 fee, uint256 denominator)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(fee, FEE_INDEX_PRECISION, denominator);
    }

    function _rewardFromIndex(uint256 stake, uint256 index)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(stake, index, FEE_INDEX_PRECISION);
    }

    function _totalVaultFees(LifecycleFees memory fees)
        internal
        pure
        returns (uint256)
    {
        return fees.buyYes + fees.buyNo + fees.sellYes + fees.secondBuyNo;
    }

    function _assertTradeFeeAccounting(LifecycleFees memory fees) internal view {
        uint256 totalVaultFees = _totalVaultFees(fees);
        assertGt(totalVaultFees, 0);
        assertEq(vault.totalMarketFeesAccrued(), totalVaultFees);
        assertEq(market.totalVaultFeesPaid(), totalVaultFees);
        assertEq(market.pendingVaultFees(), 0);
        assertEq(market.feeEscrow(), market.pendingProtocolLpFees());
    }

    function _assertSettlementBuckets() internal view {
        assertTrue(vault.resolved());
        assertTrue(vault.settlementReady());
        assertTrue(market.resolved());
        assertEq(vault.marketFeesInSettlementPool(), vault.totalMarketFeesAccrued());
        assertEq(vault.settlementPool(), vault.totalPrincipal());
        assertEq(vault.remainingSettlementPool(), vault.settlementPool());
        assertEq(
            vault.marketFeeUserPoolRemaining() + vault.officialMarketFeesClaimable(),
            vault.totalMarketFeesAccrued()
        );
        assertEq(
            token.balanceOf(address(vault)),
            vault.settlementPool() + vault.totalMarketFeesAccrued()
        );
    }

    function _claimAllOfficialFeesAndAssertVaultConservation(uint256 userFeesPaid)
        internal
    {
        uint256 vaultOfficialFees = vault.officialMarketFeesClaimable();
        uint256 protocolFees = market.pendingProtocolLpFees();
        assertEq(userFeesPaid + vaultOfficialFees, vault.totalMarketFeesAccrued());
        assertEq(vault.marketFeeUserPoolRemaining(), 0);
        assertEq(vault.remainingSettlementPool(), 0);
        assertEq(vault.remainingMarketFeeClaims(), 0);
        assertEq(vault.remainingEligibleClaims(), 0);

        uint256 treasuryBefore = token.balanceOf(TREASURY);
        uint256 outsiderBefore = token.balanceOf(OUTSIDER);
        vm.startPrank(OUTSIDER);
        if (vaultOfficialFees > 0) {
            vault.claimOfficialMarketFees();
        }
        if (protocolFees > 0) {
            market.claimProtocolLpFees();
        }
        vm.stopPrank();

        assertEq(
            token.balanceOf(TREASURY) - treasuryBefore, vaultOfficialFees + protocolFees
        );
        assertEq(token.balanceOf(OUTSIDER), outsiderBefore);
        assertEq(vault.officialMarketFeesClaimable(), 0);
        assertEq(vault.marketFeeUserPoolRemaining(), 0);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(market.pendingProtocolLpFees(), 0);
        assertEq(market.feeEscrow(), 0);

        vm.expectRevert("Nothing to claim");
        vault.claimOfficialMarketFees();
        vm.expectRevert(PredictionMarket.NoFees.selector);
        market.claimProtocolLpFees();
    }

    function _assertPmRedemption(IPredictionMarket.Outcome expectedOutcome) internal {
        uint256 expectedAlice;
        uint256 expectedBob;
        if (expectedOutcome == IPredictionMarket.Outcome.YES) {
            expectedAlice = 80 * USDC;
        } else if (expectedOutcome == IPredictionMarket.Outcome.NO) {
            expectedBob = 120 * USDC;
        } else {
            expectedAlice = 40 * USDC;
            expectedBob = 60 * USDC;
        }

        uint256 aliceBefore = token.balanceOf(ALICE);
        vm.prank(ALICE);
        assertEq(market.redeem(), expectedAlice);
        assertEq(token.balanceOf(ALICE) - aliceBefore, expectedAlice);

        uint256 bobBefore = token.balanceOf(BOB);
        vm.prank(BOB);
        assertEq(market.redeem(), expectedBob);
        assertEq(token.balanceOf(BOB) - bobBefore, expectedBob);

        assertEq(market.yesShares(ALICE), 0);
        assertEq(market.noShares(BOB), 0);
        assertEq(market.totalYesShares(), 0);
        assertEq(market.totalNoShares(), 0);
        assertEq(market.remainingLiability(), 0);

        vm.prank(ALICE);
        vm.expectRevert(PredictionMarket.NoShares.selector);
        market.redeem();
    }

    function _claimForAndAssertRecipient(address user, uint256 expected) internal {
        uint256 userBefore = token.balanceOf(user);
        uint256 outsiderBefore = token.balanceOf(OUTSIDER);
        vm.prank(OUTSIDER);
        assertEq(vault.claimMarketFeesFor(user), expected);
        assertEq(token.balanceOf(user) - userBefore, expected);
        assertEq(token.balanceOf(OUTSIDER), outsiderBefore);
    }

    function _withdrawDelta(address user) internal returns (uint256 amount) {
        uint256 balanceBefore = token.balanceOf(user);
        vm.prank(user);
        vault.withdraw();
        return token.balanceOf(user) - balanceBefore;
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
