-- API Keys table for REST API authentication
-- Supports tiered access (free/premium/unlimited) with rate limiting

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Key identification (never store plaintext - this is the hash)
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,  -- First 8 chars of key for identification (e.g., "dlnews_a1")
  
  -- Access control
  tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'premium', 'unlimited')),
  
  -- Metadata
  name TEXT,                 -- Optional friendly name for the key
  owner_email TEXT,          -- Optional owner email
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  
  -- Rate limiting (daily counters, reset at midnight UTC)
  requests_today INTEGER NOT NULL DEFAULT 0,
  requests_reset_date TEXT,  -- Date when requests_today was last reset (YYYY-MM-DD)
  
  -- Status
  is_active INTEGER NOT NULL DEFAULT 1,
  revoked_at TEXT,
  revoke_reason TEXT
);

-- Index for fast key lookup by hash
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Index for finding active keys
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- Index for rate limit queries by prefix (for debugging/admin)
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
