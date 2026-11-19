// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ProtocolFeeLottery} from "../src/lottery/ProtocolFeeLottery.sol";
import {DrandEvmnet} from "../src/lottery/DrandEvmnet.sol";

contract LotteryToken is ERC20 {
    constructor(string memory symbol_) ERC20(symbol_, symbol_) {}

    function mint(address who, uint256 amount) external {
        _mint(who, amount);
    }
}

contract ProtocolFeeLotteryTest is Test {
    uint64 private constant FIRST_CUTOFF = 1794139200;
    uint64 private constant SECOND_CUTOFF = 1794744000;
    bytes private constant FIRST_SIGNATURE =
        hex"0dfc289b2b84b5f621b231c22a9ac893f47a2ce440ac8df323002820d1d2fd9e192532f93a634138f77a088ca1aafbc9908a3b7cc2aa574d2e003d1d1b6cd6e7";
    bytes private constant SECOND_SIGNATURE =
        hex"0e4169676f416cae1f4e5c2f50d2fb19c88f255728bd4ed003e093ef1fce431622b3d1f92d76e7686f47b0b48dfa66e774bba5a131d66a1370609e78ad969980";

    address private constant KEEPER = address(0x200);
    address private constant ALICE = address(0x300);
    address private constant BOB = address(0x400);

    ProtocolFeeLottery private lottery;
    LotteryToken private first;
    LotteryToken private second;

    function setUp() public {
        first = new LotteryToken("Stock A");
        second = new LotteryToken("Stock B");
        if (address(first) > address(second)) (first, second) = (second, first);
        lottery = new ProtocolFeeLottery(KEEPER, _tokens());
        first.mint(address(this), 300);
        second.mint(address(this), 500);
        first.approve(address(lottery), 300);
        second.approve(address(lottery), 500);
        lottery.deposit(address(first), 300);
        lottery.deposit(address(second), 500);
    }

    function testWeightedDrawVerifiesProofAndCarriesOnlyUnclaimedAssets() public {
        uint64 beacon = _lock(FIRST_CUTOFF, 100, 200);
        assertEq(beacon, 22220743);
        vm.warp(DrandEvmnet.publicationTime(beacon) - 1);
        vm.expectRevert(bytes("BEACON_PENDING"));
        _draw(FIRST_CUTOFF, FIRST_SIGNATURE, ALICE);
        vm.warp(DrandEvmnet.publicationTime(beacon));

        vm.expectRevert(bytes("SIGNATURE"));
        _draw(FIRST_CUTOFF, SECOND_SIGNATURE, ALICE);
        vm.expectRevert(bytes("SIGNATURE"));
        _draw(FIRST_CUTOFF, new bytes(64), ALICE);

        address winner = _winner(FIRST_SIGNATURE);
        vm.expectRevert(bytes("WINNER"));
        _draw(FIRST_CUTOFF, FIRST_SIGNATURE, winner == ALICE ? BOB : ALICE);
        _draw(FIRST_CUTOFF, FIRST_SIGNATURE, winner);

        (address stored,, uint64 deadline) = lottery.activePrize();
        assertEq(stored, winner);
        assertEq(deadline, SECOND_CUTOFF + 12 hours);
        assertEq(lottery.prize(address(first)), 100);
        assertEq(lottery.prize(address(second)), 200);

        address[] memory partialClaim = new address[](1);
        partialClaim[0] = address(first);
        vm.expectRevert(bytes("CLAIM"));
        lottery.claim(partialClaim);
        vm.prank(winner);
        lottery.claim(partialClaim);
        assertEq(first.balanceOf(winner), 100);
        vm.expectRevert(bytes("PRIZE"));
        vm.prank(winner);
        lottery.claim(partialClaim);

        uint64 nextBeacon = _lock(SECOND_CUTOFF, 50, 60);
        assertEq(nextBeacon, 22422343);
        vm.expectRevert(bytes("CLAIM"));
        vm.prank(winner);
        lottery.claim(_tokens());

        vm.warp(DrandEvmnet.publicationTime(nextBeacon));
        address nextWinner = _winner(SECOND_SIGNATURE);
        _draw(SECOND_CUTOFF, SECOND_SIGNATURE, nextWinner);
        assertEq(lottery.prize(address(first)), 50);
        assertEq(lottery.prize(address(second)), 260);
        vm.prank(nextWinner);
        lottery.claim(_tokens());
        assertEq(second.balanceOf(nextWinner), 260);
        assertEq(first.balanceOf(address(lottery)), lottery.unallocated(address(first)));
        assertEq(second.balanceOf(address(lottery)), lottery.unallocated(address(second)));
    }

    function testExpiredRoundCannotDrawOrReopenAndRetainsFundedBasket() public {
        _lock(FIRST_CUTOFF, 100, 200);
        vm.warp(SECOND_CUTOFF + 12 hours);
        vm.expectRevert(bytes("EXPIRED"));
        _draw(FIRST_CUTOFF, FIRST_SIGNATURE, ALICE);
        lottery.expirePending();
        assertEq(lottery.prize(address(first)), 100);
        assertEq(lottery.prize(address(second)), 200);
        assertEq(lottery.pendingPrize(address(first)), 0);
        _lock(SECOND_CUTOFF, 1, 1);
        (uint64 cutoff,,,) = lottery.pendingRound();
        assertEq(cutoff, SECOND_CUTOFF);
    }

    function testRejectsEarlyUnauthorizedAndUnfundedLock() public {
        vm.warp(FIRST_CUTOFF + 12 hours - 1);
        vm.expectRevert(bytes("KEEPER"));
        lottery.lockRound(FIRST_CUTOFF, _root(FIRST_CUTOFF), 10, _tokens(), _fees(1, 1), bytes32(uint256(1)));
        vm.expectRevert(bytes("WINDOW"));
        vm.prank(KEEPER);
        lottery.lockRound(FIRST_CUTOFF, _root(FIRST_CUTOFF), 10, _tokens(), _fees(1, 1), bytes32(uint256(1)));
        vm.warp(FIRST_CUTOFF + 12 hours);
        vm.expectRevert(bytes("FUNDING"));
        vm.prank(KEEPER);
        lottery.lockRound(FIRST_CUTOFF, _root(FIRST_CUTOFF), 10, _tokens(), _fees(301, 1), bytes32(uint256(1)));
        assertEq(lottery.lastCutoff(), 0);
        assertEq(lottery.unallocated(address(first)), 300);
    }

    function testDirectTransfersSyncOnlyUnaccountedBalance() public {
        _lock(FIRST_CUTOFF, 100, 200);
        assertEq(lottery.syncDeposits(address(first)), 0);
        first.mint(address(this), 20);
        first.transfer(address(lottery), 20);
        assertEq(lottery.syncDeposits(address(first)), 20);
        assertEq(lottery.unallocated(address(first)), 220);
        assertEq(lottery.pendingPrize(address(first)), 100);
        assertEq(lottery.syncDeposits(address(first)), 0);
    }

    function _lock(uint64 cutoff, uint256 firstFee, uint256 secondFee) private returns (uint64 beacon) {
        vm.warp(cutoff + 12 hours);
        vm.prank(KEEPER);
        lottery.lockRound(cutoff, _root(cutoff), 10, _tokens(), _fees(firstFee, secondFee), bytes32(uint256(1)));
        (, beacon,,) = lottery.pendingRound();
    }

    function _winner(bytes memory signature) private view returns (address) {
        return lottery.drawIndex(signature) < 3 ? ALICE : BOB;
    }

    function _draw(uint64 cutoff, bytes memory signature, address account) private {
        bool isAlice = account == ALICE;
        bytes32[] memory hashes = new bytes32[](1);
        uint256[] memory weights = new uint256[](1);
        bool[] memory left = new bool[](1);
        weights[0] = isAlice ? 7 : 3;
        hashes[0] = keccak256(abi.encode(cutoff, isAlice ? BOB : ALICE, weights[0]));
        left[0] = !isAlice;
        lottery.draw(signature, account, isAlice ? 3 : 7, hashes, weights, left);
    }

    function _root(uint64 cutoff) private pure returns (bytes32) {
        bytes32 a = keccak256(abi.encode(cutoff, ALICE, uint256(3)));
        bytes32 b = keccak256(abi.encode(cutoff, BOB, uint256(7)));
        return keccak256(abi.encode(a, uint256(3), b, uint256(7)));
    }

    function _tokens() private view returns (address[] memory tokens) {
        tokens = new address[](2);
        tokens[0] = address(first);
        tokens[1] = address(second);
    }

    function _fees(uint256 a, uint256 b) private pure returns (uint256[] memory fees) {
        fees = new uint256[](2);
        fees[0] = a;
        fees[1] = b;
    }
}
