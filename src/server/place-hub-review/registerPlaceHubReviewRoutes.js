'use strict';

/**
 * Place-hub review API — the surface through which an AI agent operates
 * the place-hub system without touching code (2026-07-16).
 *
 * The crawler's classifiers accumulate items they could not settle:
 * unknown slugs, candidates that were fetched but never verified, expired
 * validations, structure-change events, patterns stuck at uncertain
 * accuracy. This API exposes that backlog as a REVIEW QUEUE and accepts
 * DECISIONS back — classification overrides and heuristic updates — all
 * recorded in news.db with provenance ('ai-review' + agent id + reason)
 * and an audit trail. The intended loop:
 *
 *   GET  /review-queue            → what needs attention (+why, +evidence)
 *   GET  /classify?url=…          → probe the current classifier verdict
 *   POST /overrides               → settle items (non-geo veto, confirm /
 *                                   reject hub, resolve unknown term)
 *   POST /heuristics/patterns     → add/demote URL patterns (the GOFAI
 *                                   rule base — data, not code)
 *   POST /actions/learn           → re-mine a host's verified hubs
 *   POST /actions/assess-structure→ drift check (optionally applying reset)
 *   GET  /search?place=…          → place-keyed hub retrieval (freshness-aware)
 *
 * Local-only by design: the unified server binds 127.0.0.1; agents reach
 * it through the dev-bridge http relay. Every write requires `agent` and
 * `reason` — refusing anonymous mutations keeps the audit trail honest.
 */

const path = require('path');

function canonicalHost(input) {
  return String(input || '').toLowerCase().replace(/^www\./, '');
}

