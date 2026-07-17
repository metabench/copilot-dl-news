'use strict';

/**
 * PlaceHubUrlIndex — the single URL-first surface for place-hub
 * identification (2026-07-16 place-hub intelligence slice).
 *
 * Answers three questions, all from data in news.db:
 *   1. classifyUrl(url)          — is this URL likely a place hub, for
 *      which place, with what confidence and provenance? (GOFAI: learned
 *      per-host patterns > cross-site priors, gazetteer slug resolution,
 *      non-geo negative filter. No network.)
 *   2. learnFromVerifiedHubs(host) — mine the host's verified place_hubs
 *      rows into reusable URL patterns, persisted to
 *      place_hub_url_patterns (scope 'host').
 *   3. assessStructureHealth(host) — detect website-structure drift: if
 *      pattern-matching URLs for the host now overwhelmingly 404, zero
 *      the learned patterns (forces re-learn) and record a
 *      'structure-changed' determination.
 *
 * Everything is injectable for tests; `PlaceHubUrlIndex.open()` wires the
 * production pieces (news.db via news-crawler-db store + PlaceLookup).
 */

const path = require('path');

const DEFAULT_MIN_TEMPLATE_COUNT = 2;

function canonicalHost(input) {
  return String(input || '').toLowerCase().replace(/^www\./, '');
}

function pathSegments(url) {
  try {
    const u = new URL(url);
    return { host: canonicalHost(u.hostname), segments: u.pathname.split('/').filter(Boolean) };
  } catch (_) {
    return { host: null, segments: [] };
  }
}

class PlaceHubUrlIndex {
  /**
   * @param {Object} deps
   * @param {Object} deps.db          better-sqlite3 handle on news.db
   * @param {Object} deps.store       SqlitePlaceHubUrlPatternsStore
   * @param {Object} deps.lookup      PlaceLookup instance (findBySlug/findBest)
   * @param {Set<string>} [deps.nonGeoSlugs] known non-geographic topic slugs
   * @param {Object} [deps.logger]
   */
  constructor({ db, store, lookup, nonGeoSlugs, logger } = {}) {
    if (!db) throw new Error('PlaceHubUrlIndex requires a db handle');
    if (!store) throw new Error('PlaceHubUrlIndex requires a patterns store');
    this.db = db;
    this.store = store;
    this.lookup = lookup || null;
    this.logger = logger || console;
    this.nonGeoSlugs = nonGeoSlugs || this._loadNonGeoSlugs();
  }

  /** Production wiring: open news.db + store + gazetteer lookup. */
  static open({ dbPath, readonly = false } = {}) {
    const { findProjectRoot } = require('../../shared/utils/project-root');
    const root = findProjectRoot(__dirname);
    const resolved = dbPath || path.join(root, 'data', 'news.db');
    const Database = require(require.resolve('better-sqlite3', {
      paths: [root, path.join(root, '..', 'news-crawler-db'), __dirname]
    }));
    const db = new Database(resolved, { timeout: 10000, readonly });
    const { createPlaceHubUrlPatternsStore } = require('news-crawler-db');
    const store = createPlaceHubUrlPatternsStore(db, { ensureSchema: !readonly });
    let lookup = null;
    try {
      const { PlaceLookup } = require('../../intelligence/knowledge/PlaceLookup');
      lookup = PlaceLookup.load(resolved);
    } catch (err) {
      console.warn('[PlaceHubUrlIndex] gazetteer lookup unavailable:', err.message);
    }
    return new PlaceHubUrlIndex({ db, store, lookup });
  }

  _loadNonGeoSlugs() {
    try {
      const rows = this.db.prepare('SELECT slug FROM non_geo_topic_slugs').all();
      return new Set(rows.map((r) => String(r.slug).toLowerCase()));
    } catch (_) {
      return new Set();
    }
  }

