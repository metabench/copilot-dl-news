CREATE TABLE IF NOT EXISTS layout_signatures (
    signature_hash TEXT PRIMARY KEY,
    level INTEGER NOT NULL,
    signature TEXT NOT NULL,
    first_seen_url TEXT,
    seen_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_layout_signatures_level ON layout_signatures(level);
