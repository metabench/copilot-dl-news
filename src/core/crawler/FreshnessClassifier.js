function parseTimestamp(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeHeaderMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {
      etag: null,
      lastModified: null,
      fetchedAt: null
    };
  }
  return {
    etag: meta.etag || null,
    lastModified: meta.last_modified || meta.lastModified || null,
    fetchedAt: meta.fetched_at || meta.fetchedAt || meta.fetchedAtIso || null
  };
}

function normalizeSitemapMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  return {
    lastmod: meta.lastmod || meta.sitemapLastmod || null,
    source: meta.source || null,
    sitemapDiscovery: meta.sitemapDiscovery === true
  };
}

function compareSitemapLastmod(sitemapMeta, headerMeta) {
  const sitemapLastmodMs = parseTimestamp(sitemapMeta?.lastmod);
  if (sitemapLastmodMs == null) return null;
  const storedLastModifiedMs = parseTimestamp(headerMeta?.lastModified);
  if (storedLastModifiedMs != null) {
    return sitemapLastmodMs > storedLastModifiedMs ? 'newer-than-stored-last-modified' : 'not-newer-than-stored-last-modified';
  }
  const storedFetchedAtMs = parseTimestamp(headerMeta?.fetchedAt);
  if (storedFetchedAtMs != null) {
    return sitemapLastmodMs > storedFetchedAtMs ? 'newer-than-stored-fetch' : 'not-newer-than-stored-fetch';
  }
  return 'no-stored-timestamp';
}

function classifyFreshness({
  source = null,
  status = null,
  fetchMeta = null,
  cacheInfo = null,
  requestMeta = null,
  headerMeta = null,
  conditionalHeaders = null
} = {}) {
  const stored = normalizeHeaderMeta(headerMeta);
  const sitemap = normalizeSitemapMeta(requestMeta);
  const hasStoredValidators = !!(stored.etag || stored.lastModified);
  const usedValidators = !!(
    fetchMeta?.conditional
    || (conditionalHeaders && (conditionalHeaders['If-None-Match'] || conditionalHeaders['If-Modified-Since']))
  );
  const sitemapRelation = compareSitemapLastmod(sitemap, stored);
  const proof = {
    source,
    httpStatus: fetchMeta?.httpStatus ?? cacheInfo?.httpStatus ?? null,
    conditional: usedValidators,
    validators: {
      requested: usedValidators,
      etag: stored.etag || fetchMeta?.etag || null,
      lastModified: stored.lastModified || fetchMeta?.lastModified || null
    },
    sitemapLastmod: sitemap?.lastmod || null,
    sitemapRelation,
    storedFetchedAt: stored.fetchedAt,
    storedLastModified: stored.lastModified,
    avoidedDownload: false,
    fullGetRequired: true
  };

  if (source === 'not-modified' || fetchMeta?.httpStatus === 304 || status === 'not-modified') {
    return {
      status: 'unchanged',
      reason: usedValidators ? 'conditional-get-304' : 'not-modified-without-validator-proof',
      ...proof,
      avoidedDownload: true,
      fullGetRequired: false
    };
  }

  if (source === 'cache') {
    const staleByPolicy = cacheInfo?.reason === 'stale-for-policy'
      || cacheInfo?.fallbackReason != null
      || cacheInfo?.policy === 'network-first';
    return {
      status: staleByPolicy ? 'stale' : 'unchanged',
      reason: staleByPolicy ? (cacheInfo?.fallbackReason || cacheInfo?.reason || 'cache-fallback') : (cacheInfo?.reason || 'cache-served'),
      ...proof,
      avoidedDownload: true,
      fullGetRequired: false
    };
  }

  if (source === 'network' && fetchMeta?.httpStatus >= 200 && fetchMeta.httpStatus < 300) {
    if (usedValidators || hasStoredValidators || sitemapRelation === 'newer-than-stored-last-modified' || sitemapRelation === 'newer-than-stored-fetch') {
      return {
        status: 'updated',
        reason: usedValidators ? 'conditional-get-200' : (sitemapRelation || 'stored-validator-present'),
        ...proof,
        avoidedDownload: false,
        fullGetRequired: true
      };
    }

    if (sitemap?.lastmod) {
      return {
        status: 'new',
        reason: 'sitemap-lastmod-without-stored-proof',
        ...proof,
        avoidedDownload: false,
        fullGetRequired: true
      };
    }

    return {
      status: 'new',
      reason: 'network-200-no-stored-proof',
      ...proof,
      avoidedDownload: false,
      fullGetRequired: true
    };
  }

  return {
    status: 'unknown',
    reason: status || source || 'no-freshness-signal',
    ...proof
  };
}

module.exports = {
  classifyFreshness,
  normalizeHeaderMeta,
  normalizeSitemapMeta,
  parseTimestamp
};
