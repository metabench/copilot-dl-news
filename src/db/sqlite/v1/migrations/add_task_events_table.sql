-- Unified task events table for crawls and background tasks
-- Designed for AI queryability and event replay

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identity
  task_type TEXT NOT NULL,              -- 'crawl' | 'analysis' | 'geo_import' | 'compression' | ...
  task_id TEXT NOT NULL,                -- job_id or background_task_id
  
  -- Ordering for replay
  seq INTEGER NOT NULL,                 -- monotonic per task (enables cursor-based replay)
  ts TEXT NOT NULL,                     -- ISO timestamp
  
  -- Event classification
  event_type TEXT NOT NULL,             -- 'url:fetched', 'milestone', 'problem', 'pause', 'stage:enter', etc.
  event_category TEXT,                  -- 'lifecycle' | 'work' | 'error' | 'metric' | 'control'
  severity TEXT,                        -- 'debug' | 'info' | 'warn' | 'error'
  
  -- Scoping (for filtering)
  scope TEXT,                           -- 'domain:bbc.com', 'url:...', 'stage:discovery', etc.
  target TEXT,                          -- specific URL, domain, or entity affected
  
  -- Payload (structured for extraction)
  payload TEXT,                         -- JSON with event-specific data
  
  -- Denormalized fields for fast queries
  duration_ms INTEGER,                  -- if timing event
  http_status INTEGER,                  -- if fetch event
  item_count INTEGER                    -- if counting event (links found, bytes, etc.)
);

-- Primary index for replay: get events for a task in order
CREATE INDEX IF NOT EXISTS idx_task_events_task_seq ON task_events(task_id, seq);

-- Query by event type within a task
CREATE INDEX IF NOT EXISTS idx_task_events_type ON task_events(task_id, event_type);

-- Query by category (lifecycle events, errors, etc.)
CREATE INDEX IF NOT EXISTS idx_task_events_category ON task_events(task_id, event_category);

-- Query by severity (find all errors/warnings)
CREATE INDEX IF NOT EXISTS idx_task_events_severity ON task_events(task_id, severity);

-- Query by scope (find all events for a domain)
CREATE INDEX IF NOT EXISTS idx_task_events_scope ON task_events(task_id, scope);

-- Time-based queries across all tasks
CREATE INDEX IF NOT EXISTS idx_task_events_ts ON task_events(ts);

-- Find all events by task type (all crawls, all analysis runs, etc.)
CREATE INDEX IF NOT EXISTS idx_task_events_task_type ON task_events(task_type, ts);
