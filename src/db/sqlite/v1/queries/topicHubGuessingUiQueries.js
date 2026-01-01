'use strict';

const {
  clampInt,
  normalizeLang,
  normalizeSearchQuery,
  selectTopicSlugsForMatrix
} = require('./nonGeoTopicSlugsUiQueries');

function selectTopicHubHosts(dbHandle, { hostLimit = 40, hostQ } = {}) {
  const resolvedHostLimit = clampInt(hostLimit, { min: 1, max: 400, fallback: 40 });
  const resolvedHostQ = normalizeSearchQuery(hostQ);
  const like = resolvedHostQ ? `%${resolvedHostQ}%` : null;

  return dbHandle
    .prepare(
      `
      SELECT host, COUNT(*) AS cnt
      FROM place_hubs
      WHERE topic_slug IS NOT NULL AND topic_slug != ''
        AND (? IS NULL OR host LIKE ?)
      GROUP BY host
      ORDER BY cnt DESC, host ASC
      LIMIT ?
    `
    )
    .all(like, like, resolvedHostLimit)
    .map((r) => r.host)
    .filter(Boolean);
}

function selectTopicHubMappings(dbHandle, { topicSlugs, hosts } = {}) {
  if (!Array.isArray(topicSlugs) || topicSlugs.length === 0) return [];
  if (!Array.isArray(hosts) || hosts.length === 0) return [];

  const topicPlaceholders = topicSlugs.map(() => '?').join(',');
  const hostPlaceholders = hosts.map(() => '?').join(',');

  const sql = `
    SELECT
      topic_slug,
      host,
      COUNT(*) AS cnt,
      MAX(last_seen_at) AS last_seen_at
    FROM place_hubs
    WHERE topic_slug IN (${topicPlaceholders})
      AND host IN (${hostPlaceholders})
    GROUP BY topic_slug, host
  `;

  return dbHandle.prepare(sql).all(...topicSlugs, ...hosts);
}

function buildMatrixModel(dbHandle, options = {}) {
  const lang = normalizeLang(options.lang, { fallback: 'und' });
  const fallbackLang = normalizeLang(options.fallbackLang, { fallback: 'und' });

  const topicLimit = clampInt(options.topicLimit, { min: 1, max: 2000, fallback: 120 });
  const hostLimit = clampInt(options.hostLimit, { min: 1, max: 400, fallback: 40 });

  const topicQ = normalizeSearchQuery(options.q);
  const hostQ = normalizeSearchQuery(options.hostQ);

  const topics = selectTopicSlugsForMatrix(dbHandle, {
    lang,
    fallbackLang,
    q: topicQ,
    limit: topicLimit
  });

  const hosts = selectTopicHubHosts(dbHandle, {
    hostLimit,
    hostQ
  });

  const mappingRows = selectTopicHubMappings(dbHandle, {
    topicSlugs: topics.map((t) => t.slug),
    hosts
  });

  const mappingByKey = new Map();
  let mappingCount = 0;

  for (const row of mappingRows) {
    const topicSlug = row.topic_slug;
    const host = row.host;
    if (!topicSlug || !host) continue;

    const key = `${topicSlug}|${host}`;
    mappingByKey.set(key, {
      topicSlug,
      host,
      cnt: row.cnt,
      last_seen_at: row.last_seen_at
    });
    mappingCount += 1;
  }

  return {
    lang,
    fallbackLang,
    topicLimit,
    hostLimit,
    topicQ,
    hostQ,
    topics,
    hosts,
    mappingByKey,
    stats: {
      mappingCount
    }
  };
}

function selectCellRows(dbHandle, { topicSlug, host, limit = 100 } = {}) {
  const resolvedTopicSlug = String(topicSlug || '').trim();
  const resolvedHost = String(host || '').trim();
  const resolvedLimit = clampInt(limit, { min: 1, max: 1000, fallback: 100 });

  if (!resolvedTopicSlug || !resolvedHost) return [];

  return dbHandle
    .prepare(
      `
      SELECT
        id,
        host,
        topic_slug,
        topic_label,
        topic_kind,
        title,
        url,
        first_seen_at,
        last_seen_at,
        nav_links_count,
        article_links_count,
        evidence
      FROM place_hubs_with_urls
      WHERE host = ? AND topic_slug = ?
      ORDER BY COALESCE(last_seen_at, first_seen_at) DESC, id DESC
      LIMIT ?
    `
    )
    .all(resolvedHost, resolvedTopicSlug, resolvedLimit);
}

module.exports = {
  clampInt,
  normalizeLang,
  normalizeSearchQuery,
  buildMatrixModel,
  selectCellRows,
  selectTopicHubHosts
};
