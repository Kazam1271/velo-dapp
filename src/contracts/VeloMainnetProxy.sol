// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// SaucerSwap V2 SwapRouter (UniswapV3-style — params INCLUDE deadline).
/// The mainnet router 0.0.3949434 only implements this selector (0x414bf389);
/// the deadline-less variant reverts unrecognized.
interface ISaucerSwapV2Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// WHBAR helper contract (0.0.1456985) — NOT the HTS token (0.0.1456986).
/// deposit() wraps msg.value and credits WHBAR tokens to msg.sender;
/// withdraw() burns caller WHBAR and sends back HBAR.
interface IWHBAR {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

contract VeloMainnetProxy is Ownable {
    using SafeERC20 for IERC20;

    address public immutable saucerSwapRouter;
    address public immutable whbarContract; // wraps/unwraps (0.0.1456985)
    address public immutable whbarToken;    // HTS token (0.0.1456986)

    uint256 public feeBasisPoints = 25; // 0.25%

    event FeeCollected(address indexed token, uint256 amount);
    event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(
        address _saucerSwapRouter,
        address _whbarContract,
        address _whbarToken,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_saucerSwapRouter != address(0), "Invalid router address");
        require(_whbarContract != address(0), "Invalid WHBAR contract");
        require(_whbarToken != address(0), "Invalid WHBAR token");
        saucerSwapRouter = _saucerSwapRouter;
        whbarContract = _whbarContract;
        whbarToken = _whbarToken;

        // Auto-associate the WHBAR token via the HTS precompile (0x167) so this
        // contract can hold WHBAR from wraps. (Contracts deployed via EVM txs
        // also get unlimited auto-associations, so this is belt-and-braces.)
        (bool success, ) = address(0x167).call(
            abi.encodeWithSelector(0x228df77c, address(this), _whbarToken)
        );
        // Ignore result: already-associated / precompile quirks shouldn't block deploy.
        success;
    }

    function setFeeBasisPoints(uint256 _newFee) external onlyOwner {
        require(_newFee <= 10000, "Fee cannot exceed 100%");
        feeBasisPoints = _newFee;
    }

    // Standard ERC20/HTS token swap via SaucerSwap V2 (single hop).
    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint24 poolFee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external returns (uint256 amountOut) {
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid tokens");
        require(amountIn > 0, "Amount must be > 0");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 feeAmount = (amountIn * feeBasisPoints) / 10000;
        uint256 swapAmount = amountIn - feeAmount;

        emit FeeCollected(tokenIn, feeAmount);

        IERC20(tokenIn).forceApprove(saucerSwapRouter, swapAmount);

        ISaucerSwapV2Router.ExactInputSingleParams memory params = ISaucerSwapV2Router.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: poolFee,
            recipient: msg.sender,
            deadline: block.timestamp + 300,
            amountIn: swapAmount,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISaucerSwapV2Router(saucerSwapRouter).exactInputSingle(params);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // Swap native HBAR for tokens. Special case: tokenOut == WHBAR token is a
    // direct 1:1 wrap through the WHBAR contract (no pool involved).
    function swapExactHBARForTokens(
        address tokenOut,
        uint24 poolFee,
        uint256 amountOutMinimum
    ) external payable returns (uint256 amountOut) {
        require(msg.value > 0, "Must send HBAR");

        uint256 feeAmount = (msg.value * feeBasisPoints) / 10000;
        uint256 swapAmount = msg.value - feeAmount;

        emit FeeCollected(address(0), feeAmount); // address(0) = native HBAR

        if (tokenOut == whbarToken) {
            IWHBAR(whbarContract).deposit{value: swapAmount}();
            IERC20(whbarToken).safeTransfer(msg.sender, swapAmount);
            emit SwapExecuted(msg.sender, address(0), whbarToken, msg.value, swapAmount);
            return swapAmount;
        }

        ISaucerSwapV2Router.ExactInputSingleParams memory params = ISaucerSwapV2Router.ExactInputSingleParams({
            tokenIn: whbarToken,
            tokenOut: tokenOut,
            fee: poolFee,
            recipient: msg.sender,
            deadline: block.timestamp + 300,
            amountIn: swapAmount,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISaucerSwapV2Router(saucerSwapRouter).exactInputSingle{value: swapAmount}(params);

        emit SwapExecuted(msg.sender, whbarToken, tokenOut, msg.value, amountOut);
    }

    // Unwrap WHBAR back to native HBAR (1:1, minus protocol fee).
    // Requires the caller to have approved this contract for amountIn WHBAR.
    function swapExactWHBARForHBAR(uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "Amount must be > 0");

        IERC20(whbarToken).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 feeAmount = (amountIn * feeBasisPoints) / 10000;
        uint256 swapAmount = amountIn - feeAmount;

        emit FeeCollected(whbarToken, feeAmount);

        IWHBAR(whbarContract).withdraw(swapAmount);
        (bool sent, ) = msg.sender.call{value: swapAmount}("");
        require(sent, "HBAR send failed");

        emit SwapExecuted(msg.sender, whbarToken, address(0), amountIn, swapAmount);
        return swapAmount;
    }

    // Owner functions to sweep collected fees
    function withdrawFees(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        IERC20(_token).safeTransfer(owner(), balance);
    }

    function withdrawHBAR() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No HBAR to withdraw");
        (bool success, ) = owner().call{value: balance}("");
        require(success, "HBAR withdrawal failed");
    }

    receive() external payable {}
}
