'use strict';

/**
 * TaskEventWriter - Writes task events to the database for AI queryability and replay.
 * 
 * This module provides a unified way to record events from crawls, background tasks,
 * and other long-running operations. Events are stored in a structured format that
 * enables:
 * 
 * - AI agents querying event history with SQL
 * - Event replay for debugging
 * - Cross-task analysis and comparison
 * 
 * @module src/db/TaskEventWriter
 */

const { resolveNewsCrawlerDbModule } = require('../../db/openNewsCrawlerDb');

/**
 * Maps telemetry event types to categories and severities.
 * @type {Object.<string, {category: string, severity: string}>}
 */
const EVENT_TYPE_METADATA = {
  // Lifecycle events
  'crawl:start': { category: 'lifecycle', severity: 'info' },
  'crawl:end': { category: 'lifecycle', severity: 'info' },
  'crawl:pause': { category: 'lifecycle', severity: 'info' },
  'crawl:resume': { category: 'lifecycle', severity: 'info' },
  'task:start': { category: 'lifecycle', severity: 'info' },
  'task:end': { category: 'lifecycle', severity: 'info' },
  'stage:enter': { category: 'lifecycle', severity: 'info' },
  'stage:exit': { category: 'lifecycle', severity: 'info' },
  
  // Work events
  'url:enqueued': { category: 'work', severity: 'debug' },
  'url:fetched': { category: 'work', severity: 'info' },
  'url:parsed': { category: 'work', severity: 'info' },
  'url:saved': { category: 'work', severity: 'info' },
  'url:skipped': { category: 'work', severity: 'debug' },
  'links:discovered': { category: 'work', severity: 'info' },
  'batch:complete': { category: 'work', severity: 'info' },
  
  // Metric events
  'progress': { category: 'metric', severity: 'info' },
  'metric': { category: 'metric', severity: 'info' },
  'rate': { category: 'metric', severity: 'info' },
  'coverage': { category: 'metric', severity: 'info' },
  
  // Control events
  'config:change': { category: 'control', severity: 'info' },
  'rate:limit': { category: 'control', severity: 'warn' },
  'rate:backoff': { category: 'control', severity: 'warn' },
  
  // Error events
  'error': { category: 'error', severity: 'error' },
  'problem': { category: 'error', severity: 'warn' },
  'warning': { category: 'error', severity: 'warn' },
  'url:error': { category: 'error', severity: 'warn' },
  'fetch:error': { category: 'error', severity: 'warn' },
  'parse:error': { category: 'error', severity: 'warn' },
  
  // Milestone events
  'milestone': { category: 'lifecycle', severity: 'info' },
  'goal:reached': { category: 'lifecycle', severity: 'info' },
  'goal:progress': { category: 'metric', severity: 'info' }
};

/**
 * Get default metadata for an event type.
 * @param {string} eventType 
 * @returns {{category: string, severity: string}}
 */
function getEventMetadata(eventType) {
  if (!eventType) return { category: 'work', severity: 'info' };
  
  // Check exact match first
  if (EVENT_TYPE_METADATA[eventType]) {
    return EVENT_TYPE_METADATA[eventType];
  }
  
  // Check prefix match (e.g., 'crawl:telemetry:progress' -> 'progress')
  const parts = eventType.split(':');
  for (let i = parts.length - 1; i >= 0; i--) {
    const suffix = parts.slice(i).join(':');
    if (EVENT_TYPE_METADATA[suffix]) {
      return EVENT_TYPE_METADATA[suffix];
    }
  }
  
  // Infer from type name
  if (eventType.includes('error') || eventType.includes('fail')) {
    return { category: 'error', severity: 'error' };
  }
  if (eventType.includes('warn') || eventType.includes('problem')) {
    return { category: 'error', severity: 'warn' };
  }
  if (eventType.includes('start') || eventType.includes('end') || eventType.includes('complete')) {
    return { category: 'lifecycle', severity: 'info' };
  }
  if (eventType.includes('metric') || eventType.includes('progress') || eventType.includes('rate')) {
    return { category: 'metric', severity: 'info' };
  }
  
  return { category: 'work', severity: 'info' };
}

