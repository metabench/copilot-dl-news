-- Migration: Add article_fingerprints table for content similarity engine
-- Phase 8 Item 3: Content Similarity Engine
-- 
-- Stores SimHash (64-bit) and MinHash (128 x 32-bit) signatures for duplicate detection

CREATE TABLE IF NOT EXISTS article_fingerprints (
  content_id INTEGER PRIMARY KEY,
  
  -- SimHash: 64-bit fingerprint stored as 8-byte BLOB
  -- Hamming distance ≤3 suggests near-duplicate
  simhash BLOB NOT NULL,
  
  -- MinHash: 128 hash values × 4 bytes = 512-byte BLOB
  -- Used for Jaccard similarity estimation
  minhash_signature BLOB,
  
  -- Word count at time of fingerprinting (for filtering short articles)
  word_count INTEGER,
  
  -- Timestamp when fingerprint was computed
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (content_id) REFERENCES content_storage(id) ON DELETE CASCADE
);

-- Index on simhash for fast duplicate screening
-- SQLite can use prefix matching on BLOBs
CREATE INDEX IF NOT EXISTS idx_article_fingerprints_simhash 
  ON article_fingerprints(simhash);

-- Index on computed_at for incremental recomputation
CREATE INDEX IF NOT EXISTS idx_article_fingerprints_computed_at 
  ON article_fingerprints(computed_at);
