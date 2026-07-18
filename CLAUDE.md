# Velo dApp

Velo is a Hedera DEX (veloexchange.org),
Next.js 16 + TypeScript + Solidity. Currently migrating from testnet/brokerage to
**mainnet + real SaucerSwap V2 routing**. See `MIGRATION_NOTES.md` for the full detail.

## Architecture (current)
- **Swaps** route through the on-chain `VeloMainnetProxy` contract (`src/contracts/VeloMainnetProxy.sol`),
  which calls SaucerSwap V2 `exactInputSingle` and keeps a **1% fee in-contract** (owner-withdrawable).
  This is **single-hop only** — pairs must share a direct pool (in practice, WHBAR/HBAR).
- **Quotes**: `src/lib/saucerswap/quoter.ts` calls SaucerSwap V2 QuoterV2 (mainnet `0.0.3949424`)
  via the mainnet mirror node. `getBestSaucerSwapQuote` tries all fee tiers (500/1500/3000/10000)
  and returns the best pool + tier; `SwapInterface.tsx` uses that tier for the actual swap.
- **Wallet**: Reown AppKit / wagmi (MetaMask-compatible, ECDSA accounts only) for Swap,
  Transfer, Earn + Header. **Earn and Transfer additionally support native HashPack pairing
  (ED25519 accounts)** via `HashConnectProvider` (mainnet): Earn calls the vault through
  `ContractExecuteTransaction`, Transfer sends a `TransferTransaction`. Shared native-path
  helpers in `src/lib/hedera/nativeWallet.ts`; the EVM path is preferred when both are
  connected. Swap is still EVM-only.
- **XP system** (Supabase/Postgres, schema in `xp_engine.sql`):
  - 500 XP "Early Adopter" bonus on first wallet connect (`api/xp/onboard`, wired in `Header.tsx`).
    (This replaced the old 500 VELO token airdrop, which was removed.)
  - 100 XP per transaction: swaps (`api/xp/swap-reward`), transfers + stakes (`api/xp/reward`).
  - XP keyed by canonical **lowercased EVM address** (Hedera `0.0.x` ids resolved via mirror node).
  - `api/xp/balance` (profile card) and `api/xp/leaderboard` (leaderboard page) read XP.

## Swappable tokens (`src/config/tokens.ts`)
Active: HBAR, WHBAR, SAUCE, xSAUCE (`0.0.1460200`), USDC (`0.0.456858`). VELO removed until listed.
Adding a token requires: real mainnet id + EVM address + decimals + a live SaucerSwap V2 pool.

## Key config
- `src/config/appkit.ts` — Hedera mainnet chain id **295** (not 296 = testnet).
- `src/config/contracts.ts` — SaucerSwap router `0.0.3949434`, WHBAR `0.0.1456986`,
  `VeloMainnetProxy` from `NEXT_PUBLIC_VELO_PROXY_ADDRESS`.
- `.env.local` — Supabase, `SAUCERSWAP_API_KEY`, `NEXT_PUBLIC_PROJECT_ID` (Reown),
  `OPERATOR_ID/KEY`, `TREASURY_ID/KEY`. Must be **mainnet** accounts before launch.

## Run locally
```
npm install
npm run dev   # -> http://localhost:3000
```

## Open items / TODO (see MIGRATION_NOTES.md §2–3)
1. Deploy `VeloMainnetProxy` to mainnet; set `NEXT_PUBLIC_VELO_PROXY_ADDRESS`.
2. Set the proxy's max auto-associations to unlimited (-1) so it can hold non-HBAR fee tokens.
3. (Optional) Extend native HashPack (ED25519) support from Earn+Transfer to Swap
   (needs HTS `AccountAllowanceApproveTransaction` instead of ERC20 approve).
4. (Optional) Multi-hop routing (`exactInput` with a path) for true any-to-any swaps.
5. Add PACK/USDT once their mainnet ids + V2 pools are verified.

## Conventions
- Don't hardcode unverified token ids or contract addresses — verify against SaucerSwap docs/API.
- XP wallet keys must stay canonical (lowercased EVM); reuse the `normalizeWallet` pattern.
- A full `tsc`/`npm run build` is the pre-push gate.
