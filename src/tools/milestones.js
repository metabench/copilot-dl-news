const DEFAULT_JOB_ID = 'analysis-run';

function unwrapDb(dbish) {
  if (!dbish) return null;
  if (dbish.db && typeof dbish.db.prepare === 'function') {
    return dbish.db;
  }
  return dbish;
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
  const db = unwrapDb(dbish);
  if (!db || typeof db.prepare !== 'function') {
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

  const downloadRows = db.prepare(`
    SELECT LOWER(u.host) AS host, COUNT(*) AS count
    FROM fetches f
    JOIN urls u ON u.url = f.url
    WHERE f.http_status BETWEEN 200 AND 399
    GROUP BY LOWER(u.host)
  `).all();
  for (const row of downloadRows) {
    const entry = ensure(stats, row.host);
    if (entry) entry.downloads = Number(row.count || 0);
  }

  const depthRows = db.prepare(`
    SELECT LOWER(u.host) AS host, COUNT(DISTINCT a.url) AS count
    FROM articles a
    JOIN urls u ON u.url = a.url
    WHERE a.crawl_depth = 2 AND a.analysis IS NOT NULL
    GROUP BY LOWER(u.host)
  `).all();
  for (const row of depthRows) {
    const entry = ensure(stats, row.host);
    if (entry) entry.depth2Analysed = Number(row.count || 0);
  }

  let articleRows;
  try {
    articleRows = db.prepare(`
      SELECT LOWER(u.host) AS host, COUNT(*) AS count
      FROM articles a
      JOIN urls u ON u.url = a.url
      WHERE a.analysis IS NOT NULL AND COALESCE(json_extract(a.analysis, '$.kind'), 'article') = 'article'
      GROUP BY LOWER(u.host)
    `).all();
  } catch (_) {
    articleRows = db.prepare(`
      SELECT LOWER(u.host) AS host, COUNT(*) AS count
      FROM articles a
      JOIN urls u ON u.url = a.url
      WHERE a.analysis IS NOT NULL
      GROUP BY LOWER(u.host)
    `).all();
  }
  for (const row of articleRows) {
    const entry = ensure(stats, row.host);
    if (entry) entry.articlesIdentified = Number(row.count || 0);
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
    insertMany(toInsert);
  }

  return awarded;
}

module.exports = {
  ensureMilestoneSchema,
  collectHostStats,
  awardMilestones
};
