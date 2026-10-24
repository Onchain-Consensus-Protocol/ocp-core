// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase, MockCore, MockUSDC} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TopicMarketTest is TopicMarketBase {
    function testThreeDeadlinesAndCoreOpenOnGraduation() public {
        assertEq(market.formalCutoff() + 1 hours, market.coreCutoff());
        assertEq(market.genesisCutoff() + 2 hours, market.formalCutoff());
        assertEq(oracle.openedAt(), 0);
        uint256 now_ = block.timestamp;
        _graduate();
        assertEq(oracle.openedAt(), now_);
        assertEq(oracle.deadline(), market.coreCutoff());
        _accounting();
    }

    function testBuySplitAndSquareQuote() public {
        _buy(alice, 100e3);
        assertEq(market.R(), 94500);
        assertEq(market.B(), 4500);
        assertEq(market.protocolFees(), 0);
        assertEq(market.creatorFees(), 1000);
        assertEq(market.contribution(alice), 4500);
        assertEq(market.S(), Math.sqrt(94500 * 1e30));
        _accounting();
    }

    function testFullRoundtripAndSellerContribution() public {
        _buy(alice, 100e3);
        uint256 bal = market.shares(alice);
        vm.prank(alice);
        market.genesisSell(bal, 0, type(uint64).max, 0);
        // Integer curve reverse may leave at most one microUSDC, isolated from R.
        assertEq(market.S(), 0);
        assertEq(market.R(), 0);
        assertApproxEqAbs(market.B(), 8752, 1);
        assertEq(market.B(), market.contribution(alice));
        _accounting();
    }

    function testSellGraduationFromLegalPath() public {
        _buy(alice, 9e6);
        assertEq(uint256(market.phase()), 0);
        uint256 targetY = Math.mulDiv(market.bTarget() - market.B(), 1000, 45, Math.Rounding.Ceil) + 3;
        uint256 newSupply = Math.sqrt((market.R() - targetY) * 1e30);
        uint256 quantity = market.S() - newSupply + 1;
        vm.prank(alice);
        market.genesisSell(quantity, 0, type(uint64).max, 1);
        assertEq(uint256(market.phase()), 1);
        assertGe(market.initialCollateral(), market.rTarget());
        assertGe(market.B(), market.bTarget());
        _accounting();
    }

    function testBuyGraduationDoesNotCapActualFunds() public {
        _graduate();
        assertEq(market.initialCollateral(), 13230000);
        assertEq(market.B(), 630000);
        assertGt(market.initialCollateral() + market.B(), 4200000);
        _accounting();
    }

    function testGenesisAtExactDeadlineFails() public {
        vm.warp(market.genesisCutoff());
        vm.prank(alice);
        vm.expectRevert("GENESIS_CLOSED");
        market.genesisBuy(1e6, 0, type(uint64).max, 0);
        market.closeExpired();
        assertEq(uint256(market.phase()), 4);
        assertEq(oracle.openedAt(), 0);
    }

    function testNoGenesisAfterGraduation() public {
        _graduate();
        vm.prank(bob);
        vm.expectRevert("GENESIS_CLOSED");
        market.genesisBuy(1e6, 0, type(uint64).max, 0);
    }

    function testIntentAndSlippageRollback() public {
        vm.prank(alice);
        vm.expectRevert("MUST_NOT_GRADUATE");
        market.genesisBuy(14e6, 0, type(uint64).max, 2);
        assertEq(market.S(), 0);
        vm.prank(alice);
        vm.expectRevert("SLIPPAGE");
        market.genesisBuy(1e6, type(uint256).max, type(uint64).max, 0);
        _accounting();
    }

    function testCoreOpenFailureRollsBackUSDC() public {
        oracle.setReject(true);
        uint256 pre = usd.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert("MOCK_CORE");
        market.genesisBuy(14e6, 0, type(uint64).max, 0);
        assertEq(usd.balanceOf(alice), pre);
        assertEq(market.S(), 0);
        assertEq(uint256(market.phase()), 0);
        _accounting();
    }

    function testFormalBuyThenSellFees() public {
        _graduate();
        uint256 beforeB = market.B();
        uint256 beforeZ = market.totalContribution();
        uint256 fee0 = market.lpFees();
        uint256 gross = market.quoteFormalBuy(true, 1e18);
        _formalBuy(bob, true, 1e18);
        assertEq(market.lpFees() - fee0, gross / 200);
        assertEq(market.B(), beforeB + gross / 200);
        assertEq(market.totalContribution(), beforeZ);
        (uint256 sellGross, uint256 net) = market.quoteFormalSell(true, 1e18);
        uint256 cashBefore = market.cash();
        uint256 wallet = usd.balanceOf(bob);
        vm.prank(bob);
        market.formalSell(true, 1e18, net, type(uint64).max);
        assertEq(market.cash(), cashBefore - sellGross);
        assertEq(usd.balanceOf(bob), wallet + net);
        assertLt(net, gross);
        _accounting();
    }

    function testFormalCutoffCoreKeepsOpen() public {
        _graduate();
        vm.warp(market.formalCutoff());
        vm.prank(bob);
        vm.expectRevert("FORMAL_CLOSED");
        market.formalBuy(true, 1e18, type(uint256).max, type(uint64).max);
        market.closeExpired();
        assertEq(uint256(market.phase()), 2);
        assertGt(market.coreCutoff(), block.timestamp);
        vm.expectRevert("CORE_PENDING");
        market.finalize();
        _accounting();
    }

    function testFormalOversellAndInventoryProtection() public {
        _graduate();
        vm.prank(bob);
        vm.expectRevert("HOLDINGS");
        market.formalSell(true, 1e18, 0, type(uint64).max);
        uint256 tooMuch = market.inventoryY() + 1;
        vm.expectRevert("INVENTORY");
        market.quoteFormalBuy(true, tooMuch);
    }

    function testFormalMaxPriceProtectsWallet() public {
        _graduate();
        vm.prank(bob);
        vm.expectRevert("SLIPPAGE");
        market.formalBuy(true, 1e18, 1, type(uint64).max);
        assertEq(market.yes(bob), 0);
        _accounting();
    }







    function testLPTransferPausedDoesNotTransferContribution() public {
        _graduate();
        uint256 z = market.contribution(alice);
        uint256 part = market.shares(alice) / 3;
        vm.prank(alice);
        vm.expectRevert("TRANSFER_NOT_IN_DEMO");
        market.transferShares(bob, part);
        assertEq(market.shares(bob), 0);
        assertEq(market.contribution(alice), z);
        assertEq(market.contribution(bob), 0);
        _finish(2);
        _claimAll(alice);
        _claimAll(bob);
        _accounting();
    }

    function testOutcomeTransferDisabledAndOriginalHolderKeepsPayout() public {
        _graduate();
        _formalBuy(bob, true, 1e18);
        vm.prank(bob);
        vm.expectRevert("TRANSFER_NOT_IN_DEMO");
        market.transferOutcome(carol, true, 1e18);
        _finish(1);
        vm.prank(bob);
        assertEq(market.claimOutcome(), 1e6);
        vm.prank(carol);
        vm.expectRevert("CLAIMED");
        market.claimOutcome();
        _claimAll(alice);
        _accounting();
    }

    function testRepeatedClaimsAndFinalizeRejected() public {
        _graduate();
        _formalBuy(bob, true, 1e18);
        _finish(1);
        _claimAll(alice);
        _claimAll(bob);
        vm.prank(alice);
        vm.expectRevert("CLAIMED");
        market.claimLP();
        vm.prank(alice);
        vm.expectRevert("CLAIMED");
        market.claimB();
        vm.expectRevert("CORE_PENDING");
        market.finalize();
        _accounting();
    }

    function testSettlementYes() public {
        _settleCase(1);
    }

    function testSettlementNo() public {
        _settleCase(2);
    }

    function testSettlementInvalid() public {
        _settleCase(3);
    }

    function _settleCase(uint8 r) internal {
        _graduate();
        _formalBuy(bob, true, 2e18);
        _formalBuy(carol, false, 3e18);
        _finish(r);
        _accounting();
        _claimAll(carol);
        _claimAll(alice);
        _claimAll(bob);
        _accounting();
        assertLe(market.collateralCash(), 3);
        assertEq(market.lpBudgetRemaining(), 0);
        assertEq(market.bBudgetRemaining(), 0);
    }

    function testFeesWithdrawOnlyAccruedNotReserve() public {
        _graduate();
        _formalBuy(bob, true, 1e18);
        uint256 b = market.B();
        uint256 c = market.collateralCash();
        uint256 due = market.creatorFees();
        vm.prank(creator);
        market.claimFees();
        assertEq(usd.balanceOf(creator), due);
        assertEq(market.B(), b);
        assertEq(market.collateralCash(), c);
        vm.prank(dave);
        vm.expectRevert("NO_FEES");
        market.claimFees();
        _accounting();
    }

    function testUnGraduatedCurrentSplitAndTwoSeparateRights() public {
        _buy(alice, 100e3);
        uint256 allG = market.shares(alice);
        vm.prank(alice);
        market.genesisSell(allG, 0, type(uint64).max, 0);
        _buy(bob, 10e3);
        uint256 rf = market.R();
        uint256 bf = market.B();
        uint256 za = market.contribution(alice);
        vm.warp(market.genesisCutoff());
        market.closeExpired();
        vm.prank(bob);
        assertEq(market.claimFailed(), rf);
        vm.prank(alice);
        assertEq(market.claimB(), Math.mulDiv(bf, za, market.totalContribution()));
        vm.prank(bob);
        market.claimB();
        _accounting();
        assertEq(market.failedRRemaining(), 0);
        assertLe(market.bBudgetRemaining(), 1);
    }

    function testZeroSupplyFailureNoDivisionByZero() public {
        _buy(alice, 1e6);
        uint256 allG = market.shares(alice);
        vm.prank(alice);
        market.genesisSell(allG, 0, type(uint64).max, 0);
        vm.warp(market.genesisCutoff());
        market.closeExpired();
        vm.prank(alice);
        market.claimB();
        _accounting();
        assertEq(market.failedRRemaining(), 0);
    }



    function testDonationDoesNotAffectThresholdOrClaimBudget() public {
        _buy(alice, 1e6);
        uint256 R = market.R();
        usd.mint(address(market), 7e6);
        assertEq(market.R(), R);
        assertEq(uint256(market.phase()), 0);
        assertEq(usd.balanceOf(address(market)) - market.accountedBalance(), 7e6);
    }

    function testNoPendingCoreCanSettle() public {
        _graduate();
        vm.warp(market.coreCutoff());
        vm.expectRevert("CORE_PENDING");
        market.finalize();
        assertEq(uint256(market.phase()), 1);
        _accounting();
    }


}
