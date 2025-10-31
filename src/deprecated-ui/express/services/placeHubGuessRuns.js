const DEFAULT_LIST_LIMIT = 50;

function ensurePlaceHubGuessRunsSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensurePlaceHubGuessRunsSchema requires a better-sqlite3 Database');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_hub_guess_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      stage TEXT,

      -- Hub guessing specific parameters
      domain_count INTEGER,
      total_domains INTEGER,
      kinds TEXT, -- JSON array of hub kinds
      limit_per_domain INTEGER,
      apply_changes INTEGER, -- 0/1 for boolean
      emit_report INTEGER, -- 0/1 for boolean
      report_path TEXT,
      readiness_timeout_seconds INTEGER,
      enable_topic_discovery INTEGER, -- 0/1 for boolean

      -- Results summary
      domains_processed INTEGER DEFAULT 0,
      hubs_generated INTEGER DEFAULT 0,
      hubs_validated INTEGER DEFAULT 0,
      hubs_persisted INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,

      -- Timing
      duration_ms INTEGER,

      -- Background task linkage (like analysis_runs)
      background_task_id INTEGER,
      background_task_status TEXT,

      -- Additional metadata
      summary TEXT,
      last_progress TEXT,
      error TEXT,

      FOREIGN KEY (background_task_id) REFERENCES background_tasks(id)
    )
  `);

  const columns = db.prepare(`PRAGMA table_info('place_hub_guess_runs')`).all();
  const columnNames = new Set(columns.map((col) => col.name));

  // Add any missing columns if schema evolves
  if (!columnNames.has('background_task_id')) {
    try {
      db.exec('ALTER TABLE place_hub_guess_runs ADD COLUMN background_task_id INTEGER REFERENCES background_tasks(id)');
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
      db.exec('ALTER TABLE place_hub_guess_runs ADD COLUMN background_task_status TEXT');
      columnNames.add('background_task_status');
    } catch (err) {
      if (!/duplicate column name/i.test(String(err && err.message))) {
        throw err;
      }
      columnNames.add('background_task_status');
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_place_hub_guess_runs_status
    ON place_hub_guess_runs(status);

    CREATE INDEX IF NOT EXISTS idx_place_hub_guess_runs_started_at
    ON place_hub_guess_runs(started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_place_hub_guess_runs_background_task_id
    ON place_hub_guess_runs(background_task_id);
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
  const kinds = safeParse(row.kinds);
  const diagnostics = summary?.diagnostics || lastProgress?.diagnostics || null;
  const startedAt = row.started_at || null;
  const endedAt = row.ended_at || null;
  return {
    id: row.id,
    status: row.status || null,
    stage: row.stage || null,
    startedAt,
    endedAt,
    durationMs: computeDurationMs(startedAt, endedAt),

    // Hub guessing specific fields
    domainCount: row.domain_count != null ? Number(row.domain_count) : null,
    totalDomains: row.total_domains != null ? Number(row.total_domains) : null,
    kinds: kinds || null,
    limitPerDomain: row.limit_per_domain != null ? Number(row.limit_per_domain) : null,
    applyChanges: !!row.apply_changes,
    emitReport: !!row.emit_report,
    reportPath: row.report_path || null,
    readinessTimeoutSeconds: row.readiness_timeout_seconds != null ? Number(row.readiness_timeout_seconds) : null,
    enableTopicDiscovery: !!row.enable_topic_discovery,

    // Results
    domainsProcessed: row.domains_processed != null ? Number(row.domains_processed) : 0,
    hubsGenerated: row.hubs_generated != null ? Number(row.hubs_generated) : 0,
    hubsValidated: row.hubs_validated != null ? Number(row.hubs_validated) : 0,
    hubsPersisted: row.hubs_persisted != null ? Number(row.hubs_persisted) : 0,
    errorsCount: row.errors_count != null ? Number(row.errors_count) : 0,

    summary,
    lastProgress,
    diagnostics: diagnostics || null,
    error: row.error || null,
    backgroundTaskId: row.background_task_id != null ? Number(row.background_task_id) : null,
    backgroundTaskStatus: row.background_task_status || null,

    // Type identifier for UI
    runType: 'hub-guessing'
  };
}

function createPlaceHubGuessRun(db, data) {
  ensurePlaceHubGuessRunsSchema(db);
  if (!data || !data.id) {
    throw new Error('createPlaceHubGuessRun requires an id');
  }
  const record = {
    id: String(data.id),
    started_at: data.startedAt || new Date().toISOString(),
    ended_at: data.endedAt || null,
    status: data.status || 'running',
    stage: data.stage || 'starting',

    // Hub guessing parameters
    domain_count: toNullableInt(data.domainCount),
    total_domains: toNullableInt(data.totalDomains),
    kinds: safeStringify(data.kinds),
    limit_per_domain: toNullableInt(data.limitPerDomain),
    apply_changes: toBoolInt(data.applyChanges),
    emit_report: toBoolInt(data.emitReport),
    report_path: data.reportPath || null,
    readiness_timeout_seconds: toNullableInt(data.readinessTimeoutSeconds),
    enable_topic_discovery: toBoolInt(data.enableTopicDiscovery),

    // Results (initially 0)
    domains_processed: 0,
    hubs_generated: 0,
    hubs_validated: 0,
    hubs_persisted: 0,
    errors_count: 0,

    // Timing
    duration_ms: null,

    // Background task linkage
    background_task_id: data.backgroundTaskId != null ? Number(data.backgroundTaskId) : null,
    background_task_status: data.backgroundTaskStatus || null,

    // Metadata
    summary: safeStringify(data.summary),
    last_progress: safeStringify(data.lastProgress),
    error: data.error || null
  };
  const stmt = db.prepare(`
    INSERT INTO place_hub_guess_runs (
      id, started_at, ended_at, status, stage,
      domain_count, total_domains, kinds, limit_per_domain, apply_changes, emit_report, report_path,
      readiness_timeout_seconds, enable_topic_discovery,
      domains_processed, hubs_generated, hubs_validated, hubs_persisted, errors_count,
      duration_ms, background_task_id, background_task_status,
      summary, last_progress, error
    )
    VALUES (
      @id, @started_at, @ended_at, @status, @stage,
      @domain_count, @total_domains, @kinds, @limit_per_domain, @apply_changes, @emit_report, @report_path,
      @readiness_timeout_seconds, @enable_topic_discovery,
      @domains_processed, @hubs_generated, @hubs_validated, @hubs_persisted, @errors_count,
      @duration_ms, @background_task_id, @background_task_status,
      @summary, @last_progress, @error
    )
  `);
  stmt.run(record);
  return normalizeRunRow(db.prepare('SELECT * FROM place_hub_guess_runs WHERE id = ?').get(record.id));
}

function updatePlaceHubGuessRun(db, id, patch = {}) {
  ensurePlaceHubGuessRunsSchema(db);
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!keys.length) return false;
  const mapping = {
    startedAt: 'started_at',
    endedAt: 'ended_at',
    status: 'status',
    stage: 'stage',

    // Hub guessing parameters
    domainCount: 'domain_count',
    totalDomains: 'total_domains',
    kinds: 'kinds',
    limitPerDomain: 'limit_per_domain',
    applyChanges: 'apply_changes',
    emitReport: 'emit_report',
    reportPath: 'report_path',
    readinessTimeoutSeconds: 'readiness_timeout_seconds',
    enableTopicDiscovery: 'enable_topic_discovery',

    // Results
    domainsProcessed: 'domains_processed',
    hubsGenerated: 'hubs_generated',
    hubsValidated: 'hubs_validated',
    hubsPersisted: 'hubs_persisted',
    errorsCount: 'errors_count',

    // Timing
    durationMs: 'duration_ms',

    // Background task
    backgroundTaskId: 'background_task_id',
    backgroundTaskStatus: 'background_task_status',

    // Metadata
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
    if (['domainCount', 'totalDomains', 'limitPerDomain', 'readinessTimeoutSeconds', 'domainsProcessed', 'hubsGenerated', 'hubsValidated', 'hubsPersisted', 'errorsCount', 'durationMs'].includes(key)) {
      value = toNullableInt(value);
    } else if (['applyChanges', 'emitReport', 'enableTopicDiscovery'].includes(key)) {
      value = toBoolInt(value);
    } else if (['summary', 'lastProgress', 'kinds'].includes(key)) {
      value = safeStringify(value);
    } else if (key === 'backgroundTaskId') {
      value = value == null ? null : Number(value);
      if (!Number.isFinite(value)) value = null;
    } else if (value !== null && value !== undefined) {
      value = String(value);
    } else {
      value = null;
    }
    params[column] = value;
    sets.push(`${column} = @${column}`);
  }
  if (!sets.length) return false;
  const stmt = db.prepare(`UPDATE place_hub_guess_runs SET ${sets.join(', ')} WHERE id = @id`);
  stmt.run(params);
  return true;
}

function listPlaceHubGuessRuns(db, { limit = DEFAULT_LIST_LIMIT, offset = 0, includeDetails = false } = {}) {
  ensurePlaceHubGuessRunsSchema(db);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || DEFAULT_LIST_LIMIT));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const totalRow = db.prepare('SELECT COUNT(*) AS c FROM place_hub_guess_runs').get();
  const selectColumns = includeDetails
    ? '*'
    : [
        'id',
        'status',
        'stage',
        'started_at',
        'ended_at',
        'domain_count',
        'total_domains',
        'kinds',
        'limit_per_domain',
        'apply_changes',
        'emit_report',
        'report_path',
        'readiness_timeout_seconds',
        'enable_topic_discovery',
        'domains_processed',
        'hubs_generated',
        'hubs_validated',
        'hubs_persisted',
        'errors_count',
        'duration_ms',
        'background_task_id',
        'background_task_status',
        'summary',
        'last_progress',
        'error'
      ].join(', ');
  const rows = db.prepare(`
    SELECT ${selectColumns}
    FROM place_hub_guess_runs
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(safeLimit, safeOffset);
  return {
    total: totalRow?.c || 0,
    items: rows.map(normalizeRunRow)
  };
}

function getPlaceHubGuessRun(db, id) {
  ensurePlaceHubGuessRunsSchema(db);
  const runRow = db.prepare('SELECT * FROM place_hub_guess_runs WHERE id = ?').get(String(id));
  if (!runRow) return null;
  return {
    run: normalizeRunRow(runRow),
    events: [] // Hub guessing runs don't have detailed events like analysis runs
  };
}

module.exports = {
  ensurePlaceHubGuessRunsSchema,
  createPlaceHubGuessRun,
  updatePlaceHubGuessRun,
  listPlaceHubGuessRuns,
  getPlaceHubGuessRun
};