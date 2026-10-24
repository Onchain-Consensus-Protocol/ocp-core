// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {IToken6, DLPMarket} from "../src/DLPMarket.sol";
import {MockCore} from "./DLPBase.sol";

contract AdversarialToken is IToken6 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public tax;
    bool public armed;
    address public target;
    bytes public callback;
    bytes public reason;
    bool public callbackSuccess;

    function decimals() external pure returns (uint8) {
        return 6;
    }

    function mint(address a, uint256 amount) external {
        balanceOf[a] += amount;
    }

    function approve(address a, uint256 amount) external returns (bool) {
        allowance[msg.sender][a] = amount;
        return true;
    }

    function setTax(bool a) external {
        tax = a;
    }

    function arm(address a, bytes calldata data) external {
        target = a;
        callback = data;
        armed = true;
    }

    function _callback() private {
        if (armed) {
            armed = false;
        (bool ok, bytes memory data) = target.call(callback);
        callbackSuccess = ok;
        reason = data;
        }
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        _callback();
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += tax ? amount - 1 : amount;
        _callback();
        return true;
    }
}

contract DLPAdversarialTest is Test {
    AdversarialToken internal token;
    MockCore internal core;
    DLPMarket internal m;
    address internal a = address(0xAA);

    function setUp() public {
        vm.warp(100000);
        token = new AdversarialToken();
        core = new MockCore();
        m = new DLPMarket(token, core, address(0xC), address(0xD), uint64(block.timestamp + 6 hours), 1e6, 1e18);
        core.bind(address(m));
        token.mint(a, 100e6);
        vm.prank(a);
        token.approve(address(m), type(uint256).max);
    }

    function testReentrantReceiveRejectedButOuterBuyValid() public {
        token.arm(address(m), abi.encodeCall(m.genesisBuy, (1e6, 0, type(uint64).max, 0)));
        vm.prank(a);
        m.genesisBuy(1e6, 0, type(uint64).max, 0);
        assertFalse(token.callbackSuccess());
        assertEq(token.reason(), abi.encodeWithSignature("Error(string)", "REENTER"));
        assertEq(token.balanceOf(address(m)), m.accountedBalance());
    }

    function testReentrantPayoutCannotExitOrClaimTwice() public {
        vm.prank(a);
        m.genesisBuy(1e6, 0, type(uint64).max, 0);
        uint256 amount = m.shares(a);
        token.arm(address(m), abi.encodeWithSignature("claimB()"));
        vm.prank(a);
        m.genesisSell(amount, 0, type(uint64).max, 0);
        assertFalse(token.callbackSuccess());
        assertEq(token.reason(), abi.encodeWithSignature("Error(string)", "REENTER"));
        assertEq(token.balanceOf(address(m)), m.accountedBalance());
    }

    function testFeeOnTransferIsRejectedWithFullRollback() public {
        token.setTax(true);
        uint256 before = token.balanceOf(a);
        vm.prank(a);
        vm.expectRevert("NOT_EXACT_TOKEN");
        m.genesisBuy(1e6, 0, type(uint64).max, 0);
        assertEq(token.balanceOf(a), before);
        assertEq(m.S(), 0);
        assertEq(token.balanceOf(address(m)), 0);
    }
}
