// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../src/core/OCPVault.sol";

contract MarketFeeToken is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BoundFeeMarket {
    MarketFeeToken public immutable token;
    OCPVault public immutable vault;

    constructor(MarketFeeToken token_, OCPVault vault_) {
        token = token_;
        vault = vault_;
        token_.approve(address(vault_), type(uint256).max);
    }

    function deposit(uint256 amount) external {
        vault.depositMarketFee(amount);
    }
}

contract OCPVaultMarketFeesTest is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant MIN_STAKE = USDC;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);
    address internal constant DAVE = address(0xDA7E);
    address internal constant OFFICIAL = address(0x0FF1C1A1);

    MarketFeeToken internal token;
    OCPVault internal vault;
    BoundFeeMarket internal market;
    uint256 internal deadline;

    function setUp() public {
        token = new MarketFeeToken();
        deadline = block.timestamp + 7 days;
        vault = new OCPVault(address(this), address(token), deadline, MIN_STAKE, OFFICIAL);
        market = new BoundFeeMarket(token, vault);
        vault.bindMarket(address(market));
        token.mint(address(market), 1_000_000 * USDC);

        address[4] memory users = [ALICE, BOB, CAROL, DAVE];
        for (uint256 i; i < users.length; ++i) {
            token.mint(users[i], 1_000_000 * USDC);
            vm.prank(users[i]);
            token.approve(address(vault), type(uint256).max);
        }
    }

    function test_bobConditionalLedgersAre20ZeroAnd5() public {
        _stake(ALICE, IOCPVault.Side.YES, 40 * USDC);
        _stake(BOB, IOCPVault.Side.YES, 10 * USDC);
        _stake(CAROL, IOCPVault.Side.NO, 150 * USDC);

        market.deposit(100 * USDC);

        (uint256 yesFees, uint256 noFees, uint256 invalidFees) =
            vault.conditionalMarketFees(BOB);
        assertEq(yesFees, 20 * USDC);
        assertEq(noFees, 0);
        assertEq(invalidFees, 5 * USDC);
    }

    function test_lateStakeCannotClaimHistoricalFees() public {
        _stake(ALICE, IOCPVault.Side.YES, 10 * USDC);
        market.deposit(100 * USDC);

        _stake(BOB, IOCPVault.Side.YES, 30 * USDC);
        _stake(CAROL, IOCPVault.Side.NO, 60 * USDC);
        market.deposit(120 * USDC);

        (uint256 aliceYes,, uint256 aliceInvalid) = vault.conditionalMarketFees(ALICE);
        (uint256 bobYes,, uint256 bobInvalid) = vault.conditionalMarketFees(BOB);
        (, uint256 carolNo, uint256 carolInvalid) = vault.conditionalMarketFees(CAROL);
        assertEq(aliceYes, 130 * USDC);
        assertEq(bobYes, 90 * USDC);
        assertEq(carolNo, 120 * USDC);
        assertEq(aliceInvalid, 112 * USDC);
        assertEq(bobInvalid, 36 * USDC);
        assertEq(carolInvalid, 72 * USDC);
    }

    function test_zeroYesDoesNotBackfillAndSelectedRemainderGoesOfficial() public {
        _stake(CAROL, IOCPVault.Side.NO, 100 * USDC);
        market.deposit(60 * USDC);
        _stake(ALICE, IOCPVault.Side.YES, 101 * USDC);
        market.deposit(40 * USDC);

        vm.warp(deadline);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));
        assertEq(vault.claimableMarketFees(ALICE), 40 * USDC - 1);
        assertEq(vault.officialMarketFeesClaimable(), 60 * USDC);

        uint256 aliceBefore = token.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw();
        assertEq(token.balanceOf(ALICE) - aliceBefore, 241 * USDC - 1);

        uint256 officialBefore = token.balanceOf(OFFICIAL);
        vault.claimOfficialMarketFees();
        assertEq(token.balanceOf(OFFICIAL) - officialBefore, 60 * USDC + 1);
    }

    function test_invalidUsesCombinedYesNoPoolAndExcludesInvalidStake() public {
        _stake(ALICE, IOCPVault.Side.YES, 10 * USDC);
        _stake(BOB, IOCPVault.Side.NO, 30 * USDC);
        _stake(CAROL, IOCPVault.Side.INVALID, 100 * USDC);
        market.deposit(80 * USDC);

        vm.warp(deadline);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.INVALID));
        assertEq(vault.claimableMarketFees(ALICE), 20 * USDC);
        assertEq(vault.claimableMarketFees(BOB), 60 * USDC);
        assertEq(vault.claimableMarketFees(CAROL), 0);

        uint256 carolBefore = token.balanceOf(CAROL);
        vm.prank(CAROL);
        vault.withdraw();
        assertEq(token.balanceOf(CAROL) - carolBefore, 100 * USDC);
    }

    function test_noYesOrNoMakesEntireFeeOfficialEvenWithInvalidStake() public {
        _stake(CAROL, IOCPVault.Side.INVALID, 100 * USDC);
        market.deposit(50 * USDC);
        _stake(ALICE, IOCPVault.Side.YES, 100 * USDC);

        vm.warp(deadline);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.INVALID));
        assertEq(vault.claimableMarketFees(ALICE), 0);
        assertEq(vault.claimableMarketFees(CAROL), 0);
        assertEq(vault.officialMarketFeesClaimable(), 50 * USDC);
    }

    function test_onlyBoundMarketCanDepositAndRewardFundsAreTransferred() public {
        vm.expectRevert("Only market");
        vault.depositMarketFee(USDC);

        _stake(ALICE, IOCPVault.Side.YES, 10 * USDC);
        uint256 beforeBalance = token.balanceOf(address(vault));
        market.deposit(7 * USDC);
        assertEq(token.balanceOf(address(vault)) - beforeBalance, 7 * USDC);
        assertEq(vault.totalMarketFeesAccrued(), 7 * USDC);
    }

    function test_sameSideAdditionCheckpointsBeforeIncreasingWeight() public {
        _stake(ALICE, IOCPVault.Side.YES, 10 * USDC);
        _stake(BOB, IOCPVault.Side.YES, 10 * USDC);
        market.deposit(20 * USDC);

        _stake(ALICE, IOCPVault.Side.YES, 20 * USDC);
        market.deposit(40 * USDC);

        (uint256 aliceYes,,) = vault.conditionalMarketFees(ALICE);
        (uint256 bobYes,,) = vault.conditionalMarketFees(BOB);
        assertEq(aliceYes, 40 * USDC);
        assertEq(bobYes, 20 * USDC);
    }

    function test_roundingDustDoesNotDependOnClaimOrderAndGoesOfficial() public {
        _stake(ALICE, IOCPVault.Side.YES, 2 * USDC);
        _stake(BOB, IOCPVault.Side.YES, 3 * USDC);
        market.deposit(1);

        vm.warp(deadline);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));

        vm.prank(BOB);
        vault.withdraw();
        vm.prank(ALICE);
        vault.withdraw();
        assertEq(vault.marketFeeUserPoolRemaining(), 0);
        assertEq(vault.officialMarketFeesClaimable(), 1);
    }

    function test_anyoneCanClaimFeesForInactiveUserWithoutTakingTheirFunds() public {
        _stake(ALICE, IOCPVault.Side.YES, 2 * USDC);
        _stake(BOB, IOCPVault.Side.YES, 3 * USDC);
        market.deposit(5 * USDC);

        vm.warp(deadline);
        vault.finalize();

        uint256 bobBefore = token.balanceOf(BOB);
        vm.prank(DAVE);
        assertEq(vault.claimMarketFeesFor(BOB), 3 * USDC);
        assertEq(token.balanceOf(BOB) - bobBefore, 3 * USDC);
        assertEq(token.balanceOf(DAVE), 1_000_000 * USDC);

        bobBefore = token.balanceOf(BOB);
        vm.prank(BOB);
        vault.withdraw();
        assertEq(token.balanceOf(BOB) - bobBefore, 3 * USDC);
    }

    function test_permissionlessClaimsCanReleaseDustWithoutClaimDeadline() public {
        _stake(ALICE, IOCPVault.Side.YES, 2 * USDC);
        _stake(BOB, IOCPVault.Side.YES, 3 * USDC);
        market.deposit(1);

        vm.warp(deadline);
        vault.finalize();

        vault.claimMarketFeesFor(ALICE);
        vault.claimMarketFeesFor(BOB);
        assertEq(vault.remainingMarketFeeClaims(), 0);
        assertEq(vault.marketFeeUserPoolRemaining(), 0);
        assertEq(vault.officialMarketFeesClaimable(), 1);
    }

    function _stake(address user, IOCPVault.Side side, uint256 amount) internal {
        vm.prank(user);
        vault.stake(side, amount);
    }
}
