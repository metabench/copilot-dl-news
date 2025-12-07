const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { is_array, tof } = require('lang-tools');
const { ensureDb, ensureGazetteer } = require('./ensureDb');
const { seedCrawlTypes } = require('./seeders');
const { Readable } = require('stream');

// Import extracted modules
const { StatementManager } = require('./StatementManager');
const { UtilityFunctions } = require('./UtilityFunctions');
const { SchemaInitializer } = require('./SchemaInitializer');
const { ArticleOperations } = require('./ArticleOperations');



class NewsDatabase {
  constructor(dbHandle) {
    if (!dbHandle) {
      throw new Error('NewsDatabase constructor requires a dbHandle from better-sqlite3');
    }
    this.db = dbHandle;
    this.dbFilePath = this.db.name;

    // Initialize modules
    this.statements = new StatementManager(this.db);
    this.utilities = UtilityFunctions;
    this.schemaInitializer = new SchemaInitializer(this.db);
    this.articleOperations = new ArticleOperations(this.db, this.statements, this.utilities);

    // Legacy compatibility - expose commonly used statements
    this.selectByUrlStmt = this.statements.get('selectByUrlStmt');
    this.selectByUrlOrCanonicalStmt = this.statements.get('selectByUrlOrCanonicalStmt');
    this.selectArticleHeadersStmt = this.statements.get('selectArticleHeadersStmt');
    this.countStmt = this.statements.get('countStmt');
    this.insertErrorStmt = this.statements.get('insertErrorStmt');
    this.insertLinkStmt = this.statements.get('insertLinkStmt');
    this.linkCountStmt = this.statements.get('linkCountStmt');
    this.insertUrlAliasStmt = this.statements.get('insertUrlAliasStmt');

    // Category statements for legacy compatibility
    this._ensureUrlCategoryStmt = this.statements.get('_ensureUrlCategoryStmt');
    this._getUrlCategoryIdStmt = this.statements.get('_getUrlCategoryIdStmt');
    this._mapUrlCategoryStmt = this.statements.get('_mapUrlCategoryStmt');
    this._getUrlIdStmt = this.statements.get('_getUrlIdStmt');
    this._ensurePageCategoryStmt = this.statements.get('_ensurePageCategoryStmt');
    this._getPageCategoryIdStmt = this.statements.get('_getPageCategoryIdStmt');

    // Gazetteer statements
    this._selectCountryNamesStmt = this.statements.get('_selectCountryNamesStmt');

    // Settings statements
    this._getSettingStmt = this.statements.get('_getSettingStmt');
    this._setSettingStmt = this.statements.get('_setSettingStmt');

    // Crawl job statements
    this._insertCrawlJobStmt = this.statements.get('_insertCrawlJobStmt');
    this._updateCrawlJobStmt = this.statements.get('_updateCrawlJobStmt');

    // Queue event statements
    this._insertQueueEventStmt = this.statements.get('_insertQueueEventStmt');

    // Problem statements
    this._insertProblemStmt = this.statements.get('_insertProblemStmt');

    // Milestone statements
    this._insertMilestoneStmt = this.statements.get('_insertMilestoneStmt');

    // Planner stage statements
    this._insertPlannerStageStmt = this.statements.get('_insertPlannerStageStmt');

    // Task statements
    this._countActiveTasksByJobStmt = this.statements.get('_countActiveTasksByJobStmt');
    this._selectOldActiveTasksStmt = this.statements.get('_selectOldActiveTasksStmt');
    this._deleteTaskByIdStmt = this.statements.get('_deleteTaskByIdStmt');
    this._insertTaskStmt = this.statements.get('_insertTaskStmt');
    this._updateTaskStatusStmt = this.statements.get('_updateTaskStatusStmt');
    this._clearTasksByJobStmt = this.statements.get('_clearTasksByJobStmt');
    this._getTaskByIdStmt = this.statements.get('_getTaskByIdStmt');
  }

  _init() {
    // This method is now deprecated as schema creation is handled by ensureDb.
    // It is kept for backward compatibility in case any old code calls it.
  }

  upsertArticle(article, options = {}) {
    return this.articleOperations.upsertArticle(article, options);
  }





  getArticleByUrl(url, accessContext = null) {
    const result = this.selectByUrlStmt.get(url);
    if (result && accessContext) {
      this._recordAccess(result.id, accessContext);
    }
    return result;
  }