  /**
   * GOFAI URL classification. Combines:
   *  - DB pattern match (host-learned first, then global priors)
   *  - terminal-segment gazetteer resolution (place slug → place)
   *  - non-geo topic veto
   * Confidence: pattern accuracy, +0.15 when the gazetteer also resolves
   * the slug, capped at 0.99; gazetteer-only matches score 0.45 (candidate
   * quality — verification must confirm). Never throws.
   */
  classifyUrl(url) {
    const { host, segments } = pathSegments(url);
    const result = {
      url,
      host,
      isPlaceHubCandidate: false,
      confidence: 0,
      place: null,
      pattern: null,
      provenance: null,
      reasons: []
    };
    if (!host || segments.length === 0) {
      result.reasons.push('no-parseable-path');
      return result;
    }

    const terminalSlug = segments[segments.length - 1].toLowerCase();
    if (this.nonGeoSlugs.has(terminalSlug)) {
      result.reasons.push(`non-geo-slug:${terminalSlug}`);
      return result;
    }

    // Date-shaped paths are articles, not hubs.
    if (/^(19|20)\d{2}$/.test(segments[0]) || segments.some((s) => /^(19|20)\d{2}$/.test(s))) {
      result.reasons.push('date-path(article-shaped)');
      return result;
    }

    let match = null;
    try { match = this.store.matchUrlForHost(url, host); } catch (_) { /* tolerate */ }
    const gazetteerPlaces = this.lookup ? this.lookup.findBySlug(terminalSlug) : [];
    const bestPlace = gazetteerPlaces.length
      ? gazetteerPlaces.slice().sort((a, b) => (b.population ?? -1) - (a.population ?? -1))[0]
      : null;

    if (match && match.matched) {
      result.isPlaceHubCandidate = true;
      result.confidence = Math.min(0.99, (match.confidence || 0.5) + (bestPlace ? 0.15 : 0));
      result.pattern = {
        type: match.patternType,
        regex: match.pattern?.pattern_regex || null,
        scope: match.scope || 'host'
      };
      result.provenance = match.pattern?.provenance || match.scope || 'pattern';
      result.reasons.push(`pattern:${match.patternType}(${match.scope})`);
    } else if (bestPlace && segments.length <= 3) {
      // Gazetteer-only: plausible but unproven — hand to verification.
      result.isPlaceHubCandidate = true;
      result.confidence = 0.45;
      result.provenance = 'gazetteer-slug';
      result.reasons.push('gazetteer-slug-match');
    }

    if (bestPlace) {
      result.place = {
        id: bestPlace.placeId,
        kind: bestPlace.kind,
        name: bestPlace.canonicalName,
        countryCode: bestPlace.countryCode,
        slug: terminalSlug
      };
      result.reasons.push(`gazetteer:${bestPlace.canonicalName}`);
    } else {
      result.reasons.push('gazetteer:no-match');
    }
    return result;
  }

