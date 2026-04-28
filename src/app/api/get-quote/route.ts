import { NextResponse } from "next/server";

const MOCK_PRICES_USD: Record<string, number> = {
  "0.0.8735150": 0.50, // BONZO
  "0.0.8735149": 0.02, // SAUCE (Mock)
  "0.0.8735151": 0.15, // PACK (Mock)
  "0.0.8735221": 1.00, // USDC (Mock)
  "0.0.8734118": 1.00, // USDT (Mock)
  "0.0.8725045": 1.00, // VELO (Mock)
  "0.0.8735222": 0.09, // WHBAR (Mock)
};

export async function POST(req: Request) {
  try {
    const { tokenInId, tokenOutId, amountIn } = await req.json();

    if (!tokenInId || !tokenOutId || !amountIn) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch live HBAR price from SaucerSwap
    let liveHbarUsd = 0.08;
    try {
      const priceResponse = await fetch('https://api.saucerswap.finance/tokens');
      if (priceResponse.ok) {
        const tokensData = await priceResponse.json();
        const hbarData = tokensData.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
        if (hbarData) liveHbarUsd = parseFloat(hbarData.priceUsd);
      }
    } catch (e) {
      console.warn("[Quote API] Oracle failed, using fallback HBAR price.");
    }

    // 2. Calculate Prices
    let priceIn = MOCK_PRICES_USD[tokenInId] || (tokenInId === "NATIVE" ? liveHbarUsd : 0.10);
    let priceOut = MOCK_PRICES_USD[tokenOutId] || (tokenOutId === "NATIVE" ? liveHbarUsd : 0.10);

    // If it's native, use the live price
    if (tokenInId === "NATIVE") priceIn = liveHbarUsd;
    if (tokenOutId === "NATIVE") priceOut = liveHbarUsd;

    const usdValueIn = amountIn * priceIn;
    const amountOut = usdValueIn / priceOut;

    return NextResponse.json({
      success: true,
      amountOut: amountOut,
      priceIn: priceIn,
      priceOut: priceOut,
      liveHbarUsd: liveHbarUsd
    });

  } catch (error: any) {
    console.error("[Quote API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
