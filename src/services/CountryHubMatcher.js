'use strict';

const { CountryHubGapAnalyzer } = require('./CountryHubGapAnalyzer');
const { getCountryHubCandidates, normalizeHost } = require('../data/db/sqlite/v1/queries/placeHubs');
const { upsertPlacePageMapping } = require('../data/db/sqlite/v1/queries/placePageMappings');
const { slugify, normalizeForMatching } = require('../tools/slugify');

const LEADING_NAME_STOP_WORDS = new Set([
  'the',
  'state',
  'states',
  'kingdom',
  'republic',
  'democratic',
  'federal',
  'federated',
  'federation',
  'commonwealth',
  'people',
  'peoples',
  'people-s',
  'islamic',
  'socialist',
  'arab',
  'collectivity',
  'collectivite',
  'territoriale',
  'territorial',
  'territory',
  'country',
  'department',
  'bailiwick',
  'province',
  'autonomous',
  'statehood',
  'union',
  'commonwealth',
  'demokratyczna',
  'departemang',
  'departemento',
  'departement',
  'departamento',
  'territorial',
  'territorio',
  'territoriale',
  'collectivite',
  'collectivite-territoriale',
  'collectivite-territoriale-de',
  'collectivity-of',
  'state-of',
  'kingdom-of',
  'republic-of',
  'federal-republic',
  'federated-states',
  'united-states',
  'united-kingdom',
  'reino',
  'repubblica',
  'republique',
  'republica',
  'estado',
  'estado-plurinacional'
]);

const CONNECTOR_STOP_WORDS = new Set(['of', 'de', 'du', 'la', 'le', 'los', 'las', 'das', 'des', 'do', 'da']);

function generateMatchingKeys(name) {
  const variants = new Set();
  const baseSlug = slugify(name);
  const normalized = normalizeForMatching(name);
  if (baseSlug) variants.add(baseSlug);
  if (normalized) variants.add(normalized);

  if (baseSlug) {
    const tokens = baseSlug.split('-').filter(Boolean);
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      if (LEADING_NAME_STOP_WORDS.has(token) || CONNECTOR_STOP_WORDS.has(token)) {
        index += 1;
      } else {
        break;
      }
    }
    if (index > 0 && index < tokens.length) {
      const trimmedTokens = tokens.slice(index);
      const trimmedSlug = trimmedTokens.join('-');
      if (trimmedSlug) {
        variants.add(trimmedSlug);
        variants.add(trimmedSlug.replace(/-/g, ''));
      }
    }
  }

  return Array.from(variants).filter(Boolean);
}

function ensureDb(db) {
  if (!db) {
    throw new Error('CountryHubMatcher requires a database connection');
  }
}

function safeParseJson(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}

class CountryHubMatcher {
  constructor({
    db,
    logger = console,
    minNavLinks = 8,
    minArticleLinks = 0
  } = {}) {
    ensureDb(db);
    this.db = db;
    this.logger = logger;
    this.minNavLinks = minNavLinks;
    this.minArticleLinks = minArticleLinks;
    this.analyzer = new CountryHubGapAnalyzer({ db, logger });
    this.englishNameCache = new Map();
    this.altNameStmt = this.db.prepare(`
      SELECT name
        FROM place_names
       WHERE place_id = ?
         AND lang LIKE 'en%'
       ORDER BY is_preferred DESC, id ASC
       LIMIT 1
    `);
    this.fallbackNameStmt = this.db.prepare(`
      SELECT name
        FROM place_names
       WHERE place_id = ?
       ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
       LIMIT 1
    `);
  }

  getAlternateNames(placeId) {
    if (!placeId) return [];
    if (this.englishNameCache.has(placeId)) {
      return this.englishNameCache.get(placeId);
    }

    let names = [];
    try {
      const englishRow = this.altNameStmt.get(placeId);
      const fallbackRow = this.fallbackNameStmt.get(placeId);
      const unique = new Set();
      if (englishRow?.name) unique.add(englishRow.name);
      if (fallbackRow?.name) unique.add(fallbackRow.name);
      names = Array.from(unique.values());
    } catch (error) {
      this.logger.warn?.('[CountryHubMatcher] Failed to load alternate names', error.message);
      names = [];
    }

    this.englishNameCache.set(placeId, names);
    return names;
  }

