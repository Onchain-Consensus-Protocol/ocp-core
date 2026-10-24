// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Immutable, deployment-reviewed exchanger. It pulls exact input from this router and
/// sends output only to this router; no arbitrary target or calldata is accepted.
interface ITopicMarketAssetExchange {
    function swapExactInput(address input, address output, uint256 amount, uint256 minOutput, uint64 deadline)
        external returns (uint256 outputAmount);
}
interface ITopicMarketRouterRegistry { function isMarket(address market) external view returns (bool); }
interface ITopicMarketRouterMarket {
    function token() external view returns (address);
    function core() external view returns (address);
    function isTrustedForwarder(address forwarder) external view returns (bool);
}
interface ITopicMarketRouterCore {
    function vault() external view returns (address);
}
interface ITopicMarketRouterForwarded { function isTrustedForwarder(address forwarder) external view returns (bool); }

/// @notice User-invoked, atomic stablecoin conversion and typed market/Core actions.
/// @dev Native collateral remains claimable directly. Stock availability and executable exchange
/// liquidity are deployment prerequisites, not supplied or guaranteed by this contract.
contract TopicMarketAssetRouter {
    using SafeERC20 for IERC20;
    enum Action { GenesisBuy, FormalBuy, CoreStake, GenesisSell, FormalSell, ClaimMarket,
        ClaimOutcome, ClaimLP, ClaimB, ClaimFailed, ClaimCore, RedeemPairs }
    /// @dev quantity is exact Formal outcome shares, Genesis sell shares, or pair-redemption money.
    /// businessLimit is Genesis buy minShares / Formal buy maxCollateral / sell minCollateral.
    /// minCollateral protects entry conversion; minOutput protects exit conversion.
    /// Funding actions have no cash output; Formal-buy unspent collateral is refunded in C.
    /// side uses 0=YES,1=NO,2=INVALID (Core only). Payout recipient is always caller.
    struct Request {
        address market;
        Action action;
        address paymentAsset;
        uint256 inputAmount;
        uint256 quantity;
        uint256 minCollateral;
        uint256 businessLimit;
        uint256 minOutput;
        uint64 deadline;
        uint8 side;
        uint8 graduationIntent;
    }
    ITopicMarketRouterRegistry public immutable factory;
    ITopicMarketAssetExchange public immutable exchange;
    mapping(address => bool) public stablecoin;
    uint256 private entered = 1;
    event Routed(address indexed user, address indexed market, Action action, address paymentAsset,
        uint256 inputAmount, uint256 outputAmount);

    constructor(ITopicMarketRouterRegistry factory_, ITopicMarketAssetExchange exchange_, address[] memory stablecoins) {
        // The immutable registry may be the predicted address of the next factory deployment.
        // The factory must verify the reverse router.factory() binding in its constructor.
        require(address(factory_) != address(0) && address(exchange_).code.length > 0, "CONFIG");
        factory = factory_; exchange = exchange_;
        for (uint256 i; i < stablecoins.length; ++i) {
            require(stablecoins[i].code.length > 0 && !stablecoin[stablecoins[i]], "STABLECOIN");
            stablecoin[stablecoins[i]] = true;
        }
    }
    function execute(Request calldata r) external returns (uint256 output) {
        require(entered == 1, "REENTER"); entered = 2;
        require(block.timestamp <= r.deadline, "EXPIRED");
        require(factory.isMarket(r.market), "MARKET");
        ITopicMarketRouterMarket market = ITopicMarketRouterMarket(r.market);
        address collateral = market.token();
        require(market.isTrustedForwarder(address(this)), "FORWARDER");
        require(r.paymentAsset == collateral || stablecoin[r.paymentAsset], "ASSET");
        uint256 collateralBefore = IERC20(collateral).balanceOf(address(this));
        uint256 paymentBefore = IERC20(r.paymentAsset).balanceOf(address(this));
        bool funding = uint8(r.action) <= uint8(Action.CoreStake);
        address target = r.market;
        if (r.action == Action.CoreStake || r.action == Action.ClaimCore) {
            target = ITopicMarketRouterCore(market.core()).vault();
            require(ITopicMarketRouterForwarded(target).isTrustedForwarder(address(this)), "CORE_FORWARDER");
        }
        uint256 funded;
        if (funding) {
            require(r.inputAmount > 0, "INPUT");
            _pull(r.paymentAsset, msg.sender, r.inputAmount);
            funded = r.paymentAsset == collateral ? r.inputAmount
                : _swap(r.paymentAsset, collateral, r.inputAmount, r.minCollateral, r.deadline);
            require(funded >= r.minCollateral, "MIN_COLLATERAL");
            IERC20(collateral).forceApprove(target, funded);
        } else require(r.inputAmount == 0, "NO_INPUT");
        bytes memory callData = _action(r, funded);
        (bool ok, bytes memory reason) = target.call(abi.encodePacked(callData, msg.sender));
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
        if (funding) IERC20(collateral).forceApprove(target, 0);
        uint256 remaining = IERC20(collateral).balanceOf(address(this)) - collateralBefore;
        if (funding) {
            // A formal exact-share buy may consume less than the received collateral. Return the
            // exact remainder in collateral; never execute a second unexpected exchange on a refund.
            if (remaining > 0) _send(collateral, msg.sender, remaining);
        } else {
            output = r.paymentAsset == collateral ? remaining
                : _swap(collateral, r.paymentAsset, remaining, r.minOutput, r.deadline);
            require(output >= r.minOutput, "MIN_OUTPUT");
            if (output > 0) _send(r.paymentAsset, msg.sender, output);
        }
        require(IERC20(collateral).balanceOf(address(this)) == collateralBefore, "COLLATERAL_RESIDUE");
        require(IERC20(r.paymentAsset).balanceOf(address(this)) == paymentBefore, "PAYMENT_RESIDUE");
        emit Routed(msg.sender, r.market, r.action, r.paymentAsset, r.inputAmount, output);
        entered = 1;
    }
    function _action(Request calldata r, uint256 funded) private pure returns (bytes memory) {
        if (r.action == Action.GenesisBuy) return abi.encodeWithSignature("genesisBuy(uint256,uint256,uint64,uint8)", funded, r.businessLimit, r.deadline, r.graduationIntent);
        if (r.action == Action.FormalBuy) {
            require(r.side < 2, "SIDE");
            uint256 maximum = r.businessLimit < funded ? r.businessLimit : funded;
            return abi.encodeWithSignature("formalBuy(bool,uint256,uint256,uint64)", r.side == 0, r.quantity, maximum, r.deadline);
        }
        if (r.action == Action.CoreStake) {
            require(r.side < 3, "SIDE");
            return abi.encodeWithSignature("stake(uint8,uint256)", r.side, funded);
        }
        if (r.action == Action.GenesisSell) return abi.encodeWithSignature("genesisSell(uint256,uint256,uint64,uint8)", r.quantity, r.businessLimit, r.deadline, r.graduationIntent);
        if (r.action == Action.FormalSell) {
            require(r.side < 2, "SIDE");
            return abi.encodeWithSignature("formalSell(bool,uint256,uint256,uint64)", r.side == 0, r.quantity, r.businessLimit, r.deadline);
        }
        if (r.action == Action.ClaimMarket) return abi.encodeWithSignature("claimAll()");
        if (r.action == Action.ClaimOutcome) return abi.encodeWithSignature("claimOutcome()");
        if (r.action == Action.ClaimLP) return abi.encodeWithSignature("claimLP()");
        if (r.action == Action.ClaimB) return abi.encodeWithSignature("claimB()");
        if (r.action == Action.ClaimFailed) return abi.encodeWithSignature("claimFailed()");
        if (r.action == Action.ClaimCore) return abi.encodeWithSignature("withdraw()");
        require(r.action == Action.RedeemPairs, "ACTION");
        return abi.encodeWithSignature("redeemPairs(uint256)", r.quantity);
    }
    function _swap(address input, address output, uint256 amount, uint256 minimum, uint64 deadline)
        private returns (uint256 received)
    {
        if (amount == 0) { require(minimum == 0, "MIN_OUTPUT"); return 0; }
        uint256 beforeInput = IERC20(input).balanceOf(address(this));
        uint256 beforeOutput = IERC20(output).balanceOf(address(this));
        IERC20(input).forceApprove(address(exchange), amount);
        uint256 reported = exchange.swapExactInput(input, output, amount, minimum, deadline);
        IERC20(input).forceApprove(address(exchange), 0);
        require(IERC20(input).balanceOf(address(this)) == beforeInput - amount, "SWAP_INPUT");
        received = IERC20(output).balanceOf(address(this)) - beforeOutput;
        require(received == reported && received >= minimum, "SWAP_OUTPUT");
    }
    function _pull(address asset, address from, uint256 amount) private {
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(from, address(this), amount);
        require(IERC20(asset).balanceOf(address(this)) == beforeBalance + amount, "EXACT_INPUT");
    }
    function _send(address asset, address to, uint256 amount) private {
        uint256 beforeBalance = IERC20(asset).balanceOf(to);
        IERC20(asset).safeTransfer(to, amount);
        require(IERC20(asset).balanceOf(to) == beforeBalance + amount, "EXACT_OUTPUT");
    }
}
