import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";

/**
 * Server-side SaucerSwap V2 quoting.
 *
 * WHY THIS EXISTS: the browser used to call the public mirror node's
 * `contracts/call` directly, once PER FEE TIER (4 parallel POSTs per quote,
 * on every debounced keystroke). That endpoint is aggressively rate limited —
 * it returns HTTP 429, every tier resolved to null, and the UI reported
 * "No route available" even though the pool was perfectly fine. (Only
 * HBAR<->WHBAR kept working because it's a 1:1 wrap that needs no quote.)
 *
 * Quoting here instead means: one server IP rather than every user's IP,
 * shared caching across users, sequential (not parallel) probing, and an
 * honest RATE_LIMITED signal so the UI never again mislabels throttling as
 * "no liquidity".
 */

/**
 * The public mirror node rate limits `contracts/call` hard (per IP, with a long
 * cooldown). If quotes are still getting throttled in production, set
 * HEDERA_MIRROR_NODE_URL to a dedicated/paid mirror node (Hgraph, Arkhia, …)
 * — base URL only, e.g. "https://mainnet.hedera.api.hgraph.io/v1/<key>".
 */
const MIRROR_BASE = (process.env.HEDERA_MIRROR_NODE_URL || "https://mainnet-public.mirrornode.hedera.com").replace(/\/$/, "");
const MIRROR = `${MIRROR_BASE}/api/v1/contracts/call`;
const QUOTER_EVM = "0x00000000000000000000000000000000003c4370"; // 0.0.3949424
const WHBAR_EVM = "0x0000000000000000000000000000000000163b5a"; // 0.0.1456986

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];
const iface = new ethers.Interface(QUOTER_V2_ABI);

// SaucerSwap V2 fee tiers (hundredths of a bip): 0.05%, 0.15%, 0.30%, 1.00%.
// Only used as a fallback when the pool list is unavailable.
const FEE_TIERS = [3000, 1500, 500, 10000];

const WHBAR_ID = "0.0.1456986";

/**
 * SaucerSwap's own pool list (not rate limited, needs the API key). It tells us
 * exactly which fee tiers have a pool for a pair, so we quote ONE tier instead
 * of blindly probing four — and can answer "no such pool" truthfully without
 * touching the mirror node at all.
 */
let poolsCache: { pools: any[]; ts: number } | null = null;
const POOLS_TTL = 5 * 60_000;

async function fetchV2Pools(): Promise<any[] | null> {
  if (poolsCache && Date.now() - poolsCache.ts < POOLS_TTL) return poolsCache.pools;
  try {
    const res = await fetch("https://api.saucerswap.finance/v2/pools", {
      headers: { "x-api-key": process.env.SAUCERSWAP_API_KEY || "" },
    });
    if (!res.ok) return poolsCache?.pools ?? null;
    const pools = await res.json();
    if (!Array.isArray(pools)) return poolsCache?.pools ?? null;
    poolsCache = { pools, ts: Date.now() };
    return pools;
  } catch {
    return poolsCache?.pools ?? null;
  }
}

const normaliseId = (tokenId: string) =>
  tokenId === "NATIVE" || tokenId === "HBAR" ? WHBAR_ID : tokenId;

/** Fee tiers that actually have a pool for this pair, deepest liquidity first. */
async function tiersForPair(tokenInId: string, tokenOutId: string): Promise<number[] | null> {
  const pools = await fetchV2Pools();
  if (!pools) return null; // unknown — caller falls back to probing all tiers

  const a = normaliseId(tokenInId);
  const b = normaliseId(tokenOutId);

  return pools
    .filter((p) => {
      const x = p?.tokenA?.id;
      const y = p?.tokenB?.id;
      return (x === a && y === b) || (x === b && y === a);
    })
    .sort((p, q) => Number(BigInt(q.liquidity || 0) - BigInt(p.liquidity || 0)))
    .map((p) => Number(p.fee))
    .filter((f) => Number.isFinite(f));
}

/** Winning fee tier per pair — so repeat quotes cost ONE call, not four. */
const bestTierCache = new Map<string, { fee: number; ts: number }>();
const BEST_TIER_TTL = 10 * 60_000;

/** Short-lived quote cache: collapses bursts of identical requests. */
const quoteCache = new Map<string, { amountOut: string; fee: number; ts: number }>();
const QUOTE_TTL = 8_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toEvmAddress(tokenId: string): string {
  if (tokenId === "NATIVE" || tokenId === "HBAR") return WHBAR_EVM;
  const num = BigInt(tokenId.split(".").pop() || "0");
  return "0x" + num.toString(16).padStart(40, "0");
}