/**
 * Extract scope from event data.
 * @param {Object} event 
 * @returns {string|null}
 */
function extractScope(event) {
  if (!event) return null;
  
  // Check for explicit scope
  if (event.scope) return event.scope;
  
  // Derive from data
  const data = event.data || event;
  
  if (data.host) return `domain:${data.host}`;
  if (data.domain) return `domain:${data.domain}`;
  if (data.stage) return `stage:${data.stage}`;
  if (data.url) {
    try {
      const url = new URL(data.url);
      return `domain:${url.host}`;
    } catch (_) {
      // Not a valid URL
    }
  }
  
  return null;
}

/**
 * Extract target from event data.
 * @param {Object} event 
 * @returns {string|null}
 */
function extractTarget(event) {
  if (!event) return null;
  
  const data = event.data || event;
  
  return data.url || data.target || data.pattern || null;
}

/**
 * Extract denormalized fields for fast queries.
 * @param {Object} event 
 * @returns {{duration_ms: number|null, http_status: number|null, item_count: number|null}}
 */
function extractDenormalizedFields(event) {
  if (!event) return { duration_ms: null, http_status: null, item_count: null };
  
  const data = event.data || event;
  
  return {
    duration_ms: typeof data.durationMs === 'number' ? data.durationMs :
                 typeof data.duration_ms === 'number' ? data.duration_ms :
                 typeof data.ms === 'number' ? data.ms : null,
    http_status: typeof data.httpStatus === 'number' ? data.httpStatus :
                 typeof data.http_status === 'number' ? data.http_status :
                 typeof data.status === 'number' ? data.status : null,
    item_count: typeof data.count === 'number' ? data.count :
                typeof data.linksFound === 'number' ? data.linksFound :
                typeof data.visited === 'number' ? data.visited :
                typeof data.queued === 'number' ? data.queued : null
  };
}

function getTaskEventsAccess(db) {
  if (!db) {
    throw new Error('TaskEventWriter requires a database handle or adapter');
  }
  if (db.taskEvents) return db.taskEvents;
  if (db.db && db.db.taskEvents) return db.db.taskEvents;

  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.createSqliteTaskEventsAccess !== 'function') {
    throw new Error('news-crawler-db does not expose createSqliteTaskEventsAccess');
  }
  return dbModule.createSqliteTaskEventsAccess(db);
}

class TaskEventWriter {
  /**
   * @param {Object} db - better-sqlite3 database handle
   * @param {Object} [options]
   * @param {boolean} [options.batchWrites=true] - Buffer writes and flush periodically
   * @param {number} [options.batchSize=50] - Number of events to buffer before flushing
   * @param {number} [options.flushInterval=1000] - Max ms between flushes
   */
  constructor(db, options = {}) {
    this.db = db;
    this.taskEvents = getTaskEventsAccess(db);
    this.batchWrites = options.batchWrites !== false;
    this.batchSize = options.batchSize || 50;
    this.flushInterval = options.flushInterval || 1000;
    
    /** @type {Map<string, number>} Sequence counters per task */
    this.seqCounters = new Map();
    
    /** @type {Array<Object>} Event buffer for batch writes */
    this.buffer = [];
    
    /** @type {NodeJS.Timeout|null} */
    this.flushTimer = null;
    
    this._ensureSchema();
    this._prepareStatements();
    
    if (this.batchWrites) {
      this._startFlushTimer();
    }
  }
  
  /**
   * Ensure the task_events table exists.
   * @private
   */
  _ensureSchema() {
    this.taskEvents.ensureSchema();
  }
  
  /**
   * Prepare reusable statements.
   * @private
   */
  _prepareStatements() {
    this._insertStmt = {
      run: (event) => this.taskEvents.insertTaskEventRecord(event)
    };
    this._insertMany = (events) => this.taskEvents.insertTaskEventRecords(events);
  }
  
