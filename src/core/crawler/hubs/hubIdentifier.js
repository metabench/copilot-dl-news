'use strict';
/**
 * hubIdentifier — turn a discovered hub URL into a persisted hub record.
 *
 * Pipeline (P3): URL → canonical slug → segmentSlugAsync (DB lexicon) →
 * coverage.upsertHub(members). Pure orchestration; all DB access is via the
 * news-crawler-db coverage accessors. hub-loop P3, 2026-07-11.
 */

const { segmentSlugAsync, resolveCoverage } = require('./slugLexicon');

// Extract the hub slug from a section URL. News hubs live at a short path whose
// LAST meaningful segment is the slug: /world/zimbabwe → zimbabwe,
// /world/russia-ukraine-war → russia-ukraine-war, /technology → technology.
// Ignores article-shaped paths (date segments / many parts / .html).
function slugFromHubUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const parts = u.pathname.split('/').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  // Article heuristics: a date segment or a long path → not a hub slug.
  if (parts.some((p) => /^\d{4}$/.test(p)) || parts.length > 3) return null;
  const last = parts[parts.length - 1];
  if (/\.(html?|php|aspx?)$/i.test(last)) return null;
  return last.toLowerCase();
}

/**
 * Identify + persist a hub from a URL. Returns the segmentation result plus
 * the hub id (or a skip reason). Options let tests inject a segmenter.
 *
 * @param {{host:string, url:string, adapter:object, status?:string,
 *          segment?:function, minConfidence?:number}} args
 */
async function identifyAndPersistHub(args) {
  const { host, url, adapter } = args;
  const status = args.status || 'candidate';
  const minConfidence = args.minConfidence ?? 0.4;
  const segment = args.segment || ((slug) => segmentSlugAsync(slug, adapter));

  const slug = slugFromHubUrl(url);
  if (!slug) return { persisted: false, reason: 'no-slug', url };

  const seg = await segment(slug);
  if (seg.hubKind === 'unknown' || seg.members.length === 0) {
    return { persisted: false, reason: 'unresolved', slug, segmentation: seg };
  }
  if (seg.confidence < minConfidence) {
    return { persisted: false, reason: 'low-confidence', slug, confidence: seg.confidence, segmentation: seg };
  }

  const cov = resolveCoverage(adapter);
  if (!cov || typeof cov.upsertHub !== 'function') {
    return { persisted: false, reason: 'no-upsert-accessor', slug, segmentation: seg };
  }

  const hubId = await cov.upsertHub({
    host,
    canonicalSlug: slug,
    hubKind: seg.hubKind,
    confidence: seg.confidence,
    status,
    evidence: { source: 'hubIdentifier', unresolved: seg.unresolved, alternatives: seg.alternatives },
    members: seg.members.map((m) => ({
      memberType: m.memberType,
      placeSlug: m.placeSlug || null,
      placeId: m.placeId || null,
      topicSlug: m.topicSlug || null,
      role: m.role,
      position: m.position
    }))
  });

  return { persisted: true, hubId, slug, hubKind: seg.hubKind, members: seg.members.length, confidence: seg.confidence };
}

module.exports = { slugFromHubUrl, identifyAndPersistHub };
