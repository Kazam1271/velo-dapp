import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("https://api.saucerswap.finance/tokens", {
      headers: {
        "x-api-key": process.env.SAUCERSWAP_API_KEY || "",
      },
      // Revalidate every 30 seconds to keep it fresh
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      console.error("[Prices API] SaucerSwap fetch failed:", response.statusText);
      return NextResponse.json({ error: "Failed to fetch from SaucerSwap" }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Prices API] Internal Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
