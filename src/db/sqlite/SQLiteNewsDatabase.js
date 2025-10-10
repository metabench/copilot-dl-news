const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { is_array, tof } = require('lang-tools');
const { ensureDb, ensureGazetteer } = require('./ensureDb');
const { Readable } = require('stream');

function slugifyCountryName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

class NewsDatabase {
  constructor(dbHandle) {
    if (!dbHandle) {
      throw new Error('NewsDatabase constructor requires a dbHandle from better-sqlite3');
    }
    this.db = dbHandle;
    this.dbFilePath = this.db.name;

    // Prepare category helpers
    this._ensureUrlCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO url_categories(name, description) VALUES (?, NULL)`);
    this._getUrlCategoryIdStmt = this.db.prepare(`SELECT id FROM url_categories WHERE name = ?`);
    this._mapUrlCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO url_category_map(url_id, category_id) VALUES (?, ?)`);
    this._getUrlIdStmt = this.db.prepare(`SELECT id FROM urls WHERE url = ?`);

    this._ensurePageCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO page_categories(name, description) VALUES (?, NULL)`);
    this._getPageCategoryIdStmt = this.db.prepare(`SELECT id FROM page_categories WHERE name = ?`);
    this._mapPageCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO page_category_map(fetch_id, category_id) VALUES (?, ?)`);

    // Gazetteer statements - may fail if gazetteer tables aren't initialized yet
    try {
      this._selectCountryNamesStmt = this.db.prepare(`
        SELECT name FROM place_names
        WHERE id IN (
          SELECT canonical_name_id FROM places WHERE kind='country'
        )
        ORDER BY name
        LIMIT ?
      `);
    } catch (_) {
      // Gazetteer tables not initialized - set to null
      this._selectCountryNamesStmt = null;
    }

    this._getSettingStmt = this.db.prepare(`SELECT value FROM crawler_settings WHERE key = ?`);
    this._setSettingStmt = this.db.prepare(`INSERT INTO crawler_settings(key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);
    this._insertCrawlJobStmt = this.db.prepare(`INSERT OR REPLACE INTO crawl_jobs(id, url, args, pid, started_at, status) VALUES (@id, @url, @args, @pid, @startedAt, @status)`);
    this._updateCrawlJobStmt = this.db.prepare(`UPDATE crawl_jobs SET ended_at = @endedAt, status = @status WHERE id = @id`);
    this._insertQueueEventStmt = this.db.prepare(`INSERT INTO queue_events(job_id, ts, action, url, depth, host, reason, queue_size, alias, queue_origin, queue_role, queue_depth_bucket) VALUES (@jobId, @ts, @action, @url, @depth, @host, @reason, @queueSize, @alias, @queueOrigin, @queueRole, @queueDepthBucket)`);
    this._insertProblemStmt = this.db.prepare(`INSERT INTO crawl_problems(job_id, ts, kind, scope, target, message, details) VALUES (@jobId, @ts, @kind, @scope, @target, @message, @details)`);
    this._insertMilestoneStmt = this.db.prepare(`INSERT INTO crawl_milestones(job_id, ts, kind, scope, target, message, details) VALUES (@jobId, @ts, @kind, @scope, @target, @message, @details)`);
    this._insertPlannerStageStmt = this.db.prepare(`INSERT INTO planner_stage_events(job_id, ts, stage, status, sequence, duration_ms, details) VALUES (@jobId, @ts, @stage, @status, @sequence, @durationMs, @details)`);
    this._countActiveTasksByJobStmt = this.db.prepare(`SELECT COUNT(*) AS c FROM crawl_tasks WHERE job_id = ? AND status NOT IN ('completed','failed')`);
    this._selectOldActiveTasksStmt = this.db.prepare(`SELECT id FROM crawl_tasks WHERE job_id = ? AND status NOT IN ('completed','failed') ORDER BY created_at ASC, id ASC LIMIT ?`);
    this._deleteTaskByIdStmt = this.db.prepare(`DELETE FROM crawl_tasks WHERE id = ?`);
    this._insertTaskStmt = this.db.prepare(`INSERT INTO crawl_tasks (job_id, host, kind, status, url, payload, note, created_at, updated_at) VALUES (@job_id, @host, @kind, @status, @url, @payload, @note, datetime('now'), datetime('now'))`);
    this._updateTaskStatusStmt = this.db.prepare(`UPDATE crawl_tasks SET status = @status, note = COALESCE(@note, note), updated_at = datetime('now') WHERE id = @id`);
    this._clearTasksByJobStmt = this.db.prepare(`DELETE FROM crawl_tasks WHERE job_id = ?`);
    this._getTaskByIdStmt = this.db.prepare(`SELECT id, job_id AS jobId, host, kind, status, url, payload, note, created_at AS createdAt, updated_at AS updatedAt FROM crawl_tasks WHERE id = ?`);
    this.insertErrorStmt = this.db.prepare(`INSERT INTO errors (url, host, kind, code, message, details, at) VALUES (@url, @host, @kind, @code, @message, @details, @at)`);

    // Article/URL/Fetch statements (missing - added to fix URLs API)
    this.insertArticleStmt = this.db.prepare(`
      INSERT INTO articles (url, host, title, date, section, html, crawled_at, canonical_url, referrer_url, discovered_at, crawl_depth, fetched_at, request_started_at, http_status, content_type, content_length, etag, last_modified, redirect_chain, ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps, html_sha256, text, word_count, language, article_xpath, analysis)
      VALUES (@url, @host, @title, @date, @section, @html, @crawled_at, @canonical_url, @referrer_url, @discovered_at, @crawl_depth, @fetched_at, @request_started_at, @http_status, @content_type, @content_length, @etag, @last_modified, @redirect_chain, @ttfb_ms, @download_ms, @total_ms, @bytes_downloaded, @transfer_kbps, @html_sha256, @text, @word_count, @language, @article_xpath, @analysis)
      ON CONFLICT(url) DO UPDATE SET
        host = excluded.host,
        title = excluded.title,
        date = excluded.date,
        section = excluded.section,
        html = excluded.html,
        crawled_at = excluded.crawled_at,
        canonical_url = excluded.canonical_url,
        referrer_url = excluded.referrer_url,
        discovered_at = excluded.discovered_at,
        crawl_depth = excluded.crawl_depth,
        fetched_at = excluded.fetched_at,
        request_started_at = excluded.request_started_at,
        http_status = excluded.http_status,
        content_type = excluded.content_type,
        content_length = excluded.content_length,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        redirect_chain = excluded.redirect_chain,
        ttfb_ms = excluded.ttfb_ms,
        download_ms = excluded.download_ms,
        total_ms = excluded.total_ms,
        bytes_downloaded = excluded.bytes_downloaded,
        transfer_kbps = excluded.transfer_kbps,
        html_sha256 = excluded.html_sha256,
        text = excluded.text,
        word_count = excluded.word_count,
        language = excluded.language,
        article_xpath = excluded.article_xpath,
        analysis = excluded.analysis
    `);
    this.selectByUrlStmt = this.db.prepare(`SELECT * FROM articles WHERE url = ?`);
    this.selectByUrlOrCanonicalStmt = this.db.prepare(`SELECT * FROM articles WHERE url = ? OR canonical_url = ?`);
    this.selectArticleHeadersStmt = this.db.prepare(`SELECT url, title, date, section, canonical_url FROM articles WHERE url = ? OR canonical_url = ?`);
    this.countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM articles`);
    this.insertLinkStmt = this.db.prepare(`
      INSERT INTO links (src_url, dst_url, anchor, rel, type, depth, on_domain, discovered_at)
      VALUES (@src_url, @dst_url, @anchor, @rel, @type, @depth, @on_domain, @discovered_at)
    `);
    this.linkCountStmt = this.db.prepare(`SELECT COUNT(*) as count FROM links`);
    this.insertFetchStmt = this.db.prepare(`
      INSERT INTO fetches (url, request_started_at, fetched_at, http_status, content_type, content_length, content_encoding, bytes_downloaded, transfer_kbps, ttfb_ms, download_ms, total_ms, saved_to_db, saved_to_file, file_path, file_size, classification, nav_links_count, article_links_count, word_count, analysis, host)
      VALUES (@url, @request_started_at, @fetched_at, @http_status, @content_type, @content_length, @content_encoding, @bytes_downloaded, @transfer_kbps, @ttfb_ms, @download_ms, @total_ms, @saved_to_db, @saved_to_file, @file_path, @file_size, @classification, @nav_links_count, @article_links_count, @word_count, @analysis, @host)
    `);
    this.insertUrlMinimalStmt = this.db.prepare(`
      INSERT OR IGNORE INTO urls (url, host, created_at, last_seen_at)
      VALUES (@url, @host, datetime('now'), datetime('now'))
    `);
    this.touchUrlStmt = this.db.prepare(`UPDATE urls SET last_seen_at = datetime('now') WHERE url = ?`);
    this.insertUrlAliasStmt = this.db.prepare(`
      INSERT INTO url_aliases (url, alias_url, classification, reason, url_exists, checked_at, metadata)
      VALUES (@url, @alias_url, @classification, @reason, @exists, @checked_at, @metadata)
      ON CONFLICT(url, alias_url) DO UPDATE SET
        classification = excluded.classification,
        reason = excluded.reason,
        url_exists = excluded.url_exists,
        checked_at = excluded.checked_at,
        metadata = excluded.metadata
    `);
  }

  _init() {
    // This method is now deprecated as schema creation is handled by ensureDb.
    // It is kept for backward compatibility in case any old code calls it.
  }

  upsertArticle(article) {
    // article: { url, title, date, section, html, crawled_at }
    // Extract host from URL if not provided
    let host = article.host;
    if (!host && article.url) {
      try {
        const u = new URL(article.url);
        host = u.hostname.toLowerCase();
      } catch (_) {
        host = null;
      }
    }
    const withDefaults = {
      host,
      title: null,
      date: null,
      section: null,
      html: null,
      crawled_at: new Date().toISOString(),
      canonical_url: null,
      referrer_url: null,
      discovered_at: null,
      crawl_depth: null,
      fetched_at: null,
      request_started_at: null,
      http_status: null,
      content_type: null,
      content_length: null,
      etag: null,
      last_modified: null,
      redirect_chain: null,
      ttfb_ms: null,
      download_ms: null,
      total_ms: null,
      bytes_downloaded: null,
      transfer_kbps: null,
      html_sha256: null,
      text: null,
      word_count: null,
      language: null,
      article_xpath: null,
      analysis: null,
      ...article
    };
    const res = this.insertArticleStmt.run(withDefaults);
    // Upsert domain row based on URL host
    if (host) {
      try {
        this.upsertDomain(host);
        // Ensure urls.host is populated for this url
        try { this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(host, withDefaults.url); } catch (_) {}
      } catch (_) {}
    }
    return res;
  }

  getArticleByUrl(url) {
    return this.selectByUrlStmt.get(url);
  }

  // Try to find an article row by exact URL or by canonical_url
  getArticleByUrlOrCanonical(url) {
    return this.selectByUrlOrCanonicalStmt.get(url, url);
  }

  getArticleHeaders(url) {
    return this.selectArticleHeadersStmt.get(url, url);
  }

  getCount() {
    const row = this.countStmt.get();
    return row?.count || 0;
  }

  insertLink(link) {
    // link: { src_url, dst_url, anchor, rel, type, depth, on_domain, discovered_at }
    return this.insertLinkStmt.run(link);
  }

  getLinkCount() {
    const row = this.linkCountStmt.get();
    return row?.count || 0;
  }

  insertFetch(fetchRow) {
    // Extract host from URL if not provided
    let host = fetchRow.host;
    if (!host && fetchRow.url) {
      try {
        const u = new URL(fetchRow.url);
        host = u.hostname.toLowerCase();
      } catch (_) {
        host = null;
      }
    }
    const withDefaults = { 
      request_started_at: null,
      fetched_at: null,
      http_status: null,
      content_type: null,
      content_length: null,
      content_encoding: null,
      bytes_downloaded: null,
      transfer_kbps: null,
      ttfb_ms: null,
      download_ms: null,
      total_ms: null,
      saved_to_db: 0,
      saved_to_file: 0,
      file_path: null,
      file_size: null,
      classification: null,
      nav_links_count: null,
      article_links_count: null,
      word_count: null,
      analysis: null,
      host,
      ...fetchRow 
    };
    const res = this.insertFetchStmt.run(withDefaults);
    // Upsert domain row based on URL host
    if (host) {
      try {
        this.upsertDomain(host);
        // Ensure urls.host is populated for this url
        try { this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(host, withDefaults.url); } catch (_) {}
      } catch (_) {}
    }
    return res;
  }

  _ensureUrlRow(url) {
    if (!url) return;
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase() || null;
      this.insertUrlMinimalStmt.run(url, host);
    } catch (_) {
      try { this.insertUrlMinimalStmt.run(url, null); } catch (_) {}
    }
    try { this.touchUrlStmt.run(url); } catch (_) {}
  }

  hasUrl(url) {
    if (!url) return false;
    try {
      const row = this._getUrlIdStmt.get(url);
      if (row && row.id != null) return true;
    } catch (_) {}
    try {
      const f = this.db.prepare('SELECT 1 FROM fetches WHERE url = ? LIMIT 1').get(url);
      if (f) return true;
    } catch (_) {}
    try {
      const a = this.db.prepare('SELECT 1 FROM articles WHERE url = ? LIMIT 1').get(url);
      if (a) return true;
    } catch (_) {}
    return false;
  }

  recordUrlAlias({ url, aliasUrl, classification = null, reason = null, exists = false, metadata = null }) {
    if (!url || !aliasUrl) return false;
    const nowIso = new Date().toISOString();
    this._ensureUrlRow(url);
    this._ensureUrlRow(aliasUrl);
    try {
      const payload = {
        url,
        alias_url: aliasUrl,
        classification,
        reason,
        exists: exists ? 1 : 0,
        checked_at: nowIso,
        metadata: metadata ? JSON.stringify(metadata) : null
      };
      this.insertUrlAliasStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  getFetchesByUrl(url, limit = 100) {
    return this.db.prepare('SELECT * FROM fetches WHERE url = ? ORDER BY fetched_at DESC LIMIT ?').all(url, limit);
  }

  // Aggregate counts for crawler telemetry
  getFetchCount() {
    try {
      const r = this.db.prepare('SELECT COUNT(*) AS c FROM fetches').get();
      return r?.c || 0;
    } catch (_) { return 0; }
  }
  getArticleClassifiedFetchCount() {
    try {
      const r = this.db.prepare("SELECT COUNT(*) AS c FROM fetches WHERE classification = 'article'").get();
      return r?.c || 0;
    } catch (_) { return 0; }
  }

  getTopCountrySlugs(limit = 50) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    try {
      if (!this._selectCountryNamesStmt) {
        return []; // Gazetteer not initialized
      }
      const rows = this._selectCountryNamesStmt.all(safeLimit);
      const unique = new Set();
      const slugs = [];
      for (const entry of rows) {
        const slug = slugifyCountryName(entry?.name);
        if (slug && !unique.has(slug)) {
          unique.add(slug);
          slugs.push(slug);
        }
      }
      return slugs;
    } catch (_) {
      return [];
    }
  }

  getArticleRowByUrl(url) {
    return this.db.prepare('SELECT * FROM articles WHERE url = ?').get(url);
  }

  // Stream article URLs from the database as a Node.js Readable (objectMode=true).
  // Yields strings (URLs) in no particular order.
  streamArticleUrls() {
    const stmt = this.db.prepare('SELECT url FROM articles');
    const iterator = stmt.iterate(); // efficient, low-memory iterator
    const readable = new Readable({
      objectMode: true,
      read() {
        try {
          while (true) {
            const { value, done } = iterator.next();
            if (done) {
              this.push(null);
              return;
            }
            if (!this.push(value.url)) {
              return; // respect backpressure
            }
          }
        } catch (e) {
          // Defer error to avoid synchronous throw inside read
          process.nextTick(() => this.destroy(e));
        }
      }
    });
    return readable;
  }

  close() {
    this.db.close();
  }

  // URL helpers
  upsertUrl(url, canonical = null, analysis = null) {
    const now = new Date().toISOString();
    this.db.exec(`
      INSERT OR IGNORE INTO urls(url, canonical_url, created_at, last_seen_at, analysis)
      VALUES ('${url.replace(/'/g, "''")}', ${canonical ? `'${canonical.replace(/'/g, "''")}'` : 'NULL'}, '${now}', '${now}', ${analysis ? `'${analysis.replace(/'/g, "''")}'` : 'NULL'});
      UPDATE urls SET last_seen_at='${now}' WHERE url='${url.replace(/'/g, "''")}';
      UPDATE urls SET canonical_url=COALESCE(${canonical ? `'${canonical.replace(/'/g, "''")}'` : 'NULL'}, canonical_url) WHERE url='${url.replace(/'/g, "''")}';
      UPDATE urls SET analysis=COALESCE(${analysis ? `'${analysis.replace(/'/g, "''")}'` : 'NULL'}, analysis) WHERE url='${url.replace(/'/g, "''")}';
    `);
    try {
      const u = new URL(url);
      this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(u.hostname.toLowerCase(), url);
    } catch (_) {}
  }

  // Domain helpers
  upsertDomain(host, analysis = null) {
    if (!host) return;
    const now = new Date().toISOString();
    const esc = (s) => s.replace(/'/g, "''");
    const tld = host.includes('.') ? host.split('.').slice(-1)[0] : host;
    this.db.exec(`
      INSERT OR IGNORE INTO domains(host, tld, created_at, last_seen_at, analysis)
      VALUES ('${esc(host)}', '${esc(tld)}', '${now}', '${now}', ${analysis ? `'${esc(analysis)}'` : 'NULL'});
      UPDATE domains SET last_seen_at='${now}' WHERE host='${esc(host)}';
      UPDATE domains SET analysis=COALESCE(${analysis ? `'${esc(analysis)}'` : 'NULL'}, analysis) WHERE host='${esc(host)}';
    `);
  }

  ensureDomainCategory(name) {
    this.db.prepare(`INSERT OR IGNORE INTO domain_categories(name, description) VALUES (?, NULL)`).run(name);
    const row = this.db.prepare(`SELECT id FROM domain_categories WHERE name = ?`).get(name);
    return row?.id || null;
  }

  tagDomainWithCategory(host, categoryName) {
    if (!host || !categoryName) return null;
    const row = this.db.prepare(`SELECT id FROM domains WHERE host = ?`).get(host);
    if (!row) return null;
    const cid = this.ensureDomainCategory(categoryName);
    if (!cid) return null;
    this.db.prepare(`INSERT OR IGNORE INTO domain_category_map(domain_id, category_id) VALUES (?, ?)`).run(row.id, cid);
    return { domain_id: row.id, category_id: cid };
  }

  ensureUrlCategory(name) {
    this._ensureUrlCategoryStmt.run(name);
    const row = this._getUrlCategoryIdStmt.get(name);
    return row?.id || null;
  }

  ensurePageCategory(name) {
    this._ensurePageCategoryStmt.run(name);
    const row = this._getPageCategoryIdStmt.get(name);
    return row?.id || null;
  }

  tagUrlWithCategory(url, categoryName) {
    const urlRow = this._getUrlIdStmt.get(url);
    if (!urlRow) return null;
    const cid = this.ensureUrlCategory(categoryName);
    if (!cid) return null;
    this._mapUrlCategoryStmt.run(urlRow.id, cid);
    return { url_id: urlRow.id, category_id: cid };
  }

  tagFetchWithCategory(fetchId, categoryName) {
    const cid = this.ensurePageCategory(categoryName);
    if (!cid) return null;
    this._mapPageCategoryStmt.run(fetchId, cid);
    return { fetch_id: fetchId, category_id: cid };
  }

  _safeParseJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  _hydrateTask(row) {
    if (!row) return null;
    return {
      id: row.id,
      jobId: row.jobId,
      host: row.host,
      kind: row.kind,
      status: row.status,
      url: row.url,
      payload: this._safeParseJson(row.payload),
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  getSetting(key, fallback = null) {
    if (!key) return fallback;
    try {
      const row = this._getSettingStmt.get(key);
      return row && row.value !== undefined ? row.value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  setSetting(key, value) {
    if (!key) return false;
    try {
      this._setSettingStmt.run(key, value != null ? String(value) : null);
      return true;
    } catch (_) {
      return false;
    }
  }

  getTaskQueueLimit(defaultLimit = 100) {
    const fallback = Math.max(10, parseInt(defaultLimit, 10) || 100);
    try {
      const row = this._getSettingStmt.get('taskQueueLimit');
      if (!row || row.value == null) {
        this._setSettingStmt.run('taskQueueLimit', String(fallback));
        return fallback;
      }
      const n = parseInt(row.value, 10);
      if (!Number.isFinite(n)) return fallback;
      const safe = Math.max(10, n);
      if (safe !== n) {
        this._setSettingStmt.run('taskQueueLimit', String(safe));
      }
      return safe;
    } catch (_) {
      return fallback;
    }
  }

  setTaskQueueLimit(limit) {
    const safe = Math.max(10, parseInt(limit, 10) || 10);
    this._setSettingStmt.run('taskQueueLimit', String(safe));
    return safe;
  }

  getActiveTaskCount(jobId) {
    if (!jobId) return 0;
    try {
      const row = this._countActiveTasksByJobStmt.get(jobId);
      return row?.c || 0;
    } catch (_) {
      return 0;
    }
  }

  _pruneActiveTasks(jobId, overflow) {
    if (!jobId || !overflow || overflow <= 0) return;
    try {
      const victims = this._selectOldActiveTasksStmt.all(jobId, overflow);
      for (const v of victims) {
        try { this._deleteTaskByIdStmt.run(v.id); } catch (_) {}
      }
    } catch (_) {}
  }

  createTask(task) {
    if (!task || !task.jobId) throw new Error('createTask requires jobId');
    const limit = this.getTaskQueueLimit();
    const record = {
      job_id: task.jobId,
      host: task.host || (() => {
        try { if (task.url) return new URL(task.url).hostname.toLowerCase(); } catch (_) {}
        return null;
      })(),
      kind: task.kind || null,
      status: task.status || 'pending',
      url: task.url || null,
      payload: (() => {
        if (task.payload === null || task.payload === undefined) return null;
        if (typeof task.payload === 'string') return task.payload;
        try { return JSON.stringify(task.payload); } catch (_) { return String(task.payload); }
      })(),
      note: task.note || null
    };

    const runInsert = this.db.transaction((data) => {
      const activeCount = this._countActiveTasksByJobStmt.get(data.job_id)?.c || 0;
      const overflow = Math.max(0, (activeCount + 1) - limit);
      if (overflow > 0) {
        this._pruneActiveTasks(data.job_id, overflow);
      }
      const info = this._insertTaskStmt.run(data);
      return info.lastInsertRowid;
    });

    const id = runInsert(record);
    return this.getTaskById(id);
  }

  getTaskById(id) {
    if (!id) return null;
    try {
      const row = this._getTaskByIdStmt.get(id);
      return this._hydrateTask(row);
    } catch (_) {
      return null;
    }
  }

  listTasks({ jobId = null, statuses = null, limit = 200 } = {}) {
    const clauses = [];
    const params = [];
    if (jobId) {
      clauses.push('job_id = ?');
      params.push(jobId);
    }
    if (is_array(statuses) && statuses.length) {
      const placeholders = statuses.map(() => '?').join(',');
      clauses.push(`status IN (${placeholders})`);
      params.push(...statuses);
    }
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 200));
    const sql = `
      SELECT id, job_id AS jobId, host, kind, status, url, payload, note,
             created_at AS createdAt, updated_at AS updatedAt
      FROM crawl_tasks
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params, safeLimit);
    return rows.map((row) => this._hydrateTask(row));
  }

  getTasksForJob(jobId, options = {}) {
    return this.listTasks({ jobId, ...options });
  }

  updateTaskStatus(id, status, note = null) {
    if (!id || !status) return false;
    try {
      const info = this._updateTaskStatusStmt.run({ id, status, note });
      return (info?.changes || 0) > 0;
    } catch (_) {
      return false;
    }
  }

  clearTasksForJob(jobId, { statuses = null } = {}) {
    if (!jobId) return 0;
    if (is_array(statuses) && statuses.length) {
      const placeholders = statuses.map(() => '?').join(',');
      const stmt = this.db.prepare(`DELETE FROM crawl_tasks WHERE job_id = ? AND status IN (${placeholders})`);
      const info = stmt.run(jobId, ...statuses);
      return info?.changes || 0;
    }
    const info = this._clearTasksByJobStmt.run(jobId);
    return info?.changes || 0;
  }

  insertError(err) {
    // err: { url?, kind, code?, message?, details? }
    const at = new Date().toISOString();
    let host = null;
    try { if (err.url) host = new URL(err.url).hostname.toLowerCase(); } catch (_) {}
    return this.insertErrorStmt.run({
      url: err.url || null,
      host: host || null,
      kind: err.kind || 'other',
      code: typeof err.code === 'number' ? err.code : null,
      message: err.message || null,
      details: err.details != null ? (typeof err.details === 'string' ? err.details : JSON.stringify(err.details)) : null,
      at
    });
  }

  getHandle() {
    return this.db;
  }

  ensureCrawlTypesSeeded() {
    if (this._crawlTypesSeeded) return;
    const defaults = [
      { name: 'basic', description: 'Follow links only (no sitemap)', declaration: { crawlType: 'basic', useSitemap: false, sitemapOnly: false } },
      { name: 'sitemap-only', description: 'Use only the sitemap to discover pages', declaration: { crawlType: 'sitemap-only', useSitemap: true, sitemapOnly: true } },
      { name: 'basic-with-sitemap', description: 'Follow links and also use the sitemap', declaration: { crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false } },
      { name: 'intelligent', description: 'Intelligent planning (hubs + sitemap + heuristics)', declaration: { crawlType: 'intelligent', useSitemap: true, sitemapOnly: false } },
  { name: 'discover-structure', description: 'Map site structure without downloading articles', declaration: { crawlType: 'discover-structure', useSitemap: true, sitemapOnly: false } },
  { name: 'gazetteer', description: 'Legacy alias for geography gazetteer crawl', declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false } },
  { name: 'wikidata', description: 'Only ingest gazetteer data from Wikidata', declaration: { crawlType: 'wikidata', useSitemap: false, sitemapOnly: false } },
  { name: 'geography', description: 'Aggregate gazetteer data from Wikidata plus OpenStreetMap boundaries', declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false } }
    ];
    const stmt = this.db.prepare(`
      INSERT INTO crawl_types(name, description, declaration)
      VALUES (@name, @description, @declaration)
      ON CONFLICT(name) DO UPDATE SET description = excluded.description, declaration = excluded.declaration
    `);
    const txn = this.db.transaction((rows) => {
      for (const row of rows) {
        stmt.run({
          name: row.name,
          description: row.description,
          declaration: JSON.stringify(row.declaration)
        });
      }
    });
    try {
      txn(defaults);
      this._crawlTypesSeeded = true;
    } catch (_) {
      // Ignore seeding errors but avoid retry loop
      this._crawlTypesSeeded = true;
    }
  }

  recordCrawlJobStart({ id, url = null, args = null, pid = null, startedAt = null, status = 'running' }) {
    if (!id) return false;
    const payload = {
      id,
      url,
      args: args != null ? (tof(args) === 'string' ? args : JSON.stringify(args)) : null,
      pid: pid != null ? pid : null,
      startedAt: startedAt || new Date().toISOString(),
      status: status || 'running'
    };
    try {
      this._insertCrawlJobStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  markCrawlJobStatus({ id, endedAt = null, status = 'done' }) {
    if (!id) return false;
    const payload = {
      id,
      endedAt: endedAt || new Date().toISOString(),
      status: status || 'done'
    };
    try {
      const info = this._updateCrawlJobStmt.run(payload);
      return (info?.changes || 0) > 0;
    } catch (_) {
      return false;
    }
  }

  insertQueueEvent(event) {
    if (!event || !event.jobId) return false;
    const payload = {
      jobId: event.jobId,
      ts: event.ts || new Date().toISOString(),
      action: event.action || 'unknown',
      url: event.url || null,
      depth: Number.isFinite(event.depth) ? event.depth : null,
      host: event.host || null,
      reason: event.reason || null,
      queueSize: Number.isFinite(event.queueSize) ? event.queueSize : null,
      alias: event.alias || null,
      queueOrigin: event.queueOrigin || null,
      queueRole: event.queueRole || null,
      queueDepthBucket: event.queueDepthBucket || null
    };
    try {
      this._insertQueueEventStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  insertProblem(problem) {
    if (!problem || !problem.jobId) return false;
    const payload = {
      jobId: problem.jobId,
      ts: problem.ts || new Date().toISOString(),
      kind: problem.kind || 'unknown',
      scope: problem.scope || null,
      target: problem.target || null,
      message: problem.message || null,
      details: problem.details != null ? (typeof problem.details === 'string' ? problem.details : JSON.stringify(problem.details)) : null
    };
    try {
      this._insertProblemStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  insertMilestone(milestone) {
    if (!milestone || !milestone.jobId) return false;
    const payload = {
      jobId: milestone.jobId,
      ts: milestone.ts || new Date().toISOString(),
      kind: milestone.kind || 'unknown',
      scope: milestone.scope || null,
      target: milestone.target || null,
      message: milestone.message || null,
      details: milestone.details != null ? (typeof milestone.details === 'string' ? milestone.details : JSON.stringify(milestone.details)) : null
    };
    try {
      this._insertMilestoneStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  insertPlannerStageEvent(event) {
    if (!event || !event.jobId) return false;
    const payload = {
      jobId: event.jobId,
      ts: event.ts || new Date().toISOString(),
      stage: event.stage || 'unknown',
      status: event.status || 'unknown',
      sequence: Number.isFinite(event.sequence) ? event.sequence : null,
      durationMs: Number.isFinite(event.durationMs) ? event.durationMs : null,
      details: event.details != null ? (typeof event.details === 'string' ? event.details : JSON.stringify(event.details)) : null
    };
    try {
      this._insertPlannerStageStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  listQueues(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    try {
      const rows = this.db.prepare(`
        SELECT j.id, j.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
               (SELECT COUNT(*) FROM queue_events e WHERE e.job_id = j.id) AS events,
               (SELECT MAX(ts) FROM queue_events e WHERE e.job_id = j.id) AS lastEventAt
        FROM crawl_jobs j
        ORDER BY COALESCE(j.ended_at, j.started_at) DESC
        LIMIT ?
      `).all(safeLimit);
      return rows;
    } catch (_) {
      return [];
    }
  }

  getCrawlJob(id) {
    if (!id) return null;
    try {
      return this.db.prepare(`
        SELECT id, url, pid, started_at AS startedAt, ended_at AS endedAt, status
        FROM crawl_jobs
        WHERE id = ?
      `).get(id);
    } catch (_) {
      return null;
    }
  }

  listQueueEvents({ jobId, action = null, limit = 200, before = null, after = null } = {}) {
    if (!jobId) return { items: [], cursors: {}, stats: null };
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 200));
    const clauses = ['job_id = ?'];
    const params = [jobId];
    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    let order = 'DESC';
    if (before != null) {
      clauses.push('id < ?');
      params.push(before);
    } else if (after != null) {
      clauses.push('id > ?');
      params.push(after);
      order = 'ASC';
    }
    const sql = `
      SELECT id, ts, action, url, depth, host, reason, queue_size AS queueSize, alias
      FROM queue_events
      WHERE ${clauses.join(' AND ')}
      ORDER BY id ${order}
      LIMIT ?
    `;
    try {
      let rows = this.db.prepare(sql).all(...params, safeLimit);
      if (order === 'ASC') rows = rows.reverse();
      let stats = null;
      try {
        stats = action
          ? this.db.prepare('SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ? AND action = ?').get(jobId, action)
          : this.db.prepare('SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ?').get(jobId);
      } catch (_) {}
      const cursors = rows.length ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id } : {};
      return { items: rows, cursors, stats };
    } catch (_) {
      return { items: [], cursors: {}, stats: null };
    }
  }

  listProblems({ job = null, kind = null, scope = null, limit = 100, before = null, after = null } = {}) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const clauses = [];
    const params = [];
    if (job) { clauses.push('job_id = ?'); params.push(job); }
    if (kind) { clauses.push('kind = ?'); params.push(kind); }
    if (scope) { clauses.push('scope = ?'); params.push(scope); }
    let order = 'DESC';
    if (before != null) { clauses.push('id < ?'); params.push(before); }
    else if (after != null) { clauses.push('id > ?'); params.push(after); order = 'ASC'; }
    const sql = `
      SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
      FROM crawl_problems
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY id ${order}
      LIMIT ?
    `;
    try {
      let rows = this.db.prepare(sql).all(...params, safeLimit);
      if (order === 'ASC') rows = rows.reverse();
      const cursors = rows.length ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id } : {};
      return { items: rows, cursors };
    } catch (_) {
      return { items: [], cursors: {} };
    }
  }

  listMilestones({ job = null, kind = null, scope = null, limit = 100, before = null, after = null } = {}) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const clauses = [];
    const params = [];
    if (job) { clauses.push('job_id = ?'); params.push(job); }
    if (kind) { clauses.push('kind = ?'); params.push(kind); }
    if (scope) { clauses.push('scope = ?'); params.push(scope); }
    let order = 'DESC';
    if (before != null) { clauses.push('id < ?'); params.push(before); }
    else if (after != null) { clauses.push('id > ?'); params.push(after); order = 'ASC'; }
    const sql = `
      SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
      FROM crawl_milestones
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY id ${order}
      LIMIT ?
    `;
    try {
      let rows = this.db.prepare(sql).all(...params, safeLimit);
      if (order === 'ASC') rows = rows.reverse();
      const cursors = rows.length ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id } : {};
      return { items: rows, cursors };
    } catch (_) {
      return { items: [], cursors: {} };
    }
  }

  listCrawlTypes() {
    try {
      const rows = this.db.prepare('SELECT name, description, declaration FROM crawl_types ORDER BY name ASC').all();
      return rows.map((row) => ({
        name: row.name,
        description: row.description,
        declaration: this._safeParseJson(row.declaration)
      }));
    } catch (_) {
      return [];
    }
  }
  
  /**
   * Get compressed HTML for an article (supports both individual and bucket compression)
   * 
   * @param {number} articleId - Article ID
   * @returns {Object|null} { html: Buffer|string, compressionType: string, method: 'individual'|'bucket' }
   */
  getCompressedHtml(articleId) {
    try {
      const article = this.db.prepare(`
        SELECT 
          compressed_html,
          compression_type_id,
          compression_bucket_id,
          compression_bucket_key,
          html
        FROM articles
        WHERE id = ?
      `).get(articleId);
      
      if (!article) {
        return null;
      }
      
      // Check if stored in bucket
      if (article.compression_bucket_id && article.compression_bucket_key) {
        // Bucket storage - would retrieve from bucket here
        // For now, return metadata indicating bucket storage
        return {
          method: 'bucket',
          bucketId: article.compression_bucket_id,
          bucketKey: article.compression_bucket_key,
          compressionTypeId: article.compression_type_id,
          // Note: Actual decompression would happen via compressionBuckets.retrieveFromBucket()
          html: null
        };
      }
      
      // Check if stored individually
      if (article.compressed_html) {
        return {
          method: 'individual',
          html: article.compressed_html,
          compressionTypeId: article.compression_type_id
          // Note: Caller would need to decompress using compression.decompress()
        };
      }
      
      // Not compressed, return original HTML
      return {
        method: 'uncompressed',
        html: article.html,
        compressionTypeId: null
      };
      
    } catch (error) {
      console.error('[NewsDatabase] Error getting compressed HTML:', error);
      return null;
    }
  }
  
  /**
   * Get compression statistics
   * 
   * @returns {Object} Statistics about compressed articles
   */
  getCompressionStats() {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_articles,
          COUNT(CASE WHEN compressed_html IS NOT NULL THEN 1 END) as individually_compressed,
          COUNT(CASE WHEN compression_bucket_id IS NOT NULL THEN 1 END) as bucket_compressed,
          COUNT(CASE WHEN compressed_html IS NULL AND compression_bucket_id IS NULL AND html IS NOT NULL THEN 1 END) as uncompressed,
          SUM(CASE WHEN original_size IS NOT NULL THEN original_size ELSE 0 END) as total_original_size,
          SUM(CASE WHEN compressed_size IS NOT NULL THEN compressed_size ELSE 0 END) as total_compressed_size,
          AVG(CASE WHEN compression_ratio IS NOT NULL THEN compression_ratio ELSE NULL END) as avg_compression_ratio
        FROM articles
        WHERE html IS NOT NULL
      `).get();
      
      return {
        totalArticles: stats.total_articles || 0,
        individuallyCompressed: stats.individually_compressed || 0,
        bucketCompressed: stats.bucket_compressed || 0,
        uncompressed: stats.uncompressed || 0,
        totalOriginalSize: stats.total_original_size || 0,
        totalCompressedSize: stats.total_compressed_size || 0,
        avgCompressionRatio: stats.avg_compression_ratio || null,
        spaceSavedBytes: (stats.total_original_size || 0) - (stats.total_compressed_size || 0),
        spaceSavedPercent: stats.total_original_size > 0 
          ? (1 - (stats.total_compressed_size / stats.total_original_size)) * 100
          : 0
      };
    } catch (error) {
      console.error('[NewsDatabase] Error getting compression stats:', error);
      return {
        totalArticles: 0,
        individuallyCompressed: 0,
        bucketCompressed: 0,
        uncompressed: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        avgCompressionRatio: null,
        spaceSavedBytes: 0,
        spaceSavedPercent: 0
      };
    }
  }

  // News Websites Management
  
  /**
   * Add a news website to the registry
   * @param {Object} website
   * @param {string} website.url - Full URL (e.g., 'https://news.sky.com/')
   * @param {string} [website.label] - Display name
   * @param {string} website.parent_domain - Base domain (e.g., 'sky.com')
   * @param {string} website.url_pattern - SQL LIKE pattern (e.g., 'https://news.sky.com/%')
   * @param {string} website.website_type - 'subdomain', 'path', or 'domain'
   * @param {string} [website.added_by] - User/source
  
   * @param {Object} [website.metadata] - Additional data
   * @returns {number} - ID of inserted row
   */
  addNewsWebsite({ url, label = null, parent_domain, url_pattern, website_type, added_by = 'manual', metadata = null }) {
    const added_at = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO news_websites (url, label, parent_domain, url_pattern, website_type, added_at, added_by, enabled, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const result = stmt.run(
      url,
      label,
      parent_domain,
      url_pattern,
      website_type,
      added_at,
      added_by,
      metadata ? JSON.stringify(metadata) : null
    );
    return result.lastInsertRowid;
  }

  /**
   * Remove a news website from the registry
   * @param {number} id - Website ID
   * @returns {boolean} - True if deleted
   */
  removeNewsWebsite(id) {
    const stmt = this.db.prepare('DELETE FROM news_websites WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get all news websites
   * @param {boolean} [enabledOnly=true] - Only return enabled websites
   * @returns {Array<Object>} - List of news websites
   */
  getNewsWebsites(enabledOnly = true) {
    const query = enabledOnly
      ? 'SELECT * FROM news_websites WHERE enabled = 1 ORDER BY url'
      : 'SELECT * FROM news_websites ORDER BY url';
    return this.db.prepare(query).all();
  }

  /**
   * Get a single news website by ID
   * @param {number} id - Website ID
   * @returns {Object|null} - Website object or null
   */
  getNewsWebsite(id) {
    return this.db.prepare('SELECT * FROM news_websites WHERE id = ?').get(id);
  }

  /**
   * Update news website enabled status
   * @param {number} id - Website ID
   * @param {boolean} enabled - Enabled status
   * @returns {boolean} - True if updated
   */
  setNewsWebsiteEnabled(id, enabled) {
    const stmt = this.db.prepare('UPDATE news_websites SET enabled = ? WHERE id = ?');
    const result = stmt.run(enabled ? 1 : 0, id);
    return result.changes > 0;
  }

  /**
   * Get stats for a news website (article count, fetches, etc.)
   * @param {number} id - Website ID
   * @returns {Object} - Statistics object
   */
  getNewsWebsiteStats(id) {
    const website = this.getNewsWebsite(id);
    if (!website) return null;

    const pattern = website.url_pattern;
    
    // Count articles matching the pattern
    const articlesCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM articles WHERE url LIKE ?
    `).get(pattern);

    // Count fetches matching the pattern
    const fetchesCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM fetches WHERE url LIKE ?
    `).get(pattern);

    // Get recent articles
    const recentArticles = this.db.prepare(`
      SELECT url, title, date, crawled_at 
      FROM articles 
      WHERE url LIKE ? 
      ORDER BY crawled_at DESC 
      LIMIT 10
    `).all(pattern);

    // Get fetch stats
    const fetchStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as err_count,
        MAX(fetched_at) as last_fetch_at
      FROM fetches 
      WHERE url LIKE ?
    `).get(pattern);

    return {
      website,
      articles: {
        total: articlesCount.count,
        recent: recentArticles
      },
      fetches: fetchStats
    };
  }

  /**
   * Get enhanced stats for a news website (uses cache if available)
   * @param {number} id - Website ID
   * @param {boolean} [useCache=true] - Use cached stats if available
   * @returns {Object} - Enhanced statistics object
   */
  getNewsWebsiteEnhancedStats(id, useCache = true) {
    const website = this.getNewsWebsite(id);
    if (!website) return null;

    // Try to get cached stats first
    let stats = null;
    if (useCache) {
      stats = this.db.prepare(`
        SELECT * FROM news_websites_stats_cache WHERE website_id = ?
      `).get(id);
    }

    // If no cache, compute on-demand
    if (!stats) {
      const pattern = website.url_pattern;
      stats = this._computeBasicStats(pattern);
    }

    // Get recent articles (always fresh, small query)
    const recentArticles = this.db.prepare(`
      SELECT url, title, date, crawled_at 
      FROM articles 
      WHERE url LIKE ? 
      ORDER BY crawled_at DESC 
      LIMIT 10
    `).all(website.url_pattern);

    // Get domain breakdown
    const domainBreakdown = this.db.prepare(`
      SELECT 
        SUBSTR(url, 1, INSTR(SUBSTR(url, 9), '/') + 8) as domain,
        COUNT(*) as count
      FROM articles
      WHERE url LIKE ?
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 5
    `).all(website.url_pattern);

    return {
      website,
      stats,
      recentArticles,
      domainBreakdown,
      cacheAge: stats.last_updated_at ? this._getCacheAge(stats.last_updated_at) : null
    };
  }

  /**
   * Compute basic stats for a pattern (lighter than full stats)
   * @param {string} pattern - URL pattern
   * @returns {Object} - Basic statistics
   * @private
   */
  _computeBasicStats(pattern) {
    const articleCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM articles WHERE url LIKE ?
    `).get(pattern);

    const fetchCount = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as error_count,
        MAX(fetched_at) as last_at
      FROM fetches 
      WHERE url LIKE ?
    `).get(pattern);

    return {
      article_count: articleCount.count || 0,
      fetch_count: fetchCount.total || 0,
      fetch_ok_count: fetchCount.ok_count || 0,
      fetch_error_count: fetchCount.error_count || 0,
      fetch_last_at: fetchCount.last_at || null
    };
  }

  /**
   * Get cache age in seconds
   * @param {string} timestamp - ISO timestamp
   * @returns {number} - Age in seconds
   * @private
   */
  _getCacheAge(timestamp) {
    const updated = new Date(timestamp);
    const now = new Date();
    return Math.floor((now - updated) / 1000);
  }

  /**
   * Get all news websites with their cached stats (very fast)
   * @param {boolean} [enabledOnly=true] - Only return enabled websites
   * @returns {Array<Object>} - Websites with stats
   */
  getNewsWebsitesWithStats(enabledOnly = true) {
    const query = enabledOnly
      ? `SELECT 
           w.*,
           s.article_count,
           s.fetch_count,
           s.fetch_ok_count,
           s.fetch_error_count,
           s.fetch_last_at,
           s.article_latest_date,
           s.last_updated_at as stats_updated_at
         FROM news_websites w
         LEFT JOIN news_websites_stats_cache s ON w.id = s.website_id
         WHERE w.enabled = 1
         ORDER BY w.url`
      : `SELECT 
           w.*,
           s.article_count,
           s.fetch_count,
           s.fetch_ok_count,
           s.fetch_error_count,
           s.fetch_last_at,
           s.article_latest_date,
           s.last_updated_at as stats_updated_at
         FROM news_websites w
         LEFT JOIN news_websites_stats_cache s ON w.id = s.website_id
         ORDER BY w.url`;
    
    return this.db.prepare(query).all();
  }
}

module.exports = NewsDatabase;
