import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { grantRolesForXp } from "@/lib/discord/roles";
import { buildVerifyMessage } from "@/lib/discord/verifyMessage";

export const dynamic = "force-dynamic";

/**
 * Completes a Discord <-> wallet link.
 *
 * SECURITY: the whole point of this route is proving the caller actually owns
 * the wallet they claim — otherwise anyone could type a whale's address and
 * inherit their XP and roles. Ownership is proven by an EVM signature over a
 * one-time, short-lived, single-use nonce that is bound to a specific Discord
 * user. The address is RECOVERED from the signature; it is never trusted from
 * the request body.
 */

export async function POST(req: Request) {
  try {
    const { code, signature } = await req.json();

    if (!code || !signature) {
      return NextResponse.json({ success: false, error: "Missing code or signature." }, { status: 400 });
    }

    // 1. Look up the nonce.
    const { data: nonce } = await supabaseAdmin
      .from("discord_verify_nonces")
      .select("code, discord_id, discord_username, expires_at, consumed_at")
      .eq("code", code)
      .single();

    if (!nonce) {
      return NextResponse.json({ success: false, error: "Invalid or unknown code. Run /verify in Discord again." }, { status: 400 });
    }
    if (nonce.consumed_at) {
      return NextResponse.json({ success: false, error: "This link has already been used. Run /verify again for a fresh one." }, { status: 400 });
    }
    if (new Date(nonce.expires_at as string).getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: "This link has expired. Run /verify in Discord for a new one." }, { status: 400 });
    }

    // 2. Recover the signer. This is the ownership proof — we derive the
    //    address from the signature rather than trusting any claimed address.
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(buildVerifyMessage(code as string), signature);
    } catch {
      return NextResponse.json({ success: false, error: "Signature could not be verified." }, { status: 400 });
    }
    const wallet = recovered.toLowerCase();

    // 3. Refuse if this wallet is already linked to a DIFFERENT Discord account,
    //    so one wallet's XP can't grant roles to several people.
    const { data: existing } = await supabaseAdmin
      .from("discord_links")
      .select("discord_id")
      .eq("wallet_address", wallet)
      .maybeSingle();

    if (existing && existing.discord_id !== nonce.discord_id) {
      return NextResponse.json(
        { success: false, error: "This wallet is already linked to another Discord account." },
        { status: 409 }
      );
    }

    // 4. Read the wallet's real XP.
    const { data: user } = await supabaseAdmin
      .from("velo_users")
      .select("xp, swap_count")
      .eq("wallet_address", wallet)
      .maybeSingle();

    const xp = (user?.xp as number) ?? 0;

    // 5. Persist the link and burn the nonce.
    const { error: linkErr } = await supabaseAdmin.from("discord_links").upsert(
      {
        discord_id: nonce.discord_id,
        wallet_address: wallet,
        discord_username: nonce.discord_username,
        verified_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "discord_id" }
    );
    if (linkErr) throw linkErr;

    await supabaseAdmin
      .from("discord_verify_nonces")
      .update({ consumed_at: new Date().toISOString() })
      .eq("code", code);

    // 6. Grant roles. Failures here are reported, not swallowed — the link
    //    still succeeded even if Discord rejected a role.
    const { granted, failed } = await grantRolesForXp(nonce.discord_id as string, xp);

    return NextResponse.json({
      success: true,
      wallet,
      xp,
      swaps: (user?.swap_count as number) ?? 0,
      rolesGranted: granted,
      rolesFailed: failed,
    });
  } catch (error: any) {
    console.error("[Discord Verify] error:", error);
    return NextResponse.json({ success: false, error: "Verification failed. Try again." }, { status: 500 });
  }
}
