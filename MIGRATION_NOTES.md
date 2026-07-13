# Velo — Testnet → Mainnet / SaucerSwap Migration Notes

Date: 2026-07-13

This document records the code changes made to move Velo off the brokerage swap
model and onto real SaucerSwap V2 routing, plus the XP/early-adopter changes — and
lists what **you still need to do** before this is safe on mainnet.

---

## 1. What was changed in code

### Swaps now route through SaucerSwap (fee kept in your contract)
- The swap UI (`SwapInterface.tsx`) already called your on-chain **`VeloMainnetProxy`**
  contract, which forwards the trade to **SaucerSwap V2 `exactInputSingle`** and keeps a
  **1% fee inside the contract** (`withdrawFees` / `withdrawHBAR`, owner-only). That design
  is what you asked for and was left in place.
- **Quotes are now real.** Previously the "You Receive" amount came from hardcoded fake
  prices. It now calls the **SaucerSwap V2 QuoterV2** contract on-chain via the mainnet
  mirror node (`src/lib/saucerswap/quoter.ts`), quoting against the post-fee input amount,
  and uses that number for slippage protection. If no pool exists for a pair, the button
  shows **"No route available"** instead of a fake quote.
- USD figures shown next to amounts now come from your SaucerSwap **`/api/prices`** feed
  (your API key), not hardcoded numbers. These are cosmetic only.

### Correct mainnet addresses / chain
- `src/config/appkit.ts`: **chain id fixed 296 → 295** (296 is Hedera *testnet*; 295 is
  mainnet). Wallets (MetaMask via Reown) will now connect to real mainnet.
- `src/lib/saucerswap/quoter.ts`: QuoterV2 **0.0.1390002 → 0.0.3949424** (mainnet), WHBAR
  **→ 0.0.1456986**, mirror node testnet → `mainnet-public`.

### Wallet
- The app already runs on **Reown AppKit / wagmi** (MetaMask-compatible) for the swap and
  header. No change needed there. See "Known issues" for the Transfer/Earn pages.

### Token list
- `src/config/tokens.ts`: **VELO removed** from the swappable list until you list the token.
  Re-add it (with its real token id + a confirmed V2 pool) when listing goes live.

### XP / Early-adopter
- **100 XP per transaction** now fires for **swaps, transfers, and stakes** (was swaps only).
  A new generic route `src/app/api/xp/reward/route.ts` handles transfers/stakes; swaps still
  use `xp/swap-reward`. All are deduped by transaction id.
- **Early-adopter bonus changed from 500 VELO tokens → 500 XP.** The on-chain token airdrop
  routes (`api/claim`, `api/check-airdrop`) were **removed**. New wallets now get the 500 XP
  Early Adopter bonus automatically on connect (wired in `Header.tsx` → `xp/onboard`).
- XP is now keyed by a single canonical id (lowercased EVM address; Hedera `0.0.x` ids are
  resolved to their EVM address) so a user's XP can't split across wallet types.

### Dead brokerage code removed
Deleted: `api/contract-swap`, `api/build-swap`, `api/broker-payout`, `api/swap`,
`api/exchange-whbar`, `api/execute-swap`, `api/get-quote` (mock), `lib/executeVeloMockSwap.ts`,
`hooks/useSaucerQuote.ts`, `lib/hedera/saucerQuote.ts`, `src/contracts/VeloMockRouter.sol`,
and the two root `FlattenedVeloMockRouter*.sol` files.

---

## 2. What YOU must do before mainnet (action items)

1. **Deploy `VeloMainnetProxy` to mainnet** and set `NEXT_PUBLIC_VELO_PROXY_ADDRESS` in
   `.env.local` to the deployed EVM address. Until this is set, swaps point at the zero
   address. (`scripts/deploy-mainnet-proxy.ts` is your starting point — confirm it targets
   mainnet and the mainnet router `0.0.3949434` / WHBAR `0.0.1456986`.)
2. **Associate the proxy with every input token.** The proxy holds the 1% fee in the input
   token and receives the input token during a swap, so on Hedera it must be associated with
   each one. The constructor only auto-associates WHBAR. Easiest fix: after deploy, set the
   contract account's **max auto-associations to unlimited (-1)** via a `ContractUpdate`, or
   add an owner-only associate function. Without this, non-HBAR swaps will revert.
3. **Confirm a SaucerSwap V2 pool exists at fee tier 3000 (0.3%)** for each pair you list.
   The quote/swap currently hardcode fee `3000`. If a token's main pool is a different tier
   (e.g. 500 or 1500), it needs handling or that pair won't quote.
4. **Set mainnet env/secrets**: `OPERATOR_ID`/`OPERATOR_KEY`, `TREASURY_ID`/`TREASURY_KEY`
   must be **mainnet** accounts, funded with HBAR. `SAUCERSWAP_API_KEY`, `NEXT_PUBLIC_PROJECT_ID`
   (Reown), and Supabase keys should already be present.
5. **Apply the XP schema** (`xp_engine.sql`) to your production Supabase/Postgres if not
   already done. The `xp_events.tx_hash` unique constraint is what prevents double-rewards.
6. **Run the production build locally** as the final gate: `npm run build`. (I couldn't run a
   full type-check here because the synced folder is too slow in this sandbox, but there are
   no dangling imports.)

---

## 3. Known issues to decide on

- **"HBARX" token is mislabeled.** In `tokens.ts` the entry named **HBARX / "Staked HBAR"**
  uses token id **`0.0.1460200`**, which is actually **xSAUCE** per SaucerSwap's registry.
  Real HBARX (Stader) is `0.0.834116`. I left it untouched — tell me which you intended and
  I'll correct the id/label and confirm a V2 pool exists.
- **Transfer & Earn pages still use the old HashConnect (HashPack) wallet**, not Reown. Only
  Swap and Header are on Reown. For a MetaMask user, Transfer/Earn won't work until these are
  rewired to Reown/wagmi. XP hooks were added to both, but they'll only fire for HashConnect
  users today. This is the biggest remaining item if you want a single wallet everywhere.
- **XP isn't displayed in the UI yet.** The backend tracks it (`xp/balance` exists), but no
  component shows a user's XP/rank. Easy to add to the profile page if you want it visible.