function registerPlaceHubReviewRoutes(app, {
  basePath = '/api/v1/place-hubs',
  db = null,
  dbPath = null,
  logger = console
} = {}) {
  const { findProjectRoot } = require('../../shared/utils/project-root');
  const root = findProjectRoot(__dirname);

  if (!db) {
    const Database = require(require.resolve('better-sqlite3', {
      paths: [root, path.join(root, '..', 'news-crawler-db'), __dirname]
    }));
    db = new Database(dbPath || path.join(root, 'data', 'news.db'), { timeout: 10000 });
  }

  const ncdb = require('news-crawler-db');
  const store = ncdb.createPlaceHubUrlPatternsStore(db, { ensureSchema: true });
  const { PlaceHubUrlIndex } = require('../../services/placeHubs/PlaceHubUrlIndex');
  const index = new PlaceHubUrlIndex({ db, store, lookup: null, logger });
  let lookupLoaded = false;
  const ensureLookup = () => {
    if (lookupLoaded) return;
    lookupLoaded = true;
    try {
      const { PlaceLookup } = require('../../intelligence/knowledge/PlaceLookup');
      index.lookup = PlaceLookup.load(db.name);
    } catch (err) {
      logger.warn?.('[place-hub-review] gazetteer lookup unavailable:', err.message);
    }
  };

  const tableColumns = (table) => {
    try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)); }
    catch (_) { return new Set(); }
  };

  const audit = ({ domain, url, decision, payload }) => {
    try {
      const cols = tableColumns('place_hub_audit');
      if (!cols.has('decision')) return;
      const row = {
        domain: domain || null,
        url: url || null,
        decision,
        validation_metrics_json: JSON.stringify(payload || {}),
        created_at: new Date().toISOString()
      };
      const usable = Object.keys(row).filter((k) => cols.has(k));
      db.prepare(
        `INSERT INTO place_hub_audit (${usable.join(', ')}) VALUES (${usable.map(() => '?').join(', ')})`
      ).run(...usable.map((k) => row[k]));
    } catch (err) {
      logger.warn?.('[place-hub-review] audit write failed:', err.message);
    }
  };

  const requireAgent = (req, res) => {
    const agent = req.body?.agent;
    const reason = req.body?.reason;
    if (!agent || !reason) {
      res.status(400).json({ status: 'error', message: 'agent and reason are required for all mutations' });
      return null;
    }
    return { agent: String(agent).slice(0, 120), reason: String(reason).slice(0, 500) };
  };

  // ── Review queue ────────────────────────────────────────────────────────
  app.get(`${basePath}/review-queue`, (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const kinds = req.query.kinds ? String(req.query.kinds).split(',') : null;
      const wants = (k) => !kinds || kinds.includes(k);
      const items = [];

      if (wants('unknown-term')) {
        // place_hub_unknown_terms.host is stored raw (often www-prefixed)
        // while every other table uses the bare-host canonical form. Group
        // on the canonicalized host so www/non-www rows for the same site
        // collapse and match candidate/pattern/policy joins downstream
        // (2026-07-17 consistency pass).
        const canonHostExpr = `CASE WHEN LOWER(ut.host) LIKE 'www.%' THEN SUBSTR(LOWER(ut.host), 5) ELSE LOWER(ut.host) END`;
        const rows = db.prepare(`
          SELECT ${canonHostExpr} AS host,
                 ut.term_slug AS termSlug, MAX(ut.term_label) AS termLabel,
                 SUM(ut.occurrences) AS occurrences, MAX(ut.last_seen_at) AS lastSeenAt
          FROM place_hub_unknown_terms ut
          WHERE ut.term_slug NOT IN (SELECT slug FROM non_geo_topic_slugs)
          GROUP BY ${canonHostExpr}, ut.term_slug
          ORDER BY occurrences DESC
          LIMIT ?
        `).all(limit);
        for (const r of rows) {
          items.push({
            kind: 'unknown-term',
            host: r.host, key: r.termSlug,
            evidence: { occurrences: r.occurrences, label: r.termLabel, lastSeenAt: r.lastSeenAt },
            suggestedActions: ['resolve-unknown-term (resolution: place|non-geo|junk)']
          });
        }
      }

      if (wants('unverified-candidate')) {
        const rows = db.prepare(`
          SELECT domain, candidate_url AS url, place_kind AS placeKind, place_name AS placeName,
                 score, confidence, status, last_seen_at AS lastSeenAt
          FROM place_hub_candidates
          WHERE status IN ('fetched-ok', 'cached-ok') AND (validation_status IS NULL OR validation_status = 'inconclusive')
          ORDER BY last_seen_at DESC
          LIMIT ?
        `).all(limit);
        for (const r of rows) {
          items.push({
            kind: 'unverified-candidate',
            host: canonicalHost(r.domain), key: r.url,
            evidence: { placeKind: r.placeKind, placeName: r.placeName, score: r.score, confidence: r.confidence, fetchStatus: r.status, lastSeenAt: r.lastSeenAt },
            suggestedActions: ['confirm-place-hub', 'reject-place-hub']
          });
        }
      }

      if (wants('expired-validation')) {
        for (const r of ncdb.listHubsNeedingRevalidation(db, { limit })) {
          items.push({
            kind: 'expired-validation',
            host: r.domain, key: r.hub_url,
            evidence: { validatedAt: r.validated_at, expiredAt: r.expires_at, lastStatus: r.last_fetch_status, previousVerdict: r.validation_status },
            suggestedActions: ['confirm-place-hub', 'reject-place-hub']
          });
        }
      }

      if (wants('structure-change')) {
        const rows = db.prepare(`
          SELECT domain, reason, details_json AS details, created_at AS createdAt
          FROM place_hub_determinations
          WHERE determination = 'structure-changed'
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit);
        for (const r of rows) {
          items.push({
            kind: 'structure-change',
            host: r.domain, key: r.createdAt,
            evidence: { reason: r.reason, details: r.details },
            suggestedActions: ['actions/learn after re-verification', 'heuristics/patterns']
          });
        }
      }

      if (wants('uncertain-pattern')) {
        const rows = db.prepare(`
          SELECT domain, pattern_type AS patternType, pattern_regex AS patternRegex,
                 accuracy, verified_count AS verifiedCount, sample_count AS sampleCount, provenance
          FROM place_hub_url_patterns
          WHERE accuracy > 0.3 AND accuracy < 0.7 AND scope = 'host'
          ORDER BY sample_count DESC
          LIMIT ?
        `).all(limit);
        for (const r of rows) {
          items.push({
            kind: 'uncertain-pattern',
            host: r.domain, key: `${r.patternType} ${r.patternRegex}`,
            evidence: { accuracy: r.accuracy, verifiedCount: r.verifiedCount, sampleCount: r.sampleCount, provenance: r.provenance },
            suggestedActions: ['heuristics/patterns (boost|demote)']
          });
        }
      }

      res.json({ status: 'ok', count: items.length, items });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Classifier probe ────────────────────────────────────────────────────
  app.get(`${basePath}/classify`, (req, res) => {
    try {
      const url = req.query.url;
      if (!url) return res.status(400).json({ status: 'error', message: 'url query param required' });
      ensureLookup();
      res.json({ status: 'ok', result: index.classifyUrl(String(url)) });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Overrides (classification decisions from the reviewing agent) ──────
  app.post(`${basePath}/overrides`, (req, res) => {
    try {
      const who = requireAgent(req, res);
      if (!who) return;
      const { action } = req.body || {};
      const provenance = { ...who, via: 'place-hub-review-api', at: new Date().toISOString() };

      if (action === 'mark-non-geo') {
        const slug = String(req.body.slug || '').toLowerCase().trim();
        if (!slug) return res.status(400).json({ status: 'error', message: 'slug required' });
        db.prepare(`INSERT OR IGNORE INTO non_geo_topic_slugs (slug, label, lang, source) VALUES (?, ?, ?, ?)`)
          .run(slug, req.body.label || slug, req.body.lang || 'en', `ai-review:${who.agent}`);
        const cleared = db.prepare(`DELETE FROM place_hub_unknown_terms WHERE term_slug = ?`).run(slug);
        index.nonGeoSlugs.add(slug);
        audit({ domain: req.body.host || null, url: null, decision: 'ai:mark-non-geo', payload: { slug, ...provenance, clearedUnknownTerms: cleared.changes } });
        return res.json({ status: 'ok', action, slug, clearedUnknownTerms: cleared.changes });
      }

      if (action === 'confirm-place-hub' || action === 'reject-place-hub') {
        const url = req.body.url;
        const host = canonicalHost(req.body.host || (() => { try { return new URL(url).hostname; } catch (_) { return null; } })());
        if (!url || !host) return res.status(400).json({ status: 'error', message: 'url (and derivable host) required' });
        const valid = action === 'confirm-place-hub';
        ncdb.recordHubValidation(db, {
          domain: host,
          hubUrl: url,
          hubType: req.body.placeKind ? `place:${req.body.placeKind}` : 'place',
          validationStatus: valid ? 'valid' : 'invalid',
          classificationConfidence: Number.isFinite(req.body.confidence) ? req.body.confidence : (valid ? 0.9 : 0.9),
          validationMethod: 'ai-review',
          contentIndicators: { agent: who.agent, reason: who.reason }
        });
        db.prepare(`
          UPDATE place_hub_candidates SET validation_status = ? WHERE candidate_url = ?
        `).run(valid ? 'valid' : 'invalid', url);
        if (Number.isFinite(req.body.placeId)) {
          const existing = db.prepare(`SELECT id FROM place_page_mappings WHERE place_id = ? AND url = ?`).get(req.body.placeId, url);
          const now = new Date().toISOString();
          if (existing) {
            db.prepare(`UPDATE place_page_mappings SET status = ?, verified_at = ?, last_seen_at = ? WHERE id = ?`)
              .run(valid ? 'verified' : 'absent', now, now, existing.id);
          } else {
            db.prepare(`
              INSERT INTO place_page_mappings (place_id, host, url, page_kind, status, first_seen_at, last_seen_at, verified_at, evidence)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(req.body.placeId, host, url, req.body.pageKind || `${req.body.placeKind || 'place'}-hub`,
              valid ? 'verified' : 'absent', now, now, now, JSON.stringify(provenance));
          }
        }
        audit({ domain: host, url, decision: `ai:${action}`, payload: { ...provenance, placeId: req.body.placeId || null } });
        return res.json({ status: 'ok', action, url, host });
      }

      if (action === 'resolve-unknown-term') {
        const host = canonicalHost(req.body.host);
        const termSlug = String(req.body.termSlug || '').toLowerCase().trim();
        const resolution = req.body.resolution;
        if (!termSlug || !['place', 'non-geo', 'junk'].includes(resolution)) {
          return res.status(400).json({ status: 'error', message: 'termSlug and resolution (place|non-geo|junk) required' });
        }
        if (resolution === 'non-geo') {
          db.prepare(`INSERT OR IGNORE INTO non_geo_topic_slugs (slug, label, lang, source) VALUES (?, ?, 'en', ?)`)
            .run(termSlug, req.body.label || termSlug, `ai-review:${who.agent}`);
          index.nonGeoSlugs.add(termSlug);
        }
        // unknown_terms.host is stored in whatever form the crawler saw
        // (frequently www.-prefixed) — match both canonical and www forms.
        const scope = host ? 'AND (host = ? OR host = ?)' : '';
        const params = host ? [termSlug, host, `www.${host}`] : [termSlug];
        const cleared = db.prepare(`DELETE FROM place_hub_unknown_terms WHERE term_slug = ? ${scope}`).run(...params);
        audit({ domain: host || null, url: null, decision: `ai:resolve-unknown-term:${resolution}`, payload: { termSlug, placeId: req.body.placeId || null, ...provenance } });
        return res.json({ status: 'ok', action, termSlug, resolution, clearedUnknownTerms: cleared.changes });
      }

      return res.status(400).json({ status: 'error', message: `unknown action: ${action}` });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Heuristic updates (the GOFAI rule base as data) ────────────────────
  app.post(`${basePath}/heuristics/patterns`, (req, res) => {
    try {
      const who = requireAgent(req, res);
      if (!who) return;
      const { op = 'upsert', domain, patternType, patternRegex } = req.body || {};
      if (!domain || !patternType || !patternRegex) {
        return res.status(400).json({ status: 'error', message: 'domain, patternType, patternRegex required' });
      }
      try { new RegExp(patternRegex); } catch (e) {
        return res.status(400).json({ status: 'error', message: `invalid regex: ${e.message}` });
      }
      if (op === 'upsert') {
        const saved = store.savePattern({
          domain,
          patternType,
          patternRegex,
          patternDescription: req.body.description || `AI heuristic (${who.agent}): ${who.reason}`.slice(0, 300),
          placeKind: req.body.placeKind || null,
          accuracy: Number.isFinite(req.body.accuracy) ? Math.max(0, Math.min(1, req.body.accuracy)) : 0.7,
          scope: domain === '*' ? 'global' : 'host',
          provenance: `ai-heuristic:${who.agent}`
        });
        audit({ domain: canonicalHost(domain), url: null, decision: 'ai:pattern-upsert', payload: { patternType, patternRegex, agent: who.agent, reason: who.reason } });
        return res.json({ status: 'ok', op, pattern: saved });
      }
      if (op === 'demote') {
        const info = db.prepare(`
          UPDATE place_hub_url_patterns
          SET accuracy = 0, provenance = COALESCE(provenance,'') || ' [demoted:' || ? || ']', updated_at = ?
          WHERE domain = ? AND pattern_type = ? AND pattern_regex = ?
        `).run(who.agent, new Date().toISOString(), canonicalHost(domain) === domain ? domain : canonicalHost(domain), patternType, patternRegex);
        audit({ domain: canonicalHost(domain), url: null, decision: 'ai:pattern-demote', payload: { patternType, patternRegex, agent: who.agent, reason: who.reason } });
        return res.json({ status: 'ok', op, changes: info.changes });
      }
      return res.status(400).json({ status: 'error', message: `unknown op: ${op}` });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Maintenance actions ────────────────────────────────────────────────
  app.post(`${basePath}/actions/learn`, (req, res) => {
    try {
      const who = requireAgent(req, res);
      if (!who) return;
      const host = canonicalHost(req.body.host);
      if (!host) return res.status(400).json({ status: 'error', message: 'host required' });
      const report = index.learnFromVerifiedHubs(host, { minCount: Number(req.body.minCount) || undefined });
      audit({ domain: host, url: null, decision: 'ai:learn-patterns', payload: { ...report, agent: who.agent, reason: who.reason } });
      res.json({ status: 'ok', report });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post(`${basePath}/actions/assess-structure`, (req, res) => {
    try {
      const who = requireAgent(req, res);
      if (!who) return;
      const host = canonicalHost(req.body.host);
      if (!host) return res.status(400).json({ status: 'error', message: 'host required' });
      const assessment = index.assessStructureHealth(host, {
        apply: req.body.apply !== false,
        threshold: Number.isFinite(req.body.threshold) ? req.body.threshold : undefined,
        minSample: Number.isFinite(req.body.minSample) ? req.body.minSample : undefined
      });
      audit({ domain: host, url: null, decision: 'ai:assess-structure', payload: { ...assessment, agent: who.agent, reason: who.reason } });
      res.json({ status: 'ok', assessment });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Bot-protection model (domain_fetch_policies) ───────────────────────
  // Seed the hosts whose protections were established the hard way.
  // Non-destructive: existing rows (agent decisions) are never overwritten.
  try {
    const seeds = [
      { host: 'theguardian.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer', confidence: 0.95, provenance: 'static-seed:verified-2026-07-15', evidence: [{ code: 'ECONNRESET', note: 'direct fetch resets; puppeteer verified live (200 pages, 0 errors)' }] },
      { host: 'bloomberg.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer', confidence: 0.7, provenance: 'static-seed', evidence: [{ code: 'ECONNRESET', note: 'legacy static fallback list' }] },
      { host: 'wsj.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer', confidence: 0.7, provenance: 'static-seed', evidence: [{ code: 'ECONNRESET', note: 'legacy static fallback list' }] },
      { host: 'lemonde.fr', protectionKind: 'http-402', fetchStrategy: 'puppeteer', confidence: 0.5, provenance: 'static-seed:trial', evidence: [{ httpStatus: 402, note: 'every direct fetch 402s (jobs 143fc616, ce78bfd3, 82cbcaf9); puppeteer unproven — TRIAL' }] },
      { host: 'reuters.com', protectionKind: 'bot-block', fetchStrategy: 'puppeteer', confidence: 0.4, provenance: 'static-seed:guess', evidence: [{ note: 'silent 0-page completions; consider remote-worker if puppeteer fails' }] }
    ];
    for (const seed of seeds) {
      if (!ncdb.getDomainFetchPolicy(db, seed.host)) ncdb.upsertDomainFetchPolicy(db, seed);
    }
  } catch (err) {
    logger.warn?.('[place-hub-review] fetch-policy seeding failed:', err.message);
  }

  app.get(`${basePath}/fetch-policies`, (req, res) => {
    try {
      const rows = ncdb.listDomainFetchPolicies(db, {
        strategy: req.query.strategy || null,
        limit: Math.max(1, Math.min(500, Number(req.query.limit) || 200))
      });
      res.json({ status: 'ok', count: rows.length, policies: rows });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post(`${basePath}/fetch-policies`, (req, res) => {
    try {
      const who = requireAgent(req, res);
      if (!who) return;
      const { host, protectionKind, fetchStrategy, notes, confidence, evidence } = req.body || {};
      if (!host) return res.status(400).json({ status: 'error', message: 'host required' });
      let result;
      try {
        result = ncdb.upsertDomainFetchPolicy(db, {
          host,
          protectionKind: protectionKind || 'unknown',
          fetchStrategy: fetchStrategy || 'direct',
          notes: notes || null,
          confidence: Number.isFinite(confidence) ? confidence : null,
          evidence: evidence || null,
          provenance: `ai-review:${who.agent}`
        });
      } catch (e) {
        return res.status(400).json({ status: 'error', message: e.message });
      }
      audit({ domain: canonicalHost(host), url: null, decision: 'ai:fetch-policy-upsert', payload: { protectionKind, fetchStrategy, agent: who.agent, reason: who.reason } });
      res.json({ status: 'ok', changes: result.changes, policy: ncdb.getDomainFetchPolicy(db, host) });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Place-keyed search ─────────────────────────────────────────────────
  app.get(`${basePath}/search`, (req, res) => {
    try {
      const requireFresh = req.query.fresh === '1' || req.query.fresh === 'true';
      const includeSites = !(req.query.sites === '0' || req.query.sites === 'false');
      const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
      let rows;
      if (req.query.placeId) {
        rows = ncdb.findHubsForPlace(db, Number(req.query.placeId), { requireFresh, limit, includeSites });
      } else if (req.query.place) {
        rows = ncdb.findHubsForPlaceSlug(db, String(req.query.place), { requireFresh, limit, includeSites });
      } else {
        return res.status(400).json({ status: 'error', message: 'place or placeId query param required' });
      }
      res.json({ status: 'ok', count: rows.length, hubs: rows });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ── Admin-class map review (A7 finale) ─────────────────────────────────
  // The verified flip is the single human step of unattended admin-area
  // ingestion: list shows ALL rows (incl. auto-discovered candidates);
  // verify mutates review-owned fields with agent+reason + audit.
  app.get(`${basePath}/admin-class-map`, (req, res) => {
    try {
      const rows = ncdb.listAdminClasses(db, {
        countryCode: req.query.countryCode ? String(req.query.countryCode) : undefined,
        adminLevel: req.query.adminLevel !== undefined ? Number(req.query.adminLevel) : undefined,
        verifiedOnly: req.query.verifiedOnly === '1'
      });
      res.json({ status: 'ok', count: rows.length, classes: rows });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post(`${basePath}/admin-class-map/verify`, (req, res) => {
    try {
      const who = requireAgent(req, res);
      if (!who) return;
      const { countryCode, wikidataClassQid, verified, placeKind, adminLevel, subclassWalk } = req.body || {};
      if (!countryCode || !wikidataClassQid || verified === undefined) {
        return res.status(400).json({ status: 'error', message: 'countryCode, wikidataClassQid and verified are required' });
      }
      const updated = ncdb.setAdminClassReview(db, {
        countryCode,
        wikidataClassQid,
        verified,
        placeKind,
        adminLevel,
        subclassWalk,
        provenance: `review:${who.agent}`
      });
      if (!updated) {
        return res.status(404).json({ status: 'error', message: `no admin_class_map row for ${countryCode}/${wikidataClassQid}` });
      }
      audit({
        domain: null,
        url: null,
        decision: `ai:admin-class-${verified ? 'verify' : 'unverify'}`,
        payload: { countryCode, wikidataClassQid, placeKind: updated.placeKind, adminLevel: updated.adminLevel, subclassWalk: updated.subclassWalk, agent: who.agent, reason: who.reason }
      });
      res.json({ status: 'ok', class: updated });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return { db, store, index, basePath };
}

module.exports = { registerPlaceHubReviewRoutes };