  matchDomain(domain, {
    dryRun = false,
    minNavLinks = this.minNavLinks,
    minArticleLinks = this.minArticleLinks,
    hubStats = {},
    includeTopicHubs = false,
    requireHttpOk = true
  } = {}) {
    const host = normalizeHost(domain);
    if (!host) {
      throw new Error('matchDomain requires a domain or host');
    }

    const analysisBefore = this.analyzer.analyzeGaps(host, hubStats);
    const missingCountries = Array.isArray(analysisBefore.missingCountries)
      ? analysisBefore.missingCountries
      : [];

    const missingByPlaceId = new Map();
    const missingBySlug = new Map();
    const missingByCode = new Map();

    for (const country of missingCountries) {
      missingByPlaceId.set(country.placeId, country);
      const names = new Set();
      if (country.name) {
        names.add(country.name);
      }
      for (const altName of this.getAlternateNames(country.placeId)) {
        if (altName) names.add(altName);
      }
      for (const candidateName of names) {
        for (const key of generateMatchingKeys(candidateName)) {
          missingBySlug.set(key, country);
        }
      }
      if (country.code) {
        missingByCode.set(country.code.toUpperCase(), country);
      }
    }

    const candidates = getCountryHubCandidates(this.db, host, {
      includeTopicHubs,
      requireHttpOk
    });
    const actions = [];
    const skipped = [];
    const now = new Date().toISOString();

    for (const candidate of candidates) {
      const navLinks = candidate.navLinksCount ?? 0;
      const articleLinks = candidate.articleLinksCount ?? 0;
      const meetsNavThreshold = minNavLinks != null && navLinks >= minNavLinks;
      const meetsArticleThreshold = minArticleLinks != null && minArticleLinks > 0 && articleLinks >= minArticleLinks;
      if (!meetsNavThreshold && !meetsArticleThreshold) {
        skipped.push({
          candidate,
          reason: 'insufficient-evidence',
          navLinks,
          articleLinks
        });
        continue;
      }

      const rawSlug = candidate.placeSlug ? String(candidate.placeSlug).trim() : '';
      const derivedSlug = rawSlug ? slugify(rawSlug) : '';
      const normalizedSlug = rawSlug ? normalizeForMatching(rawSlug) : '';

      let target = null;
      if (derivedSlug && missingBySlug.has(derivedSlug)) {
        target = missingBySlug.get(derivedSlug);
      } else if (normalizedSlug && missingBySlug.has(normalizedSlug)) {
        target = missingBySlug.get(normalizedSlug);
      }

      if (!target && rawSlug) {
        const upperCode = rawSlug.toUpperCase();
        if (missingByCode.has(upperCode)) {
          target = missingByCode.get(upperCode);
        }
      }

      if (!target) {
        skipped.push({ candidate, reason: 'no-missing-country-match' });
        continue;
      }

      if (!missingByPlaceId.has(target.placeId)) {
        skipped.push({
          candidate,
          target,
          reason: 'already-linked'
        });
        continue;
      }

      const evidence = safeParseJson(candidate.evidence) || {};
      const evidenceRecord = {
        ...evidence,
        matcher: 'country-hub-matcher',
        matchedAt: now,
        source: 'match-country-hubs',
        navLinksCount: navLinks,
        articleLinksCount: articleLinks,
        placeHubId: candidate.id,
        placeSlug: rawSlug || null,
        candidateUrl: candidate.url,
        countryName: target.name,
        countryCode: target.code || null
      };

      if (!dryRun) {
        upsertPlacePageMapping(this.db, {
          placeId: target.placeId,
          host,
          url: candidate.url,
          publisher: host,
          status: 'verified',
          verifiedAt: now,
          evidence: evidenceRecord,
          hubId: candidate.id
        });
      }

      missingByPlaceId.delete(target.placeId);
      if (target.name) {
        missingBySlug.delete(slugify(target.name));
        missingBySlug.delete(normalizeForMatching(target.name));
      }
      if (target.code) {
        missingByCode.delete(target.code.toUpperCase());
      }

      actions.push({
        candidate,
        target,
        applied: !dryRun
      });
    }

    if (!dryRun) {
      this.analyzer.lastAnalysis = null;
      this.analyzer.lastAnalysisTime = 0;
    }

    const analysisAfter = dryRun
      ? analysisBefore
      : this.analyzer.analyzeGaps(host, hubStats);

    return {
      host,
      dryRun,
      actions,
      skipped,
      candidateCount: candidates.length,
      linkedCount: actions.filter((action) => action.applied).length,
      analysisBefore,
      analysisAfter
    };
  }
}

module.exports = {
  CountryHubMatcher
};

