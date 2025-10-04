'use strict';

const cheerio = require('cheerio');
const { tokenize, extractKeyPhrases } = require('../../analysis/deep-analyzer');

function uniqueUrls(urls = []) {
  const seen = new Set();
  const result = [];
  for (const candidate of urls) {
    if (!candidate || typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function safeUrlSection(url) {
  try {
    const parsed = new URL(url);
    const parts = (parsed.pathname || '/').split('/').filter(Boolean);
    return parts.length ? parts[0].toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

function selectContainer($) {
  const article = $('article').first();
  if (article && article.length) return article;
  const main = $('main').first();
  if (main && main.length) return main;
  const content = $('[data-role="article"], .article, #article').first();
  if (content && content.length) return content;
  return $('body');
}

function normaliseWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

class TargetedAnalysisRunner {
  constructor({
    fetchPage,
    getCachedArticle,
    baseUrl,
    domain,
    maxSamples = 3,
    logger = console
  } = {}) {
    if (typeof fetchPage !== 'function') {
      throw new Error('TargetedAnalysisRunner requires fetchPage function');
    }
    if (typeof getCachedArticle !== 'function') {
      throw new Error('TargetedAnalysisRunner requires getCachedArticle function');
    }
    this.fetchPage = fetchPage;
    this.getCachedArticle = getCachedArticle;
    this.baseUrl = baseUrl || null;
    this.domain = domain || null;
    this.maxSamples = Math.max(1, Math.min(5, Number.isFinite(maxSamples) ? maxSamples : 3));
    this.logger = logger;
  }

  async run({ seeds = [], sections = [], articleHints = [] } = {}) {
    const sampleUrls = this._selectSamples({ seeds, sections, articleHints });
    if (sampleUrls.length === 0) {
      return {
        sampleLimit: this.maxSamples,
        samples: [],
        coverage: { sampleSize: 0, sectionsCovered: [], coveragePct: 0 },
        topKeywords: []
      };
    }

    const samples = [];
    for (const url of sampleUrls) {
      try {
        const analysed = await this._analyseUrl(url);
        if (analysed) {
          samples.push(analysed);
        }
      } catch (error) {
        this._log('warn', `[targeted-analysis] Failed to analyse ${url}`, error?.message || error);
      }
    }

    const coverage = this._summariseCoverage(samples, sections);
    const topKeywords = this._aggregateKeywords(samples);

    return {
      sampleLimit: this.maxSamples,
      samples,
      coverage,
      topKeywords
    };
  }

  _selectSamples({ seeds, sections, articleHints }) {
    const seedList = uniqueUrls(seeds).slice(0, this.maxSamples * 2);
    if (seedList.length >= this.maxSamples) {
      return seedList.slice(0, this.maxSamples);
    }

    const extras = [];
    const sectionList = Array.isArray(sections) ? sections : [];
    if (this.baseUrl && sectionList.length) {
      for (const section of sectionList) {
        if (!section) continue;
        try {
          const candidate = new URL(section.replace(/^\/*/, ''), this.baseUrl).toString();
          extras.push(candidate);
        } catch (_) {}
        if (extras.length >= this.maxSamples) break;
      }
    }

    const hints = Array.isArray(articleHints) ? articleHints : [];
    if (this.baseUrl && hints.length && extras.length < this.maxSamples) {
      for (const hint of hints) {
        if (!hint) continue;
        try {
          const candidate = new URL(hint.replace(/^\/*/, ''), this.baseUrl).toString();
          extras.push(candidate);
        } catch (_) {}
        if (extras.length + seedList.length >= this.maxSamples) break;
      }
    }

    const combined = uniqueUrls([...seedList, ...extras]);
    return combined.slice(0, this.maxSamples);
  }

  async _analyseUrl(url) {
    const payload = await this._loadHtml(url);
    if (!payload || !payload.html) {
      return null;
    }
    const { html, source } = payload;
    const $ = cheerio.load(html);
    const container = selectContainer($);
    const isArticleTag = container && (typeof container.is === 'function')
      ? (container.is('article') || container.parents('article').length > 0)
      : false;
    const headline = normaliseWhitespace(container.find('h1').first().text() || $('h1').first().text());
    const paragraphs = [];
    container.find('p').each((_, el) => {
      const text = normaliseWhitespace($(el).text());
      if (text.length >= 40) {
        paragraphs.push(text);
      }
      if (paragraphs.length >= 20) {
        return false;
      }
      return undefined;
    });
    let combinedText = paragraphs.join(' ');
    if (!combinedText) {
      combinedText = normaliseWhitespace(container.text()).slice(0, 5000);
    }
    const tokens = tokenize(combinedText);
    const keyPhrases = extractKeyPhrases(tokens).slice(0, 6).map((entry) => entry.phrase);
    const words = combinedText ? combinedText.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const section = safeUrlSection(url);
    const snippet = words.slice(0, 60).join(' ');
    const paragraphCount = paragraphs.length;
    const hasMedia = container.find('figure, video, iframe').length > 0;

    const classification = this._classifySample({ wordCount, paragraphCount, hasMedia, isArticle: isArticleTag });

    return {
      url,
      section,
      headline: headline || null,
      snippet: snippet || null,
      wordCount,
      paragraphCount,
      hasMedia,
      keyPhrases,
      tokens: tokens.length,
      classification,
      source
    };
  }

  async _loadHtml(url) {
    try {
      const result = await this.fetchPage({
        url,
        context: {
          depth: 1,
          allowRevisit: true,
          referrerUrl: null,
          intent: 'targeted-analysis'
        }
      });
      if (result) {
        if (result.source === 'network' || result.source === 'cache') {
          return { html: result.html || null, source: result.source || 'network' };
        }
        if (result.source === 'not-modified') {
          const cached = await this.getCachedArticle(url);
          if (cached && cached.html) {
            return { html: cached.html, source: 'cache' };
          }
        }
        if (result.html) {
          return { html: result.html, source: result.source || 'unknown' };
        }
      }
    } catch (error) {
      this._log('warn', `[targeted-analysis] Fetch failed for ${url}`, error?.message || error);
    }
    try {
      const cached = await this.getCachedArticle(url);
      if (cached && cached.html) {
        return { html: cached.html, source: 'cache-only' };
      }
    } catch (error) {
      this._log('warn', `[targeted-analysis] Cache lookup failed for ${url}`, error?.message || error);
    }
    return null;
  }

  _classifySample({ wordCount, paragraphCount, hasMedia, isArticle }) {
    if (isArticle && paragraphCount >= 2 && wordCount >= 50) {
      return 'article';
    }
    if (wordCount >= 400 && paragraphCount >= 5) {
      return 'article';
    }
    if (wordCount >= 180 && paragraphCount >= 3) {
      return 'brief';
    }
    if (paragraphCount >= 2 && wordCount >= 80) {
      return 'brief';
    }
    if (paragraphCount <= 1 && hasMedia) {
      return 'media';
    }
    return 'summary';
  }

  _summariseCoverage(samples, sections) {
    const sectionCounts = new Map();
    let totalWords = 0;
    for (const sample of samples) {
      totalWords += Number(sample.wordCount) || 0;
      if (sample.section) {
        sectionCounts.set(sample.section, (sectionCounts.get(sample.section) || 0) + 1);
      }
    }
    const sectionsAnalysed = Array.from(sectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([section, count]) => ({ section, count }));
    const expectedSections = Array.isArray(sections) ? sections.filter(Boolean).length : 0;
    const coveragePct = expectedSections > 0
      ? Math.min(1, sectionsAnalysed.length / expectedSections)
      : (samples.length > 0 ? 1 : 0);

    const avgWordCount = samples.length ? Math.round(totalWords / samples.length) : 0;

    return {
      sampleSize: samples.length,
      avgWordCount,
      sectionsCovered: sectionsAnalysed,
      coveragePct,
      expectedSections
    };
  }

  _aggregateKeywords(samples) {
    const counts = new Map();
    for (const sample of samples) {
      if (!Array.isArray(sample.keyPhrases)) continue;
      for (const phrase of sample.keyPhrases) {
        const key = phrase && phrase.toLowerCase ? phrase.toLowerCase() : null;
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([phrase, count]) => ({ phrase, count }));
  }

  _log(level, ...args) {
    if (!this.logger) return;
    const fn = this.logger[level];
    if (typeof fn === 'function') {
      try {
        fn.apply(this.logger, args);
      } catch (_) {}
    }
  }
}

module.exports = {
  TargetedAnalysisRunner
};
