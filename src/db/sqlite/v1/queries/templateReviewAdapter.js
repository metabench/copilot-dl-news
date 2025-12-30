'use strict';

/**
 * Template Review Queue Database Adapter
 * 
 * Persists template review queue items for human review workflow.
 * Manages the template_review_queue table with status tracking.
 * 
 * @module templateReviewAdapter
 */

const { safeStringify, safeParse, toNullableInt } = require('./common');

/**
 * Ensure the template_review_queue table exists
 * @param {import('better-sqlite3').Database} db
 */
function ensureTemplateReviewSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureTemplateReviewSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS template_review_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      template_json TEXT NOT NULL,
      accuracy_score REAL NOT NULL,
      sample_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_template_review_domain ON template_review_queue(domain);
    CREATE INDEX IF NOT EXISTS idx_template_review_status ON template_review_queue(status);
    CREATE INDEX IF NOT EXISTS idx_template_review_created_at ON template_review_queue(created_at);
  `);
}

/**
 * Normalize a review queue row from DB format to JS format
 * @param {Object} row - Database row
 * @returns {Object|null} Normalized queue item
 */
function normalizeReviewRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    template: safeParse(row.template_json),
    accuracyScore: row.accuracy_score,
    sampleCount: row.sample_count || 0,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at
  };
}

/**
 * Create template review queries for a database
 * @param {import('better-sqlite3').Database} db
 * @returns {Object} Query functions
 */
function createTemplateReviewAdapter(db) {
  ensureTemplateReviewSchema(db);

  const addStmt = db.prepare(`
    INSERT INTO template_review_queue (
      domain,
      template_json,
      accuracy_score,
      sample_count,
      status,
      created_at
    ) VALUES (
      @domain,
      @template_json,
      @accuracy_score,
      @sample_count,
      @status,
      @created_at
    )
  `);

  const getByIdStmt = db.prepare(`
    SELECT * FROM template_review_queue
    WHERE id = ?
  `);

  const getPendingStmt = db.prepare(`
    SELECT * FROM template_review_queue
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const getByDomainStmt = db.prepare(`
    SELECT * FROM template_review_queue
    WHERE domain = ?
    ORDER BY created_at DESC
  `);

  const getByDomainStatusStmt = db.prepare(`
    SELECT * FROM template_review_queue
    WHERE domain = ? AND status = ?
    ORDER BY created_at DESC
  `);

  const updateStatusStmt = db.prepare(`
    UPDATE template_review_queue
    SET status = @status,
        reviewed_by = @reviewed_by,
        reviewed_at = @reviewed_at,
        rejection_reason = @rejection_reason
    WHERE id = @id
  `);

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM template_review_queue
  `);

  const statsStmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM template_review_queue
  `);

  const clearStmt = db.prepare(`
    DELETE FROM template_review_queue
  `);

  return {
    /**
     * Add a template to the review queue
     * @param {Object} item - Queue item data
     * @returns {Object} Created item with id
     */
    add(item) {
      const now = new Date().toISOString();
      const record = {
        domain: item.domain,
        template_json: safeStringify(item.template),
        accuracy_score: item.accuracyScore,
        sample_count: item.sampleCount || 0,
        status: item.status || 'pending',
        created_at: item.createdAt || now
      };

      const result = addStmt.run(record);
      const inserted = getByIdStmt.get(result.lastInsertRowid);
      return normalizeReviewRow(inserted);
    },

    /**
     * Get a queue item by ID
     * @param {number} id - Queue item ID
     * @returns {Object|null} Queue item or null
     */
    getById(id) {
      const row = getByIdStmt.get(id);
      return normalizeReviewRow(row);
    },

    /**
     * Get pending review items
     * @param {number} [limit=10] - Maximum items to return
     * @returns {Object[]} Pending items
     */
    getPending(limit = 10) {
      const rows = getPendingStmt.all(toNullableInt(limit) || 10);
      return rows.map(normalizeReviewRow);
    },

    /**
     * Get queue items by domain
     * @param {string} domain - Domain to filter by
     * @param {Object} [opts] - Options
     * @param {string} [opts.status] - Filter by status
     * @returns {Object[]} Queue items
     */
    getByDomain(domain, opts = {}) {
      if (opts.status) {
        const rows = getByDomainStatusStmt.all(domain, opts.status);
        return rows.map(normalizeReviewRow);
      }
      const rows = getByDomainStmt.all(domain);
      return rows.map(normalizeReviewRow);
    },

    /**
     * Update queue item status
     * @param {number} id - Queue item ID
     * @param {Object} updates - Status updates
     */
    updateStatus(id, updates) {
      updateStatusStmt.run({
        id,
        status: updates.status,
        reviewed_by: updates.reviewedBy || null,
        reviewed_at: updates.reviewedAt || null,
        rejection_reason: updates.rejectionReason || null
      });
    },

    /**
     * Get total count
     * @returns {number}
     */
    count() {
      const result = countStmt.get();
      return result?.count || 0;
    },

    /**
     * Get queue statistics
     * @returns {Object} Statistics
     */
    getStats() {
      const row = statsStmt.get();
      const total = row?.total || 0;
      const approved = row?.approved || 0;
      const rejected = row?.rejected || 0;
      
      return {
        total,
        pending: row?.pending || 0,
        approved,
        rejected,
        approvalRate: (approved + rejected) > 0 ? approved / (approved + rejected) : 0
      };
    },

    /**
     * Clear all items
     */
    clear() {
      clearStmt.run();
    }
  };
}

module.exports = {
  ensureTemplateReviewSchema,
  normalizeReviewRow,
  createTemplateReviewAdapter
};
