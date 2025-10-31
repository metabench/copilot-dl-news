'use strict';

function createGuessPlaceHubsQueries(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createGuessPlaceHubsQueries requires a valid SQLite database instance');
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS place_hub_determinations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        determination TEXT NOT NULL,
        reason TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_place_hub_determinations_domain
        ON place_hub_determinations(domain, created_at DESC);
    `);
  } catch (error) {
    /* If schema creation fails, continue without determinations table */
  }

  const ensureIndex = (sql) => {
    try {
      db.exec(sql);
    } catch (_) {
      /* ignore missing table or other index creation errors */
    }
  };

  ensureIndex(`CREATE INDEX IF NOT EXISTS idx_fetches_host ON fetches(host);`);
  ensureIndex(`CREATE INDEX IF NOT EXISTS idx_place_page_mappings_host_status ON place_page_mappings(host, status, page_kind);`);
  ensureIndex(`CREATE INDEX IF NOT EXISTS idx_place_hubs_host ON place_hubs(host);`);
  ensureIndex(`CREATE INDEX IF NOT EXISTS idx_place_hub_candidates_domain ON place_hub_candidates(domain);`);

  const selectLatestFetchStmt = db.prepare(`
    SELECT http_status, fetched_at, request_started_at
      FROM fetches
     WHERE url = ?
  ORDER BY COALESCE(fetched_at, request_started_at) DESC
     LIMIT 1
  `);

  const selectHubByUrlStmt = db.prepare(`
    SELECT id, place_slug
      FROM place_hubs
     WHERE url = ?
     LIMIT 1
  `);

  const insertHubStmt = db.prepare(`
    INSERT OR IGNORE INTO place_hubs(
      host,
      url,
      place_slug,
      place_kind,
      topic_slug,
      topic_label,
      topic_kind,
      title,
      first_seen_at,
      last_seen_at,
      nav_links_count,
      article_links_count,
      evidence
    ) VALUES (
      @host,
      @url,
      @place_slug,
      @place_kind,
      NULL,
      NULL,
      NULL,
      @title,
      datetime('now'),
      datetime('now'),
      @nav_links_count,
      @article_links_count,
      @evidence
    )
  `);

  const updateHubStmt = db.prepare(`
    UPDATE place_hubs
       SET place_slug = COALESCE(@place_slug, place_hubs.place_slug),
           place_kind = COALESCE(@place_kind, place_hubs.place_kind),
           topic_slug = COALESCE(@topic_slug, place_hubs.topic_slug),
           topic_label = COALESCE(@topic_label, place_hubs.topic_label),
           topic_kind = COALESCE(@topic_kind, place_hubs.topic_kind),
           title = COALESCE(@title, place_hubs.title),
           last_seen_at = datetime('now'),
           nav_links_count = COALESCE(@nav_links_count, place_hubs.nav_links_count),
           article_links_count = COALESCE(@article_links_count, place_hubs.article_links_count),
           evidence = COALESCE(@evidence, place_hubs.evidence)
     WHERE url = @url
  `);

  let insertLegacyFetchStmt = null;
  try {
    insertLegacyFetchStmt = db.prepare(`
      INSERT INTO fetches (
        url,
        request_started_at,
        fetched_at,
        http_status,
        content_type,
        content_length,
        bytes_downloaded,
        total_ms,
        download_ms,
        host
      ) VALUES (
        @url,
        @request_started_at,
        @fetched_at,
        @http_status,
        @content_type,
        @content_length,
        @bytes_downloaded,
        @total_ms,
        @download_ms,
        @host
      )
    `);
  } catch (error) {
    insertLegacyFetchStmt = null;
  }

  const normalizeNumber = (value) => (Number.isFinite(value) ? value : null);
  const resolveHost = (domain, url) => {
    if (domain) return domain;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.hostname ? parsed.hostname.toLowerCase() : null;
    } catch (_) {
      return null;
    }
  };

  const prepareCountStmt = (sql) => {
    try {
      return db.prepare(sql);
    } catch (_) {
      return null;
    }
  };

  const fetchCountStmt = prepareCountStmt('SELECT COUNT(*) AS count FROM fetches WHERE host = ?');
  const verifiedMappingCountStmt = prepareCountStmt(`
    SELECT COUNT(*) AS count
      FROM place_page_mappings
     WHERE host = ?
       AND status = 'verified'
       AND page_kind IN ('country-hub', 'region-hub', 'city-hub')
  `);
  const storedHubCountStmt = prepareCountStmt('SELECT COUNT(*) AS count FROM place_hubs WHERE host = ?');
  const candidateCountStmt = prepareCountStmt('SELECT COUNT(*) AS count FROM place_hub_candidates WHERE domain = ?');

  const runCountStmt = (stmt, value) => {
    if (!stmt) return { count: 0, error: null };
    try {
      const row = stmt.get(value);
      return { count: Number.isFinite(row?.count) ? row.count : 0, error: null };
    } catch (error) {
      return { count: 0, error };
    }
  };

  let insertDeterminationStmt = null;
  let latestDeterminationStmt = null;
  try {
    insertDeterminationStmt = db.prepare(`
      INSERT INTO place_hub_determinations (domain, determination, reason, details_json, created_at)
      VALUES (@domain, @determination, @reason, @details_json, datetime('now'))
    `);
    latestDeterminationStmt = db.prepare(`
      SELECT domain, determination, reason, details_json, created_at
        FROM place_hub_determinations
       WHERE domain = ?
    ORDER BY created_at DESC
       LIMIT 1
    `);
  } catch (error) {
    insertDeterminationStmt = null;
    latestDeterminationStmt = null;
  }

  // Audit trail statements for Task 4.4
  let insertAuditStmt = null;
  let loadAuditTrailStmt = null;
  try {
    insertAuditStmt = db.prepare(`
      INSERT INTO place_hub_audit (
        domain, url, place_kind, place_name, decision,
        validation_metrics_json, attempt_id, run_id, created_at
      ) VALUES (
        @domain, @url, @place_kind, @place_name, @decision,
        @validation_metrics_json, @attempt_id, @run_id, datetime('now')
      )
    `);
    loadAuditTrailStmt = db.prepare(`
      SELECT domain, url, place_kind, place_name, decision,
             validation_metrics_json, attempt_id, run_id, created_at
        FROM place_hub_audit
       WHERE domain = ?
    ORDER BY created_at DESC
       LIMIT ?
    `);
  } catch (error) {
    insertAuditStmt = null;
    loadAuditTrailStmt = null;
  }

  return {
    getLatestFetch(url) {
      if (!url) return null;
      return selectLatestFetchStmt.get(url) || null;
    },

    getHubByUrl(url) {
      if (!url) return null;
      return selectHubByUrlStmt.get(url) || null;
    },

    getPlaceHub(domain, url) {
      return this.getHubByUrl(url);
    },

    insertPlaceHub({ url, domain, placeSlug, placeKind, title, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!url) return;
      insertHubStmt.run({
        host: resolveHost(domain, url),
        url,
        place_slug: placeSlug || null,
        place_kind: placeKind || null,
        topic_slug: null,
        topic_label: null,
        topic_kind: null,
        title: title || null,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence: evidence || null
      });
    },

    updatePlaceHub({ url, placeSlug = null, placeKind = null, title = null, navLinksCount = null, articleLinksCount = null, evidence = null, topicSlug = null, topicLabel = null, topicKind = null }) {
      if (!url) return 0;
      const info = updateHubStmt.run({
        url,
        place_slug: placeSlug,
        place_kind: placeKind,
        topic_slug: topicSlug,
        topic_label: topicLabel,
        topic_kind: topicKind,
        title,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence
      });
      return info?.changes || 0;
    },

    getTopicHub(domain, url) {
      return this.getHubByUrl(url);
    },

    insertTopicHub({ url, domain, topicSlug, topicLabel, title, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!url) return;
      insertHubStmt.run({
        host: resolveHost(domain, url),
        url,
        place_slug: null,
        place_kind: null,
        topic_slug: topicSlug || null,
        topic_label: topicLabel || null,
        topic_kind: null,
        title: title || null,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence: evidence || null
      });
    },

    updateTopicHub({ url, topicSlug = null, topicLabel = null, topicKind = null, title = null, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!url) return 0;
      const info = updateHubStmt.run({
        url,
        place_slug: null,
        place_kind: null,
        topic_slug: topicSlug,
        topic_label: topicLabel,
        topic_kind: topicKind,
        title,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence
      });
      return info?.changes || 0;
    },

    getCombinationHub(domain, url) {
      return this.getHubByUrl(url);
    },

    insertCombinationHub({ url, domain, placeSlug, placeKind, topicSlug, topicLabel, title, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!url) return;
      insertHubStmt.run({
        host: resolveHost(domain, url),
        url,
        place_slug: placeSlug || null,
        place_kind: placeKind || null,
        topic_slug: topicSlug || null,
        topic_label: topicLabel || null,
        topic_kind: null,
        title: title || null,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence: evidence || null
      });
    },

    updateCombinationHub({ url, placeSlug = null, placeKind = null, topicSlug = null, topicLabel = null, topicKind = null, title = null, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!url) return 0;
      const info = updateHubStmt.run({
        url,
        place_slug: placeSlug,
        place_kind: placeKind,
        topic_slug: topicSlug,
        topic_label: topicLabel,
        topic_kind: topicKind,
        title,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence
      });
      return info?.changes || 0;
    },

    insertHub({ host, url, placeSlug, placeKind, title, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!host || !url) return;
      insertHubStmt.run({
        host,
        url,
        place_slug: placeSlug || null,
        place_kind: placeKind || null,
        title: title || null,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence: evidence || null
      });
    },

    updateHub({ url, placeSlug = null, placeKind = null, topicSlug = null, topicLabel = null, topicKind = null, title = null, navLinksCount = null, articleLinksCount = null, evidence = null }) {
      if (!url) return 0;
      const info = updateHubStmt.run({
        url,
        place_slug: placeSlug,
        place_kind: placeKind,
        topic_slug: topicSlug,
        topic_label: topicLabel,
        topic_kind: topicKind,
        title,
        nav_links_count: normalizeNumber(navLinksCount),
        article_links_count: normalizeNumber(articleLinksCount),
        evidence
      });
      return info?.changes || 0;
    },

    insertLegacyFetch(fetchRow) {
      if (!insertLegacyFetchStmt || !fetchRow) return;
      insertLegacyFetchStmt.run({
        url: fetchRow.url || null,
        request_started_at: fetchRow.request_started_at || fetchRow.fetched_at || null,
        fetched_at: fetchRow.fetched_at || fetchRow.request_started_at || null,
        http_status: fetchRow.http_status ?? null,
        content_type: fetchRow.content_type ?? null,
        content_length: normalizeNumber(fetchRow.content_length),
        bytes_downloaded: normalizeNumber(fetchRow.bytes_downloaded),
        total_ms: normalizeNumber(fetchRow.total_ms),
        download_ms: normalizeNumber(fetchRow.download_ms),
        host: fetchRow.host || null
      });
    },

    getDomainCoverageMetrics(domain, options = {}) {
      if (!domain) {
        return {
          fetchCount: 0,
          verifiedHubMappingCount: 0,
          storedHubCount: 0,
          candidateCount: 0,
          timedOut: false,
          elapsedMs: 0,
          completedMetrics: [],
          skippedMetrics: []
        };
      }

      const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : null;
      const timeSource = typeof options.now === 'function' ? options.now : () => Date.now();
      const started = timeSource();
      let timedOut = false;
      const completedMetrics = [];
      const skippedMetrics = [];

      const results = {
        fetchCount: 0,
        verifiedHubMappingCount: 0,
        storedHubCount: 0,
        candidateCount: 0
      };

      const measure = (key, stmt, value) => {
        if (!stmt) {
          skippedMetrics.push(key);
          return;
        }
        if (timedOut) {
          skippedMetrics.push(key);
          return;
        }
        if (timeoutMs != null && timeSource() - started >= timeoutMs) {
          timedOut = true;
          skippedMetrics.push(key);
          return;
        }
        const { count, error } = runCountStmt(stmt, value);
        if (error) {
          skippedMetrics.push(key);
          return;
        }
        results[key] = Number.isFinite(count) ? count : 0;
        completedMetrics.push(key);
        if (timeoutMs != null && timeSource() - started >= timeoutMs) {
          timedOut = true;
        }
      };

      measure('fetchCount', fetchCountStmt, domain);
      measure('verifiedHubMappingCount', verifiedMappingCountStmt, domain);
      measure('storedHubCount', storedHubCountStmt, domain);
      measure('candidateCount', candidateCountStmt, domain);

      return {
        ...results,
        timedOut,
        elapsedMs: timeSource() - started,
        completedMetrics,
        skippedMetrics
      };
    },

    recordDomainDetermination({ domain, determination, reason, details = null }) {
      if (!insertDeterminationStmt || !domain || !determination || !reason) {
        return 0;
      }
      const payload = {
        domain,
        determination,
        reason,
        details_json: details ? JSON.stringify(details) : null
      };
      try {
        const info = insertDeterminationStmt.run(payload);
        return info?.changes || 0;
      } catch (_) {
        return 0;
      }
    },

    getLatestDomainDetermination(domain) {
      if (!latestDeterminationStmt || !domain) return null;
      try {
        return latestDeterminationStmt.get(domain) || null;
      } catch (_) {
        return null;
      }
    },

    getGazetteerPlaceNames() {
      return null;
    },

    getNonGeoTopicSlugs() {
      return null;
    },

    // Audit trail helpers for Task 4.4
    recordAuditEntry({ domain, url, placeKind, placeName, decision, validationMetrics, attemptId, runId }) {
      if (!insertAuditStmt || !domain || !url || !decision) {
        return 0;
      }
      const payload = {
        domain,
        url,
        place_kind: placeKind || null,
        place_name: placeName || null,
        decision,
        validation_metrics_json: validationMetrics ? JSON.stringify(validationMetrics) : null,
        attempt_id: attemptId || null,
        run_id: runId || null
      };
      try {
        const info = insertAuditStmt.run(payload);
        return info?.changes || 0;
      } catch (_) {
        return 0;
      }
    },

    loadAuditTrail(domain, limit = 50) {
      if (!loadAuditTrailStmt || !domain) return [];
      try {
        const rows = loadAuditTrailStmt.all(domain, Math.max(1, Math.min(500, Number(limit) || 50)));
        return rows.map(row => ({
          ...row,
          validationMetrics: row.validation_metrics_json ? JSON.parse(row.validation_metrics_json) : null
        }));
      } catch (_) {
        return [];
      }
    },

    dispose() {
      const finalize = (stmt) => {
        if (stmt && typeof stmt.finalize === 'function') {
          try {
            stmt.finalize();
          } catch (_) {
            /* ignore */
          }
        }
      };
      finalize(selectLatestFetchStmt);
      finalize(selectHubByUrlStmt);
      finalize(insertHubStmt);
      finalize(updateHubStmt);
      finalize(insertLegacyFetchStmt);
      finalize(fetchCountStmt);
      finalize(verifiedMappingCountStmt);
      finalize(storedHubCountStmt);
      finalize(candidateCountStmt);
      finalize(insertDeterminationStmt);
      finalize(latestDeterminationStmt);
      finalize(insertAuditStmt);
      finalize(loadAuditTrailStmt);
    }
  };
}

module.exports = {
  createGuessPlaceHubsQueries
};