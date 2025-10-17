-- Migration 006: Hierarchical Planning Tables
-- Created: 2025-10-14
-- Purpose: Add tables for storing strategic plans, execution outcomes, and learned heuristics

-- Strategic plans generated during preview phase
CREATE TABLE IF NOT EXISTS hierarchical_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  session_id TEXT,
  plan_steps TEXT NOT NULL, -- JSON array of plan steps
  estimated_value REAL,
  estimated_cost REAL,
  probability REAL,
  lookahead INTEGER DEFAULT 5,
  branches_explored INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (session_id) REFERENCES planning_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hierarchical_plans_domain ON hierarchical_plans(domain);
CREATE INDEX IF NOT EXISTS idx_hierarchical_plans_session ON hierarchical_plans(session_id);
CREATE INDEX IF NOT EXISTS idx_hierarchical_plans_created ON hierarchical_plans(created_at);

-- Plan execution outcomes (for learning)
CREATE TABLE IF NOT EXISTS plan_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER REFERENCES hierarchical_plans(id) ON DELETE CASCADE,
  job_id TEXT,
  success BOOLEAN NOT NULL DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  steps_succeeded INTEGER DEFAULT 0,
  steps_failed INTEGER DEFAULT 0,
  backtracks INTEGER DEFAULT 0,
  actual_value REAL,
  estimated_value REAL,
  performance_ratio REAL, -- actual_value / estimated_value
  execution_time_ms INTEGER,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  failure_reason TEXT,
  
  FOREIGN KEY (job_id) REFERENCES crawl_jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_outcomes_plan ON plan_outcomes(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_outcomes_job ON plan_outcomes(job_id);
CREATE INDEX IF NOT EXISTS idx_plan_outcomes_success ON plan_outcomes(success);
CREATE INDEX IF NOT EXISTS idx_plan_outcomes_completed ON plan_outcomes(completed_at);

-- Plan step execution details
CREATE TABLE IF NOT EXISTS plan_step_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id INTEGER NOT NULL REFERENCES plan_outcomes(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  target_url TEXT,
  success BOOLEAN NOT NULL DEFAULT 0,
  expected_value REAL,
  actual_value REAL,
  cost INTEGER,
  execution_time_ms INTEGER,
  executed_at TEXT NOT NULL DEFAULT (datetime('now')),
  backtracked BOOLEAN DEFAULT 0,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_step_results_outcome ON plan_step_results(outcome_id);
CREATE INDEX IF NOT EXISTS idx_plan_step_results_step ON plan_step_results(outcome_id, step_index);
CREATE INDEX IF NOT EXISTS idx_plan_step_results_success ON plan_step_results(success);

-- Learned heuristics (domain-specific patterns)
CREATE TABLE IF NOT EXISTS planning_heuristics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  patterns TEXT, -- JSON array of successful action sequences
  avg_lookahead REAL,
  branching_factor REAL,
  confidence REAL DEFAULT 0.5,
  sample_size INTEGER DEFAULT 1,
  success_rate REAL, -- successful plans / total plans
  avg_performance REAL, -- average performance ratio
  last_plan_id INTEGER REFERENCES hierarchical_plans(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_planning_heuristics_domain ON planning_heuristics(domain);
CREATE INDEX IF NOT EXISTS idx_planning_heuristics_confidence ON planning_heuristics(confidence);
CREATE INDEX IF NOT EXISTS idx_planning_heuristics_updated ON planning_heuristics(updated_at);

-- Pattern performance tracking
CREATE TABLE IF NOT EXISTS pattern_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  heuristic_id INTEGER NOT NULL REFERENCES planning_heuristics(id) ON DELETE CASCADE,
  pattern_signature TEXT NOT NULL, -- e.g., "explore-hub→explore-hub→explore-hub"
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  total_value REAL DEFAULT 0,
  avg_value REAL DEFAULT 0,
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pattern_performance_heuristic ON pattern_performance(heuristic_id);
CREATE INDEX IF NOT EXISTS idx_pattern_performance_signature ON pattern_performance(pattern_signature);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_performance_unique ON pattern_performance(heuristic_id, pattern_signature);
