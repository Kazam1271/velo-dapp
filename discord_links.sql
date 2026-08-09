-- Discord <-> wallet linking, so Discord roles can be granted from REAL Velo XP
-- (swaps/stakes/transfers) rather than chat activity.
--
-- Ownership is proven by a wallet signature over a one-time nonce, so a user
-- can never claim someone else's wallet (and therefore someone else's XP/roles).
-- Run this in the Supabase SQL editor.

-- One-time codes handed out by the /verify slash command. Short-lived and
-- single-use: consumed on successful verification, so a leaked link is useless
-- after it's been used once or after it expires.
CREATE TABLE IF NOT EXISTS discord_verify_nonces (
  code TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  discord_username TEXT,
  guild_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nonces_discord ON discord_verify_nonces(discord_id);
CREATE INDEX IF NOT EXISTS idx_nonces_expiry ON discord_verify_nonces(expires_at);

-- The confirmed link. wallet_address uses the same canonical key as the XP
-- engine: lowercased EVM address.
CREATE TABLE IF NOT EXISTS discord_links (
  discord_id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  discord_username TEXT,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

-- One Discord account per wallet, so two people can't both claim the same
-- wallet's XP for roles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_wallet ON discord_links(wallet_address);
