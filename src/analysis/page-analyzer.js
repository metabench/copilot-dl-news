const { Readability } = require('@mozilla/readability');
const cheerio = require('cheerio');
const {
  extractGazetteerPlacesFromText,
  extractPlacesFromUrl,
  dedupeDetections,
  inferContext
} = require('./place-extraction');
const { evaluateArticleCandidate } = require('./articleDetection');
const ArticleSignalsService = require('../crawler/ArticleSignalsService');
const { detectPlaceHub } = require('../tools/placeHubDetector');
const { performDeepAnalysis } = require('./deep-analyzer');
const { extractDomain } = require('../services/shared/dxpl');
const { performance } = require('perf_hooks');
const { createJsdom } = require('../utils/jsdomUtils');
const { countWords } = require('../utils/textMetrics');
const { summarizeLinks } = require('../utils/linkClassification');

async function analyzePage({
  url,
  title = null,
  section = null,
  articleRow = null,
  fetchRow = null,
  html = null,
  gazetteer = null,
  db,
  targetVersion = 1,
  nonGeoTopicSlugs = null,
  xpathService = null
}) {
  if (!url) throw new Error('analyzePage requires a url');

  const timings = {
    overallMs: 0,
    contextMs: 0,
    preparationMs: 0,
    buildAnalysisMs: 0,
    detectHubMs: 0,
    deepAnalysisMs: 0
  };
  const overallStart = performance.now();

  const contextStart = performance.now();
  const context = inferContext(db, url, title || null, section || null);
  timings.contextMs = Math.max(0, performance.now() - contextStart);

  const preparationStart = performance.now();
  const preparation = await prepareArticleContent({
    url,
    html,
    articleRow,
    xpathService,
    fetchRow,
    title
  });
  timings.preparationMs = Math.max(0, performance.now() - preparationStart);

  const buildStart = performance.now();
  const analysis = await buildAnalysis({
    url,
    title,
    section,
    articleRow: preparation.articleRow,
    fetchRow,
    gazetteer,
    context,
    targetVersion,
    preparation
  });
  timings.buildAnalysisMs = Math.max(0, performance.now() - buildStart);

  const places = Array.isArray(analysis.findings?.places) ? analysis.findings.places : [];
  const latestWordCount = extractWordCount(analysis);
  const urlPlaceAnalysis = analysis.meta?.urlPlaceAnalysis || null;
  const urlPlaceMatches = (() => {
    if (!urlPlaceAnalysis) return [];
    const chain = urlPlaceAnalysis.bestChain?.places && urlPlaceAnalysis.bestChain.places.length
      ? urlPlaceAnalysis.bestChain.places
      : urlPlaceAnalysis.matches || [];
    return chain.map((match) => ({
      name: match.place?.name || null,
      kind: match.place?.kind || null,
      place_id: match.place?.place_id || match.place?.id || null,
      country_code: match.place?.country_code || match.place?.countryCode || null
    })).filter((entry) => entry.name);
  })();

  const detectHubStart = performance.now();
  const hubCandidate = detectPlaceHub({
    url,
    urlPlaceAnalysis,
    urlPlaces: urlPlaceMatches,
    analysisPlaces: places,
    section,
    fetchClassification: fetchRow?.classification || null,
    navLinksCount: fetchRow?.nav_links_count ?? null,
    articleLinksCount: fetchRow?.article_links_count ?? null,
    wordCount: latestWordCount,
    gazetteerPlaceNames: gazetteer?.placeNames || null,
    nonGeoTopicSlugs,
    db
  });
  timings.detectHubMs = Math.max(0, performance.now() - detectHubStart);

  const articleSignalsService = new ArticleSignalsService();
  const urlSignals = articleSignalsService.computeUrlSignals(url);
  const contentSignals = preparation.contentSignals;
  const articleEvaluation = articleSignalsService.combineSignals(urlSignals, contentSignals, { wordCount: latestWordCount });

  if (hubCandidate && hubCandidate.kind === 'place') {
    analysis.kind = 'hub';
    analysis.meta.hub = hubCandidate;
  } else {
    analysis.kind = articleEvaluation.hint === 'article' ? 'article' : 'nav';
  }
  analysis.meta.articleEvaluation = articleEvaluation;

  const deepStart = performance.now();
  const deepAnalysis = performDeepAnalysis({
    text: preparation.articleRow?.text || articleRow?.text || null,
    title,
    metadata: { url }
  });
  timings.deepAnalysisMs = Math.max(0, performance.now() - deepStart);

  timings.overallMs = Math.max(0, performance.now() - overallStart);

  const timingSummary = {
    ...timings,
    preparation: preparation?.timings || null
  };

  analysis.meta = analysis.meta || {};
  analysis.meta.timings = timingSummary;

  if (preparation?.linkSummary) {
    analysis.meta.linkSummary = preparation.linkSummary;
  }

  return {
    analysis,
    places,
    hubCandidate,
    deepAnalysis,
    preparation,
    timings: timingSummary
  };
}

