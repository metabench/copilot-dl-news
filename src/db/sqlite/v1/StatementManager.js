/**
 * src/db/sqlite/v1/StatementManager.js
 *
 * Manages prepared statements for the SQLite database.
 * Separated from main NewsDatabase class to reduce complexity.
 */

class StatementManager {
  constructor(db) {
    this.db = db;
    this.statements = new Map();
    this._initStatements();
  }

  _initStatements() {
    // URL-related statements
    this._addStatement('selectByUrlStmt', `
      SELECT
        u.id AS id,
        u.url AS url,
        u.canonical_url AS canonical_url,
        ca.title AS title,
        ca.date AS date,
        ca.section AS section,
        cs.content_blob AS html,
        hr.fetched_at AS crawled_at,
        hr.request_started_at AS request_started_at,
        hr.fetched_at AS fetched_at,
        hr.http_status AS http_status,
        hr.content_type AS content_type,
        hr.etag AS etag,
        hr.last_modified AS last_modified,
        hr.redirect_chain AS redirect_chain,
        hr.ttfb_ms AS ttfb_ms,
        hr.download_ms AS download_ms,
        hr.total_ms AS total_ms
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
      LEFT JOIN content_analysis ca ON ca.content_id = cs.id
      LEFT JOIN discovery_events de ON de.url_id = u.id
      WHERE u.url = ?
      ORDER BY hr.fetched_at DESC
      LIMIT 1
    `);

    this._addStatement('selectByUrlOrCanonicalStmt', `
      SELECT
        u.id AS id,
        u.url AS url,
        u.canonical_url AS canonical_url,
        ca.title AS title,
        ca.date AS date,
        ca.section AS section,
        cs.content_blob AS html,
        hr.fetched_at AS crawled_at,
        hr.request_started_at AS request_started_at,
        hr.fetched_at AS fetched_at,
        hr.http_status AS http_status,
        hr.content_type AS content_type,
        hr.etag AS etag,
        hr.last_modified AS last_modified,
        hr.redirect_chain AS redirect_chain,
        hr.ttfb_ms AS ttfb_ms,
        hr.download_ms AS download_ms,
        hr.total_ms AS total_ms
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
      LEFT JOIN content_analysis ca ON ca.content_id = cs.id
      LEFT JOIN discovery_events de ON de.url_id = u.id
      WHERE u.url = ? OR u.canonical_url = ?
      ORDER BY hr.fetched_at DESC
      LIMIT 1
    `);

    this._addStatement('selectArticleHeadersStmt', `
      SELECT u.url, ca.title, ca.date, ca.section, u.canonical_url
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
      LEFT JOIN content_analysis ca ON ca.content_id = cs.id
      LEFT JOIN discovery_events de ON de.url_id = u.id
      WHERE u.url = ? OR u.canonical_url = ?
      ORDER BY hr.fetched_at DESC
      LIMIT 1
    `);

    this._addStatement('countStmt', `
      SELECT COUNT(*) as count
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
    `);

    // Settings statements
    this._addStatement('_getSettingStmt', `SELECT value FROM crawler_settings WHERE key = ?`);
    this._addStatement('_setSettingStmt', `INSERT INTO crawler_settings(key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);

    // Crawl job statements
    this._addStatement('_insertCrawlJobStmt', `INSERT OR REPLACE INTO crawl_jobs(id, url_id, args, pid, started_at, status) VALUES (@id, @urlId, @args, @pid, @startedAt, @status)`);
    this._addStatement('_updateCrawlJobStmt', `UPDATE crawl_jobs SET ended_at = @endedAt, status = @status WHERE id = @id`);

    // Queue event statements
    this._addStatement('_insertQueueEventStmt', `INSERT INTO queue_events(job_id, ts, action, url_id, depth, host, reason, queue_size, alias, queue_origin, queue_role, queue_depth_bucket) VALUES (@jobId, @ts, @action, @urlId, @depth, @host, @reason, @queueSize, @alias, @queueOrigin, @queueRole, @queueDepthBucket)`);

    // Problem statements
    this._addStatement('_insertProblemStmt', `INSERT INTO crawl_problems(job_id, ts, kind, scope, target, message, details) VALUES (@jobId, @ts, @kind, @scope, @target, @message, @details)`);

    // Milestone statements
    this._addStatement('_insertMilestoneStmt', `INSERT INTO crawl_milestones(job_id, ts, kind, scope, target, message, details) VALUES (@jobId, @ts, @kind, @scope, @target, @message, @details)`);

    // Planner stage statements
    this._addStatement('_insertPlannerStageStmt', `INSERT INTO planner_stage_events(job_id, ts, stage, status, sequence, duration_ms, details) VALUES (@jobId, @ts, @stage, @status, @sequence, @durationMs, @details)`);

    // Task statements
    this._addStatement('_countActiveTasksByJobStmt', `SELECT COUNT(*) AS c FROM crawl_tasks WHERE job_id = ? AND status NOT IN ('completed','failed')`);
    this._addStatement('_selectOldActiveTasksStmt', `SELECT id FROM crawl_tasks WHERE job_id = ? AND status NOT IN ('completed','failed') ORDER BY created_at ASC, id ASC LIMIT ?`);
    this._addStatement('_deleteTaskByIdStmt', `DELETE FROM crawl_tasks WHERE id = ?`);
    this._addStatement('_insertTaskStmt', `INSERT INTO crawl_tasks (job_id, host, kind, status, url, payload, note, created_at, updated_at) VALUES (@job_id, @host, @kind, @status, @url, @payload, @note, datetime('now'), datetime('now'))`);
    this._addStatement('_updateTaskStatusStmt', `UPDATE crawl_tasks SET status = @status, note = COALESCE(@note, note), updated_at = datetime('now') WHERE id = @id`);
    this._addStatement('_clearTasksByJobStmt', `DELETE FROM crawl_tasks WHERE job_id = ?`);
    this._addStatement('_getTaskByIdStmt', `SELECT id, job_id AS jobId, host, kind, status, url, payload, note, created_at AS createdAt, updated_at AS updatedAt FROM crawl_tasks WHERE id = ?`);

    // Error statements
    this._addStatement('insertErrorStmt', `INSERT INTO errors (url_id, host, kind, code, message, details, at) VALUES (@urlId, @host, @kind, @code, @message, @details, @at)`);

    // Link statements
    this._addStatement('insertLinkStmt', `
      INSERT INTO links (src_url_id, dst_url_id, anchor, rel, type, depth, on_domain, discovered_at)
      VALUES (@src_url_id, @dst_url_id, @anchor, @rel, @type, @depth, @on_domain, @discovered_at)
    `);
    this._addStatement('linkCountStmt', `SELECT COUNT(*) as count FROM links`);

    // URL alias statements
    this._addStatement('insertUrlAliasStmt', `
      INSERT INTO url_aliases (url_id, alias_url_id, classification, reason, url_exists, checked_at, metadata)
      VALUES (@url_id, @alias_url_id, @classification, @reason, @exists, @checked_at, @metadata)
      ON CONFLICT(url_id, alias_url_id) DO UPDATE SET
        classification = excluded.classification,
        reason = excluded.reason,
        url_exists = excluded.url_exists,
        checked_at = excluded.checked_at,
        metadata = excluded.metadata
    `);

    // Category statements
    this._addStatement('_ensureUrlCategoryStmt', `INSERT OR IGNORE INTO url_categories(name, description) VALUES (?, NULL)`);
    this._addStatement('_getUrlCategoryIdStmt', `SELECT id FROM url_categories WHERE name = ?`);
    this._addStatement('_mapUrlCategoryStmt', `INSERT OR IGNORE INTO url_category_map(url_id, category_id) VALUES (?, ?)`);
    this._addStatement('_getUrlIdStmt', `SELECT id FROM urls WHERE url = ?`);

    this._addStatement('_ensurePageCategoryStmt', `INSERT OR IGNORE INTO page_categories(name, description) VALUES (?, NULL)`);
    this._addStatement('_getPageCategoryIdStmt', `SELECT id FROM page_categories WHERE name = ?`);

    // Gazetteer statements (may fail if tables not initialized)
    try {
      this._addStatement('_selectCountryNamesStmt', `
        SELECT name FROM place_names
        WHERE id IN (
          SELECT canonical_name_id FROM places WHERE kind='country'
        )
        ORDER BY name
        LIMIT ?
      `);
    } catch (_) {
      this.statements.set('_selectCountryNamesStmt', null);
    }
  }

  _addStatement(name, sql) {
    try {
      const stmt = this.db.prepare(sql);
      this.statements.set(name, stmt);
    } catch (error) {
      console.warn(`[StatementManager] Failed to prepare statement ${name}:`, error.message);
      this.statements.set(name, null);
    }
  }

  get(name) {
    return this.statements.get(name);
  }

  close() {
    for (const stmt of this.statements.values()) {
      if (stmt && typeof stmt.finalize === 'function') {
        try {
          stmt.finalize();
        } catch (_) {
          // Ignore errors during cleanup
        }
      }
    }
    this.statements.clear();
  }
}

module.exports = { StatementManager };