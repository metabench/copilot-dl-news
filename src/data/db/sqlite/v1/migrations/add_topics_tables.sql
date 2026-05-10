-- Topics Tables Migration
-- Phase 9 Item 3: Topic Modeling & Clustering
--
-- Tables:
-- - topics: Topic definitions (seed + discovered)
-- - article_topics: Article-topic assignments with probability scores
-- - story_clusters: Related articles grouped into story threads
-- - topic_trends: Daily topic statistics for trend detection

-- Topics table
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  keywords TEXT NOT NULL,  -- JSON array of top keywords
  is_seed INTEGER DEFAULT 0,  -- 1 for seed topics, 0 for discovered
  article_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Article-topic assignments (many-to-many with probability)
CREATE TABLE IF NOT EXISTS article_topics (
  content_id INTEGER NOT NULL,
  topic_id INTEGER NOT NULL,
  probability REAL NOT NULL CHECK(probability >= 0 AND probability <= 1),
  assigned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (content_id, topic_id),
  FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- Story clusters (related articles about same event)
CREATE TABLE IF NOT EXISTS story_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headline TEXT NOT NULL,
  summary TEXT,
  article_ids TEXT NOT NULL,  -- JSON array of content_ids
  article_count INTEGER DEFAULT 1,
  first_seen TEXT DEFAULT (datetime('now')),
  last_updated TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1,
  primary_topic_id INTEGER,
  FOREIGN KEY(primary_topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

-- Topic trends (daily aggregates for trend detection)
CREATE TABLE IF NOT EXISTS topic_trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  date TEXT NOT NULL,  -- YYYY-MM-DD format
  article_count INTEGER DEFAULT 0,
  avg_probability REAL DEFAULT 0,
  trend_score REAL DEFAULT 0,
  computed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(topic_id, date),
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- Indexes for performance

-- Topics indexes
CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name);
CREATE INDEX IF NOT EXISTS idx_topics_is_seed ON topics(is_seed);
CREATE INDEX IF NOT EXISTS idx_topics_article_count ON topics(article_count DESC);

-- Article-topics indexes
CREATE INDEX IF NOT EXISTS idx_article_topics_content ON article_topics(content_id);
CREATE INDEX IF NOT EXISTS idx_article_topics_topic ON article_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_article_topics_probability ON article_topics(probability DESC);

-- Story clusters indexes
CREATE INDEX IF NOT EXISTS idx_story_clusters_active ON story_clusters(is_active);
CREATE INDEX IF NOT EXISTS idx_story_clusters_last_updated ON story_clusters(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_story_clusters_article_count ON story_clusters(article_count DESC);
CREATE INDEX IF NOT EXISTS idx_story_clusters_topic ON story_clusters(primary_topic_id);

-- Topic trends indexes
CREATE INDEX IF NOT EXISTS idx_topic_trends_topic ON topic_trends(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_trends_date ON topic_trends(date DESC);
CREATE INDEX IF NOT EXISTS idx_topic_trends_score ON topic_trends(trend_score DESC);