type TierResult = { amountOut: bigint } | "RATE_LIMITED" | "NO_POOL";

/** Quote a single fee tier, retrying briefly through transient 429s. */
async function quoteTier(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  fee: number
): Promise<TierResult> {
  const data = iface.encodeFunctionData("quoteExactInputSingle", [
    { tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0 },
  ]);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(MIRROR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: QUOTER_EVM, data, estimate: false }),
      });

      if (res.status === 429) {
        if (attempt === 2) return "RATE_LIMITED";
        await sleep(400 * (attempt + 1) ** 2); // 400ms, 1.6s
        continue;
      }
      if (!res.ok) return "NO_POOL";

      const out = await res.json();
      // A pool that doesn't exist reverts → empty "0x" result.
      if (!out?.result || out.result === "0x") return "NO_POOL";

      const decoded = iface.decodeFunctionResult("quoteExactInputSingle", out.result);
      const amountOut = BigInt(decoded.amountOut.toString());
      return amountOut > 0n ? { amountOut } : "NO_POOL";
    } catch {
      return "NO_POOL";
    }
  }
  return "RATE_LIMITED";
}

export async function POST(req: Request) {
  try {
    const { tokenInId, tokenOutId, amountIn, decimalsIn } = await req.json();
    if (!tokenInId || !tokenOutId || !amountIn) {
      return NextResponse.json({ ok: false, reason: "BAD_REQUEST" }, { status: 400 });
    }

    const tokenIn = toEvmAddress(tokenInId);
    const tokenOut = toEvmAddress(tokenOutId);
    const amount = ethers.parseUnits(String(amountIn), decimalsIn ?? 8);

    const pairKey = `${tokenIn}-${tokenOut}`;
    const quoteKey = `${pairKey}-${amount.toString()}`;
    const now = Date.now();

    const cachedQuote = quoteCache.get(quoteKey);
    if (cachedQuote && now - cachedQuote.ts < QUOTE_TTL) {
      return NextResponse.json({ ok: true, amountOut: cachedQuote.amountOut, fee: cachedQuote.fee, cached: true });
    }

    // Fast path: we already know this pair's best tier — one call instead of four.
    const cachedTier = bestTierCache.get(pairKey);
    if (cachedTier && now - cachedTier.ts < BEST_TIER_TTL) {
      const r = await quoteTier(tokenIn, tokenOut, amount, cachedTier.fee);
      if (typeof r === "object") {
        const amountOut = r.amountOut.toString();
        quoteCache.set(quoteKey, { amountOut, fee: cachedTier.fee, ts: now });
        return NextResponse.json({ ok: true, amountOut, fee: cachedTier.fee });
      }
      if (r === "RATE_LIMITED") {
        return NextResponse.json({ ok: false, reason: "RATE_LIMITED" });
      }
      bestTierCache.delete(pairKey); // tier went stale — fall through to a full probe
    }

    // Ask SaucerSwap which tiers actually have a pool, so we quote only those.
    const knownTiers = await tiersForPair(tokenInId, tokenOutId);
    if (knownTiers && knownTiers.length === 0) {
      // Authoritative: this pair genuinely has no direct V2 pool.
      return NextResponse.json({ ok: false, reason: "NO_ROUTE" });
    }
    const tiersToProbe = knownTiers && knownTiers.length > 0 ? knownTiers : FEE_TIERS;

    // Sequential (never parallel) so we stay under the mirror node's rate limit.
    let best: { amountOut: bigint; fee: number } | null = null;
    let sawRateLimit = false;

    for (const fee of tiersToProbe) {
      const r = await quoteTier(tokenIn, tokenOut, amount, fee);
      if (r === "RATE_LIMITED") {
        sawRateLimit = true;
        break; // already throttled — stop hammering
      }
      if (typeof r === "object" && (!best || r.amountOut > best.amountOut)) {
        best = { amountOut: r.amountOut, fee };
      }
      await sleep(120); // be gentle between tiers
    }

    if (best) {
      const amountOut = best.amountOut.toString();
      bestTierCache.set(pairKey, { fee: best.fee, ts: now });
      quoteCache.set(quoteKey, { amountOut, fee: best.fee, ts: now });
      return NextResponse.json({ ok: true, amountOut, fee: best.fee });
    }

    // Only claim "no route" when we actually got clean answers from the network.
    return NextResponse.json({ ok: false, reason: sawRateLimit ? "RATE_LIMITED" : "NO_ROUTE" });
  } catch (error: any) {
    console.error("[Quote API] error:", error);
    return NextResponse.json({ ok: false, reason: "ERROR", error: error.message }, { status: 500 });
  }
}
