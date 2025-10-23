'use strict';

const { initializeSchema } = require('../schema');
const { toNullableInt, safeStringify, safeParse } = require('./common');

function ensureBackgroundTaskSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureBackgroundTaskSchema requires a better-sqlite3 Database');
  }
  initializeSchema(db, { verbose: false, logger: console });
}

function normalizeProgress(row) {
  const current = row.progress_current != null ? Number(row.progress_current) : null;
  const total = row.progress_total != null ? Number(row.progress_total) : null;
  let percent = null;
  if (current != null && total && Number.isFinite(total) && total > 0) {
    percent = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }
  return {
    current,
    total,
    message: row.progress_message || null,
    percent
  };
}

function normalizeBackgroundTaskRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    progress: normalizeProgress(row),
    config: safeParse(row.config),
    metadata: safeParse(row.metadata),
    error: row.error_message || null,
    createdAt: row.created_at || null,
    startedAt: row.started_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
    resumeStartedAt: row.resume_started_at || null
  };
}

function createBackgroundTask(db, data) {
  ensureBackgroundTaskSchema(db);
  if (!data || !data.taskType) {
    throw new Error('createBackgroundTask requires taskType');
  }

  const now = new Date().toISOString();
  const record = {
    task_type: String(data.taskType),
    status: data.status || 'pending',
    progress_current: toNullableInt(data.progressCurrent ?? data.progress?.current),
    progress_total: toNullableInt(data.progressTotal ?? data.progress?.total),
    progress_message: data.progressMessage ?? data.progress?.message ?? null,
    config: safeStringify(data.config ?? null),
    metadata: safeStringify(data.metadata ?? null),
    error_message: data.error ?? data.errorMessage ?? null,
    created_at: data.createdAt || now,
    started_at: data.startedAt || (data.status && ['running', 'resuming'].includes(data.status) ? now : null),
    updated_at: data.updatedAt || now,
    completed_at: data.completedAt || null,
    resume_started_at: data.resumeStartedAt || null
  };

  const stmt = db.prepare(`
    INSERT INTO background_tasks (
      task_type,
      status,
      progress_current,
      progress_total,
      progress_message,
      config,
      metadata,
      error_message,
      created_at,
      started_at,
      updated_at,
      completed_at,
      resume_started_at
    ) VALUES (
      @task_type,
      @status,
      @progress_current,
      @progress_total,
      @progress_message,
      @config,
      @metadata,
      @error_message,
      @created_at,
      @started_at,
      @updated_at,
      @completed_at,
      @resume_started_at
    )
  `);

  const result = stmt.run(record);
  const insertedId = result.lastInsertRowid;
  const inserted = db.prepare('SELECT * FROM background_tasks WHERE id = ?').get(insertedId);
  return normalizeBackgroundTaskRow(inserted);
}

function buildTaskUpdate(record = {}) {
  const mapping = {
    taskType: 'task_type',
    status: 'status',
    progressCurrent: 'progress_current',
    progressTotal: 'progress_total',
    progressMessage: 'progress_message',
    config: 'config',
    metadata: 'metadata',
    error: 'error_message',
    errorMessage: 'error_message',
    startedAt: 'started_at',
    updatedAt: 'updated_at',
    completedAt: 'completed_at',
    resumeStartedAt: 'resume_started_at'
  };

  const updates = [];
  const params = {};

  for (const [key, column] of Object.entries(mapping)) {
    if (!(key in record)) continue;
    const value = record[key];
    switch (key) {
      case 'progressCurrent':
        params[column] = toNullableInt(value);
        break;
      case 'progressTotal':
        params[column] = toNullableInt(value);
        break;
      case 'config':
        params[column] = safeStringify(value);
        break;
      case 'metadata':
        params[column] = safeStringify(value);
        break;
      case 'status':
      case 'progressMessage':
      case 'error':
      case 'errorMessage':
      case 'taskType':
      case 'startedAt':
      case 'updatedAt':
      case 'completedAt':
      case 'resumeStartedAt':
        params[column] = value === undefined ? null : value;
        break;
      default:
        params[column] = value;
        break;
    }
    updates.push(`${column} = @${column}`);
  }

  if (updates.length === 0) {
    return null;
  }

  return { sql: updates.join(', '), params };
}

function updateBackgroundTask(db, id, patch = {}) {
  ensureBackgroundTaskSchema(db);
  if (!id) throw new Error('updateBackgroundTask requires id');
  if (typeof patch !== 'object' || patch === null) return false;

  const enrichedPatch = { ...patch };

  if (patch.progress && typeof patch.progress === 'object') {
    if (!('progressCurrent' in enrichedPatch) && patch.progress.current !== undefined) {
      enrichedPatch.progressCurrent = patch.progress.current;
    }
    if (!('progressTotal' in enrichedPatch) && patch.progress.total !== undefined) {
      enrichedPatch.progressTotal = patch.progress.total;
    }
    if (!('progressMessage' in enrichedPatch) && patch.progress.message !== undefined) {
      enrichedPatch.progressMessage = patch.progress.message;
    }
  }

  if (!('updatedAt' in enrichedPatch)) {
    enrichedPatch.updatedAt = new Date().toISOString();
  }

  const updateSpec = buildTaskUpdate(enrichedPatch);
  if (!updateSpec) return false;

  const stmt = db.prepare(`UPDATE background_tasks SET ${updateSpec.sql} WHERE id = @id`);
  const result = stmt.run({ ...updateSpec.params, id: Number(id) });
  return result.changes > 0;
}

function getBackgroundTaskById(db, id) {
  ensureBackgroundTaskSchema(db);
  const row = db.prepare('SELECT * FROM background_tasks WHERE id = ?').get(Number(id));
  return normalizeBackgroundTaskRow(row);
}

module.exports = {
  ensureBackgroundTaskSchema,
  createBackgroundTask,
  updateBackgroundTask,
  getBackgroundTaskById,
  normalizeBackgroundTaskRow
};
