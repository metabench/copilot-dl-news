'use strict';
/**
 * Build the segmenter's lexicon from a coverage-capable DB adapter
 * (news-crawler-db). Resolves coverage exactly like the sitemap cache does
 * (adapter.coverage / adapter.db.coverage / _getCoverageAccess), so it works
 * with both the drizzle adapter and the live crawler's CrawlerDb. All DB
 * access stays inside the module's accessors — hub-loop P2, 2026-07-11.
 *
 * Returns an ASYNC lexicon; segmentSlug is sync, so callers that need DB-backed
 * matching use segmentSlugAsync (below) which awaits per-phrase lookups.
 */

function resolveCoverage(adapter) {
  if (!adapter) return null;
  return adapter.coverage
    || (adapter.db && adapter.db.coverage)
    || (adapter.db && adapter.db.access && adapter.db.access.coverage)
    || (typeof adapter._getCoverageAccess === 'function' ? adapter._getCoverageAccess() : null);
}

/**
 * Async slug segmentation backed by the DB lexicon. Mirrors segmentSlug's
 * longest-match-with-place-preference, but awaits lexicon lookups (with a small
 * in-run memo so repeated phrases hit the DB once).
 */
async function segmentSlugAsync(slug, adapter, opts = {}) {
  const cov = resolveCoverage(adapter);
  if (!cov || typeof cov.lookupPlaceByNormalized !== 'function') {
    return { slug: String(slug || ''), hubKind: 'unknown', members: [], confidence: 0, unresolved: [], alternatives: [], reason: 'no-lexicon' };
  }
  const maxSpan = opts.maxSpan || 4;
  const tokens = String(slug || '').toLowerCase().split(/[-_/]+/).filter(Boolean);
  const n = tokens.length;
  const placeMemo = new Map();
  const topicMemo = new Map();
  const matchPlace = async (phrase) => {
    if (placeMemo.has(phrase)) return placeMemo.get(phrase);
    const r = await cov.lookupPlaceByNormalized(phrase);
    placeMemo.set(phrase, r); return r;
  };
  const matchTopic = async (phrase) => {
    if (topicMemo.has(phrase)) return topicMemo.get(phrase);
    const r = cov.lookupTopicByTerm ? await cov.lookupTopicByTerm(phrase) : null;
    topicMemo.set(phrase, r); return r;
  };

  const phrasesAt = (i, span) => { const seg = tokens.slice(i, i + span); return [seg.join(' '), seg.join('-')]; };
  const members = []; const unresolved = [];
  let i = 0;
  while (i < n) {
    let matched = null;
    for (let span = Math.min(maxSpan, n - i); span >= 1 && !matched; span--) {
      for (const phrase of phrasesAt(i, span)) {
        const place = await matchPlace(phrase);
        if (place) { matched = { memberType: 'place', span, place }; break; }
      }
    }
    if (!matched) {
      for (let span = Math.min(maxSpan, n - i); span >= 1 && !matched; span--) {
        for (const phrase of phrasesAt(i, span)) {
          const topic = await matchTopic(phrase);
          if (topic) { matched = { memberType: 'topic', span, topic }; break; }
        }
      }
    }
    if (matched) { members.push(matched); i += matched.span; }
    else { unresolved.push(tokens[i]); i += 1; }
  }

  let placeSeen = 0;
  const outMembers = members.map((m, position) => {
    if (m.memberType === 'place') {
      const role = placeSeen === 0 ? 'subject' : 'counterpart'; placeSeen += 1;
      return { memberType: 'place', placeSlug: m.place.slug, placeId: m.place.placeId ?? null, role, position };
    }
    return { memberType: 'topic', topicSlug: m.topic.slug, role: 'theme', position };
  });
  const placeCount = outMembers.filter((m) => m.memberType === 'place').length;
  const topicCount = outMembers.filter((m) => m.memberType === 'topic').length;
  let hubKind = 'unknown';
  if (outMembers.length === 0) hubKind = 'unknown';
  else if (topicCount === 0 && placeCount === 1) hubKind = 'place';
  else if (placeCount === 0 && topicCount >= 1) hubKind = 'topic';
  else hubKind = 'composite';
  const resolved = n - unresolved.length;
  const confidence = n === 0 ? 0 : Math.max(0, Math.min(1, resolved / n - 0.15 * (unresolved.length > 0 ? 1 : 0)));
  return { slug: String(slug || ''), hubKind, members: outMembers, confidence: Number(confidence.toFixed(3)), unresolved, alternatives: [] };
}

module.exports = { resolveCoverage, segmentSlugAsync };
