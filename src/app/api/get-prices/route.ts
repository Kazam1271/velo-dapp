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

export async function GET() {
  try {
    let hbarPrice = 0.08;
    
    // 1. Fetch live HBAR price from SaucerSwap
    try {
      const response = await fetch('https://api.saucerswap.finance/tokens', {
        next: { revalidate: 60 } // Cache for 60 seconds
      });
      if (response.ok) {
        const tokens = await response.json();
        const hbar = tokens.find((t: any) => t.symbol === 'WHBAR' || t.symbol === 'HBAR');
        if (hbar) hbarPrice = parseFloat(hbar.priceUsd);
      }
    } catch (e) {
      console.warn("[Prices API] SaucerSwap fetch failed, using fallback.");
    }

    // 2. Build complete price map
    const priceMap: Record<string, number> = {
      ...MOCK_PRICES_USD,
      "HBAR": hbarPrice,
      "NATIVE": hbarPrice
    };

    return NextResponse.json({
      success: true,
      prices: priceMap,
      timestamp: Date.now()
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
