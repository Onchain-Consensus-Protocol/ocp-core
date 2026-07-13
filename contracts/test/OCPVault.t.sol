// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/core/OCPVault.sol";
import "../src/factory/OCPVaultFactory.sol";

contract TestToken is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ControlledUSDC is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Controlled USD Coin", "USDC") {}

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
        require(!blocked[from] && !blocked[to], "USDC blacklist");
        super._update(from, to, value);
    }
}

contract OCPVaultTest is Test {
    TestToken token;
    OCPVaultFactory factory;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address dave = address(0xDA7E);
    uint256 constant USDC = 1_000_000;
    uint256 constant MIN = USDC;

    function setUp() public {
        token = new TestToken();
        factory = new OCPVaultFactory(address(token));
        for (uint256 i; i < 4; i++) {
            token.mint([alice, bob, carol, dave][i], 10_000 * USDC);
        }
    }

    function createVault(uint256 end) internal returns (OCPVault vault) {
        (address addr, address market) =
            factory.createMarket(address(token), end, MIN, 0, "Test", "YES / NO / INVALID");
        assertEq(market, address(0));
        vault = OCPVault(addr);
    }

    function stake(address user, OCPVault vault, IOCPVault.Side side, uint256 amount) internal {
        vm.startPrank(user);
        token.approve(address(vault), type(uint256).max);
        vault.stake(side, amount);
        vm.stopPrank();
    }

    function test_factoryCreatesSinglePeriodVault() public {
        OCPVault vault = createVault(block.timestamp + 1 days);
        assertEq(token.decimals(), 6);
        assertEq(vault.protocolVersion(), 4);
        assertEq(address(vault.stakeToken()), address(token));
        assertEq(factory.officialStakeToken(), address(token));
        assertEq(factory.getVaults().length, 1);
    }

    function test_factoryRejectsUnsupportedToken() public {
        TestToken other = new TestToken();
        vm.expectRevert("Unsupported stake token");
        factory.createMarket(
            address(other), block.timestamp + 1 days, MIN, 0, "Test", "Description"
        );
    }

    function test_factoryConstructorRejectsEOAAsToken() public {
        vm.expectRevert("Token has no code");
        new OCPVaultFactory(alice);
    }

    function test_onlyFactoryOwnerCanCreateVault() public {
        vm.prank(alice);
        vm.expectRevert("Only owner");
        factory.createMarket(
            address(token), block.timestamp + 1 days, MIN, 0, "Test", "Description"
        );
    }

    function test_allThreeSidesOpenAndSameSideCanAdd() public {
        OCPVault vault = createVault(block.timestamp + 1 days);
        stake(alice, vault, IOCPVault.Side.YES, 10 * USDC);
        stake(alice, vault, IOCPVault.Side.YES, 5 * USDC);
        stake(bob, vault, IOCPVault.Side.NO, 7 * USDC);
        stake(carol, vault, IOCPVault.Side.INVALID, 3 * USDC);
        assertEq(vault.totalStakeYes(), 15 * USDC);
        assertEq(vault.totalStakeNo(), 7 * USDC);
        assertEq(vault.totalStakeInvalid(), 3 * USDC);
    }

    function test_positionCannotChangeSide() public {
        OCPVault vault = createVault(block.timestamp + 1 days);
        stake(alice, vault, IOCPVault.Side.YES, 10 * USDC);
        vm.startPrank(alice);
        token.approve(address(vault), 10 * USDC);
        vm.expectRevert("Position is locked to one side");
        vault.stake(IOCPVault.Side.NO, 10 * USDC);
        vm.stopPrank();
    }

    function test_minStakeUsesSixDecimalUSDCUnits() public {
        OCPVault vault = createVault(block.timestamp + 1 days);
        vm.startPrank(alice);
        token.approve(address(vault), MIN);
        vm.expectRevert("Amount below min stake");
        vault.stake(IOCPVault.Side.YES, MIN - 1);
        vault.stake(IOCPVault.Side.YES, MIN);
        vm.stopPrank();
        assertEq(vault.totalPrincipal(), 1_000_000);
    }

    function test_stakingClosesAtFixedDeadline() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(bob, vault, IOCPVault.Side.NO, MIN);
        vm.warp(end);
        vm.prank(alice);
        vm.expectRevert("Staking ended");
        vault.stake(IOCPVault.Side.YES, MIN);
        assertTrue(vault.canResolve());
    }

    function test_donationAlsoClosesAtFixedDeadline() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, MIN);
        vm.warp(end);
        vm.startPrank(dave);
        token.approve(address(vault), MIN);
        vm.expectRevert("Staking ended");
        vault.donate(MIN);
        vm.stopPrank();
    }

    function test_emptyVaultIsNotResolvable() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        vm.warp(end);
        assertFalse(vault.canResolve());
        vm.expectRevert("Empty vault");
        vault.finalize();
    }

    function test_yesMustExceedHalfOfAllCapital() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 500 * USDC);
        stake(bob, vault, IOCPVault.Side.NO, 300 * USDC);
        stake(carol, vault, IOCPVault.Side.INVALID, 200 * USDC);
        vm.warp(end);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.INVALID));
    }

    function test_oneMicroUSDCAboveHalfWins() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 50 * USDC + 1);
        stake(bob, vault, IOCPVault.Side.NO, 50 * USDC);
        vm.warp(end);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));
    }

    function test_noStrictMajorityResolvesInvalidEvenWhenYesIsLargestSide() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 49 * USDC);
        stake(bob, vault, IOCPVault.Side.NO, 40 * USDC);
        stake(carol, vault, IOCPVault.Side.INVALID, 11 * USDC);
        vm.warp(end);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.INVALID));
    }

    function test_winnersShareEntirePoolProRata() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 600 * USDC);
        stake(bob, vault, IOCPVault.Side.YES, 200 * USDC);
        stake(carol, vault, IOCPVault.Side.NO, 200 * USDC);
        vm.startPrank(dave);
        token.approve(address(vault), 100 * USDC);
        vault.donate(100 * USDC);
        vm.stopPrank();
        vm.warp(end);
        vault.finalize();
        uint256 beforeAlice = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - beforeAlice, 825 * USDC);
        uint256 beforeBob = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - beforeBob, 275 * USDC);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_invalidRefundsEveryoneProRataWithDonation() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 500 * USDC);
        stake(bob, vault, IOCPVault.Side.NO, 500 * USDC);
        vm.startPrank(dave);
        token.approve(address(vault), 100 * USDC);
        vault.donate(100 * USDC);
        vm.stopPrank();
        vm.warp(end);
        vault.finalize();
        uint256 beforeAlice = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - beforeAlice, 550 * USDC);
        uint256 beforeBob = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - beforeBob, 550 * USDC);
    }

    function test_loserGetsZeroAndCannotClaimTwice() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 600 * USDC);
        stake(bob, vault, IOCPVault.Side.NO, 400 * USDC);
        vm.warp(end);
        vault.finalize();
        uint256 beforeBob = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob), beforeBob);
        vm.prank(bob);
        vm.expectRevert("Already claimed");
        vault.withdraw();
    }

    function test_multiWinnerRoundingClearsVault() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, MIN);
        stake(bob, vault, IOCPVault.Side.YES, MIN);
        stake(carol, vault, IOCPVault.Side.YES, MIN);
        stake(dave, vault, IOCPVault.Side.NO, MIN);
        vm.warp(end);
        vault.finalize();

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, 1_333_333);

        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - bobBefore, 1_333_333);

        uint256 carolBefore = token.balanceOf(carol);
        vm.prank(carol);
        vault.withdraw();
        assertEq(token.balanceOf(carol) - carolBefore, 1_333_334);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.remainingEligibleClaims(), 0);
    }

    function test_directTransferBeforeFinalizeJoinsSettlementPoolButNotVotes() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 2 * USDC);
        stake(bob, vault, IOCPVault.Side.NO, MIN);
        vm.prank(dave);
        token.transfer(address(vault), 7 * USDC);
        vm.warp(end);
        vault.finalize();
        assertEq(vault.totalPrincipal(), 3 * USDC);
        assertEq(vault.totalDonations(), 0);
        assertEq(vault.settlementPool(), 10 * USDC);
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));
    }

    function test_directTransferAfterFinalizeGoesToLastEligibleClaimant() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, 2 * USDC);
        stake(bob, vault, IOCPVault.Side.YES, 2 * USDC);
        stake(carol, vault, IOCPVault.Side.NO, MIN);
        vm.warp(end);
        vault.finalize();
        assertEq(vault.settlementPool(), 5 * USDC);

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, 2_500_000);

        vm.prank(dave);
        token.transfer(address(vault), 7 * USDC);
        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - bobBefore, 9_500_000);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_invalidNonDivisiblePoolClearsRoundingDust() public {
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, MIN);
        stake(bob, vault, IOCPVault.Side.NO, MIN);
        stake(carol, vault, IOCPVault.Side.INVALID, MIN);
        vm.prank(dave);
        token.transfer(address(vault), 1);
        vm.warp(end);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.INVALID));

        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - bobBefore, MIN);
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, MIN);
        uint256 carolBefore = token.balanceOf(carol);
        vm.prank(carol);
        vault.withdraw();
        assertEq(token.balanceOf(carol) - carolBefore, MIN + 1);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_extremeMajorityAndMulDivDoNotOverflow() public {
        uint256 huge = uint256(1) << 200;
        token.mint(alice, huge);
        token.mint(bob, huge);
        token.mint(carol, huge);
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, huge);
        stake(bob, vault, IOCPVault.Side.YES, huge);
        stake(carol, vault, IOCPVault.Side.NO, huge);
        vm.warp(end);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, huge + huge / 2);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_withdrawBeforeFinalizeAndWithoutStakeRevert() public {
        OCPVault vault = createVault(block.timestamp + 1 days);
        vm.prank(alice);
        vm.expectRevert("Not finalized");
        vault.withdraw();
        stake(alice, vault, IOCPVault.Side.YES, MIN);
        vm.warp(vault.resolutionTime());
        vault.finalize();
        vm.prank(dave);
        vm.expectRevert("No stake");
        vault.withdraw();
    }

    function test_insufficientAllowanceLeavesAccountingUnchanged() public {
        OCPVault vault = createVault(block.timestamp + 1 days);
        vm.prank(alice);
        vm.expectRevert();
        vault.stake(IOCPVault.Side.YES, MIN);
        assertEq(vault.totalPrincipal(), 0);
        assertEq(vault.totalStakeYes(), 0);
        (uint256 yes, uint256 no, uint256 invalid) = vault.stakeOf(alice);
        assertEq(yes + no + invalid, 0);
    }

    function test_blacklistedWinnerCanRetryAfterUnblock() public {
        ControlledUSDC controlled = new ControlledUSDC();
        controlled.mint(alice, 10 * USDC);
        OCPVaultFactory controlledFactory = new OCPVaultFactory(address(controlled));
        (address vaultAddress,) = controlledFactory.createMarket(
            address(controlled), block.timestamp + 1 days, MIN, 0, "Test", "Description"
        );
        OCPVault vault = OCPVault(vaultAddress);
        vm.startPrank(alice);
        controlled.approve(vaultAddress, 10 * USDC);
        vault.stake(IOCPVault.Side.YES, 10 * USDC);
        vm.stopPrank();
        vm.warp(vault.resolutionTime());
        vault.finalize();

        controlled.setBlocked(alice, true);
        vm.prank(alice);
        vm.expectRevert("USDC blacklist");
        vault.withdraw();

        controlled.setBlocked(alice, false);
        vm.prank(alice);
        vault.withdraw();
        assertEq(controlled.balanceOf(alice), 10 * USDC);
        assertEq(controlled.balanceOf(vaultAddress), 0);
    }

    function testFuzz_outcomeAndSettlementConserveUSDC(
        uint64 yesSeed,
        uint64 noSeed,
        uint64 invalidSeed
    ) public {
        uint256 yesAmount = bound(uint256(yesSeed), MIN, 3_000 * USDC);
        uint256 noAmount = bound(uint256(noSeed), MIN, 3_000 * USDC);
        uint256 invalidAmount = bound(uint256(invalidSeed), MIN, 3_000 * USDC);
        uint256 end = block.timestamp + 1 days;
        OCPVault vault = createVault(end);
        stake(alice, vault, IOCPVault.Side.YES, yesAmount);
        stake(bob, vault, IOCPVault.Side.NO, noAmount);
        stake(carol, vault, IOCPVault.Side.INVALID, invalidAmount);

        uint256 total = yesAmount + noAmount + invalidAmount;
        assertEq(vault.totalPrincipal(), total);
        assertEq(vault.totalStakeYes() + vault.totalStakeNo() + vault.totalStakeInvalid(), total);

        vm.warp(end);
        vault.finalize();
        IOCPVault.Outcome expected = yesAmount > total - yesAmount
            ? IOCPVault.Outcome.YES
            : noAmount > total - noAmount ? IOCPVault.Outcome.NO : IOCPVault.Outcome.INVALID;
        assertEq(uint256(vault.outcome()), uint256(expected));
        assertEq(vault.settlementPool(), total);

        vm.prank(alice);
        vault.withdraw();
        vm.prank(bob);
        vault.withdraw();
        vm.prank(carol);
        vault.withdraw();
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.remainingEligibleClaims(), 0);
    }

    function test_factoryOwnershipTwoStep() public {
        factory.transferOwnership(alice);
        vm.prank(alice);
        factory.acceptOwnership();
        assertEq(factory.owner(), alice);

        vm.expectRevert("Only owner");
        factory.createMarket(
            address(token), block.timestamp + 1 days, MIN, 0, "Test", "Description"
        );
        vm.prank(alice);
        factory.createMarket(
            address(token), block.timestamp + 1 days, MIN, 0, "Test", "Description"
        );
    }
}
