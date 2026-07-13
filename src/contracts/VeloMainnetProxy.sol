// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISaucerSwapV2Router {
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


contract VeloMainnetProxy is Ownable {
    using SafeERC20 for IERC20;

    address public immutable saucerSwapRouter;
    address public immutable whbar;

    uint256 public feeBasisPoints = 100; // 1%

    event FeeCollected(address indexed token, uint256 amount);
    event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(address _saucerSwapRouter, address _whbar, address _initialOwner) Ownable(_initialOwner) {
        require(_saucerSwapRouter != address(0), "Invalid router address");
        require(_whbar != address(0), "Invalid WHBAR address");
        saucerSwapRouter = _saucerSwapRouter;
        whbar = _whbar;

        // Auto-associate WHBAR via Hedera Token Service Precompile (0x167)
        (bool success, ) = address(0x167).call(
            abi.encodeWithSelector(0x228df77c, address(this), _whbar)
        );
        // No require(success) needed; if it's already associated or fails, it will just pass
    }

    function setFeeBasisPoints(uint256 _newFee) external onlyOwner {
        require(_newFee <= 10000, "Fee cannot exceed 100%");
        feeBasisPoints = _newFee;
    }

    // Standard ERC20 token swap
    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint24 poolFee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external returns (uint256 amountOut) {
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid tokens");
        require(amountIn > 0, "Amount must be > 0");

        // Transfer tokens from user to this proxy
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate fee
        uint256 feeAmount = (amountIn * feeBasisPoints) / 10000;
        uint256 swapAmount = amountIn - feeAmount;

        emit FeeCollected(tokenIn, feeAmount);

        // Approve router
        IERC20(tokenIn).forceApprove(saucerSwapRouter, swapAmount);

        // Execute swap
        ISaucerSwapV2Router.ExactInputSingleParams memory params = ISaucerSwapV2Router.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: poolFee,
            recipient: msg.sender,
            amountIn: swapAmount,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISaucerSwapV2Router(saucerSwapRouter).exactInputSingle(params);
        
        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // Swap Native HBAR for Tokens — forwards HBAR directly to SaucerSwap router.
    // SaucerSwap V2 router handles HBAR→WHBAR wrapping internally when value is provided.
    // Special case: if tokenOut == whbar, we directly wrap HBAR without going through SaucerSwap.
    function swapExactHBARForTokens(
        address tokenOut,
        uint24 poolFee,
        uint256 amountOutMinimum
    ) external payable returns (uint256 amountOut) {
        require(msg.value > 0, "Must send HBAR");

        // Calculate 1% protocol fee — fees stay in contract, owner withdraws via withdrawHBAR()
        uint256 feeAmount = (msg.value * feeBasisPoints) / 10000;
        uint256 swapAmount = msg.value - feeAmount;

        emit FeeCollected(address(0), feeAmount); // address(0) = native HBAR

        // Special case: HBAR → WHBAR is a direct wrap via the HTS precompile, not a swap
        if (tokenOut == whbar) {
            // Call WHBAR contract's deposit() to wrap the swapAmount of HBAR
            (bool wrapOk, ) = whbar.call{value: swapAmount}(abi.encodeWithSignature("deposit()"));
            require(wrapOk, "HBAR wrap failed");
            // Transfer WHBAR to user
            IERC20(whbar).safeTransfer(msg.sender, swapAmount);
            amountOut = swapAmount;
            emit SwapExecuted(msg.sender, address(0), whbar, msg.value, amountOut);
            return amountOut;
        }

        // Forward remaining HBAR directly to SaucerSwap router.
        // Router wraps it internally as WHBAR before executing the swap.
        ISaucerSwapV2Router.ExactInputSingleParams memory params = ISaucerSwapV2Router.ExactInputSingleParams({
            tokenIn: whbar,
            tokenOut: tokenOut,
            fee: poolFee,
            recipient: msg.sender,
            amountIn: swapAmount,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISaucerSwapV2Router(saucerSwapRouter).exactInputSingle{value: swapAmount}(params);

        emit SwapExecuted(msg.sender, whbar, tokenOut, msg.value, amountOut);
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
