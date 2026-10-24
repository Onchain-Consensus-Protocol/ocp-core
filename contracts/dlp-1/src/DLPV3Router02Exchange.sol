// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDLPAssetExchange} from "./DLPAssetRouter.sol";

/// @dev Uniswap SwapRouter02 ABI: deadline is enforced by this adapter before the call.
/// Other router variants may use a different ABI. Deployment must verify exact bytecode,
/// ABI, token permissions and actual pool liquidity; this does not establish chain compatibility.
interface IDLPV3Router02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Immutable single stock/stable pool adapter for DLPAssetRouter.
/// @dev Permissionless callers receive only their own swap delta; pre-existing balances stay put.
contract DLPV3Router02Exchange is IDLPAssetExchange {
    using SafeERC20 for IERC20;
    IDLPV3Router02 public immutable dexRouter;
    address public immutable stock;
    address public immutable stable;
    uint24 public immutable fee;
    uint256 private entered = 1;
    constructor(IDLPV3Router02 dex_, address stock_, address stable_, uint24 fee_) {
        require(address(dex_).code.length > 0 && stock_.code.length > 0 && stable_.code.length > 0, "CONFIG");
        require(stock_ != stable_ && fee_ > 0 && fee_ < 1_000_000, "PAIR");
        dexRouter = dex_; stock = stock_; stable = stable_; fee = fee_;
    }
    function swapExactInput(address input, address output, uint256 amount, uint256 minOutput, uint64 deadline)
        external returns (uint256 received)
    {
        require(entered == 1, "REENTER"); entered = 2;
        require(block.timestamp <= deadline && amount > 0, "TIME_AMOUNT");
        require((input == stock && output == stable) || (input == stable && output == stock), "PAIR");
        IERC20 inToken = IERC20(input); IERC20 outToken = IERC20(output);
        uint256 beforeInput = inToken.balanceOf(address(this));
        uint256 beforeOutput = outToken.balanceOf(address(this));
        inToken.safeTransferFrom(msg.sender, address(this), amount);
        require(inToken.balanceOf(address(this)) == beforeInput + amount, "EXACT_INPUT");
        inToken.forceApprove(address(dexRouter), amount);
        uint256 reported = dexRouter.exactInputSingle(IDLPV3Router02.ExactInputSingleParams({
            tokenIn: input, tokenOut: output, fee: fee, recipient: address(this),
            amountIn: amount, amountOutMinimum: minOutput, sqrtPriceLimitX96: 0
        }));
        inToken.forceApprove(address(dexRouter), 0);
        require(inToken.balanceOf(address(this)) == beforeInput, "INPUT_DELTA");
        received = outToken.balanceOf(address(this)) - beforeOutput;
        require(received == reported && received >= minOutput, "OUTPUT_DELTA");
        uint256 recipientBefore = outToken.balanceOf(msg.sender);
        outToken.safeTransfer(msg.sender, received);
        require(outToken.balanceOf(msg.sender) == recipientBefore + received, "EXACT_OUTPUT");
        require(outToken.balanceOf(address(this)) == beforeOutput, "RESIDUE");
        entered = 1;
    }
}
