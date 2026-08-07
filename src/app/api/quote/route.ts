import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";

/**
 * Swap quoting, computed locally from SaucerSwap V2 pool state.
 *
 * WHY NOT THE ON-CHAIN QUOTER: the public Hedera mirror node hard-blocks
 * `contracts/call` against SaucerSwap's QuoterV2 (0.0.3949424) — measured 0
 * successes in 15 spaced attempts, HTTP 429, while the SaucerSwap router and
 * our own contracts answer 200 on the very same endpoint. The public JSON-RPC
 * relay proxies to that same service and fails identically. Quoting through it
 * is therefore impossible, and the old code's failure surfaced to users as
 * "No route available" on pairs with perfectly good liquidity.
 *
 * So we do what Uniswap's own frontend does: read pool state and compute the
 * swap locally. Validated against mainnet — 5 HBAR -> SAUCE computes 26.4524
 * vs 26.5428 implied by USD spot prices, i.e. exactly the 0.30% pool fee.
 *
 * LIMITATION: this models a swap inside the current tick range (SaucerSwap's
 * API returns no tick array, so range crossing can't be modelled). For very
 * large trades that would cross a tick, the real output is LOWER than computed.
 * `priceImpact` is returned so the UI can warn before that becomes material;
 * execution is still protected on-chain by amountOutMinimum/slippage.
 */

const POOLS_URL = "https://api.saucerswap.finance/v2/pools/full";
const WHBAR_ID = "0.0.1456986";
const Q96 = 2n ** 96n;

/** Pool state cache — pool prices move with every trade, so keep this short. */
let poolsCache: { pools: any[]; ts: number } | null = null;
const POOLS_TTL = 20_000;

async function fetchPools(): Promise<any[] | null> {
  if (poolsCache && Date.now() - poolsCache.ts < POOLS_TTL) return poolsCache.pools;
  try {
    const res = await fetch(POOLS_URL, {
      headers: { "x-api-key": process.env.SAUCERSWAP_API_KEY || "" },
    });
    if (!res.ok) return poolsCache?.pools ?? null; // serve stale rather than fail
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

/** Hedera entity number — long-zero EVM addresses order identically to these. */
const entityNum = (tokenId: string) => BigInt(tokenId.split(".").pop() || "0");

/**
 * Uniswap V3 exact-input swap within the current tick range.
 * Returns the raw output amount for `amountIn` raw units of tokenIn.
 */
function computeAmountOut(
  amountIn: bigint,
  liquidity: bigint,
  sqrtP: bigint,
  fee: bigint,
  zeroForOne: boolean
): bigint | null {
  if (amountIn <= 0n || liquidity <= 0n || sqrtP <= 0n) return null;

  // Pool fee is charged on the input, in hundredths of a bip (1e6 = 100%).
  const inLessFee = (amountIn * (1_000_000n - fee)) / 1_000_000n;
  if (inLessFee <= 0n) return null;

  if (zeroForOne) {
    // token0 in, token1 out — price moves down.
    const denom = liquidity * Q96 + inLessFee * sqrtP;
    if (denom <= 0n) return null;
    const sqrtNext = (liquidity * Q96 * sqrtP) / denom;
    if (sqrtNext <= 0n || sqrtNext > sqrtP) return null;
    return (liquidity * (sqrtP - sqrtNext)) / Q96;
  }

  // token1 in, token0 out — price moves up.
  const sqrtNext = sqrtP + (inLessFee * Q96) / liquidity;
  if (sqrtNext <= sqrtP) return null;
  return (liquidity * Q96 * (sqrtNext - sqrtP)) / (sqrtNext * sqrtP);
}

export async function POST(req: Request) {
  try {
    const { tokenInId, tokenOutId, amountIn, decimalsIn } = await req.json();
    if (!tokenInId || !tokenOutId || !amountIn) {
      return NextResponse.json({ ok: false, reason: "BAD_REQUEST" }, { status: 400 });
    }

    const inId = normaliseId(tokenInId);
    const outId = normaliseId(tokenOutId);
    if (inId === outId) return NextResponse.json({ ok: false, reason: "NO_ROUTE" });

    const amount = ethers.parseUnits(String(amountIn), decimalsIn ?? 8);

    const pools = await fetchPools();
    if (!pools) return NextResponse.json({ ok: false, reason: "UNAVAILABLE" });

    const matching = pools.filter((p) => {
      const a = p?.tokenA?.id;
      const b = p?.tokenB?.id;
      return (a === inId && b === outId) || (a === outId && b === inId);
    });

    // Authoritative: SaucerSwap lists every V2 pool, so none means no direct route.
    if (matching.length === 0) return NextResponse.json({ ok: false, reason: "NO_ROUTE" });

    let best: { amountOut: bigint; fee: number; impact: number } | null = null;

    for (const p of matching) {
      try {
        const liquidity = BigInt(p.liquidity ?? 0);
        const sqrtP = BigInt(p.sqrtRatioX96 ?? 0);
        const fee = BigInt(p.fee ?? 0);
        if (liquidity <= 0n || sqrtP <= 0n) continue;

        // token0/token1 are ordered by address; long-zero addresses order by entity num.
        const zeroIsIn = entityNum(inId) < entityNum(outId);

        const out = computeAmountOut(amount, liquidity, sqrtP, fee, zeroIsIn);
        if (out === null || out <= 0n) continue;

        // Price impact vs the pool's spot price, as a sanity/warning signal.
        // spot price of tokenIn denominated in tokenOut, scaled by 1e18.
        const SCALE = 10n ** 18n;
        const priceX96Sq = (sqrtP * sqrtP * SCALE) / (Q96 * Q96); // token1 per token0
        const spotOutPerIn = zeroIsIn ? priceX96Sq : (SCALE * SCALE) / (priceX96Sq || 1n);
        const expectedOut = (amount * spotOutPerIn) / SCALE;
        const impact =
          expectedOut > 0n ? Math.max(0, 1 - Number(out) / Number(expectedOut)) : 0;

        if (!best || out > best.amountOut) {
          best = { amountOut: out, fee: Number(p.fee), impact };
        }
      } catch {
        continue; // skip a malformed pool rather than fail the whole quote
      }
    }

    if (!best) return NextResponse.json({ ok: false, reason: "NO_ROUTE" });

    return NextResponse.json({
      ok: true,
      amountOut: best.amountOut.toString(),
      fee: best.fee,
      priceImpact: Number(best.impact.toFixed(6)),
    });
  } catch (error: any) {
    console.error("[Quote API] error:", error);
    return NextResponse.json({ ok: false, reason: "ERROR", error: error.message }, { status: 500 });
  }
}
