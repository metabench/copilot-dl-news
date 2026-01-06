"use strict";

const { safeParse, safeStringify } = require("./common");

function normalizePatternDomain(domain) {
  if (!domain) return null;
  const trimmed = String(domain).trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
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

async function ensureArticleXPathPatternSchema(pool, { logger = console } = {}) {
  // Schema should be handled by migrations/ensureDb, but we can check/create if needed.
  // For now, assume schema exists or is created by ensureDb.
  // PostgresNewsDatabase handles schema init.
}

async function findDomainId(pool, domain) {
  const variants = [domain, `www.${domain}`];
  const res = await pool.query('SELECT id FROM domains WHERE host = ANY($1)', [variants]);
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

async function upsertArticleXPathPattern(pool, pattern) {
  if (!pattern || !pattern.domain || !pattern.xpath) {
    throw new Error("upsertArticleXPathPattern requires domain and xpath");
  }
  const normalizedDomain = normalizePatternDomain(pattern.domain);
  if (!normalizedDomain) {
    throw new Error("Invalid domain supplied to upsertArticleXPathPattern");
  }
  const now = new Date().toISOString();
  const metadata = safeStringify(pattern.metadata || { alternatives: pattern.alternatives || [] });
  
  const domainId = await findDomainId(pool, normalizedDomain);

  const sql = `
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(domain, xpath) DO UPDATE SET
      confidence = COALESCE(EXCLUDED.confidence, article_xpath_patterns.confidence),
      learned_from = COALESCE(EXCLUDED.learned_from, article_xpath_patterns.learned_from),
      learned_at = COALESCE(EXCLUDED.learned_at, article_xpath_patterns.learned_at),
      sample_text_length = COALESCE(EXCLUDED.sample_text_length, article_xpath_patterns.sample_text_length),
      paragraph_count = COALESCE(EXCLUDED.paragraph_count, article_xpath_patterns.paragraph_count),
      metadata = COALESCE(EXCLUDED.metadata, article_xpath_patterns.metadata)
    RETURNING *
  `;
  
  const res = await pool.query(sql, [
    normalizedDomain,
    domainId,
    pattern.xpath,
    pattern.confidence != null ? Number(pattern.confidence) : null,
    pattern.learnedFrom || null,
    pattern.learnedAt || now,
    pattern.sampleTextLength != null ? Number(pattern.sampleTextLength) : null,
    pattern.paragraphCount != null ? Number(pattern.paragraphCount) : null,
    pattern.usageCount != null ? Number(pattern.usageCount) : 0,
    pattern.lastUsedAt || null,
    metadata
  ]);
  
  return mapPatternRow(res.rows[0]);
}

async function getArticleXPathPatternsForDomain(pool, domain, { limit } = {}) {
  const normalizedDomain = normalizePatternDomain(domain);
  if (!normalizedDomain) return [];
  
  let sql = `
    SELECT *
    FROM article_xpath_patterns
    WHERE domain = $1
    ORDER BY usage_count DESC, confidence DESC, COALESCE(learned_at, '1970-01-01T00:00:00Z') DESC, id DESC
  `;
  const params = [normalizedDomain];
  
  if (limit != null) {
    sql += ' LIMIT $2';
    params.push(Math.max(0, limit));
  }
  
  const res = await pool.query(sql, params);
  return res.rows.map(mapPatternRow);
}

async function recordArticleXPathPatternUsage(pool, domain, xpath, { at } = {}) {
  const normalizedDomain = normalizePatternDomain(domain);
  if (!normalizedDomain || !xpath) return false;
  
  const sql = `
    UPDATE article_xpath_patterns
    SET usage_count = usage_count + 1,
        last_used_at = COALESCE($3, NOW())
    WHERE domain = $1 AND xpath = $2
  `;
  const res = await pool.query(sql, [normalizedDomain, xpath, at || new Date().toISOString()]);
  return res.rowCount > 0;
}

async function getArticleXPathPatternCount(pool) {
  const res = await pool.query("SELECT COUNT(*) AS count FROM article_xpath_patterns");
  return res.rows[0] ? Number(res.rows[0].count) : 0;
}

async function getTopDomains(pool, limit) {
  const res = await pool.query(`
    SELECT domain
    FROM article_xpath_patterns
    GROUP BY domain
    ORDER BY MAX(usage_count) DESC, COUNT(*) DESC
    LIMIT $1
  `, [limit]);
  return res.rows;
}

module.exports = {
  ensureArticleXPathPatternSchema,
  getArticleXPathPatternsForDomain,
  upsertArticleXPathPattern,
  recordArticleXPathPatternUsage,
  getArticleXPathPatternCount,
  normalizePatternDomain,
  getTopDomains
};
