// One-time (or on-change) registration of Velo's Discord slash commands.
// Usage: node scripts/register-discord-commands.mjs
// Requires DISCORD_APP_ID and DISCORD_BOT_TOKEN in .env.local.
// Registers as GUILD commands (instant availability) rather than global
// commands (which can take up to an hour to propagate) — fine since this
// bot only ever needs to work in the Velo server.

import { config } from "dotenv";
config({ path: ".env.local" });

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "1511068901872767187"; // Velo server

if (!APP_ID || !BOT_TOKEN) {
  console.error("Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN in .env.local.");
  process.exit(1);
}

const commands = [
  {
    name: "leaderboard",
    description: "Show the top Velo XP earners",
  },
  {
    name: "rank",
    description: "Look up your Velo XP and rank",
    options: [
      {
        name: "wallet",
        description: "Your Hedera account id (0.0.x) or EVM address (0x...)",
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  }
);

if (!res.ok) {
  console.error("Failed to register commands:", res.status, await res.text());
  process.exit(1);
}

const registered = await res.json();
console.log(`Registered ${registered.length} command(s):`, registered.map((c) => `/${c.name}`).join(", "));
