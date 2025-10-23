'use strict';

const { initializeSchema } = require('../schema');
const { toBoolInt, toNullableInt, safeStringify, safeParse, computeDurationMs } = require('./common');

function ensureAnalysisRunSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureAnalysisRunSchema requires a better-sqlite3 Database');
  }

  initializeSchema(db, { verbose: false, logger: console });

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
      error TEXT,
      background_task_id INTEGER,
      background_task_status TEXT
    );
  `);

  const columns = db.prepare(`PRAGMA table_info('analysis_runs')`).all();
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('background_task_id')) {
    try {
      db.exec('ALTER TABLE analysis_runs ADD COLUMN background_task_id INTEGER');
      columnNames.add('background_task_id');
    } catch (err) {
      if (!/duplicate column name/i.test(String(err && err.message))) {
        throw err;
      }
      columnNames.add('background_task_id');
    }
  }

  if (!columnNames.has('background_task_status')) {
    try {
      db.exec('ALTER TABLE analysis_runs ADD COLUMN background_task_status TEXT');
      columnNames.add('background_task_status');
    } catch (err) {
      if (!/duplicate column name/i.test(String(err && err.message))) {
        throw err;
      }
      columnNames.add('background_task_status');
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_started_at ON analysis_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status, started_at DESC);
  `);

  if (columnNames.has('background_task_id')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_analysis_runs_background_task ON analysis_runs(background_task_id)');
  }

  db.exec(`
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

function normalizeRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status || null,
    stage: row.stage || null,
    startedAt: row.started_at || null,
    endedAt: row.ended_at || null,
    durationMs: computeDurationMs(row.started_at, row.ended_at),
    analysisVersion: row.analysis_version != null ? Number(row.analysis_version) : null,
    pageLimit: row.page_limit != null ? Number(row.page_limit) : null,
    domainLimit: row.domain_limit != null ? Number(row.domain_limit) : null,
    skipPages: !!row.skip_pages,
    skipDomains: !!row.skip_domains,
    dryRun: !!row.dry_run,
    verbose: !!row.verbose,
    summary: safeParse(row.summary),
    lastProgress: safeParse(row.last_progress),
    error: row.error || null,
    backgroundTaskId: row.background_task_id != null ? Number(row.background_task_id) : null,
    backgroundTaskStatus: row.background_task_status || null
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
    error: data.error || null,
    background_task_id: data.backgroundTaskId != null ? Number(data.backgroundTaskId) : null,
    background_task_status: data.backgroundTaskStatus || null
  };

  const stmt = db.prepare(`
    INSERT INTO analysis_runs (
      id,
      started_at,
      ended_at,
      status,
      stage,
      analysis_version,
      page_limit,
      domain_limit,
      skip_pages,
      skip_domains,
      dry_run,
      verbose,
      summary,
      last_progress,
      error,
      background_task_id,
      background_task_status
    ) VALUES (
      @id,
      @started_at,
      @ended_at,
      @status,
      @stage,
      @analysis_version,
      @page_limit,
      @domain_limit,
      @skip_pages,
      @skip_domains,
      @dry_run,
      @verbose,
      @summary,
      @last_progress,
      @error,
      @background_task_id,
      @background_task_status
    )
  `);

  stmt.run(record);
  return normalizeRunRow(db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(record.id));
}

function updateAnalysisRun(db, id, patch = {}) {
  ensureAnalysisRunSchema(db);
  if (!id) throw new Error('updateAnalysisRun requires id');
  const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
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
    error: 'error',
    backgroundTaskId: 'background_task_id',
    backgroundTaskStatus: 'background_task_status'
  };

  const updates = [];
  const params = {};
  for (const key of keys) {
    const column = mapping[key];
    if (!column) continue;
    switch (key) {
      case 'analysisVersion':
      case 'pageLimit':
      case 'domainLimit':
        params[column] = toNullableInt(patch[key]);
        break;
      case 'skipPages':
      case 'skipDomains':
      case 'dryRun':
      case 'verbose':
        params[column] = toBoolInt(patch[key]);
        break;
      case 'summary':
      case 'lastProgress':
        params[column] = safeStringify(patch[key]);
        break;
      default:
        params[column] = patch[key];
        break;
    }
    updates.push(`${column} = @${column}`);
  }

  if (!updates.length) return false;
  params.id = String(id);
  const sql = `UPDATE analysis_runs SET ${updates.join(', ')} WHERE id = @id`;
  const result = db.prepare(sql).run(params);
  return result.changes > 0;
}

function addAnalysisRunEvent(db, data) {
  ensureAnalysisRunSchema(db);
  if (!data || !data.runId) {
    throw new Error('addAnalysisRunEvent requires runId');
  }

  const stmt = db.prepare(`
    INSERT INTO analysis_run_events (run_id, ts, stage, message, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    String(data.runId),
    data.ts || new Date().toISOString(),
    data.stage || null,
    data.message || null,
    safeStringify(data.details)
  );

  return normalizeEventRow(
    db.prepare('SELECT * FROM analysis_run_events WHERE run_id = ? ORDER BY id DESC LIMIT 1').get(String(data.runId))
  );
}

function getAnalysisRunById(db, id) {
  ensureAnalysisRunSchema(db);
  return normalizeRunRow(db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(String(id)));
}

function getAnalysisRunEvents(db, runId) {
  ensureAnalysisRunSchema(db);
  const rows = db.prepare('SELECT * FROM analysis_run_events WHERE run_id = ? ORDER BY ts ASC').all(String(runId));
  return rows.map(normalizeEventRow);
}

function getLatestAnalysisRunVersion(db) {
  ensureAnalysisRunSchema(db);
  const runRow = db.prepare('SELECT MAX(analysis_version) AS version FROM analysis_runs').get();
  const runValue = runRow && runRow.version;
  const runVersion = toFiniteOrNull(runValue);

  let contentVersion = null;
  if (tableExists(db, 'content_analysis')) {
    const contentRow = db.prepare('SELECT MAX(analysis_version) AS version FROM content_analysis').get();
    contentVersion = toFiniteOrNull(contentRow && contentRow.version);
  }

  if (runVersion == null && contentVersion == null) {
    return null;
  }

  if (runVersion == null) return contentVersion;
  if (contentVersion == null) return runVersion;
  return Math.max(runVersion, contentVersion);
}

function tableExists(db, tableName) {
  if (!tableName) return false;
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(String(tableName));
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

function toFiniteOrNull(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

module.exports = {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  getAnalysisRunById,
  getAnalysisRunEvents,
  getLatestAnalysisRunVersion
};