  /**
   * Start the flush timer for batch writes.
   * @private
   */
  _startFlushTimer() {
    if (this.flushTimer) return;
    
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
    
    this.flushTimer.unref();
  }
  
  /**
   * Get the next sequence number for a task.
   * @param {string} taskId 
   * @returns {number}
   * @private
   */
  _nextSeq(taskId) {
    let seq = this.seqCounters.get(taskId);
    if (seq === undefined) {
      // Check DB for existing max seq
      try {
        seq = this.taskEvents.getMaxSeq(taskId);
      } catch (_) {
        seq = 0;
      }
    }
    seq++;
    this.seqCounters.set(taskId, seq);
    return seq;
  }
  
  /**
   * Write a single event.
   * 
   * @param {Object} options
   * @param {string} options.taskType - 'crawl' | 'analysis' | 'geo_import' | etc.
   * @param {string} options.taskId - Job or task ID
   * @param {string} options.eventType - Event type (e.g., 'url:fetched')
   * @param {Object} [options.data] - Event payload data
   * @param {string} [options.scope] - Optional scope override
   * @param {string} [options.target] - Optional target override
   * @param {string} [options.category] - Optional category override
   * @param {string} [options.severity] - Optional severity override
   * @param {string} [options.ts] - Optional timestamp (defaults to now)
   */
  write(options) {
    const {
      taskType,
      taskId,
      eventType,
      data = {},
      scope: scopeOverride,
      target: targetOverride,
      category: categoryOverride,
      severity: severityOverride,
      ts: tsOverride
    } = options;
    
    if (!taskType || !taskId || !eventType) {
      return; // Silently skip invalid events
    }
    
    const metadata = getEventMetadata(eventType);
    const denormalized = extractDenormalizedFields(data);
    
    const record = {
      task_type: taskType,
      task_id: taskId,
      seq: this._nextSeq(taskId),
      ts: tsOverride || new Date().toISOString(),
      event_type: eventType,
      event_category: categoryOverride || metadata.category,
      severity: severityOverride || metadata.severity,
      scope: scopeOverride || extractScope(data),
      target: targetOverride || extractTarget(data),
      payload: JSON.stringify(data),
      duration_ms: denormalized.duration_ms,
      http_status: denormalized.http_status,
      item_count: denormalized.item_count
    };
    
    if (this.batchWrites) {
      this.buffer.push(record);
      if (this.buffer.length >= this.batchSize) {
        this.flush();
      }
    } else {
      try {
        this._insertStmt.run(record);
      } catch (err) {
        // Log but don't throw - telemetry should not break the crawler
        console.error('[TaskEventWriter] Failed to write event:', err.message);
      }
    }
  }
  
  /**
   * Write a telemetry event from CrawlTelemetryBridge format.
   * 
   * @param {Object} event - Telemetry event from the bridge
   */
  writeTelemetryEvent(event) {
    if (!event) return;
    
    const taskId = event.jobId || (event.data && event.data.jobId);
    if (!taskId) return;
    
    const taskType = event.crawlType || 'crawl';
    const eventType = event.type || 'unknown';
    const ts = event.timestamp || new Date().toISOString();
    
    this.write({
      taskType,
      taskId,
      eventType,
      data: event.data || event,
      ts,
      severity: event.severity
    });
  }
  
  /**
   * Flush buffered events to the database.
   */
  flush() {
    if (this.buffer.length === 0) return;
    
    const events = this.buffer.splice(0);
    try {
      this._insertMany(events);
    } catch (err) {
      console.error('[TaskEventWriter] Failed to flush events:', err.message);
      // Events are lost, but we don't want to break the crawler
    }
  }
  
