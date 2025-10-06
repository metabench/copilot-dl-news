const DEFAULT_LOGGER = console;

function createWritableDbAccessor({ ensureDb, urlsDbPath, queueDebug = false, verbose = false, logger = DEFAULT_LOGGER } = {}) {
  if (typeof ensureDb !== 'function') {
    throw new Error('createWritableDbAccessor: ensureDb function is required');
  }
  if (!urlsDbPath || typeof urlsDbPath !== 'string') {
    throw new Error('createWritableDbAccessor: urlsDbPath string is required');
  }

  let dbInstance = null;

  function getDbRW() {
    if (dbInstance) {
      return dbInstance;
    }

    try {
      const db = ensureDb(urlsDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS crawl_jobs (
          id TEXT PRIMARY KEY,
          url TEXT,
          args TEXT,
          pid INTEGER,
          started_at TEXT,
          ended_at TEXT,
          status TEXT
        );
        CREATE TABLE IF NOT EXISTS queue_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          action TEXT NOT NULL,
          url TEXT,
          depth INTEGER,
          host TEXT,
          reason TEXT,
          queue_size INTEGER,
          alias TEXT,
          queue_origin TEXT,
          queue_role TEXT,
          queue_depth_bucket TEXT,
          FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_queue_events_job_ts ON queue_events(job_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_events_action ON queue_events(action);
        CREATE INDEX IF NOT EXISTS idx_queue_events_host ON queue_events(host);
        CREATE TABLE IF NOT EXISTS queue_events_enhanced (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          action TEXT NOT NULL,
          url TEXT NOT NULL,
          depth INTEGER,
          host TEXT,
          reason TEXT,
          queue_size INTEGER,
          alias TEXT,
          queue_origin TEXT,
          queue_role TEXT,
          queue_depth_bucket TEXT,
          priority_score REAL,
          priority_source TEXT,
          bonus_applied REAL,
          cluster_id TEXT,
          gap_prediction_score REAL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_job_ts ON queue_events_enhanced(job_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_priority ON queue_events_enhanced(priority_score DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_cluster ON queue_events_enhanced(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_host ON queue_events_enhanced(host);
        CREATE TABLE IF NOT EXISTS crawl_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          declaration TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS crawler_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS crawl_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          host TEXT,
          kind TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          url TEXT,
          payload TEXT,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_crawl_tasks_job_status ON crawl_tasks(job_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_crawl_tasks_status ON crawl_tasks(status, created_at DESC);

        CREATE TABLE IF NOT EXISTS analysis_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          status TEXT NOT NULL,
          stage TEXT,
          analysis_version INTEGER,
          page_limit INTEGER,
          domain_limit INTEGER,
          skip_pages INTEGER,
          skip_domains INTEGER,
          dry_run INTEGER,
          verbose INTEGER,
          summary TEXT,
          last_progress TEXT,
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_runs_started_at ON analysis_runs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status, started_at DESC);

        CREATE TABLE IF NOT EXISTS analysis_run_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          stage TEXT,
          message TEXT,
          details TEXT,
          FOREIGN KEY(run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_run_events_run_ts ON analysis_run_events(run_id, ts DESC);
      `);

      try {
        const crawlCols = db.prepare('PRAGMA table_info(crawl_jobs)').all().map((r) => r.name);
        if (!crawlCols.includes('args')) {
          db.exec('ALTER TABLE crawl_jobs ADD COLUMN args TEXT');
          crawlCols.push('args');
        }
        if (!crawlCols.includes('pid')) {
          db.exec('ALTER TABLE crawl_jobs ADD COLUMN pid INTEGER');
          crawlCols.push('pid');
        }
        if (!crawlCols.includes('started_at')) {
          db.exec('ALTER TABLE crawl_jobs ADD COLUMN started_at TEXT');
          crawlCols.push('started_at');
        }
        if (!crawlCols.includes('ended_at')) {
          db.exec('ALTER TABLE crawl_jobs ADD COLUMN ended_at TEXT');
          crawlCols.push('ended_at');
        }
        if (!crawlCols.includes('status')) {
          db.exec('ALTER TABLE crawl_jobs ADD COLUMN status TEXT');
          crawlCols.push('status');
        }
      } catch (_) {
        /* ignore migration errors */
      }

      try {
        const queueCols = db.prepare('PRAGMA table_info(queue_events)').all().map((r) => r.name);
        if (!queueCols.includes('alias')) {
          db.exec('ALTER TABLE queue_events ADD COLUMN alias TEXT');
        }
        if (!queueCols.includes('queue_origin')) {
          db.exec('ALTER TABLE queue_events ADD COLUMN queue_origin TEXT');
        }
        if (!queueCols.includes('queue_role')) {
          db.exec('ALTER TABLE queue_events ADD COLUMN queue_role TEXT');
        }
        if (!queueCols.includes('queue_depth_bucket')) {
          db.exec('ALTER TABLE queue_events ADD COLUMN queue_depth_bucket TEXT');
        }
      } catch (_) {
        /* ignore migration errors */
      }

      try {
        const upsert = db.prepare(`
          INSERT INTO crawl_types(name, description, declaration)
          VALUES (?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            description = excluded.description,
            declaration = excluded.declaration
        `);
        const defaults = [
          {
            name: 'basic',
            description: 'Follow links only (no sitemap)',
            declaration: { crawlType: 'basic', useSitemap: false, sitemapOnly: false }
          },
          {
            name: 'sitemap-only',
            description: 'Use only the sitemap to discover pages',
            declaration: { crawlType: 'sitemap-only', useSitemap: true, sitemapOnly: true }
          },
          {
            name: 'basic-with-sitemap',
            description: 'Follow links and also use the sitemap',
            declaration: { crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false }
          },
          {
            name: 'intelligent',
            description: 'Intelligent planning (hubs + sitemap + heuristics)',
            declaration: { crawlType: 'intelligent', useSitemap: true, sitemapOnly: false }
          },
          {
            name: 'discover-structure',
            description: 'Map site structure without downloading articles',
            declaration: { crawlType: 'discover-structure', useSitemap: true, sitemapOnly: false }
          },
          {
            name: 'gazetteer',
            description: 'Legacy alias for geography gazetteer crawl',
            declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false }
          },
          {
            name: 'wikidata',
            description: 'Only ingest gazetteer data from Wikidata',
            declaration: { crawlType: 'wikidata', useSitemap: false, sitemapOnly: false }
          },
          {
            name: 'geography',
            description: 'Aggregate gazetteer data from Wikidata plus OpenStreetMap boundaries',
            declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false }
          }
        ];
        for (const def of defaults) {
          upsert.run(def.name, def.description, JSON.stringify(def.declaration));
        }
      } catch (_) {
        /* ignore seed errors */
      }

      try {
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_queue_events_job_id_desc ON queue_events(job_id, id DESC);
          CREATE INDEX IF NOT EXISTS idx_queue_events_job_action_id_desc ON queue_events(job_id, action, id DESC);
          CREATE TABLE IF NOT EXISTS crawl_problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            scope TEXT,
            target TEXT,
            message TEXT,
            details TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_crawl_problems_job_ts ON crawl_problems(job_id, ts DESC);
          CREATE TABLE IF NOT EXISTS crawl_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            scope TEXT,
            target TEXT,
            message TEXT,
            details TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_crawl_milestones_job_ts ON crawl_milestones(job_id, ts DESC);
          CREATE TABLE IF NOT EXISTS planner_stage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            stage TEXT,
            status TEXT,
            sequence INTEGER,
            duration_ms INTEGER,
            details TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_planner_stage_events_job_ts ON planner_stage_events(job_id, ts DESC);
        `);
      } catch (_) {
        /* ignore index errors */
      }

      dbInstance = db;
      if (queueDebug) {
        try {
          logger.log('[db] opened writable queue DB at', urlsDbPath);
        } catch (_) {
          /* noop */
        }
      }
    } catch (err) {
      dbInstance = null;
      try {
        // Only log DB warnings in verbose mode or when explicitly requested
        // Skip logging "no such column: wikidata_qid" errors in tests (gazetteer not initialized)
        const isGazetteerError = err?.message?.includes('wikidata_qid');
        const isTestEnv = process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
        const shouldLog = (queueDebug || verbose) && !(isGazetteerError && isTestEnv);
        
        if (shouldLog) {
          logger.warn('[db] failed to open writable DB:', err?.message || err);
        }
      } catch (_) {
        /* noop */
      }
    }

    return dbInstance;
  }

  return getDbRW;
}

module.exports = {
  createWritableDbAccessor
};
