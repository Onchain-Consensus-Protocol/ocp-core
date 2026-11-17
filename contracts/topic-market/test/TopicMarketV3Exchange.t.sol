// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TopicMarketV3Exchange, ITopicMarketV3SwapRouter} from "../src/TopicMarketV3Exchange.sol";
contract V3TestToken is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract TopicMarketTestDex is ITopicMarketV3SwapRouter {
    bool public lie;
    bool public shortPull;
    bool public fail;
    address public reentry;
    bytes public reentryData;
    function configure(bool lie_, bool shortPull_, bool fail_) external { lie = lie_; shortPull = shortPull_; fail = fail_; }
    function setReentry(address target, bytes calldata data) external { reentry = target; reentryData = data; }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        require(!fail, "DEX_FAIL"); require(p.deadline >= block.timestamp, "DEX_EXPIRED");
        require(p.fee == 3000 && p.sqrtPriceLimitX96 == 0, "DEX_PARAMS");
        if (reentry != address(0)) { (bool success,) = reentry.call(reentryData); require(!success, "REENTRY_SUCCEEDED"); }
        ERC20(p.tokenIn).transferFrom(msg.sender, address(this), shortPull ? p.amountIn - 1 : p.amountIn);
        amountOut = p.amountIn * 2; require(amountOut >= p.amountOutMinimum, "DEX_MIN");
        ERC20(p.tokenOut).transfer(p.recipient, amountOut); if (lie) ++amountOut;
    }
}
contract TopicMarketV3ExchangeTest is Test {
    V3TestToken stock; V3TestToken stable; TopicMarketTestDex dex; TopicMarketV3Exchange adapter;
    address alice = address(0xa11ce);
    function setUp() public {
        stock = new V3TestToken(); stable = new V3TestToken(); dex = new TopicMarketTestDex();
        adapter = new TopicMarketV3Exchange(dex, address(stock), address(stable), 3000);
        stock.mint(alice, 1000); stable.mint(alice, 1000);
        stock.mint(address(dex), 100000); stable.mint(address(dex), 100000);
        vm.startPrank(alice); stock.approve(address(adapter), type(uint256).max); stable.approve(address(adapter), type(uint256).max); vm.stopPrank();
    }
    function swap(address input, address output, uint256 minimum) internal returns (uint256) {
        vm.prank(alice); return adapter.swapExactInput(input, output, 100, minimum, uint64(block.timestamp + 1));
    }
    function testBothDirectionsExactDeltaAndApprovalCleared() public {
        assertEq(swap(address(stable), address(stock), 200), 200);
        assertEq(stock.balanceOf(alice), 1200); assertEq(stable.balanceOf(alice), 900);
        assertEq(swap(address(stock), address(stable), 200), 200);
        assertEq(stock.balanceOf(alice), 1100); assertEq(stable.balanceOf(alice), 1100);
        assertEq(stock.allowance(address(adapter), address(dex)), 0); assertEq(stable.allowance(address(adapter), address(dex)), 0);
    }
    function testDonatedDustCannotBeSwept() public {
        stock.mint(address(adapter), 17); stable.mint(address(adapter), 23);
        swap(address(stable), address(stock), 200);
        assertEq(stock.balanceOf(address(adapter)), 17); assertEq(stable.balanceOf(address(adapter)), 23);
    }
    function testMinimumOutputFailureRestoresInput() public {
        vm.expectRevert(bytes("DEX_MIN")); swap(address(stable), address(stock), 201);
        assertEq(stable.balanceOf(alice), 1000); assertEq(stable.balanceOf(address(dex)), 100000);
    }
    function testLyingOutputAndPartialConsumptionRejected() public {
        dex.configure(true, false, false);
        vm.expectRevert(bytes("OUTPUT_DELTA")); swap(address(stable), address(stock), 200);
        dex.configure(false, true, false);
        vm.expectRevert(bytes("INPUT_DELTA")); swap(address(stable), address(stock), 200);
        assertEq(stable.balanceOf(alice), 1000); assertEq(stock.balanceOf(alice), 1000);
    }
    function testWrongPairExpiredAndSameAssetRejected() public {
        V3TestToken other = new V3TestToken();
        vm.expectRevert(bytes("PAIR")); swap(address(other), address(stock), 0);
        vm.expectRevert(bytes("PAIR")); swap(address(stock), address(stock), 0);
        vm.prank(alice); vm.expectRevert(bytes("TIME_AMOUNT"));
        adapter.swapExactInput(address(stock), address(stable), 100, 0, uint64(block.timestamp - 1));
    }
    function testReentryFailsWhileSwapSucceeds() public {
        dex.setReentry(address(adapter), abi.encodeCall(adapter.swapExactInput,
            (address(stock), address(stable), 1, 0, uint64(block.timestamp + 1))));
        swap(address(stable), address(stock), 200); assertEq(stock.balanceOf(alice), 1200);
    }
    function testDexFailureAtomicAndConstructorRejectsSameAsset() public {
        dex.configure(false, false, true);
        vm.expectRevert(bytes("DEX_FAIL")); swap(address(stable), address(stock), 200);
        assertEq(stable.balanceOf(alice), 1000);
        vm.expectRevert(bytes("PAIR")); new TopicMarketV3Exchange(dex, address(stock), address(stock), 3000);
    }
}
