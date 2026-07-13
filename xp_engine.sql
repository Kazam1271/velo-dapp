CREATE TABLE velo_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  xp INTEGER DEFAULT 0,
  swap_count INTEGER DEFAULT 0,
  first_connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE xp_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES velo_users(wallet_address),
  event_type TEXT NOT NULL, -- 'onboarding', 'swap', 'referral', etc.
  xp_amount INTEGER NOT NULL,
  tx_hash TEXT UNIQUE, -- Ensures no duplicate swaps can be claimed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_velo_users_wallet ON velo_users(wallet_address);
CREATE INDEX idx_xp_events_wallet ON xp_events(wallet_address);
CREATE INDEX idx_xp_events_tx_hash ON xp_events(tx_hash);
