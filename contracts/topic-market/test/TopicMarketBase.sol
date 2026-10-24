// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TopicMarket, IToken6, ITopicMarketCore} from "../src/TopicMarket.sol";

contract MockUSDC is IToken6 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function decimals() external pure returns (uint8) {
        return 6;
    }
    bool public fail;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function setFail(bool f) external {
        fail = f;
    }

    function approve(address to, uint256 v) external returns (bool) {
        allowance[msg.sender][to] = v;
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        if (fail) return false;
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        if (fail) return false;
        allowance[from][msg.sender] -= v;
        balanceOf[from] -= v;
        balanceOf[to] += v;
        return true;
    }
}

contract MockCore is ITopicMarketCore {
    address public immutable admin = msg.sender;
    address public market;
    uint64 public openedAt;
    uint64 public deadline;
    uint8 public finalOutcome;
    bool public reject;
    bool public rejectFee;
    uint256 public fees;

    function setRejectFee(bool r) external {
        require(msg.sender == admin);
        rejectFee = r;
    }

    function depositMarketFee(uint256 amount) external {
        require(msg.sender == market && !rejectFee, "MOCK_FEE");
        require(TopicMarket(market).token().transferFrom(msg.sender, address(this), amount), "MOCK_PULL");
        fees += amount;
    }

    function bind(address m) external {
        require(msg.sender == admin && market == address(0));
        market = m;
    }

    function setReject(bool r) external {
        require(msg.sender == admin);
        reject = r;
    }

    function open(uint64 end) external {
        require(msg.sender == market && openedAt == 0 && !reject, "MOCK_CORE");
        openedAt = uint64(block.timestamp);
        deadline = end;
    }

    function resolve(uint8 result) external {
        require(
            msg.sender == admin && block.timestamp >= deadline && openedAt > 0 && result >= 1 && result <= 3
                && finalOutcome == 0,
            "MOCK_RESULT"
        );
        finalOutcome = result;
    }
}

abstract contract TopicMarketBase is Test {
    MockUSDC internal usd;
    MockCore internal oracle;
    TopicMarket internal market;
    address internal alice = address(0xA1);
    address internal bob = address(0xB1);
    address internal carol = address(0xC1);
    address internal dave = address(0xD1);
    address internal creator = address(0xC0);
    address internal protocol = address(0xF0);
    uint256 internal constant W = 1e18;

    function setUp() public virtual {
        vm.warp(100000);
        usd = new MockUSDC();
        oracle = new MockCore();
        market = new TopicMarket(usd, oracle, creator, protocol, uint64(block.timestamp + 6 hours), 1e6, 1e18);
        oracle.bind(address(market));
        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i; i < 4; i++) {
            usd.mint(users[i], 1000e6);
            vm.prank(users[i]);
            usd.approve(address(market), type(uint256).max);
        }
    }

    function _buy(address a, uint256 money) internal {
        vm.prank(a);
        market.genesisBuy(money, 0, type(uint64).max, 0);
    }

    function _graduate() internal {
        _buy(alice, 14e6);
        assertEq(uint256(market.phase()), 1);
    }

    function _formalBuy(address a, bool isYes, uint256 amount) internal {
        vm.prank(a);
        market.formalBuy(isYes, amount, type(uint256).max, type(uint64).max);
    }

    function _finish(uint8 result) internal {
        vm.warp(market.coreCutoff());
        oracle.resolve(result);
        market.finalize();
    }

    function _claimAll(address user) internal {
        if (market.yes(user) + market.no(user) > 0) {
            vm.prank(user);
            market.claimOutcome();
        }
        if (market.shares(user) + market.lpToken().balanceOf(user) > 0) {
            bool settled = market.phase() == TopicMarket.Phase.SETTLED;
            vm.prank(user);
            if (settled) market.claimLP();
            else market.claimFailed();
        }
        if (market.bToken().balanceOf(user) > 0) {
            vm.prank(user);
            market.claimB();
        }
    }

    function _accounting() internal view {
        assertEq(usd.balanceOf(address(market)), market.accountedBalance());
        assertTrue(market.checkInvariants());
        uint256 ys = market.inventoryY() + market.yes(alice) + market.yes(bob) + market.yes(carol) + market.yes(dave);
        uint256 ns = market.inventoryN() + market.no(alice) + market.no(bob) + market.no(carol) + market.no(dave);
        assertEq(ys, market.yesSupply());
        assertEq(ns, market.noSupply());
        assertEq(
            market.contribution(alice) + market.contribution(bob) + market.contribution(carol)
                + market.contribution(dave),
            market.totalContribution()
        );
    }
}
