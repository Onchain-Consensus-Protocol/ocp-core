// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/core/OCPVault.sol";
import "../src/factory/OCPVaultFactory.sol";

interface IBaseUSDC is IERC20 {
    function decimals() external view returns (uint8);
    function blacklister() external view returns (address);
    function blacklist(address account) external;
    function unBlacklist(address account) external;
    function isBlacklisted(address account) external view returns (bool);
}

/**
 * @notice Base 主网 Fork 集成测试。
 * @dev 测试直接调用主网 USDC 的真实代理合约代码，但所有余额、黑名单和 OCP 状态
 *      只写入 Foundry 创建的本地 Fork，不会广播主网交易，也不会改变真实 USDC。
 *      未配置 BASE_RPC_URL 时整组测试自动跳过，普通单元测试不依赖外部 RPC。
 */
contract OCPVaultBaseForkTest is Test {
    address private constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint256 private constant USDC = 1_000_000;

    IBaseUSDC private constant usdc = IBaseUSDC(BASE_USDC);
    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);

    function setUp() public {
        string memory rpcUrl = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
            return;
        }

        uint256 forkBlock = vm.envOr("BASE_FORK_BLOCK", uint256(0));
        if (forkBlock == 0) vm.createSelectFork(rpcUrl);
        else vm.createSelectFork(rpcUrl, forkBlock);

        assertEq(block.chainid, 8453, "Not Base mainnet");
        assertEq(usdc.decimals(), 6, "Unexpected USDC decimals");
        assertGt(BASE_USDC.code.length, 0, "USDC code missing");
    }

    function test_realUSDCStakeFinalizeAndWithdraw() public {
        uint256 end = block.timestamp + 1 hours;
        OCPVault vault = _createVault(end);

        // deal 只修改本地 Fork 中 Base USDC 代理的 storage，不调用 Circle mint。
        deal(BASE_USDC, alice, 60 * USDC, true);
        deal(BASE_USDC, bob, 40 * USDC, true);
        _stake(alice, vault, IOCPVault.Side.YES, 60 * USDC);
        _stake(bob, vault, IOCPVault.Side.NO, 40 * USDC);

        assertEq(usdc.balanceOf(address(vault)), 100 * USDC);
        assertEq(vault.totalPrincipal(), 100 * USDC);
        vm.warp(end);
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IOCPVault.Outcome.YES));
        assertEq(vault.settlementPool(), 100 * USDC);

        vm.prank(bob);
        vault.withdraw();
        assertEq(usdc.balanceOf(bob), 0);
        assertEq(vault.remainingEligibleClaims(), 1);

        vm.prank(alice);
        vault.withdraw();
        assertEq(usdc.balanceOf(alice), 100 * USDC);
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(vault.remainingEligibleClaims(), 0);
    }

    function test_realUSDCBlacklistedWinnerCanRetryAfterUnblock() public {
        uint256 end = block.timestamp + 1 hours;
        OCPVault vault = _createVault(end);
        deal(BASE_USDC, alice, 10 * USDC, true);
        _stake(alice, vault, IOCPVault.Side.YES, 10 * USDC);
        vm.warp(end);
        vault.finalize();

        address blacklister = usdc.blacklister();
        assertTrue(blacklister != address(0), "USDC blacklister missing");
        vm.prank(blacklister);
        usdc.blacklist(alice);
        assertTrue(usdc.isBlacklisted(alice));

        uint256 claimsBefore = vault.remainingEligibleClaims();
        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw();
        assertEq(vault.remainingEligibleClaims(), claimsBefore, "Failed transfer changed claims");
        assertEq(usdc.balanceOf(address(vault)), 10 * USDC);

        vm.prank(blacklister);
        usdc.unBlacklist(alice);
        assertFalse(usdc.isBlacklisted(alice));
        vm.prank(alice);
        vault.withdraw();
        assertEq(usdc.balanceOf(alice), 10 * USDC);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function _createVault(uint256 end) private returns (OCPVault vault) {
        OCPVaultFactory factory = new OCPVaultFactory(BASE_USDC);
        (address vaultAddress,) =
            factory.createMarket(BASE_USDC, end, USDC, 0, "Base USDC fork", "YES / NO / INVALID");
        vault = OCPVault(vaultAddress);
    }

    function _stake(address user, OCPVault vault, IOCPVault.Side side, uint256 amount) private {
        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        vault.stake(side, amount);
        vm.stopPrank();
    }
}
