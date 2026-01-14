'use strict';

const fs = require('fs');
const path = require('path');
const { ensureGazetteer, ensureDb } = require('../data/db/sqlite/v1');
const { findProjectRoot } = require('../shared/utils/project-root');

function resolveDefaultDatasetPath() {
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'bootstrap', 'bootstrap-db.json');
}

function readDatasetFromFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new TypeError('readDatasetFromFile requires a filePath string');
  }
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Dataset JSON must be an object');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse dataset JSON: ${err?.message || err}`);
  }
}

function normalizeTerm(value) {
  if (value == null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .trim();
}

function sanitizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item != null).map((item) => String(item));
  return [String(value)];
}

function ensureBootstrapSource(db, { name = 'bootstrap-db', version = null, url = null, license = 'internal' } = {}) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO place_sources(name, version, url, license)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(name, version, url, license);
}

function isBootstrapSafeToRun(db, { sourcePrefix = 'bootstrap-db' } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('isBootstrapSafeToRun requires an open better-sqlite3 Database');
  }
  const likeValue = `${sourcePrefix}%`;

  const selectTotals = (sql) => {
    const row = db.prepare(sql).get(likeValue) || {};
    return {
      total: Number(row.total || 0),
      bootstrap: Number(row.bootstrap || 0)
    };
  };

  const countries = selectTotals(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN IFNULL(source, '') LIKE ? THEN 1 ELSE 0 END) AS bootstrap
    FROM places
    WHERE kind = 'country'
  `);

  const topics = selectTotals(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN IFNULL(source, '') LIKE ? THEN 1 ELSE 0 END) AS bootstrap
    FROM topic_keywords
  `);

  const skipTerms = selectTotals(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN IFNULL(source, '') LIKE ? THEN 1 ELSE 0 END) AS bootstrap
    FROM crawl_skip_terms
  `);

  return (
    countries.total === countries.bootstrap &&
    topics.total === topics.bootstrap &&
    skipTerms.total === skipTerms.bootstrap
  );
}

function loadBootstrapData({ db, dataset, source = 'bootstrap-db@1.0', logger = console } = {}) {
  if (!db) {
    throw new Error('loadBootstrapData requires an open better-sqlite3 Database');
  }
  ensureGazetteer(db);

  if (!dataset || typeof dataset !== 'object') {
    throw new TypeError('loadBootstrapData requires a dataset object');
  }

  const countries = Array.isArray(dataset.countries) ? dataset.countries : [];
  const topics = Array.isArray(dataset.topics) ? dataset.topics : [];
  const skipTerms = dataset.skipTerms && typeof dataset.skipTerms === 'object' ? dataset.skipTerms : {};

  ensureBootstrapSource(db, {
    name: 'bootstrap-db',
    version: dataset.version || null,
    url: dataset.url || null,
    license: dataset.license || 'internal'
  });

  const getCountryStmt = db.prepare(`SELECT id FROM places WHERE kind='country' AND country_code = ?`);
  const insertCountryStmt = db.prepare(`
    INSERT INTO places(kind, country_code, population, timezone, lat, lng, bbox, canonical_name_id, source, extra, status)
    VALUES ('country', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, 'current')
  `);
  const updateCountryStmt = db.prepare(`
    UPDATE places
    SET source = ?,
        extra = ?,
        status = 'current'
    WHERE id = ?
  `);
  const insertNameStmt = db.prepare(`
    INSERT OR IGNORE INTO place_names(place_id, name, normalized, lang, script, name_kind, is_preferred, is_official, source)
    VALUES (@placeId, @name, @normalized, @lang, NULL, @nameKind, @isPreferred, @isOfficial, @source)
  `);
  const selectNameStmt = db.prepare(`
    SELECT id FROM place_names
    WHERE place_id = ?
      AND normalized = ?
      AND IFNULL(lang, '') = IFNULL(?, '')
      AND IFNULL(name_kind, '') = IFNULL(?, '')
    LIMIT 1
  `);
  const updateCanonicalStmt = db.prepare(`UPDATE places SET canonical_name_id = ? WHERE id = ?`);
  const selectBestNameStmt = db.prepare(`
    SELECT id FROM place_names
    WHERE place_id = ?
    ORDER BY is_official DESC, is_preferred DESC, (lang = 'en') DESC, id ASC
    LIMIT 1
  `);
  const insertTopicStmt = db.prepare(`
    INSERT INTO topic_keywords(topic, lang, term, normalized, source, metadata)
    VALUES (@topic, @lang, @term, @normalized, @source, @metadata)
    ON CONFLICT(topic, lang, normalized)
    DO UPDATE SET term = excluded.term, source = excluded.source, metadata = excluded.metadata
  `);
  const getTopicStmt = db.prepare(`
    SELECT id FROM topic_keywords WHERE topic = ? AND lang = ? AND normalized = ?
  `);
  const insertSkipStmt = db.prepare(`
    INSERT INTO crawl_skip_terms(lang, term, normalized, reason, source, metadata)
    VALUES (@lang, @term, @normalized, @reason, @source, @metadata)
    ON CONFLICT(lang, normalized)
    DO UPDATE SET term = excluded.term, reason = excluded.reason, source = excluded.source, metadata = excluded.metadata
  `);
  const getSkipStmt = db.prepare(`
    SELECT id FROM crawl_skip_terms WHERE lang = ? AND normalized = ?
  `);

  const summary = {
    source,
    version: dataset.version || null,
    countries: {
      attempted: countries.length,
      inserted: 0,
      updated: 0,
      namesInserted: 0,
      canonicalUpdated: 0,
      codes: []
    },
    topics: {
      attempted: topics.length,
      inserted: 0,
      updated: 0,
      totalTerms: 0
    },
    skipTerms: {
      attempted: Object.keys(skipTerms).length,
      inserted: 0,
      updated: 0,
      totalTerms: 0
    }
  };

  const run = db.transaction(() => {
    for (const entry of countries) {
      if (!entry || typeof entry !== 'object') continue;
      const code = String(entry.code || '').trim().toUpperCase();
      if (!code) continue;

      const existing = getCountryStmt.get(code);
      const extraPayload = {
        dataset: source,
        version: dataset.version || null,
        continent: entry.continent || null,
        region: entry.region || null,
        subregion: entry.subregion || null,
        capital: entry.capital || null
      };
      const extraJson = JSON.stringify(extraPayload);
      let placeId;
      if (existing && existing.id) {
        updateCountryStmt.run(source, extraJson, existing.id);
        summary.countries.updated += 1;
        placeId = existing.id;
      } else {
        const info = insertCountryStmt.run(code, source, extraJson);
        summary.countries.inserted += 1;
        placeId = info.lastInsertRowid;
      }
      summary.countries.codes.push(code);

      const namesByLang = entry.names && typeof entry.names === 'object' ? entry.names : {};
      let canonicalCandidate = null;
      for (const [langKey, langValues] of Object.entries(namesByLang)) {
        const lang = String(langKey || '').trim().toLowerCase() || null;
        const { common = [], official = [], aliases = [] } = langValues || {};
        const commonList = sanitizeArray(common);
        const officialList = sanitizeArray(official);
        const aliasList = sanitizeArray(aliases);
        for (const value of officialList) {
          const name = value.trim();
          if (!name) continue;
          const normalized = normalizeTerm(name);
          if (!normalized) continue;
          const payload = {
            placeId,
            name,
            normalized,
            lang,
            nameKind: 'official',
            isPreferred: 1,
            isOfficial: 1,
            source
          };
          const info = insertNameStmt.run(payload);
          if (info.changes > 0) {
            summary.countries.namesInserted += 1;
          }
          const inserted = selectNameStmt.get(placeId, normalized, lang, 'official');
          if (!canonicalCandidate && inserted) {
            canonicalCandidate = inserted.id;
          }
        }
        for (const value of commonList) {
          const name = value.trim();
          if (!name) continue;
          const normalized = normalizeTerm(name);
          if (!normalized) continue;
          const payload = {
            placeId,
            name,
            normalized,
            lang,
            nameKind: 'common',
            isPreferred: 1,
            isOfficial: 0,
            source
          };
          const info = insertNameStmt.run(payload);
          if (info.changes > 0) {
            summary.countries.namesInserted += 1;
          }
          if (!canonicalCandidate) {
            const inserted = selectNameStmt.get(placeId, normalized, lang, 'common');
            if (inserted) {
              canonicalCandidate = inserted.id;
            }
          }
        }
        for (const value of aliasList) {
          const name = value.trim();
          if (!name) continue;
          const normalized = normalizeTerm(name);
          if (!normalized) continue;
          const payload = {
            placeId,
            name,
            normalized,
            lang,
            nameKind: 'alias',
            isPreferred: 0,
            isOfficial: 0,
            source
          };
          const info = insertNameStmt.run(payload);
          if (info.changes > 0) {
            summary.countries.namesInserted += 1;
          }
        }
      }
      const best = canonicalCandidate || (selectBestNameStmt.get(placeId)?.id || null);
      if (best) {
        updateCanonicalStmt.run(best, placeId);
        summary.countries.canonicalUpdated += 1;
      }
    }

    for (const topic of topics) {
      if (!topic || typeof topic !== 'object') continue;
      const topicId = String(topic.id || topic.topic || '').trim();
      if (!topicId) continue;
      const labels = topic.labels && typeof topic.labels === 'object' ? topic.labels : {};
      const metadata = topic.metadata ? JSON.stringify(topic.metadata) : null;
      for (const [langKey, terms] of Object.entries(labels)) {
        const lang = String(langKey || '').trim().toLowerCase();
        if (!lang) continue;
        const values = sanitizeArray(terms);
        for (const term of values) {
          const normalized = normalizeTerm(term);
          if (!normalized) continue;
          const existing = getTopicStmt.get(topicId, lang, normalized);
          insertTopicStmt.run({
            topic: topicId,
            lang,
            term: term.trim(),
            normalized,
            source,
            metadata
          });
          summary.topics.totalTerms += 1;
          if (existing && existing.id) {
            summary.topics.updated += 1;
          } else {
            summary.topics.inserted += 1;
          }
        }
      }
    }

    for (const [langKey, terms] of Object.entries(skipTerms)) {
      const lang = String(langKey || '').trim().toLowerCase();
      if (!lang) continue;
      const entries = Array.isArray(terms) ? terms : [];
      for (const entry of entries) {
        if (!entry) continue;
        const term = String(entry.term || '').trim();
        if (!term) continue;
        const normalized = normalizeTerm(term);
        if (!normalized) continue;
        const reason = entry.reason ? String(entry.reason) : null;
        const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;
        const existing = getSkipStmt.get(lang, normalized);
        insertSkipStmt.run({
          lang,
          term,
          normalized,
          reason,
          source,
          metadata
        });
        summary.skipTerms.totalTerms += 1;
        if (existing && existing.id) {
          summary.skipTerms.updated += 1;
        } else {
          summary.skipTerms.inserted += 1;
        }
      }
    }
  });

  run();

  if (logger && typeof logger.info === 'function') {
    try {
      logger.info('[bootstrap-db] load summary', summary);
    } catch (_) {
      /* ignore logger failures */
    }
  }

  return summary;
}

function loadBootstrapDataFromFile({ dbPath = null, db = null, datasetPath = null, source = 'bootstrap-db@1.0', logger = console } = {}) {
  let database = db;
  if (!database) {
    const resolvedDbPath = dbPath || resolveDefaultDbPath();
    database = ensureDb(resolvedDbPath);
  }
  const resolvedDataset = datasetPath || resolveDefaultDatasetPath();
  const payload = readDatasetFromFile(resolvedDataset);
  return loadBootstrapData({ db: database, dataset: payload, source, logger });
}

function resolveDefaultDbPath() {
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'news.db');
}

module.exports = {
  readDatasetFromFile,
  resolveDefaultDatasetPath,
  resolveDefaultDbPath,
  loadBootstrapData,
  loadBootstrapDataFromFile,
  isBootstrapSafeToRun
};
