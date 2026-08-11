/**
 * Discord role granting, driven by real Velo XP.
 *
 * Role ids come from env vars so they can be changed without a deploy. Any
 * unset role is simply skipped, so the feature degrades gracefully rather than
 * failing the whole verification if one id is missing.
 */

const DISCORD_API = "https://discord.com/api/v10";

export interface RoleTier {
  envVar: string;
  label: string;
  /** Minimum XP required. 0 = granted to anyone with a verified wallet. */
  minXp: number;
}

/**
 * Velo's Discord-specific XP ladder (branded role names — deliberately
 * separate from the plainer Novice/Regular/Pro Trader/Whale labels used by
 * api/xp/balance and /rank, which are a different display, not a role set).
 * No 0-XP tier needed: first wallet connect already awards 500 XP via
 * api/xp/onboard, so Spark IS the "you're in" tier in practice.
 */
export const ROLE_TIERS: RoleTier[] = [
  { envVar: "DISCORD_ROLE_SPARK", label: "Spark", minXp: 500 },
  { envVar: "DISCORD_ROLE_SLIPSTREAM", label: "Slipstream", minXp: 1000 },
  { envVar: "DISCORD_ROLE_OVERDRIVE", label: "Overdrive", minXp: 2500 },
  { envVar: "DISCORD_ROLE_ESCAPE_VELOCITY", label: "Escape Velocity", minXp: 5000 },
];

/**
 * Grant every role the user's XP qualifies them for.
 * Returns the labels actually granted, plus any that failed, so the caller can
 * tell the user the truth instead of assuming success.
 */
export async function grantRolesForXp(
  discordId: string,
  xp: number
): Promise<{ granted: string[]; failed: string[] }> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const granted: string[] = [];
  const failed: string[] = [];

  if (!botToken || !guildId) return { granted, failed };

  for (const tier of ROLE_TIERS) {
    const roleId = process.env[tier.envVar];
    if (!roleId || xp < tier.minXp) continue;

    try {
      const res = await fetch(
        `${DISCORD_API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      // 204 = added, 200 = already had it. Both count as success.
      if (res.ok) granted.push(tier.label);
      else failed.push(tier.label);
    } catch {
      failed.push(tier.label);
    }
  }

  return { granted, failed };
}
