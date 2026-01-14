"use strict";

const path = require("path");
const cheerio = require("cheerio");

const { ArticleXPathAnalyzer } = require("../shared/utils/ArticleXPathAnalyzer");
const { extractDomain, loadDxplLibrary, getDxplForDomain } = require('./shared/dxpl");

const DEFAULT_MAX_PATTERNS_PER_DOMAIN = 6;
const DEFAULT_PRELOAD_LIMIT = 25;
const MINIMUM_TEXT_LENGTH = 50;

function sortPatterns(patterns) {
  return [...patterns].sort((a, b) => {
    const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;
    const usageDelta = (b.usageCount ?? 0) - (a.usageCount ?? 0);
    if (usageDelta !== 0) return usageDelta;
    const learnedDelta =
      new Date(b.learnedAt || 0).getTime() - new Date(a.learnedAt || 0).getTime();
    if (learnedDelta !== 0) return learnedDelta;
    return (b.id ?? 0) - (a.id ?? 0);
  });
}

function dedupePatterns(patterns) {
  const seen = new Set();
  const deduped = [];
  for (const pattern of patterns) {
    const key = pattern?.xpath;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(pattern);
  }
  return deduped;
}

function normalizeDomainOrNull(domain, queries) {
  if (!domain) return null;
  try {
    return queries.normalizePatternDomain(domain);
  } catch {
    return null;
  }
}

class ArticleXPathService {
  constructor({
    db,
    logger = console,
    analyzerOptions = {},
    maxPatternsPerDomain = DEFAULT_MAX_PATTERNS_PER_DOMAIN,
    preloadDomains = DEFAULT_PRELOAD_LIMIT,
    dxplDir = path.join(__dirname, "..", "..", "data", "dxpls"),
    migrateLegacyDxpl = false
  } = {}) {
    if (!db) {
      throw new Error("ArticleXPathService requires a database connection");
    }

    this.db = db;
    this.logger = logger;
    this.maxPatternsPerDomain =
      Math.max(1, Number(maxPatternsPerDomain) || DEFAULT_MAX_PATTERNS_PER_DOMAIN);
    this.analyzerOptions = { limit: 3, verbose: false, ...analyzerOptions };
    this.dxplDir = dxplDir;
    this.cache = new Map();
    this.cacheStats = { hits: 0, misses: 0, warmLoads: 0, refreshes: 0, migrations: 0 };
    this._legacyDxplMap = undefined;

    this.queries = this.db.createArticleXPathPatternQueries();
    this.queries.ensureArticleXPathPatternSchema({ logger: this.logger });

    if (preloadDomains && preloadDomains > 0) {
      this._warmCache(Math.min(Number(preloadDomains) || DEFAULT_PRELOAD_LIMIT, 500)).catch(err => {
        this.logger?.warn?.(`[xpath-service] Cache warming failed: ${err.message}`);
      });
    }

    if (migrateLegacyDxpl) {
      this._migrateLegacyDxplLibrary().catch(err => {
        this.logger?.warn?.(`[xpath-service] Legacy DXPL migration failed: ${err.message}`);
      });
    }
  }

  async getXPathForDomain(domain) {
    const entry = await this._getCacheEntry(domain);
    if (!entry || entry.patterns.length === 0) {
      return null;
    }
    return entry.patterns[0];
  }

  async learnXPathFromHtml(url, html) {
    const domain = extractDomain(url);
    if (!domain) {
      this.logger?.warn?.(`[xpath-service] Invalid URL for learning: ${url}`);
      return null;
    }

    const analyzer = new ArticleXPathAnalyzer(this.analyzerOptions);
    const result = await analyzer.analyzeHtml(html);
    return this._processAnalysisResult(result, domain, url);
  }

  async learnXPathFromDocument(url, document) {
    const domain = extractDomain(url);
    if (!domain) {
      this.logger?.warn?.(`[xpath-service] Invalid URL for learning: ${url}`);
      return null;
    }

    const analyzer = new ArticleXPathAnalyzer(this.analyzerOptions);
    const result = analyzer.analyzeDocument(document);
    return this._processAnalysisResult(result, domain, url);
  }

  async _processAnalysisResult(result, domain, url) {
    const topPattern = result?.topPatterns?.[0];
    if (!topPattern || !topPattern.xpath) {
      this.logger?.warn?.(`[xpath-service] No XPath patterns discovered for ${url}`);
      return null;
    }

    const alternatives = Array.isArray(topPattern.alternatives)
      ? topPattern.alternatives
      : [];

    const patternRecord = {
      domain,
      xpath: topPattern.xpath,
      confidence: topPattern.confidence ?? null,
      learnedFrom: url,
      learnedAt: new Date().toISOString(),
      sampleTextLength: topPattern.stats?.chars ?? null,
      paragraphCount: topPattern.stats?.paras ?? null,
      usageCount: 0,
      alternatives,
      metadata: { alternatives }
    };

    const persisted = await this.queries.upsertArticleXPathPattern(patternRecord);
    if (!persisted) {
      return null;
    }

    this._applyPatternToCache(domain, persisted);
    const confidencePercent = Math.round((persisted.confidence ?? 0) * 100);
    this.logger?.log?.(
      `[xpath-service] Learned XPath for ${persisted.domain}: ${persisted.xpath} (${confidencePercent}% confidence)`
    );
    return persisted;
  }

  async extractTextWithXPath(url, html) {
    const domain = extractDomain(url);
    if (!domain) return null;

    const entry = await this._getCacheEntry(domain);
    if (!entry || entry.patterns.length === 0) {
      return null;
    }

    for (const pattern of entry.patterns) {
      const tried = new Set();
      const candidateXpaths = [pattern.xpath, ...(pattern.alternatives || [])];
      for (const candidate of candidateXpaths) {
        if (!candidate || tried.has(candidate)) continue;
        tried.add(candidate);
        const extracted = this._extractWithXPath(html, candidate);
        if (this._isAcceptableExtract(extracted)) {
          const patternDomain = pattern.domain || domain;
          await this._recordUsage(patternDomain, pattern.xpath);
          this._touchCachePattern(patternDomain, pattern.xpath);
          return extracted.trim();
        }
      }
    }

    return null;
  }

  async hasXPathForDomain(domain) {
    const entry = await this._getCacheEntry(domain);
    return Boolean(entry && entry.patterns.length > 0);
  }

  getCacheStats() {
    return { ...this.cacheStats, size: this.cache.size };
  }

  migrateLegacyDxplLibrary() {
    this._migrateLegacyDxplLibrary();
  }

  async _warmCache(limit) {
    try {
      // Use the query interface to get top domains
      if (typeof this.queries.getTopDomains === 'function') {
        const rows = await this.queries.getTopDomains(Math.max(1, Number(limit) || DEFAULT_PRELOAD_LIMIT));
        for (const row of rows) {
          await this._getCacheEntry(row.domain);
        }
        this.cacheStats.warmLoads += rows.length;
      }
    } catch (error) {
      this.logger?.warn?.(`[xpath-service] Failed to warm cache: ${error.message}`);
    }
  }

  async _getCacheEntry(domain) {
    const normalized = normalizeDomainOrNull(domain, this.queries);
    if (!normalized) {
      return null;
    }

    const existing = this.cache.get(normalized);
    if (existing) {
      this.cacheStats.hits += 1;
      existing.lastAccessedAt = Date.now();
      return existing;
    }

    this.cacheStats.misses += 1;
    const patterns = await this._loadPatternsForDomain(normalized);
    const entry = {
      domain: normalized,
      patterns,
      lastAccessedAt: Date.now()
    };
    this.cache.set(normalized, entry);
    return entry;
  }

  async _loadPatternsForDomain(domain) {
    let patterns = await this.queries.getArticleXPathPatternsForDomain(domain, {
      limit: this.maxPatternsPerDomain * 2
    });

    if (patterns.length === 0 && this.dxplDir) {
      const imported = await this._importLegacyDxplForDomain(domain);
      if (imported.length > 0) {
        patterns = await this.queries.getArticleXPathPatternsForDomain(domain, {
          limit: this.maxPatternsPerDomain * 2
        });
      }
    }

    const deduped = dedupePatterns(patterns);
    return sortPatterns(deduped).slice(0, this.maxPatternsPerDomain);
  }

  _applyPatternToCache(domain, pattern) {
    const normalized = normalizeDomainOrNull(domain, this.queries);
    if (!normalized) return;

    const entry = this.cache.get(normalized) || {
      domain: normalized,
      patterns: [],
      lastAccessedAt: Date.now()
    };

    const index = entry.patterns.findIndex((p) => p.xpath === pattern.xpath);
    if (index >= 0) {
      entry.patterns[index] = pattern;
    } else {
      entry.patterns.push(pattern);
    }

    entry.patterns = sortPatterns(dedupePatterns(entry.patterns)).slice(
      0,
      this.maxPatternsPerDomain
    );
    entry.lastAccessedAt = Date.now();
    this.cache.set(normalized, entry);
    this.cacheStats.refreshes += 1;
  }

  _recordUsage(domain, xpath) {
    try {
      this.queries.recordArticleXPathPatternUsage(domain, xpath, {
        at: new Date().toISOString()
      });
    } catch (error) {
      this.logger?.warn?.(`[xpath-service] Failed to record usage: ${error.message}`);
    }
  }

  _touchCachePattern(domain, xpath) {
    const normalized = normalizeDomainOrNull(domain, this.queries);
    if (!normalized) return;
    const entry = this.cache.get(normalized);
    if (!entry) return;

    entry.patterns = entry.patterns.map((pattern) => {
      if (pattern.xpath !== xpath) return pattern;
      return {
        ...pattern,
        usageCount: (pattern.usageCount ?? 0) + 1,
        lastUsedAt: new Date().toISOString()
      };
    });

    entry.patterns = sortPatterns(entry.patterns);
    this.cache.set(normalized, entry);
  }

  async _migrateLegacyDxplLibrary() {
    const dxplMap = this._getLegacyDxplMap();
    if (!dxplMap || dxplMap.size === 0) {
      return;
    }

    const processed = new Set();
    let importedCount = 0;
    for (const [domain, dxpl] of dxplMap.entries()) {
      const normalized = normalizeDomainOrNull(domain, this.queries);
      if (!normalized || processed.has(normalized)) continue;
      processed.add(normalized);

      if (!dxpl || !Array.isArray(dxpl.articleXPathPatterns)) continue;
      for (const pattern of dxpl.articleXPathPatterns) {
        const alternatives = Array.isArray(pattern.alternatives) ? pattern.alternatives : [];
        const prepared = {
          domain: normalized,
          xpath: pattern.xpath,
          confidence: pattern.confidence ?? null,
          learnedFrom: pattern.learnedFrom || pattern.learned_from || null,
          learnedAt: pattern.learnedAt || pattern.learned_at || null,
          sampleTextLength: pattern.sampleTextLength || pattern.sample_text_length || null,
          paragraphCount: pattern.paragraphCount || pattern.paragraph_count || null,
          usageCount: pattern.usageCount || pattern.usage_count || 0,
          lastUsedAt: pattern.lastUsedAt || pattern.last_used_at || null,
          alternatives,
          metadata: { alternatives }
        };

        if (!prepared.xpath) continue;

        const persisted = await this.queries.upsertArticleXPathPattern(prepared);
        if (persisted) {
          this._applyPatternToCache(normalized, persisted);
          importedCount += 1;
        }
      }
    }

    if (importedCount > 0) {
      this.cacheStats.migrations += importedCount;
      this.logger?.log?.(
        `[xpath-service] Migrated ${importedCount} legacy DXPL pattern(s) into the database`
      );
    }
  }

  async _importLegacyDxplForDomain(domain) {
    const dxplMap = this._getLegacyDxplMap();
    if (!dxplMap) return [];

    const entry = getDxplForDomain(dxplMap, domain);
    if (!entry || !Array.isArray(entry.articleXPathPatterns)) {
      return [];
    }

    const persisted = [];
    for (const pattern of entry.articleXPathPatterns) {
      if (!pattern.xpath) continue;
      const alternatives = Array.isArray(pattern.alternatives) ? pattern.alternatives : [];
      const prepared = {
        domain,
        xpath: pattern.xpath,
        confidence: pattern.confidence ?? null,
        learnedFrom: pattern.learnedFrom || pattern.learned_from || null,
        learnedAt: pattern.learnedAt || pattern.learned_at || null,
        sampleTextLength: pattern.sampleTextLength || pattern.sample_text_length || null,
        paragraphCount: pattern.paragraphCount || pattern.paragraph_count || null,
        usageCount: pattern.usageCount || pattern.usage_count || 0,
        lastUsedAt: pattern.lastUsedAt || pattern.last_used_at || null,
        alternatives,
        metadata: { alternatives }
      };
      const stored = await this.queries.upsertArticleXPathPattern(prepared);
      if (stored) {
        persisted.push(stored);
        this._applyPatternToCache(domain, stored);
      }
    }

    if (persisted.length > 0) {
      this.logger?.log?.(
        `[xpath-service] Imported ${persisted.length} legacy DXPL pattern(s) for ${domain}`
      );
    }

    return persisted;
  }

  _getLegacyDxplMap() {
    if (!this.dxplDir) return null;
    if (this._legacyDxplMap === undefined) {
      try {
        this._legacyDxplMap = loadDxplLibrary({
          dxplDir: this.dxplDir,
          logger: this.logger
        });
      } catch (error) {
        this.logger?.warn?.(
          `[xpath-service] Failed to load legacy DXPL library: ${error.message}`
        );
        this._legacyDxplMap = null;
      }
    }
    return this._legacyDxplMap;
  }

  _extractWithXPath(html, xpath) {
    const cssSelector = this._xpathToCssSelector(xpath);
    if (!cssSelector) return null;

    try {
      const $ = cheerio.load(html, {
        decodeEntities: false,
        lowerCaseAttributeNames: false,
        lowerCaseTags: false
      });

      const node = $(cssSelector).first();
      if (!node || node.length === 0) return null;

      const text = node.text();
      if (this._isAcceptableExtract(text)) {
        return text;
      }

      const htmlContent = node.html();
      return this._isAcceptableExtract(htmlContent) ? htmlContent : null;
    } catch (error) {
      this.logger?.debug?.(
        `[xpath-service] Cheerio extraction failed for ${xpath}: ${error.message}`
      );
      return null;
    }
  }

  _isAcceptableExtract(value) {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed.length >= MINIMUM_TEXT_LENGTH;
  }

  _xpathToCssSelector(xpath) {
    if (!xpath || typeof xpath !== "string") return null;

    // Handle //*[@id="..."] syntax -> #id
    const idMatch = xpath.match(/\/\/\*\[@id=["']([^"']+)["']\]/);
    if (idMatch) {
      return `#${idMatch[1]}`;
    }

    // Handle //tagname[@id="..."] syntax -> tagname#id
    const tagIdMatch = xpath.match(/\/\/(\w+)\[@id=["']([^"']+)["']\]/);
    if (tagIdMatch) {
      return `${tagIdMatch[1]}#${tagIdMatch[2]}`;
    }

    // Handle [@class="..."] or [contains(@class, "...")] patterns
    const classMatch = xpath.match(/\/\/\*\[@class=["']([^"']+)["']\]/);
    if (classMatch) {
      return `.${classMatch[1].split(/\s+/).join(".")}`;
    }

    // Handle [data-*="..."] patterns
    const dataAttrMatch = xpath.match(/\/\/\*\[@(data-[a-z-]+)=["']([^"']+)["']\]/);
    if (dataAttrMatch) {
      return `[${dataAttrMatch[1]}="${dataAttrMatch[2]}"]`;
    }

    if (xpath.startsWith("/html/body/")) {
      const parts = xpath.replace("/html/body/", "").split("/");
      return parts
        .map((part) => {
          if (!part) return null;
          if (part.includes("[")) {
            const [tag, indexPart] = part.split("[");
            const idx = Number.parseInt(indexPart.replace("]", ""), 10);
            if (Number.isNaN(idx) || idx <= 0) return tag;
            return idx === 1 ? tag : `${tag}:nth-child(${idx})`;
          }
          return part;
        })
        .filter(Boolean)
        .join(" > ");
    }

    if (xpath === "/body/main/article") return "body > main > article";
    if (xpath === "/html/body/main/article") return "main > article";
    return null;
  }
}

module.exports = { ArticleXPathService };