  // Try to find an article row by exact URL or by canonical_url
  getArticleByUrlOrCanonical(url, accessContext = null) {
    const result = this.selectByUrlOrCanonicalStmt.get(url, url);
    if (result && accessContext) {
      this._recordAccess(result.id, accessContext);
    }
    return result;
  }

  getArticleHeaders(url, accessContext = null) {
    const result = this.selectArticleHeadersStmt.get(url, url);
    if (result && accessContext) {
      this._recordAccess(result.id, accessContext);
    }
    return result;
  }

  getCount() {
    const row = this.countStmt.get();
    return row?.count || 0;
  }

  insertLink(link) {
    // link: { src_url, dst_url, anchor, rel, type, depth, on_domain, discovered_at }
    const srcUrlId = link.src_url ? this._ensureUrlId(link.src_url) : null;
    const dstUrlId = link.dst_url ? this._ensureUrlId(link.dst_url) : null;
    return this.insertLinkStmt.run({
      src_url_id: srcUrlId,
      dst_url_id: dstUrlId,
      anchor: link.anchor,
      rel: link.rel,
      type: link.type,
      depth: link.depth,
      on_domain: link.on_domain,
      discovered_at: link.discovered_at
    });
  }

  getLinkCount() {
    const row = this.linkCountStmt.get();
    return row?.count || 0;
  }

