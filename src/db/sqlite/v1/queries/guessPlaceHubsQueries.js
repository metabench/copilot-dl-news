'use strict';

function createGuessPlaceHubsQueries(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createGuessPlaceHubsQueries requires a valid SQLite database instance');
  }

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

  return {
    getLatestFetch(url) {
      if (!url) return null;
      return selectLatestFetchStmt.get(url) || null;
    },

    getHubByUrl(url) {
      if (!url) return null;
      return selectHubByUrlStmt.get(url) || null;
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
    }
  };
}

module.exports = {
  createGuessPlaceHubsQueries
};