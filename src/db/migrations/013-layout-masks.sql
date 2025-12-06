CREATE TABLE IF NOT EXISTS layout_masks (
    signature_hash TEXT PRIMARY KEY,
    mask_json TEXT NOT NULL,                    -- JSON string of dynamic node paths
    sample_count INTEGER DEFAULT 0,             -- how many pages contributed to the mask
    dynamic_nodes_count INTEGER DEFAULT 0,      -- number of dynamic nodes identified
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (signature_hash) REFERENCES layout_signatures(signature_hash) ON DELETE CASCADE
);
