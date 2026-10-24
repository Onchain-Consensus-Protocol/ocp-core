// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DLPAssetRouter, IDLPAssetExchange, IDLPRouterRegistry} from "../src/DLPAssetRouter.sol";
contract RouterTestToken is ERC20 {
    constructor(string memory symbol_) ERC20(symbol_, symbol_) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract RouterTestRegistry is IDLPRouterRegistry {
    mapping(address => bool) public isMarket;
    function add(address market) external { isMarket[market] = true; }
}
contract RouterTestExchange is IDLPAssetExchange {
    bool public lie;
    bool public fail;
    address public reentry;
    bytes public reentryData;
    function configure(bool lie_, bool fail_) external { lie = lie_; fail = fail_; }
    function setReentry(address target, bytes calldata data) external { reentry = target; reentryData = data; }
    function swapExactInput(address input, address output, uint256 amount, uint256 minimum, uint64)
        external returns (uint256 value)
    {
        require(!fail, "EXCHANGE_FAIL");
        if (reentry != address(0)) {
            (bool success,) = reentry.call(reentryData);
            require(!success, "REENTRY_SUCCEEDED");
        }
        ERC20(input).transferFrom(msg.sender, address(this), amount);
        value = amount * 2;
        require(value >= minimum, "EXCHANGE_SLIPPAGE");
        ERC20(output).transfer(msg.sender, value);
        if (lie) ++value;
    }
}
contract RouterTestMarket {
    RouterTestToken public token;
    address public core;
    address public trusted;
    mapping(address => uint256) public rights;
    bool public reject;
    constructor(RouterTestToken token_) { token = token_; }
    function configure(address router, address core_) external { trusted = router; core = core_; }
    function setReject(bool value) external { reject = value; }
    function isTrustedForwarder(address who) external view returns (bool) { return trusted == who; }
    function actor() internal view returns (address who) {
        require(msg.sender == trusted, "TRUST");
        assembly { who := shr(96, calldataload(sub(calldatasize(), 20))) }
    }
    function genesisBuy(uint256 input, uint256 minimum, uint64, uint8) external {
        require(!reject && input >= minimum, "BUSINESS_LIMIT");
        rights[actor()] += input;
        token.transferFrom(msg.sender, address(this), input);
    }
    function formalBuy(bool, uint256 quantity, uint256 maximum, uint64) external {
        require(quantity <= maximum, "BUSINESS_LIMIT");
        rights[actor()] += quantity;
        token.transferFrom(msg.sender, address(this), quantity);
    }
    function genesisSell(uint256 quantity, uint256 minimum, uint64, uint8) external {
        require(quantity >= minimum, "BUSINESS_LIMIT");
        rights[actor()] -= quantity;
        token.transfer(msg.sender, quantity);
    }
    function claimAll() external {
        uint256 amount = rights[actor()]; rights[actor()] = 0;
        token.transfer(msg.sender, amount);
    }
}
contract RouterTestCore {
    address public vault;
    constructor(address vault_) { vault = vault_; }
}
contract RouterTestVault {
    RouterTestToken public token;
    address public trusted;
    mapping(address => uint256) public principal;
    mapping(address => uint8) public direction;
    constructor(RouterTestToken token_) { token = token_; }
    function configure(address router) external { trusted = router; }
    function isTrustedForwarder(address who) external view returns (bool) { return trusted == who; }
    function actor() internal view returns (address who) {
        require(msg.sender == trusted, "TRUST");
        assembly { who := shr(96, calldataload(sub(calldatasize(), 20))) }
    }
    function stake(uint8 side, uint256 amount) external {
        principal[actor()] += amount; direction[actor()] = side;
        token.transferFrom(msg.sender, address(this), amount);
    }
    function withdraw() external {
        uint256 amount = principal[actor()]; require(amount > 0, "CLAIMED");
        principal[actor()] = 0; token.transfer(msg.sender, amount);
    }
}
contract DLPAssetRouterTest is Test {
    RouterTestToken c; RouterTestToken u; RouterTestRegistry registry;
    RouterTestExchange exchange; RouterTestMarket market; RouterTestVault vault; DLPAssetRouter router;
    address alice = address(0xa11ce); address bob = address(0xb0b);
    function setUp() public {
        c = new RouterTestToken("STOCK"); u = new RouterTestToken("USD");
        registry = new RouterTestRegistry(); exchange = new RouterTestExchange();
        address[] memory stablecoins = new address[](1); stablecoins[0] = address(u);
        router = new DLPAssetRouter(registry, exchange, stablecoins);
        market = new RouterTestMarket(c); vault = new RouterTestVault(c);
        market.configure(address(router), address(new RouterTestCore(address(vault)))); vault.configure(address(router));
        registry.add(address(market));
        u.mint(alice, 1000); c.mint(alice, 1000);
        c.mint(address(exchange), 100000); u.mint(address(exchange), 100000);
        vm.startPrank(alice); u.approve(address(router), type(uint256).max); c.approve(address(router), type(uint256).max); vm.stopPrank();
    }
    function request(DLPAssetRouter.Action action) internal view returns (DLPAssetRouter.Request memory r) {
        r.market = address(market); r.action = action; r.paymentAsset = address(u);
        r.deadline = uint64(block.timestamp + 1 hours); r.inputAmount = 100; r.minCollateral = 200;
    }
    function testStablecoinBuyCreditsOnlyUserAndClearsApprovals() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy); r.businessLimit = 200;
        vm.prank(alice); router.execute(r);
        assertEq(market.rights(alice), 200); assertEq(market.rights(address(router)), 0);
        assertEq(c.balanceOf(address(router)), 0); assertEq(u.balanceOf(address(router)), 0);
        assertEq(u.allowance(address(router), address(exchange)), 0); assertEq(c.allowance(address(router), address(market)), 0);
    }
    function testDirectCollateralAndStableRouteHaveEquivalentRights() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); router.execute(r);
        r.paymentAsset = address(c); r.inputAmount = 200;
        vm.prank(alice); router.execute(r); assertEq(market.rights(alice), 400);
    }
    function testExactShareBuyReturnsUnusedCollateralToUser() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.FormalBuy);
        r.quantity = 70; r.businessLimit = 100;
        vm.prank(alice); router.execute(r);
        assertEq(market.rights(alice), 70); assertEq(c.balanceOf(alice), 1130);
    }
    function testClaimConvertsToStablecoinAndCannotBeRepeated() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); router.execute(r);
        r.action = DLPAssetRouter.Action.ClaimMarket; r.inputAmount = 0; r.minOutput = 400;
        vm.prank(alice); assertEq(router.execute(r), 400); assertEq(u.balanceOf(alice), 1300);
        vm.prank(alice); vm.expectRevert(bytes("MIN_OUTPUT")); router.execute(r);
    }
    function testCoreStakeAndClaimRetainRealAccountIdentity() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.CoreStake); r.side = 1;
        vm.prank(alice); router.execute(r);
        assertEq(vault.principal(alice), 200); assertEq(vault.principal(address(router)), 0); assertEq(vault.direction(alice), 1);
        r.action = DLPAssetRouter.Action.ClaimCore; r.inputAmount = 0; r.minOutput = 400;
        vm.prank(alice); router.execute(r); assertEq(vault.principal(alice), 0); assertEq(u.balanceOf(alice), 1300);
    }
    function testOutputSlippageRollsBackBurnAndFunds() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); router.execute(r);
        r.action = DLPAssetRouter.Action.GenesisSell; r.quantity = 200; r.inputAmount = 0; r.minOutput = 401;
        vm.prank(alice); vm.expectRevert(bytes("EXCHANGE_SLIPPAGE")); router.execute(r);
        assertEq(market.rights(alice), 200); assertEq(c.balanceOf(address(market)), 200);
    }
    function testBusinessRevertRollsBackSwap() public {
        market.setReject(true); DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); vm.expectRevert(bytes("BUSINESS_LIMIT")); router.execute(r);
        assertEq(u.balanceOf(alice), 1000); assertEq(c.balanceOf(address(exchange)), 100000);
    }
    function testRejectsLyingExchangeByBalanceDelta() public {
        exchange.configure(true, false); DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); vm.expectRevert(bytes("SWAP_OUTPUT")); router.execute(r); assertEq(u.balanceOf(alice), 1000);
    }
    function testOldDonationsCannotBeSweptByNextUser() public {
        c.mint(address(router), 12); u.mint(address(router), 9);
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); router.execute(r);
        assertEq(c.balanceOf(address(router)), 12); assertEq(u.balanceOf(address(router)), 9);
        assertEq(market.rights(alice), 200);
    }
    function testRejectsUnknownMarketAssetExpiredAndBadCoreSide() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy); r.market = bob;
        vm.prank(alice); vm.expectRevert(bytes("MARKET")); router.execute(r);
        r.market = address(market); r.paymentAsset = address(new RouterTestToken("OTHER"));
        vm.prank(alice); vm.expectRevert(bytes("ASSET")); router.execute(r);
        r.paymentAsset = address(u); r.deadline = uint64(block.timestamp - 1);
        vm.prank(alice); vm.expectRevert(bytes("EXPIRED")); router.execute(r);
        r.deadline = uint64(block.timestamp + 1); r.action = DLPAssetRouter.Action.CoreStake; r.side = 3;
        vm.prank(alice); vm.expectRevert(bytes("SIDE")); router.execute(r);
    }
    function testCoreClaimSlippageRestoresClaimRight() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.CoreStake);
        vm.prank(alice); router.execute(r);
        r.action = DLPAssetRouter.Action.ClaimCore; r.inputAmount = 0; r.minOutput = 401;
        vm.prank(alice); vm.expectRevert(bytes("EXCHANGE_SLIPPAGE")); router.execute(r);
        assertEq(vault.principal(alice), 200); assertEq(c.balanceOf(address(vault)), 200);
        r.minOutput = 400; vm.prank(alice); router.execute(r); assertEq(vault.principal(alice), 0);
    }
    function testAnotherCallerCannotSpendUsersRights() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        vm.prank(alice); router.execute(r);
        r.action = DLPAssetRouter.Action.GenesisSell; r.quantity = 200; r.inputAmount = 0;
        vm.prank(bob); vm.expectRevert(); router.execute(r);
        assertEq(market.rights(alice), 200);
    }
    function testExchangeCannotReenterRouter() public {
        DLPAssetRouter.Request memory r = request(DLPAssetRouter.Action.GenesisBuy);
        exchange.setReentry(address(router), abi.encodeCall(router.execute, (r)));
        vm.prank(alice); router.execute(r); assertEq(market.rights(alice), 200);
    }
}
