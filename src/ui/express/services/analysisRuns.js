const DEFAULT_LIST_LIMIT = 50;

function ensureAnalysisRunSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureAnalysisRunSchema requires a better-sqlite3 Database');
  }
  db.exec(`
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
}

function toBoolInt(value) {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeStringify(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_) {
    return null;
  }
}

function safeParse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch (_) {
    return null;
  }
}

function computeDurationMs(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const diff = end - start;
  return Number.isFinite(diff) ? diff : null;
}

function normalizeRunRow(row) {
  if (!row) return null;
  const summary = safeParse(row.summary);
  const lastProgress = safeParse(row.last_progress);
  const startedAt = row.started_at || null;
  const endedAt = row.ended_at || null;
  return {
    id: row.id,
    status: row.status || null,
    stage: row.stage || null,
    startedAt,
    endedAt,
    durationMs: computeDurationMs(startedAt, endedAt),
    analysisVersion: row.analysis_version != null ? Number(row.analysis_version) : null,
    pageLimit: row.page_limit != null ? Number(row.page_limit) : null,
    domainLimit: row.domain_limit != null ? Number(row.domain_limit) : null,
    skipPages: !!row.skip_pages,
    skipDomains: !!row.skip_domains,
    dryRun: !!row.dry_run,
    verbose: !!row.verbose,
    summary,
    lastProgress,
    error: row.error || null
  };
}

function normalizeEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    ts: row.ts,
    stage: row.stage || null,
    message: row.message || null,
    details: safeParse(row.details)
  };
}

function createAnalysisRun(db, data) {
  ensureAnalysisRunSchema(db);
  if (!data || !data.id) {
    throw new Error('createAnalysisRun requires an id');
  }
  const record = {
    id: String(data.id),
    started_at: data.startedAt || new Date().toISOString(),
    ended_at: data.endedAt || null,
    status: data.status || 'running',
    stage: data.stage || 'starting',
    analysis_version: toNullableInt(data.analysisVersion),
    page_limit: toNullableInt(data.pageLimit),
    domain_limit: toNullableInt(data.domainLimit),
    skip_pages: toBoolInt(data.skipPages),
    skip_domains: toBoolInt(data.skipDomains),
    dry_run: toBoolInt(data.dryRun),
    verbose: toBoolInt(data.verbose),
    summary: safeStringify(data.summary),
    last_progress: safeStringify(data.lastProgress),
    error: data.error || null
  };
  const stmt = db.prepare(`
    INSERT INTO analysis_runs (id, started_at, ended_at, status, stage, analysis_version, page_limit, domain_limit, skip_pages, skip_domains, dry_run, verbose, summary, last_progress, error)
    VALUES (@id, @started_at, @ended_at, @status, @stage, @analysis_version, @page_limit, @domain_limit, @skip_pages, @skip_domains, @dry_run, @verbose, @summary, @last_progress, @error)
  `);
  stmt.run(record);
  return normalizeRunRow(db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(record.id));
}

function updateAnalysisRun(db, id, patch = {}) {
  ensureAnalysisRunSchema(db);
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!keys.length) return false;
  const mapping = {
    startedAt: 'started_at',
    endedAt: 'ended_at',
    status: 'status',
    stage: 'stage',
    analysisVersion: 'analysis_version',
    pageLimit: 'page_limit',
    domainLimit: 'domain_limit',
    skipPages: 'skip_pages',
    skipDomains: 'skip_domains',
    dryRun: 'dry_run',
    verbose: 'verbose',
    summary: 'summary',
    lastProgress: 'last_progress',
    error: 'error'
  };
  const params = { id: String(id) };
  const sets = [];
  for (const key of keys) {
    const column = mapping[key];
    if (!column) continue;
    let value = patch[key];
    if (key === 'analysisVersion' || key === 'pageLimit' || key === 'domainLimit') {
      value = toNullableInt(value);
    } else if (key === 'skipPages' || key === 'skipDomains' || key === 'dryRun' || key === 'verbose') {
      value = toBoolInt(value);
    } else if (key === 'summary' || key === 'lastProgress') {
      value = safeStringify(value);
    } else if (value !== null && value !== undefined) {
      value = String(value);
    } else {
      value = null;
    }
    params[column] = value;
    sets.push(`${column} = @${column}`);
  }
  if (!sets.length) return false;
  const stmt = db.prepare(`UPDATE analysis_runs SET ${sets.join(', ')} WHERE id = @id`);
  stmt.run(params);
  return true;
}

function addAnalysisRunEvent(db, data) {
  ensureAnalysisRunSchema(db);
  if (!data || !data.runId) {
    throw new Error('addAnalysisRunEvent requires runId');
  }
  const record = {
    run_id: String(data.runId),
    ts: data.ts || new Date().toISOString(),
    stage: data.stage || null,
    message: data.message || null,
    details: safeStringify(data.details)
  };
  const stmt = db.prepare(`
    INSERT INTO analysis_run_events (run_id, ts, stage, message, details)
    VALUES (@run_id, @ts, @stage, @message, @details)
  `);
  stmt.run(record);
  return normalizeEventRow(db.prepare('SELECT * FROM analysis_run_events WHERE rowid = last_insert_rowid()').get());
}

function listAnalysisRuns(db, { limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}) {
  ensureAnalysisRunSchema(db);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || DEFAULT_LIST_LIMIT));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const totalRow = db.prepare('SELECT COUNT(*) AS c FROM analysis_runs').get();
  const rows = db.prepare(`
    SELECT *
    FROM analysis_runs
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(safeLimit, safeOffset);
  return {
    total: totalRow?.c || 0,
    items: rows.map(normalizeRunRow)
  };
}

function getAnalysisRun(db, id, { limitEvents = 100 } = {}) {
  ensureAnalysisRunSchema(db);
  const runRow = db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(String(id));
  if (!runRow) return null;
  const safeLimit = Math.max(1, Math.min(500, parseInt(limitEvents, 10) || 100));
  const eventsRows = db.prepare(`
    SELECT *
    FROM analysis_run_events
    WHERE run_id = ?
    ORDER BY ts DESC, id DESC
    LIMIT ?
  `).all(String(id), safeLimit);
  return {
    run: normalizeRunRow(runRow),
    events: eventsRows.map(normalizeEventRow)
  };
}

module.exports = {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  listAnalysisRuns,
  getAnalysisRun
};
