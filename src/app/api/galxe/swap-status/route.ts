import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Galxe "Import Your Own Data" (REST credential) endpoint for the swap-quest
 * task — verifies a wallet has actually swapped on Velo, not just clicked
 * through a link.
 *
 * Galxe's own "How to Create Endpoint" doc link 404'd while setting this up,
 * so the exact request/response contract couldn't be confirmed in advance.
 * This accepts every common query-param name for the wallet address and
 * returns the eligibility result under every common field name, so it's
 * very likely to match whatever Galxe actually expects. Verify with Galxe's
 * own "Test address" button once deployed — that live test is the real
 * spec now, adjust field names here if it comes back wrong.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Galxe's platform preflights with OPTIONS before the real GET ("OPTIONS
// Request Check" in their UI) — without this it never gets to testing data.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Same normalization as api/xp/balance: canonical lowercased EVM key. */
async function normalizeWallet(input: string): Promise<string> {
  const w = input.trim();
  if (w.startsWith("0x")) return w.toLowerCase();
  if (/^\d+\.\d+\.\d+$/.test(w)) {
    try {
      const res = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${w}`);
      if (res.ok) {
        const data = await res.json();
        if (data.evm_address) return String(data.evm_address).toLowerCase();
      }
    } catch {
      /* fall through */
    }
  }
  return w.toLowerCase();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw =
    searchParams.get("address") ||
    searchParams.get("wallet") ||
    searchParams.get("account") ||
    searchParams.get("user_address") ||
    searchParams.get("walletAddress") ||
    searchParams.get("id") ||
    "";

  if (!raw) {
    return NextResponse.json(
      { result: false, isEligible: false, value: 0, swapCount: 0, data: { result: false, value: 0 } },
      { headers: CORS_HEADERS }
    );
  }

  const wallet = await normalizeWallet(raw);

  const { data: user } = await supabaseAdmin
    .from("velo_users")
    .select("swap_count")
    .eq("wallet_address", wallet)
    .single();

  const swapCount = (user?.swap_count as number) ?? 0;
  const eligible = swapCount >= 1;

  return NextResponse.json(
    {
      result: eligible,
      isEligible: eligible,
      eligible,
      value: swapCount,
      swapCount,
      data: { result: eligible, value: swapCount },
    },
    { headers: CORS_HEADERS }
  );
}
