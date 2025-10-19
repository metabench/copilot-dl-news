const { Readability } = require('@mozilla/readability');
const { JSDOM, VirtualConsole } = require('jsdom');
const {
  extractGazetteerPlacesFromText,
  extractPlacesFromUrl,
  dedupeDetections,
  inferContext
} = require('./place-extraction');
const { detectPlaceHub } = require('../tools/placeHubDetector');
const { performDeepAnalysis } = require('./deep-analyzer');
const { ArticleXPathService } = require('../services/ArticleXPathService');
const { extractDomain } = require('../services/shared/dxpl');

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

  const context = inferContext(db, url, title || null, section || null);
  const analysis = await buildAnalysis({
    url,
    html,
    title,
    section,
    articleRow,
    fetchRow,
    gazetteer,
    context,
    targetVersion,
    xpathService
  });

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
    nonGeoTopicSlugs
  });

  const deepAnalysis = performDeepAnalysis({
    text: articleRow?.text || null,
    title,
    metadata: { url }
  });

  return {
    analysis,
    places,
    hubCandidate,
    deepAnalysis
  };
}

async function buildAnalysis({
  url,
  html,
  title,
  section,
  articleRow,
  fetchRow,
  gazetteer,
  context,
  targetVersion,
  xpathService = null
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
    base.kind = 'article';
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

    // Extract article text using XPath patterns or Readability
    let extractedText = null;
    let extractionMethod = 'readability';

    if (html) {
      // Try XPath extraction first if service is available
      if (xpathService && !base.meta.articleXPath) {
        try {
          extractedText = xpathService.extractTextWithXPath(url, html);
          if (extractedText) {
            extractionMethod = 'xpath';
            base.meta.articleXPath = xpathService.getXPathForDomain(extractDomain(url))?.xpath;
          }
        } catch (error) {
          // XPath extraction failed, continue to learning/fallback
        }
      }

      // If no XPath worked and we have HTML, try learning or Readability
      if (!extractedText) {
        if (xpathService && !xpathService.hasXPathForDomain(extractDomain(url))) {
          // Learn new XPath pattern
          try {
            const learnedPattern = await xpathService.learnXPathFromHtml(url, html);
            if (learnedPattern) {
              extractedText = xpathService.extractTextWithXPath(url, html);
              if (extractedText) {
                extractionMethod = 'xpath-learned';
                base.meta.articleXPath = learnedPattern.xpath;
              }
            }
          } catch (error) {
            // XPath learning failed, fall back to Readability
          }
        }

        // Fall back to Readability if XPath didn't work
        if (!extractedText) {
          try {
            const virtualConsole = new VirtualConsole();
            virtualConsole.on('jsdomError', () => {});
            const dom = new JSDOM(html, { url, virtualConsole });
            const readable = new Readability(dom.window.document).parse();
            if (readable && readable.textContent) {
              extractedText = readable.textContent.trim();
              extractionMethod = 'readability';
            }
          } catch (_) {
            // ignore readability errors
          }
        }
      }

      // Update word count if we extracted text
      if (extractedText) {
        base.meta.wordCount = base.meta.wordCount ?? extractedText.split(/\s+/).filter(Boolean).length;
      }
    }

    base.meta.method = `${extractionMethod}+heuristics@v1`;
    return base;
  }

  if (fetchRow) {
    base.kind = ['article', 'nav'].includes(fetchRow.classification) ? fetchRow.classification : 'minimal';
    base.meta.method = 'minimal@v1';
  }

  return base;
}

function extractWordCount(analysis) {
  if (!analysis || !analysis.meta) return null;
  if (typeof analysis.meta.wordCount === 'number') return analysis.meta.wordCount;
  return null;
}

module.exports = {
  analyzePage,
  buildAnalysis
};
