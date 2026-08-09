import { NextResponse } from "next/server";
import { verifyKey, InteractionType, InteractionResponseType } from "discord-interactions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Discord "HTTP Interactions" endpoint for /leaderboard and /rank — shows
 * REAL Velo XP (swaps/stakes/transfers, same data as veloexchange.org's
 * leaderboard), not a generic Discord chat-activity bot. No persistent bot
 * process to host: Discord calls this URL directly per slash command.
 *
 * Setup (Discord Developer Portal, one-time, done outside this codebase):
 * 1. Create an Application, get its Public Key + Application ID + Bot Token.
 * 2. Set DISCORD_PUBLIC_KEY (this route), DISCORD_APP_ID + DISCORD_BOT_TOKEN
 *    (scripts/register-discord-commands.mjs only) as env vars.
 * 3. After this route is deployed, set the app's Interactions Endpoint URL to
 *    https://veloexchange.org/api/discord/interactions — Discord verifies it
 *    live with a PING, which only succeeds once DISCORD_PUBLIC_KEY is deployed.
 * 4. Run scripts/register-discord-commands.mjs once to register the commands.
 */

const MIRROR = "https://mainnet-public.mirrornode.hedera.com/api/v1";
const EPHEMERAL = 64; // Discord message flag: visible only to the requester

/** Keep in sync with the tiers in api/xp/balance. */
function rankLabel(xp: number): string {
  if (xp >= 5000) return "Whale";
  if (xp >= 2000) return "Pro Trader";
  if (xp >= 1000) return "Regular";
  return "Novice";
}

/** Same normalization as api/xp/balance: canonical lowercased EVM key. */
async function normalizeWallet(input: string): Promise<string> {
  const w = input.trim();
  if (w.startsWith("0x")) return w.toLowerCase();
  if (/^\d+\.\d+\.\d+$/.test(w)) {
    try {
      const res = await fetch(`${MIRROR}/accounts/${w}`);
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

function shortWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

async function handleLeaderboard() {
  const { data, error } = await supabaseAdmin
    .from("velo_users")
    .select("wallet_address, display_name, xp")
    .order("xp", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return { content: "No leaderboard data yet — be the first to earn Velo XP at veloexchange.org!" };
  }

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  const lines = data.map((u, i) => {
    const label = (u.display_name as string) || shortWallet(u.wallet_address as string);
    const rankMark = medals[i] || `**${i + 1}.**`;
    return `${rankMark} ${label} — **${(u.xp as number) ?? 0} XP**`;
  });

  return {
    embeds: [
      {
        title: "\u{1F3C6} Velo XP Leaderboard",
        description: lines.join("\n"),
        color: 0x22d3ee,
        footer: { text: "Live from veloexchange.org" },
      },
    ],
  };
}

async function handleRank(walletInput: string) {
  if (!walletInput) {
    return { content: "Provide your Hedera account id (0.0.x) or EVM address (0x…).", flags: EPHEMERAL };
  }

  const wallet = await normalizeWallet(walletInput);

  const { data: user } = await supabaseAdmin
    .from("velo_users")
    .select("xp, swap_count")
    .eq("wallet_address", wallet)
    .single();

  if (!user) {
    return {
      content: `No Velo XP found for \`${walletInput}\` yet — connect your wallet on veloexchange.org to start earning.`,
      flags: EPHEMERAL,
    };
  }

  const xp = (user.xp as number) ?? 0;
  const { count } = await supabaseAdmin
    .from("velo_users")
    .select("*", { count: "exact", head: true })
    .gt("xp", xp);

  const position = (count ?? 0) + 1;

  return {
    embeds: [
      {
        title: "Your Velo Stats",
        color: 0x22d3ee,
        fields: [
          { name: "XP", value: `${xp}`, inline: true },
          { name: "Rank", value: rankLabel(xp), inline: true },
          { name: "Leaderboard Position", value: `#${position}`, inline: true },
          { name: "Swaps", value: `${(user.swap_count as number) ?? 0}`, inline: true },
        ],
      },
    ],
    flags: EPHEMERAL,
  };
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) {
    return new NextResponse("Bad request signature", { status: 401 });
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return new NextResponse("Bad request signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // Discord sends this once when you save the Interactions Endpoint URL, to
  // confirm the endpoint is live and correctly verifying signatures.
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    try {
      const name = interaction.data?.name;
      let data;
      if (name === "leaderboard") {
        data = await handleLeaderboard();
      } else if (name === "rank") {
        const walletOpt = interaction.data?.options?.find((o: any) => o.name === "wallet")?.value;
        data = await handleRank(String(walletOpt || ""));
      } else {
        data = { content: "Unknown command.", flags: EPHEMERAL };
      }
      return NextResponse.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data });
    } catch (error: any) {
      console.error("[Discord Interactions] error:", error);
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Something went wrong fetching that — try again in a moment.", flags: EPHEMERAL },
      });
    }
  }

  return new NextResponse("Unhandled interaction type", { status: 400 });
}