  /**
   * Mine verified place_hubs rows for a host into persisted URL patterns.
   * Template derivation: replace the place-slug path segment with a slug
   * class; templates seen >= minCount become patterns (scope 'host',
   * provenance 'learned-from-verified-hubs', accuracy grows with support).
   */
  learnFromVerifiedHubs(host, { minCount = DEFAULT_MIN_TEMPLATE_COUNT } = {}) {
    const canonical = canonicalHost(host);
    const rows = this.db.prepare(`
      SELECT ph.place_slug AS placeSlug, ph.place_kind AS placeKind, u.url AS url
      FROM place_hubs ph
      LEFT JOIN urls u ON u.id = ph.url_id
      WHERE (ph.host = ? OR ph.host = ?)
        AND u.url IS NOT NULL
    `).all(canonical, `www.${canonical}`);

    const templates = new Map(); // template → { count, kinds, examples }
    for (const row of rows) {
      const { segments } = pathSegments(row.url);
      if (!segments.length || !row.placeSlug) continue;
      const slugLower = String(row.placeSlug).toLowerCase();
      const idx = segments.findIndex((s) => s.toLowerCase() === slugLower);
      if (idx === -1) continue;
      const templateSegs = segments.map((s, i) => (i === idx ? '{slug}' : s));
      const template = '/' + templateSegs.join('/');
      const entry = templates.get(template) || { count: 0, kinds: new Map(), examples: [] };
      entry.count++;
      entry.kinds.set(row.placeKind || 'unknown', (entry.kinds.get(row.placeKind || 'unknown') || 0) + 1);
      if (entry.examples.length < 5) entry.examples.push(row.url);
      templates.set(template, entry);
    }

    const saved = [];
    for (const [template, entry] of templates) {
      if (entry.count < minCount) continue;
      const regex = '\\/' + template.slice(1).split('/').map((seg) =>
        seg === '{slug}' ? '[a-z0-9-]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      ).join('\\/') + '\\/?$';
      const dominantKind = [...entry.kinds.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const accuracy = Math.min(0.95, 0.6 + entry.count * 0.02);
      const pattern = this.store.savePattern({
        domain: canonical,
        patternType: `learned:${template}`,
        patternRegex: regex,
        patternDescription: `Learned from ${entry.count} verified hubs (${template})`,
        placeKind: dominantKind === 'unknown' ? null : dominantKind,
        accuracy,
        scope: 'host',
        provenance: 'learned-from-verified-hubs',
        exampleUrls: entry.examples
      });
      if (pattern) saved.push({ template, count: entry.count, accuracy, kind: dominantKind });
    }
    return { host: canonical, verifiedHubRows: rows.length, templatesConsidered: templates.size, patternsSaved: saved };
  }

  /**
   * Structure-drift assessment v1: of this host's previously verified hub
   * URLs, how many most recently answered 404/410? A site redesign shows
   * up as verified hubs going dead in bulk. When the dead ratio crosses
   * `threshold` with at least `minSample` checked hubs, learned patterns
   * are zeroed (global priors survive) and a determination row records it.
   */
  assessStructureHealth(host, { threshold = 0.5, minSample = 5, apply = true } = {}) {
    const canonical = canonicalHost(host);
    const rows = this.db.prepare(`
      SELECT u.url AS url,
             (SELECT hr.http_status FROM http_responses hr
              WHERE hr.url_id = u.id ORDER BY hr.fetched_at DESC LIMIT 1) AS lastStatus
      FROM place_hubs ph
      JOIN urls u ON u.id = ph.url_id
      WHERE ph.host = ? OR ph.host = ?
    `).all(canonical, `www.${canonical}`);

    const checked = rows.filter((r) => Number.isFinite(r.lastStatus));
    const dead = checked.filter((r) => r.lastStatus === 404 || r.lastStatus === 410);
    const ratio = checked.length ? dead.length / checked.length : 0;
    const drifted = checked.length >= minSample && ratio >= threshold;

    const assessment = {
      host: canonical,
      hubsKnown: rows.length,
      hubsChecked: checked.length,
      hubsDead: dead.length,
      deadRatio: Number(ratio.toFixed(3)),
      drifted,
      applied: false
    };

    if (drifted && apply) {
      const resetCount = this.store.resetHostPatterns(canonical, 'structure-change');
      try {
        this.db.prepare(`
          INSERT INTO place_hub_determinations (domain, determination, reason, details_json, created_at)
          VALUES (?, 'structure-changed', ?, ?, ?)
        `).run(
          canonical,
          `${dead.length}/${checked.length} verified hubs now 404/410`,
          JSON.stringify(assessment),
          new Date().toISOString()
        );
      } catch (err) {
        this.logger.warn?.('[PlaceHubUrlIndex] determination write failed:', err.message);
      }
      assessment.applied = true;
      assessment.patternsReset = resetCount;
    }
    return assessment;
  }

  close() {
    try { this.db.close(); } catch (_) { /* noop */ }
  }
}

module.exports = { PlaceHubUrlIndex };
