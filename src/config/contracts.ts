// Protocol fee taken by VeloMainnetProxy, in basis points. MUST match the
// on-chain feeBasisPoints() value (owner-settable via scripts/set-fee.cjs).
export const PROTOCOL_FEE_BPS = 25; // 0.25%
export const PROTOCOL_FEE_FACTOR = 1 - PROTOCOL_FEE_BPS / 10000;
export const PROTOCOL_FEE_LABEL = `${PROTOCOL_FEE_BPS / 100}%`;

// Non-custodial HBAR staking vault (no owner/admin — only each staker can
// move their own funds). Sourcify-verified. Amounts are tinybars (8 dec).
export const STAKING_VAULT = "0x58525E513a4e4F4Dd732804C2AF42096091dC9eb";
// Same contract as a native Hedera entity id — used by the HashPack (ED25519)
// signing path, which calls the vault via ContractExecuteTransaction.
export const STAKING_VAULT_ID = "0.0.10647892";
export const VAULT_ABI = [
  "function stake() payable",
  "function unstake(uint256 amount)",
  "function stakedOf(address user) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "event Staked(address indexed user, uint256 amount)",
  "event Unstaked(address indexed user, uint256 amount)",
];

export const CONTRACTS = {
  // Mainnet Addresses
  SaucerSwapV2Router: "0x00000000000000000000000000000000003c437a", // 0.0.3949434
  WHBAR: "0x0000000000000000000000000000000000163b5a", // 0.0.1456986
  VeloMainnetProxy: process.env.NEXT_PUBLIC_VELO_PROXY_ADDRESS || "0x0000000000000000000000000000000000000000",

  // ABIs
  ProxyABI: [
    {
      "inputs": [
        { "internalType": "address", "name": "tokenIn", "type": "address" },
        { "internalType": "address", "name": "tokenOut", "type": "address" },
        { "internalType": "uint24", "name": "poolFee", "type": "uint24" },
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
        { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" }
      ],
      "name": "swapExactTokensForTokens",
      "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "tokenOut", "type": "address" },
        { "internalType": "uint24", "name": "poolFee", "type": "uint24" },
        { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" }
      ],
      "name": "swapExactHBARForTokens",
      "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" }
      ],
      "name": "swapExactWHBARForHBAR",
      "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "tokenIn", "type": "address" },
        { "internalType": "uint24", "name": "poolFee", "type": "uint24" },
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
        { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" }
      ],
      "name": "swapExactTokensForHBAR",
      "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  ERC20ABI: [
    {
      "inputs": [
        { "internalType": "address", "name": "spender", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "approve",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]
};
