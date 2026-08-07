/**
 * SaucerSwap V2 quoting (client side).
 *
 * Quotes go through our own `/api/quote` route rather than the browser calling
 * the public mirror node directly. The direct approach fired one
 * `contracts/call` POST per fee tier, in parallel, on every debounced
 * keystroke — which the public mirror node rate limits (HTTP 429). Every tier
 * then failed and the UI wrongly reported "No route available" for pairs that
 * had perfectly good liquidity. See src/app/api/quote/route.ts.
 */

export type QuoteFailure = "RATE_LIMITED" | "NO_ROUTE";

export interface QuoteResult {
  amountOut: string;
  fee: number;
}

/**
 * Best quote across SaucerSwap V2 fee tiers.
 * Returns null when no pool exists OR the quote service is unavailable — use
 * `getBestSaucerSwapQuoteDetailed` when you need to tell those apart.
 */
export async function getBestSaucerSwapQuote(
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  decimalsIn: number
): Promise<QuoteResult | null> {
  const res = await getBestSaucerSwapQuoteDetailed(tokenInId, tokenOutId, amountIn, decimalsIn);
  return res.ok ? { amountOut: res.amountOut, fee: res.fee } : null;
}

/** Same as above but distinguishes "no pool" from "rate limited / unavailable". */
export async function getBestSaucerSwapQuoteDetailed(
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  decimalsIn: number
): Promise<({ ok: true } & QuoteResult) | { ok: false; reason: QuoteFailure }> {
  try {
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenInId, tokenOutId, amountIn, decimalsIn }),
    });

    if (!response.ok) return { ok: false, reason: "RATE_LIMITED" };

    const data = await response.json();
    if (data?.ok && data.amountOut && data.amountOut !== "0") {
      return { ok: true, amountOut: data.amountOut, fee: data.fee };
    }
    return { ok: false, reason: data?.reason === "NO_ROUTE" ? "NO_ROUTE" : "RATE_LIMITED" };
  } catch (error) {
    console.error("[Quoter] quote request failed:", error);
    return { ok: false, reason: "RATE_LIMITED" };
  }
}