  /**
   * Clean up resources.
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Final flush
    this.flush();
  }
  
  /**
   * Write a background task telemetry event.
   * 
   * This method handles the format emitted by BackgroundTaskManager._telemetry().
   * 
   * @param {Object} entry - Telemetry entry from BackgroundTaskManager
   */
  writeBackgroundTaskEvent(entry) {
    if (!entry) return;
    
    const taskId = entry.taskId;
    const taskType = entry.taskType || 'background';
    const eventType = entry.event || entry.status || 'unknown';
    const ts = entry.ts || new Date().toISOString();
    
    if (!taskId) return;
    
    this.write({
      taskType,
      taskId,
      eventType,
      data: entry.data || entry.details || {},
      ts,
      severity: entry.severity,
      scope: taskType ? `taskType:${taskType}` : undefined
    });
  }
  
  /**
   * Create an emitter function for BackgroundTaskManager.
   * 
   * Usage:
   *   const writer = new TaskEventWriter(db);
   *   const manager = new BackgroundTaskManager({
   *     db,
   *     emitTelemetry: writer.createBackgroundTaskEmitter()
   *   });
   * 
   * @returns {Function} Emitter function compatible with BackgroundTaskManager
   */
  createBackgroundTaskEmitter() {
    return (entry) => this.writeBackgroundTaskEvent(entry);
  }
  
  // ========== Pruning / Maintenance ==========
  
  /**
   * Delete events older than a specified number of days.
   * 
   * @param {number} days - Delete events older than this many days
   * @returns {{deleted: number}} Number of rows deleted
   */
  pruneOlderThan(days) {
    return this.taskEvents.pruneOlderThan(days);
  }
  
  /**
   * Delete all events for a specific task.
   * 
   * @param {string} taskId 
   * @returns {{deleted: number}} Number of rows deleted
   */
  deleteTask(taskId) {
    const result = this.taskEvents.deleteTask(taskId);
    this.seqCounters.delete(taskId);
    return result;
  }
  
  /**
   * Delete events for tasks that have ended and are older than N days.
   * Keeps recent task events even if complete.
   * 
   * @param {number} days - Delete completed task events older than this many days
   * @returns {{deleted: number, tasksAffected: number}}
   */
  pruneCompletedTasks(days) {
    const result = this.taskEvents.pruneCompletedTasks(days);
    if (result.deleted > 0) {
      this.seqCounters.clear();
    }
    return result;
  }
  
  /**
   * Get storage statistics.
   * 
   * @returns {Object} Storage stats
   */
  getStorageStats() {
    return this.taskEvents.getStorageStats();
  }
  
  // ========== Query helpers for AI agents ==========
  
  /**
   * Get events for a task, optionally filtered.
   * 
   * @param {string} taskId 
   * @param {Object} [options]
   * @param {string} [options.eventType] - Filter by event type
   * @param {string} [options.category] - Filter by category
   * @param {string} [options.severity] - Filter by severity
   * @param {string} [options.scope] - Filter by scope
   * @param {number} [options.sinceSeq] - Only events after this sequence number
   * @param {number} [options.limit=1000] - Max events to return
   * @returns {Array<Object>}
   */
  getEvents(taskId, options = {}) {
    return this.taskEvents.getEvents(taskId, options);
  }
  
  /**
   * Get a summary of events for a task.
   * 
   * @param {string} taskId 
   * @returns {Object}
   */
  getSummary(taskId) {
    return this.taskEvents.getSummary(taskId);
  }
  
  /**
   * Get errors and warnings for a task.
   * 
   * @param {string} taskId 
   * @param {number} [limit=100]
   * @returns {Array<Object>}
   */
  getProblems(taskId, limit = 100) {
    return this.taskEvents.getProblems(taskId, limit);
  }
  
  /**
   * Get lifecycle events (start, end, stage changes) for a task.
   * 
   * @param {string} taskId 
   * @returns {Array<Object>}
   */
  getTimeline(taskId) {
    return this.taskEvents.getTimeline(taskId);
  }
  
  /**
   * List recent tasks with event counts.
   * 
   * @param {Object} [options]
   * @param {string} [options.taskType] - Filter by task type
   * @param {number} [options.limit=20]
   * @returns {Array<Object>}
   */
  listTasks(options = {}) {
    return this.taskEvents.listTasks(options);
  }
}

module.exports = { TaskEventWriter, getEventMetadata, EVENT_TYPE_METADATA };