async function buildAnalysis({
  url,
  title,
  section,
  articleRow,
  fetchRow,
  gazetteer,
  context,
  targetVersion,
  preparation = null
}) {
  const base = {
    analysis_version: targetVersion,
    kind: 'minimal',
    findings: {},
    notes: [],
    meta: {}
  };

  let urlPlaceAnalysis = null;
  if (gazetteer) {
    try {
      urlPlaceAnalysis = extractPlacesFromUrl(url, gazetteer);
    } catch (error) {
      urlPlaceAnalysis = {
        matches: [],
        segments: [],
        chains: [],
        bestChain: null,
        topics: { all: [], recognized: [], segments: [], leading: [], trailing: [] },
        error: error?.message || String(error)
      };
    }
    base.meta.urlPlaceAnalysis = urlPlaceAnalysis;
  }

  if (articleRow && articleRow.text) {
    base.meta.wordCount = articleRow.word_count ?? null;
    base.meta.articleXPath = articleRow.article_xpath || null;

    const detections = [];

    try {
      if (articleRow.text && gazetteer) {
        for (const place of extractGazetteerPlacesFromText(articleRow.text, gazetteer, context, false)) {
          detections.push({
            place: place.name,
            place_kind: place.kind,
            method: 'gazetteer',
            source: 'text',
            offset_start: place.start,
            offset_end: place.end,
            country_code: place.country_code,
            place_id: place.place_id
          });
        }
      }

      if (title && gazetteer) {
        for (const place of extractGazetteerPlacesFromText(title, gazetteer, context, true)) {
          detections.push({
            place: place.name,
            place_kind: place.kind,
            method: 'gazetteer',
            source: 'title',
            offset_start: place.start,
            offset_end: place.end,
            country_code: place.country_code,
            place_id: place.place_id
          });
        }
      }

      if (urlPlaceAnalysis) {
        const chain = urlPlaceAnalysis.bestChain?.places && urlPlaceAnalysis.bestChain.places.length
          ? urlPlaceAnalysis.bestChain.places
          : urlPlaceAnalysis.matches || [];
        for (const match of chain) {
          const place = match.place || match;
          detections.push({
            place: place.name,
            place_kind: place.kind,
            method: 'gazetteer',
            source: 'url',
            offset_start: -1,
            offset_end: -1,
            country_code: place.country_code,
            place_id: place.place_id
          });
        }
      }
    } catch (_) {
      // ignore extraction failures
    }

    if (detections.length) {
      base.findings.places = dedupeDetections(detections);
    }

    base.meta.method = `${(preparation?.extraction.method) || 'preparation'}+heuristics@v1`;
  } else if (fetchRow) {
    base.kind = ['article', 'nav'].includes(fetchRow.classification) ? fetchRow.classification : 'minimal';
    base.meta.method = 'minimal@v1';
  }

  if (preparation) {
    base.meta.wordCount = preparation.articleRow?.word_count ?? base.meta.wordCount ?? null;
    base.meta.articleXPath = preparation.articleRow?.article_xpath || base.meta.articleXPath || null;
    base.meta.preparation = {
      method: preparation.extraction.method,
      htmlUsed: preparation.htmlUsed,
      wordCountUpdated: preparation.updates.wordCountChanged,
      articleXPathUpdated: preparation.updates.articleXPathChanged,
      contentSignals: preparation.contentSignals
    };
  }

  if (!base.meta.method) {
    base.meta.method = 'preparation@v1';
  }

  return base;
}

