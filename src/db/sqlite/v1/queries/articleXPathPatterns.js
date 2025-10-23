"use strict";

const { initializeSchema } = require("../schema");
const { safeParse, safeStringify } = require("./common");

const statementCache = new WeakMap();

function normalizePatternDomain(domain) {
  if (!domain) return null;
  const trimmed = String(domain).trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
}

function getStatements(db) {
  let statements = statementCache.get(db);
  if (!statements) {
    statements = {
      selectDomain: db.prepare("SELECT id FROM domains WHERE host = ?"),
      upsertPattern: db.prepare(`
        INSERT INTO article_xpath_patterns (
          domain,
          domain_id,
          xpath,
          confidence,
          learned_from,
          learned_at,
          sample_text_length,
          paragraph_count,
          usage_count,
          last_used_at,
          metadata
        ) VALUES (
          @domain,
          @domain_id,
          @xpath,
          @confidence,
          @learned_from,
          @learned_at,
          @sample_text_length,
          @paragraph_count,
          @usage_count,
          @last_used_at,
          @metadata
        )
        ON CONFLICT(domain, xpath) DO UPDATE SET
          confidence = COALESCE(excluded.confidence, article_xpath_patterns.confidence),
          learned_from = COALESCE(excluded.learned_from, article_xpath_patterns.learned_from),
          learned_at = COALESCE(excluded.learned_at, article_xpath_patterns.learned_at),
          sample_text_length = COALESCE(excluded.sample_text_length, article_xpath_patterns.sample_text_length),
          paragraph_count = COALESCE(excluded.paragraph_count, article_xpath_patterns.paragraph_count),
          metadata = COALESCE(excluded.metadata, article_xpath_patterns.metadata)
      `),
      selectPattern: db.prepare("SELECT * FROM article_xpath_patterns WHERE domain = ? AND xpath = ?"),
      selectPatternsForDomain: db.prepare(`
        SELECT *
        FROM article_xpath_patterns
        WHERE domain = ?
        ORDER BY usage_count DESC, confidence DESC, datetime(COALESCE(learned_at, '1970-01-01T00:00:00Z')) DESC, id DESC
      `),
      selectCount: db.prepare("SELECT COUNT(*) AS count FROM article_xpath_patterns"),
      updateUsage: db.prepare(`
        UPDATE article_xpath_patterns
        SET usage_count = usage_count + 1,
            last_used_at = COALESCE(@last_used_at, datetime('now'))
        WHERE domain = @domain AND xpath = @xpath
      `)
    };
    statementCache.set(db, statements);
  }
  return statements;
}

function ensureArticleXPathPatternSchema(db, { logger = console } = {}) {
  if (!db || typeof db.exec !== "function") {
    throw new Error("ensureArticleXPathPatternSchema requires a better-sqlite3 Database instance");
  }
  initializeSchema(db, { verbose: false, logger });
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_xpath_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      domain_id INTEGER REFERENCES domains(id),
      xpath TEXT NOT NULL,
      confidence REAL,
      learned_from TEXT,
      learned_at TEXT,
      sample_text_length INTEGER,
      paragraph_count INTEGER,
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_article_xpath_patterns_domain ON article_xpath_patterns(domain);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_article_xpath_patterns_domain_xpath ON article_xpath_patterns(domain, xpath);
  `);
  statementCache.delete(db);
}

function mapPatternRow(row) {
  if (!row) return null;
  const metadata = safeParse(row.metadata) || {};
  return {
    id: row.id,
    domain: row.domain,
    domainId: row.domain_id != null ? Number(row.domain_id) : null,
    xpath: row.xpath,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    learnedFrom: row.learned_from || null,
    learnedAt: row.learned_at || null,
    sampleTextLength: row.sample_text_length != null ? Number(row.sample_text_length) : null,
    paragraphCount: row.paragraph_count != null ? Number(row.paragraph_count) : null,
    usageCount: row.usage_count != null ? Number(row.usage_count) : 0,
    lastUsedAt: row.last_used_at || null,
    alternatives: Array.isArray(metadata.alternatives) ? metadata.alternatives : [],
    metadata
  };
}

function findDomainId(db, domain) {
  const statements = getStatements(db);
  const variants = [domain, `www.${domain}`];
  for (const variant of variants) {
    const row = statements.selectDomain.get(variant);
    if (row && row.id != null) {
      return Number(row.id);
    }
  }
  return null;
}

function upsertArticleXPathPattern(db, pattern) {
  ensureArticleXPathPatternSchema(db);
  if (!pattern || !pattern.domain || !pattern.xpath) {
    throw new Error("upsertArticleXPathPattern requires domain and xpath");
  }
  const normalizedDomain = normalizePatternDomain(pattern.domain);
  if (!normalizedDomain) {
    throw new Error("Invalid domain supplied to upsertArticleXPathPattern");
  }
  const now = new Date().toISOString();
  const statements = getStatements(db);
  const metadata = safeStringify(pattern.metadata || { alternatives: pattern.alternatives || [] });
  const record = {
    domain: normalizedDomain,
    domain_id: findDomainId(db, normalizedDomain),
    xpath: pattern.xpath,
    confidence: pattern.confidence != null ? Number(pattern.confidence) : null,
    learned_from: pattern.learnedFrom || null,
    learned_at: pattern.learnedAt || now,
    sample_text_length: pattern.sampleTextLength != null ? Number(pattern.sampleTextLength) : null,
    paragraph_count: pattern.paragraphCount != null ? Number(pattern.paragraphCount) : null,
    usage_count: pattern.usageCount != null ? Number(pattern.usageCount) : 0,
    last_used_at: pattern.lastUsedAt || null,
    metadata
  };
  statements.upsertPattern.run(record);
  const row = statements.selectPattern.get(normalizedDomain, pattern.xpath);
  return mapPatternRow(row);
}

function getArticleXPathPatternsForDomain(db, domain, { limit } = {}) {
  ensureArticleXPathPatternSchema(db);
  const normalizedDomain = normalizePatternDomain(domain);
  if (!normalizedDomain) return [];
  const statements = getStatements(db);
  let rows = statements.selectPatternsForDomain.all(normalizedDomain);
  if (limit != null) {
    rows = rows.slice(0, Math.max(0, limit));
  }
  return rows.map(mapPatternRow);
}

function recordArticleXPathPatternUsage(db, domain, xpath, { at } = {}) {
  ensureArticleXPathPatternSchema(db);
  const normalizedDomain = normalizePatternDomain(domain);
  if (!normalizedDomain || !xpath) return false;
  const statements = getStatements(db);
  const result = statements.updateUsage.run({
    domain: normalizedDomain,
    xpath,
    last_used_at: at || new Date().toISOString()
  });
  return result.changes > 0;
}

function getArticleXPathPatternCount(db) {
  ensureArticleXPathPatternSchema(db);
  const statements = getStatements(db);
  const row = statements.selectCount.get();
  return row && row.count != null ? Number(row.count) : 0;
}

module.exports = {
  ensureArticleXPathPatternSchema,
  getArticleXPathPatternsForDomain,
  upsertArticleXPathPattern,
  recordArticleXPathPatternUsage,
  getArticleXPathPatternCount,
  normalizePatternDomain
};