  insertFetch(fetchRow) {
    // Map legacy fetchRow to upsertArticle
    // Note: This only stores metadata if content is missing
    return this.upsertArticle({
      url: fetchRow.url,
      fetched_at: fetchRow.fetched_at,
      request_started_at: fetchRow.request_started_at,
      http_status: fetchRow.http_status,
      content_type: fetchRow.content_type,
      content_length: fetchRow.content_length,
      bytes_downloaded: fetchRow.bytes_downloaded,
      ttfb_ms: fetchRow.ttfb_ms,
      download_ms: fetchRow.download_ms,
      total_ms: fetchRow.total_ms,
      classification: fetchRow.classification,
      word_count: fetchRow.word_count,
      nav_links_count: fetchRow.nav_links_count,
      article_links_count: fetchRow.article_links_count,
      analysis: fetchRow.analysis,
      host: fetchRow.host
    }, { compress: false });
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
      const f = this.db.prepare(`
        SELECT 1 FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        INNER JOIN content_storage cs ON cs.http_response_id = hr.id
        INNER JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE u.url = ?
        LIMIT 1
      `).get(url);
      if (f) return true;
    } catch (_) {}
    try {
      const a = this.db.prepare(`
        SELECT 1 FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        INNER JOIN content_storage cs ON cs.http_response_id = hr.id
        INNER JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE u.url = ?
        LIMIT 1
      `).get(url);
      if (a) return true;
    } catch (_) {}
    return false;
  }

  recordUrlAlias({ url, aliasUrl, classification = null, reason = null, exists = false, metadata = null }) {
    if (!url || !aliasUrl) return false;
    const nowIso = new Date().toISOString();
    const urlId = this._ensureUrlId(url);
    const aliasUrlId = this._ensureUrlId(aliasUrl);
    if (!urlId || !aliasUrlId) return false;
    try {
      const payload = {
        url_id: urlId,
        alias_url_id: aliasUrlId,
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
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));
    try {
      return this.db.prepare(`
        SELECT 
          u.url,
          hr.fetched_at,
          hr.http_status,
          hr.content_type,
          hr.bytes_downloaded AS content_length,
          hr.bytes_downloaded,
          hr.transfer_kbps,
          hr.ttfb_ms,
          hr.download_ms,
          hr.total_ms,
          cs.uncompressed_size,
          cs.compressed_size,
          cs.compression_ratio,
          ca.classification,
          ca.title,
          ca.date,
          ca.word_count,
          ca.article_links_count,
          ca.nav_links_count,
          ca.analysis_json AS analysis
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        LEFT JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE u.url = ?
        ORDER BY hr.fetched_at DESC
        LIMIT ?
      `).all(url, safeLimit);
    } catch (error) {
      console.error('[NewsDatabase] Error getting fetches by URL:', error);
      return [];
    }
  }

  // Aggregate counts for crawler telemetry
  getFetchCount() {
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS c FROM http_responses').get();
      return row?.c || 0;
    } catch (error) {
      console.error('[NewsDatabase] Error getting fetch count:', error);
      return 0;
    }
  }
  getArticleClassifiedFetchCount() {
    try {
      const row = this.db.prepare("SELECT COUNT(*) AS c FROM content_analysis WHERE classification = 'article'").get();
      return row?.c || 0;
    } catch (error) {
      console.error('[NewsDatabase] Error getting article classified fetch count:', error);
      return 0;
    }
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
        const slug = this.utilities.slugifyCountryName(entry?.name);
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
    return this.selectByUrlStmt.get(url);
  }

  // Stream article URLs from the database as a Node.js Readable (objectMode=true).
  // Yields strings (URLs) in no particular order.
  streamArticleUrls() {
    const stmt = this.db.prepare(`
      SELECT u.url
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
    `);
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

  listDomainHosts({ limit = 0, orderBy = 'last_seen_at' } = {}) {
    const order = orderBy === 'host' ? 'host' : 'last_seen_at DESC';
    const sql = limit && Number(limit) > 0
      ? `SELECT host FROM domains WHERE host IS NOT NULL ORDER BY ${order} LIMIT ?`
      : `SELECT host FROM domains WHERE host IS NOT NULL ORDER BY ${order}`;
    const rows = limit && Number(limit) > 0
      ? this.db.prepare(sql).all(Number(limit))
      : this.db.prepare(sql).all();
    return rows.map((row) => row.host).filter(Boolean);
  }

  getDomainArticleMetrics(host) {
    const variants = this.utilities.normalizeHostVariants(host);
    if (!variants.length) {
      return { articleFetches: 0, distinctSections: 0, datedUrlRatio: 0 };
    }
    const placeholders = this.utilities.buildInClausePlaceholders(variants);
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS article_count,
        COUNT(DISTINCT CASE
          WHEN ca.section IS NOT NULL AND TRIM(ca.section) != ''
            THEN LOWER(TRIM(ca.section))
        END) AS section_count,
        SUM(CASE
          WHEN u.url GLOB '*[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]*' THEN 1
          ELSE 0
        END) AS dated_count
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE LOWER(COALESCE(ca.classification, '')) = 'article'
        AND u.host IN (${placeholders})
    `).get(...variants);

    const totalArticles = Number(row?.article_count || 0);
    const distinctSections = Number(row?.section_count || 0);
    const datedCount = Number(row?.dated_count || 0);
    const datedUrlRatio = totalArticles > 0 ? datedCount / totalArticles : 0;

    return {
      articleFetches: totalArticles,
      distinctSections,
      datedUrlRatio
    };
  }

  getHttp429Stats(host, minutes) {
    const variants = this.utilities.normalizeHostVariants(host);
    if (!variants.length) {
      return { count429: 0, attempts: 0, rpm: 0, ratio: 0, last429At: null };
    }
    const windowMinutes = Math.max(0, Number(minutes) || 0);
    const windowArg = `-${windowMinutes} minutes`;
    const placeholders = this.utilities.buildInClausePlaceholders(variants);

    const okRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM http_responses hr
      JOIN urls u ON hr.url_id = u.id
      WHERE u.host IN (${placeholders})
        AND (
          hr.fetched_at IS NOT NULL
          OR hr.request_started_at IS NOT NULL
        )
        AND datetime(COALESCE(hr.fetched_at, hr.request_started_at)) >= datetime('now', ?)
    `).get(...variants, windowArg);

    const errRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM errors
      WHERE host IN (${placeholders})
        AND datetime(at) >= datetime('now', ?)
    `).get(...variants, windowArg);

    const row429 = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM errors
      WHERE host IN (${placeholders})
        AND code = 429
        AND datetime(at) >= datetime('now', ?)
    `).get(...variants, windowArg);

    const last429Row = this.db.prepare(`
      SELECT MAX(datetime(at)) AS last_at
      FROM errors
      WHERE host IN (${placeholders})
        AND code = 429
    `).get(...variants);

    const ok = Number(okRow?.count || 0);
    const err = Number(errRow?.count || 0);
    const count429 = Number(row429?.count || 0);
    const attempts = ok + err;
    const rpm = windowMinutes > 0 ? count429 / windowMinutes : 0;
    const ratio = attempts > 0 ? count429 / attempts : 0;
    const last429At = last429Row?.last_at || null;

    return { count429, attempts, rpm, ratio, last429At };
  }

  getMilestoneHostStats({ hosts } = {}) {
    const stats = new Map();
    const ensure = (host) => {
      const key = String(host || '').trim().toLowerCase();
      if (!key) return null;
      if (!stats.has(key)) {
        stats.set(key, {
          host: key,
          downloads: 0,
          depth2Analysed: 0,
          articlesIdentified: 0
        });
      }
      return stats.get(key);
    };

    const normalizedHosts = Array.isArray(hosts)
      ? hosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const uniqueHosts = Array.from(new Set(normalizedHosts));
    const placeholders = uniqueHosts.length ? this.utilities.buildInClausePlaceholders(uniqueHosts) : '';
    const hostFilterClause = uniqueHosts.length ? `AND LOWER(u.host) IN (${placeholders})` : '';

    const downloadSql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS count
      FROM http_responses hr
      JOIN urls u ON hr.url_id = u.id
      WHERE hr.http_status BETWEEN 200 AND 399
        ${hostFilterClause}
      GROUP BY LOWER(u.host)
    `;
    const downloadRows = uniqueHosts.length
      ? this.db.prepare(downloadSql).all(...uniqueHosts)
      : this.db.prepare(downloadSql).all();
    for (const row of downloadRows) {
      const entry = ensure(row.host);
      if (entry) entry.downloads = Number(row.count || 0);
    }

    const depthConditions = [];
    if (uniqueHosts.length) {
      depthConditions.push(`LOWER(u.host) IN (${placeholders})`);
    }
    depthConditions.push(`EXISTS (
      SELECT 1 FROM discovery_events de
      WHERE de.url_id = u.id AND de.crawl_depth = 2
    )`);
    depthConditions.push(`EXISTS (
      SELECT 1
      FROM http_responses hr
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE hr.url_id = u.id
    )`);
    const depthWhere = depthConditions.length
      ? `WHERE ${depthConditions.join('\n        AND ')}`
      : '';
    const depthSql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS count
      FROM urls u
      ${depthWhere}
      GROUP BY LOWER(u.host)
    `;
    const depthRows = uniqueHosts.length
      ? this.db.prepare(depthSql).all(...uniqueHosts)
      : this.db.prepare(depthSql).all();
    for (const row of depthRows) {
      const entry = ensure(row.host);
      if (entry) entry.depth2Analysed = Number(row.count || 0);
    }

    const articleSql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS count
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE LOWER(COALESCE(ca.classification, '')) = 'article'
        ${hostFilterClause}
      GROUP BY LOWER(u.host)
    `;
    const articleRows = uniqueHosts.length
      ? this.db.prepare(articleSql).all(...uniqueHosts)
      : this.db.prepare(articleSql).all();
    for (const row of articleRows) {
      const entry = ensure(row.host);
      if (entry) entry.articlesIdentified = Number(row.count || 0);
    }

    if (uniqueHosts.length) {
      for (const host of uniqueHosts) {
        ensure(host);
      }
    }

    return Array.from(stats.values());
  }

  countArticlesNeedingAnalysis({ analysisVersion = 1, limit = null } = {}) {
    const version = Number.isFinite(Number(analysisVersion)) ? Number(analysisVersion) : 1;
    const limitNumber = Number.isFinite(Number(limit)) ? Number(limit) : null;

    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE
          WHEN ca.analysis_version IS NULL
            OR ca.analysis_version < ?
            OR ca.analysis_json IS NULL
            OR TRIM(ca.analysis_json) = ''
          THEN 1
          ELSE 0
        END) AS needing
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      WHERE LOWER(COALESCE(ca.classification, '')) = 'article'
    `).get(version);

    const total = Number(row?.total || 0);
    const needingRaw = Number(row?.needing || 0);
    const needingAnalysis = limitNumber && limitNumber > 0
      ? Math.min(needingRaw, limitNumber)
      : needingRaw;
    const analyzed = total - needingRaw;

    return {
      total,
      analyzed,
      needingAnalysis,
      needingAnalysisRaw: needingRaw,
      analysisVersion: version,
      limit: limitNumber && limitNumber > 0 ? limitNumber : null
    };
  }

  getArticlesNeedingAnalysis({ analysisVersion = 1, limit = 100, offset = 0 } = {}) {
    const version = Number.isFinite(Number(analysisVersion)) ? Number(analysisVersion) : 1;
    const limitNumber = Math.max(0, Number(limit) || 0);
    const offsetNumber = Math.max(0, Number(offset) || 0);

    const sql = `
      SELECT
        u.url AS url,
        ca.title AS title,
        ca.section AS section,
        ca.analysis_json AS analysis_json,
        ca.analysis_version AS analysis_version,
        COALESCE(lf.ts, hr.fetched_at, hr.request_started_at) AS last_ts,
        hr.http_status AS http_status
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      LEFT JOIN latest_fetch lf ON lf.url = u.url
      WHERE LOWER(COALESCE(ca.classification, '')) = 'article'
        AND (
          ca.analysis_version IS NULL
          OR ca.analysis_version < ?
          OR ca.analysis_json IS NULL
          OR TRIM(ca.analysis_json) = ''
        )
      ORDER BY
        (COALESCE(lf.ts, hr.fetched_at, hr.request_started_at) IS NULL) ASC,
        COALESCE(lf.ts, hr.fetched_at, hr.request_started_at) DESC
      LIMIT ? OFFSET ?
    `;

    return this.db.prepare(sql).all(version, limitNumber || 100, offsetNumber);
  }

  getAnalysisStatusCounts() {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE
          WHEN ca.analysis_json IS NOT NULL
            AND TRIM(ca.analysis_json) != ''
          THEN 1
          ELSE 0
        END) AS analyzed
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      WHERE LOWER(COALESCE(ca.classification, '')) = 'article'
    `).get();

    const total = Number(row?.total || 0);
    const analyzed = Number(row?.analyzed || 0);
    const pending = Math.max(0, total - analyzed);

    return { total, analyzed, pending };
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

  _safeParseJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  /**
   * Record access to an article for intelligent compression decisions
   * @param {number} articleId - Article ID that was accessed
   * @param {Object} accessContext - Context of the access (optional)
   * @param {string} accessContext.source - Source of access ('api', 'ui', 'background-task', etc.)
   * @param {string} accessContext.userAgent - User agent string (optional)
   * @param {string} accessContext.ip - IP address (optional)
   * @param {Object} accessContext.metadata - Additional metadata (optional)
   * @private
   */
  _recordAccess(articleId, accessContext = null) {
    if (!articleId || !accessContext) return;

    try {
      // Check if content_access_log table exists (optional feature)
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='content_access_log'
      `).get();

      if (!tableExists) return; // Table doesn't exist, skip logging

      const payload = {
        article_id: articleId,
        accessed_at: new Date().toISOString(),
        source: accessContext.source || 'unknown',
        user_agent: accessContext.userAgent || null,
        ip_address: accessContext.ip || null,
        metadata: accessContext.metadata ? JSON.stringify(accessContext.metadata) : null
      };

      this.db.prepare(`
        INSERT INTO content_access_log (
          article_id, accessed_at, source, user_agent, ip_address, metadata
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        payload.article_id,
        payload.accessed_at,
        payload.source,
        payload.user_agent,
        payload.ip_address,
        payload.metadata
      );
    } catch (error) {
      // Silently fail - access logging is optional and shouldn't break core functionality
      console.warn('[NewsDatabase] Failed to record access:', error.message);
    }
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
    let urlId = null;
    if (err.url) {
      try { host = new URL(err.url).hostname.toLowerCase(); } catch (_) {}
      urlId = this._ensureUrlId(err.url);
    }
    return this.insertErrorStmt.run({
      urlId: urlId,
      host: host || null,
      kind: err.kind || 'other',
      code: typeof err.code === 'number' ? err.code : null,
      message: err.message || null,
      details: err.details != null ? (typeof err.details === 'string' ? err.details : JSON.stringify(err.details)) : null,
      at
    });
  }

  insertHttpResponse(responseData) {
    return this.articleOperations.insertHttpResponse(responseData);
  }



  getHandle() {
    return this.db;
  }

  ensureCrawlTypesSeeded() {
    return this.schemaInitializer.ensureCrawlTypesSeeded();
  }

  recordCrawlJobStart({ id, url = null, args = null, pid = null, startedAt = null, status = 'running' }) {
    if (!id) return false;
    const urlId = url ? this._ensureUrlId(url) : null;
    const payload = {
      id,
      urlId,
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
    const urlId = event.url ? this._ensureUrlId(event.url) : null;
    const payload = {
      jobId: event.jobId,
      ts: event.ts || new Date().toISOString(),
      action: event.action || 'unknown',
      urlId: urlId,
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
        SELECT j.id, u.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
               (SELECT COUNT(*) FROM queue_events e WHERE e.job_id = j.id) AS events,
               (SELECT MAX(ts) FROM queue_events e WHERE e.job_id = j.id) AS lastEventAt
        FROM crawl_jobs j
        LEFT JOIN urls u ON j.url_id = u.id
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
        SELECT j.id, u.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status
        FROM crawl_jobs j
        LEFT JOIN urls u ON j.url_id = u.id
        WHERE j.id = ?
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
      SELECT qe.id, qe.ts, qe.action, u.url, qe.depth, qe.host, qe.reason, qe.queue_size AS queueSize, qe.alias
      FROM queue_events qe
      LEFT JOIN urls u ON qe.url_id = u.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY qe.id ${order}
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
          cs.content_blob AS compressed_html,
          cs.compression_type_id,
          cs.compression_bucket_id,
          cs.bucket_entry_key,
          cs.content_blob AS html
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        INNER JOIN content_storage cs ON cs.http_response_id = hr.id
        INNER JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE u.id = ?
      `).get(articleId);
      if (!article) {
        return null;
      }
      
      // Check if stored in bucket
      if (article.compression_bucket_id && article.bucket_entry_key) {
        // Bucket storage - would retrieve from bucket here
        // For now, return metadata indicating bucket storage
        return {
          method: 'bucket',
          bucketId: article.compression_bucket_id,
          bucketKey: article.bucket_entry_key,
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
          COUNT(CASE WHEN cs.compression_type_id IS NOT NULL THEN 1 END) as individually_compressed,
          COUNT(CASE WHEN cs.compression_bucket_id IS NOT NULL THEN 1 END) as bucket_compressed,
          COUNT(CASE WHEN cs.compression_type_id IS NULL AND cs.compression_bucket_id IS NULL THEN 1 END) as uncompressed,
          SUM(CASE WHEN cs.uncompressed_size IS NOT NULL THEN cs.uncompressed_size ELSE 0 END) as total_original_size,
          SUM(CASE WHEN cs.compressed_size IS NOT NULL THEN cs.compressed_size ELSE 0 END) as total_compressed_size,
          AVG(CASE WHEN cs.compression_ratio IS NOT NULL THEN cs.compression_ratio ELSE NULL END) as avg_compression_ratio
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        INNER JOIN content_storage cs ON cs.http_response_id = hr.id
        INNER JOIN content_analysis ca ON ca.content_id = cs.id
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
      SELECT COUNT(*) as count
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.url LIKE ?
    `).get(pattern);

    // Count fetches matching the pattern
    const fetchesCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      WHERE u.url LIKE ?
    `).get(pattern);

    // Get recent articles
    const recentArticles = this.db.prepare(`
      SELECT u.url, ca.title, ca.date, hr.fetched_at as crawled_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.url LIKE ?
      ORDER BY hr.fetched_at DESC
      LIMIT 10
    `).all(pattern);    // Get fetch stats
    const fetchStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as err_count,
        MAX(fetched_at) as last_fetch_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      WHERE u.url LIKE ?
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
      SELECT u.url, ca.title, ca.date, hr.fetched_at as crawled_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.url LIKE ?
      ORDER BY hr.fetched_at DESC
      LIMIT 10
    `).all(website.url_pattern);    // Get domain breakdown
    const domainBreakdown = this.db.prepare(`
      SELECT
        SUBSTR(u.url, 1, INSTR(SUBSTR(u.url, 9), '/') + 8) as domain,
        COUNT(*) as count
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.url LIKE ?
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
      SELECT COUNT(*) as count
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      INNER JOIN content_storage cs ON cs.http_response_id = hr.id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.url LIKE ?
    `).get(pattern);

    const fetchCount = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as error_count,
        MAX(fetched_at) as last_at
      FROM urls u
      INNER JOIN http_responses hr ON hr.url_id = u.id
      WHERE u.url LIKE ?
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

  // ═══════════════════════════════════════════════════════════════════════════
  // News Website Favicon Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get a news website's favicon data
   * @param {number} id - Website ID
   * @returns {Object|null} - { faviconData, faviconContentType, faviconUpdatedAt } or null
   */
  getNewsWebsiteFavicon(id) {
    const row = this.db.prepare(`
      SELECT favicon_data, favicon_content_type, favicon_updated_at, favicon_fetch_error
      FROM news_websites WHERE id = ?
    `).get(id);
    if (!row) return null;
    return {
      faviconData: row.favicon_data,
      faviconContentType: row.favicon_content_type,
      faviconUpdatedAt: row.favicon_updated_at,
      faviconFetchError: row.favicon_fetch_error
    };
  }

  /**
   * Store a news website's favicon data
   * @param {number} id - Website ID
   * @param {string} faviconData - Base64-encoded data (without data URL prefix)
   * @param {string} contentType - MIME type (e.g., 'image/png')
   * @returns {boolean} - True if updated
   */
  setNewsWebsiteFavicon(id, faviconData, contentType) {
    const stmt = this.db.prepare(`
      UPDATE news_websites 
      SET favicon_data = ?, favicon_content_type = ?, favicon_updated_at = ?, favicon_fetch_error = NULL
      WHERE id = ?
    `);
    const result = stmt.run(faviconData, contentType, new Date().toISOString(), id);
    return result.changes > 0;
  }

  /**
   * Mark a favicon fetch as failed
   * @param {number} id - Website ID
   * @param {string} errorMessage - Error message
   * @returns {boolean} - True if updated
   */
  setNewsWebsiteFaviconError(id, errorMessage) {
    const stmt = this.db.prepare(`
      UPDATE news_websites 
      SET favicon_fetch_error = ?, favicon_updated_at = ?
      WHERE id = ?
    `);
    const result = stmt.run(errorMessage, new Date().toISOString(), id);
    return result.changes > 0;
  }

  /**
   * Get news websites with their favicons for the widget dropdown
   * Returns enriched data including favicon as data URL
   * @param {boolean} [enabledOnly=true] - Only return enabled websites
   * @returns {Array<Object>} - List with id, url, label, icon, faviconUrl
   */
  getNewsWebsitesForWidget(enabledOnly = true) {
    const query = enabledOnly
      ? `SELECT id, url, label, metadata, favicon_data, favicon_content_type, favicon_updated_at 
         FROM news_websites WHERE enabled = 1 ORDER BY label, url`
      : `SELECT id, url, label, metadata, favicon_data, favicon_content_type, favicon_updated_at 
         FROM news_websites ORDER BY label, url`;
    
    const rows = this.db.prepare(query).all();
    
    return rows.map(row => {
      // Parse metadata for icon emoji
      let icon = '🌐';
      try {
        if (row.metadata) {
          const meta = JSON.parse(row.metadata);
          if (meta.icon) icon = meta.icon;
        }
      } catch {}
      
      // Build favicon data URL if available
      let faviconUrl = null;
      if (row.favicon_data && row.favicon_content_type) {
        faviconUrl = `data:${row.favicon_content_type};base64,${row.favicon_data}`;
      }
      
      return {
        id: row.id,
        url: row.url,
        label: row.label || new URL(row.url).hostname,
        icon,
        faviconUrl,
        hasFavicon: !!row.favicon_data,
        faviconUpdatedAt: row.favicon_updated_at
      };
    });
  }

  /**
   * Get websites that need favicon fetching
   * @param {number} [maxAge=86400000] - Max age in ms before refetch (default 24h)
   * @returns {Array<Object>} - Websites needing favicon fetch
   */
  getWebsitesNeedingFavicons(maxAge = 86400000) {
    const cutoff = new Date(Date.now() - maxAge).toISOString();
    const rows = this.db.prepare(`
      SELECT id, url, label
      FROM news_websites 
      WHERE enabled = 1 
        AND (favicon_updated_at IS NULL OR favicon_updated_at < ?)
      ORDER BY favicon_updated_at ASC NULLS FIRST
    `).all(cutoff);
    return rows;
  }
}

module.exports = NewsDatabase;
