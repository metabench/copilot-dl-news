const { NewsDatabase } = require('../db/sqlite/v1');

const DEFAULT_JOB_ID = 'analysis-run';

function unwrapDb(dbish) {
  if (!dbish) return null;
  if (dbish.db && typeof dbish.db.prepare === 'function') {
    return dbish.db;
  }
  return dbish;
}

function resolveNewsDatabase(dbish) {
  if (!dbish) return null;
  if (dbish instanceof NewsDatabase) {
    return dbish;
  }
  if (dbish.newsDatabase instanceof NewsDatabase) {
    return dbish.newsDatabase;
  }
  const raw = unwrapDb(dbish);
  if (!raw || typeof raw.prepare !== 'function') {
    return null;
  }
  if (raw instanceof NewsDatabase) {
    return raw;
  }
  return new NewsDatabase(raw);
}

function ensureMilestoneSchema(dbish) {
  const db = unwrapDb(dbish);
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureMilestoneSchema requires a better-sqlite3 Database');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS crawl_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      ts TEXT,
      kind TEXT,
      scope TEXT,
      target TEXT,
      message TEXT,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_milestones_job_ts ON crawl_milestones(job_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_crawl_milestones_scope_kind ON crawl_milestones(scope, kind);
  `);
}

function collectHostStats(dbish) {
  const newsDb = resolveNewsDatabase(dbish);
  if (!newsDb || !newsDb.db || typeof newsDb.db.prepare !== 'function') {
    throw new Error('collectHostStats requires a better-sqlite3 Database');
  }

  const ensure = (map, host) => {
    if (!host) return null;
    const key = String(host).trim().toLowerCase();
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        host: key,
        downloads: 0,
        depth2Analysed: 0,
        articlesIdentified: 0
      });
    }
    return map.get(key);
  };

  const stats = new Map();
  let hosts = [];
  try {
    hosts = newsDb.listDomainHosts();
  } catch (_) {
    hosts = [];
  }

  const milestoneRows = typeof newsDb.getMilestoneHostStats === 'function'
    ? newsDb.getMilestoneHostStats({ hosts })
    : [];

  for (const row of milestoneRows) {
    const entry = ensure(stats, row.host);
    if (!entry) continue;
    entry.downloads = Number(row.downloads || 0);
    entry.depth2Analysed = Number(row.depth2Analysed || 0);
    entry.articlesIdentified = Number(row.articlesIdentified || 0);
  }

  for (const host of hosts) {
    ensure(stats, host);
  }

  return stats;
}

function awardMilestones(dbish, { dryRun = false, verbose = false, jobId = DEFAULT_JOB_ID } = {}) {
  const db = unwrapDb(dbish);
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('awardMilestones requires a better-sqlite3 Database');
  }

  ensureMilestoneSchema(db);
  const existingRows = db.prepare('SELECT scope, kind FROM crawl_milestones').all();
  const existing = new Set(existingRows.map((r) => `${(r.scope || '').toLowerCase()}|${r.kind}`));
  const insertStmt = db.prepare(`
    INSERT INTO crawl_milestones(job_id, ts, kind, scope, target, message, details)
    VALUES (@jobId, datetime('now'), @kind, @scope, @target, @message, @details)
  `);
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item);
    }
  });

  const stats = collectHostStats(db);
  const awarded = [];
  const toInsert = [];

  for (const entry of stats.values()) {
    if (verbose) {
      console.log(`[analysis-run] host=${entry.host} downloads=${entry.downloads} depth2=${entry.depth2Analysed} articles=${entry.articlesIdentified}`);
    }
    const scope = entry.host;
    if (!scope) continue;

    const candidates = [];
    if (entry.depth2Analysed >= 10) {
      candidates.push({
        kind: 'depth2-coverage',
        message: 'Completed analysis of 10 depth-2 pages from the front page',
        details: { pages: entry.depth2Analysed }
      });
    }
    if (entry.downloads >= 1000) {
      candidates.push({
        kind: 'downloads-1k',
        message: 'Downloaded 1,000 documents',
        details: { count: entry.downloads }
      });
    }
    if (entry.articlesIdentified >= 1000) {
      candidates.push({
        kind: 'articles-identified-1k',
        message: 'Identified 1,000 articles during analysis',
        details: { count: entry.articlesIdentified }
      });
    }
    if (entry.articlesIdentified >= 10000) {
      candidates.push({
        kind: 'articles-identified-10k',
        message: 'Identified 10,000 articles during analysis',
        details: { count: entry.articlesIdentified }
      });
    }

    for (const candidate of candidates) {
      const key = `${scope}|${candidate.kind}`;
      if (existing.has(key)) continue;

      if (!dryRun) {
        toInsert.push({
          jobId,
          kind: candidate.kind,
          scope,
          target: null,
          message: candidate.message,
          details: JSON.stringify({ ...candidate.details, source: 'analysis-run' })
        });
      }
      existing.add(key);
      awarded.push({ scope, kind: candidate.kind, message: candidate.message, details: candidate.details });
    }
  }

  if (!dryRun && toInsert.length) {
    const ensureJobStmt = db.prepare(`
      INSERT OR IGNORE INTO crawl_jobs(id, args, pid, started_at, ended_at, status)
      VALUES (@id, NULL, NULL, datetime('now'), datetime('now'), 'analysis-run')
    `);

    const uniqueJobIds = Array.from(new Set(toInsert.map((row) => row.jobId).filter(Boolean)));
    for (const jobId of uniqueJobIds) {
      try {
        ensureJobStmt.run({ id: jobId });
      } catch (error) {
        if (error && /no such table/i.test(error.message)) {
          // Fallback for older databases without crawl_jobs
          db.exec(`
            CREATE TABLE IF NOT EXISTS crawl_jobs (
              id TEXT PRIMARY KEY,
              url_id INTEGER REFERENCES urls(id),
              args TEXT,
              pid INTEGER,
              started_at TEXT,
              ended_at TEXT,
              status TEXT,
              crawl_type_id INTEGER REFERENCES crawl_types(id)
            );
          `);
          ensureJobStmt.run({ id: jobId });
        } else {
          throw error;
        }
      }
    }

    insertMany(toInsert);
  }

  return awarded;
}

module.exports = {
  ensureMilestoneSchema,
  collectHostStats,
  awardMilestones
};