async function prepareArticleContent({
  url,
  html,
  articleRow = null,
  xpathService = null,
  fetchRow = null,
  title = null
}) {
  const overallStart = performance.now();
  const timings = {
    totalMs: 0,
    xpathExtractionMs: 0,
    xpathLearningMs: 0,
    readabilityMs: 0,
    wordCountingMs: 0
  };
  const preparedArticleRow = {
    text: articleRow?.text || null,
    word_count: typeof articleRow?.word_count === 'number' ? articleRow.word_count : null,
    article_xpath: articleRow?.article_xpath || null
  };

  const result = {
    articleRow: preparedArticleRow,
    linkCounts: {
      nav: null,
      article: null,
      total: null
    },
    linkSummary: null,
    contentSignals: null,
    htmlUsed: Boolean(html),
    extraction: {
      method: preparedArticleRow.text ? 'existing-text' : 'unavailable',
      text: preparedArticleRow.text || null
    },
    updates: {
      wordCountChanged: false,
      articleXPathChanged: false
    }
  };

  const needsText = !preparedArticleRow.text;
  const needsWordCount = preparedArticleRow.word_count == null;
  const needsXPath = !preparedArticleRow.article_xpath;

  if (!html || (!needsText && !needsWordCount && !needsXPath)) {
    if (preparedArticleRow.text && needsWordCount) {
      const countStart = performance.now();
      const count = countWords(preparedArticleRow.text);
      timings.wordCountingMs += Math.max(0, performance.now() - countStart);
      preparedArticleRow.word_count = count;
      result.updates.wordCountChanged = true;
    }
    timings.totalMs = Math.max(0, performance.now() - overallStart);
    result.timings = timings;
    return result;
  }

  let extractedText = null;
  let extractionMethod = null;
  let xPathLearned = false;
  const domain = safeExtractDomain(url);

  if (xpathService) {
    try {
      const xpathStart = performance.now();
      extractedText = xpathService.extractTextWithXPath(url, html);
      timings.xpathExtractionMs += Math.max(0, performance.now() - xpathStart);
      if (extractedText) {
        extractionMethod = 'xpath';
        preparedArticleRow.article_xpath = preparedArticleRow.article_xpath || xpathService.getXPathForDomain(domain)?.xpath || null;
      }
    } catch (_) {
      // ignore primary xpath errors
    }

    if (!extractedText && !xpathService.hasXPathForDomain(domain)) {
      try {
        const learnStart = performance.now();
        const learnedPattern = await xpathService.learnXPathFromHtml(url, html);
        timings.xpathLearningMs += Math.max(0, performance.now() - learnStart);
        if (learnedPattern) {
          const secondXpathStart = performance.now();
          extractedText = xpathService.extractTextWithXPath(url, html);
          timings.xpathExtractionMs += Math.max(0, performance.now() - secondXpathStart);
          if (extractedText) {
            extractionMethod = 'xpath-learned';
            xPathLearned = true;
            preparedArticleRow.article_xpath = learnedPattern.xpath || preparedArticleRow.article_xpath || null;
          }
        }
      } catch (_) {
        // ignore learning failures
      }
    }
  }

  if (!extractedText) {
    let dom = null;
    try {
      const readabilityStart = performance.now();

      const $ = cheerio.load(html);
      const articleSignalsService = new ArticleSignalsService();
      result.contentSignals = articleSignalsService.computeContentSignals($, html);

      const jsdomStart = performance.now();
      ({ dom } = createJsdom(html, { url }));
      const jsdomMs = Math.max(0, performance.now() - jsdomStart);
      const document = dom.window.document;

      const linkSummary = summarizeLinks({ url, document });
      result.linkCounts.total = linkSummary.total;
      result.linkCounts.nav = linkSummary.navigation;
      result.linkCounts.article = linkSummary.article;
      result.linkSummary = linkSummary;

      const readabilityAlgoStart = performance.now();
      const readable = new Readability(document).parse();
      const readabilityAlgoMs = Math.max(0, performance.now() - readabilityAlgoStart);

      if (readable && readable.textContent) {
        extractedText = readable.textContent.trim();
        extractionMethod = extractionMethod || 'readability';
      }
      const totalReadabilityMs = Math.max(0, performance.now() - readabilityStart);
      timings.readabilityMs += totalReadabilityMs;
      timings.jsdomMs = (timings.jsdomMs || 0) + jsdomMs;
      timings.readabilityAlgoMs = (timings.readabilityAlgoMs || 0) + readabilityAlgoMs;
    } catch (_) {
      // ignore readability failures
    } finally {
      if (dom) {
        dom.window.close();
      }
    }
  }

  if (extractedText) {
    if (!preparedArticleRow.text) {
      preparedArticleRow.text = extractedText;
      result.extraction.text = extractedText;
    }

    const countStart = performance.now();
    const count = countWords(extractedText);
    timings.wordCountingMs += Math.max(0, performance.now() - countStart);
    if (preparedArticleRow.word_count == null || preparedArticleRow.word_count !== count) {
      preparedArticleRow.word_count = count;
      result.updates.wordCountChanged = true;
    }

    if (xPathLearned) {
      result.updates.articleXPathChanged = true;
    }
  }

  result.extraction.method = extractionMethod || result.extraction.method;
  timings.totalMs = Math.max(0, performance.now() - overallStart);
  result.timings = timings;
  return result;
}

function extractWordCount(analysis) {
  if (!analysis || !analysis.meta) return null;
  if (typeof analysis.meta.wordCount === 'number') return analysis.meta.wordCount;
  return null;
}

function safeExtractDomain(url) {
  try {
    return extractDomain(url);
  } catch (_) {
    return null;
  }
}

module.exports = {
  analyzePage,
  buildAnalysis,
  prepareArticleContent
};
