-- Persist each wallet's native Hedera "0.0.x" id next to its canonical EVM key.
--
-- XP is keyed by lowercased EVM address, but the leaderboard displays the
-- native id — which previously meant one mirror-node lookup per row on every
-- load (an N+1 that scales with the user table). Caching the id here turns
-- that into a one-time resolution per wallet.
--
--   hedera_id             The native id, or NULL if not resolved yet / the
--                         account isn't activated on Hedera at all (wallet
--                         connected but never transacted, so Hedera never
--                         assigned it an id).
--   hedera_id_checked_at  When the mirror node was last asked. Lets unresolved
--                         wallets be re-checked periodically — they DO get an
--                         id once they first transact — without re-checking
--                         every wallet on every load.
--
-- Safe to re-run.

ALTER TABLE velo_users ADD COLUMN IF NOT EXISTS hedera_id TEXT;
ALTER TABLE velo_users ADD COLUMN IF NOT EXISTS hedera_id_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_velo_users_hedera_id ON velo_users(hedera_id);
