-- Migration: Add page_categories table for page content categorization
-- This table stores page category types like "In-Depth", "Opinion", "Live Coverage", etc.
-- The page_category_map links fetched content to categories.

-- Create the page_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS page_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    detection_heuristics TEXT,  -- JSON describing how to detect this category
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create the page_category_map table for many-to-many relationship
CREATE TABLE IF NOT EXISTS page_category_map (
    content_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    confidence REAL DEFAULT 1.0,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    detection_method TEXT,
    PRIMARY KEY (content_id, category_id),
    FOREIGN KEY (content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES page_categories(id) ON DELETE CASCADE
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_page_category_map_content ON page_category_map(content_id);
CREATE INDEX IF NOT EXISTS idx_page_category_map_category ON page_category_map(category_id);

-- Seed initial categories
INSERT OR IGNORE INTO page_categories (name, slug, description, detection_heuristics) VALUES
    ('In-Depth', 'in-depth', 'Hub pages linking to long-form articles, features, and investigative pieces', 
     '{"urlPatterns": ["long-read", "long-form", "in-depth", "feature", "series", "investigation", "special-report"], "minAvgArticleWordCount": 2000, "minArticleLinks": 3}'),
    ('Opinion', 'opinion', 'Editorial and opinion section hubs',
     '{"urlPatterns": ["opinion", "comment", "editorial", "columnist", "voices"], "minArticleLinks": 3}'),
    ('Live Coverage', 'live', 'Live event coverage and live blogs',
     '{"urlPatterns": ["live", "liveblog", "live-blog", "as-it-happened"], "hasLiveIndicators": true}'),
    ('Explainer', 'explainer', 'Explainer and educational content hubs',
     '{"urlPatterns": ["explainer", "explained", "guide", "what-is", "how-to", "faq"], "minArticleLinks": 2}'),
    ('Multimedia', 'multimedia', 'Video, audio, and interactive content hubs',
     '{"urlPatterns": ["video", "audio", "podcast", "interactive", "multimedia", "gallery", "photos"], "hasMediaIndicators": true}');
