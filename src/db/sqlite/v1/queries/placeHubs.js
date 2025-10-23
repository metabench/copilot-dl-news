'use strict';

function normalizeHost(host) {
  if (!host) return '';
  const trimmed = String(host).trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*/, '')
      .toLowerCase();
  }
}

function buildHostVariants(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return [];

  const variants = new Set([normalized]);

  if (!normalized.startsWith('www.')) {
    variants.add(`www.${normalized}`);
  } else {
    variants.add(normalized.replace(/^www\./, ''));
  }

  return Array.from(variants);
}

function getCountryHubCandidates(db, host, {
  includeTopicHubs = false,
  requireHttpOk = true
} = {}) {
  const hostVariants = buildHostVariants(host);
  if (!hostVariants.length) {
    return [];
  }

  const params = {
    includeTopicHubs: includeTopicHubs ? 1 : 0,
    requireHttpOk: requireHttpOk ? 1 : 0
  };

  const hostBindings = hostVariants
    .map((value, index) => {
      const key = `host${index}`;
      params[key] = value;
      return `@${key}`;
    })
    .join(', ');

  const query = `
    SELECT
      ph.id,
      ph.host,
      ph.url,
      ph.place_slug AS placeSlug,
      ph.place_kind AS placeKind,
      ph.topic_slug AS topicSlug,
      ph.topic_kind AS topicKind,
      ph.title,
      ph.nav_links_count AS navLinksCount,
      ph.article_links_count AS articleLinksCount,
      ph.evidence,
      ph.first_seen_at AS firstSeenAt,
      ph.last_seen_at AS lastSeenAt,
      lf.http_status AS httpStatus
    FROM place_hubs ph
    LEFT JOIN urls u ON u.url = ph.url
    LEFT JOIN latest_fetch lf ON lf.url = ph.url
    WHERE ph.host IN (${hostBindings})
      AND ph.place_slug IS NOT NULL
      AND TRIM(ph.place_slug) != ''
      AND (@includeTopicHubs = 1 OR ph.place_kind IS NULL OR ph.place_kind = 'country')
      AND (
        @requireHttpOk = 0
        OR (
          (lf.http_status BETWEEN 200 AND 299)
          OR lf.http_status IS NULL
        )
      )
    ORDER BY
      COALESCE(ph.nav_links_count, 0) DESC,
      COALESCE(ph.article_links_count, 0) DESC,
      ph.last_seen_at DESC
  `;

  const rows = db.prepare(query).all(params);

  const normalizedHost = normalizeHost(hostVariants[0]);

  return rows.map((row) => ({
    ...row,
    host: normalizedHost,
    navLinksCount: row.navLinksCount != null ? Number(row.navLinksCount) : null,
    articleLinksCount: row.articleLinksCount != null ? Number(row.articleLinksCount) : null,
    httpStatus: row.httpStatus != null ? Number(row.httpStatus) : null
  }));
}

module.exports = {
  getCountryHubCandidates,
  normalizeHost
};
