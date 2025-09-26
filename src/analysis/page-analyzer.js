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

function analyzePage({
  url,
  title = null,
  section = null,
  articleRow = null,
  fetchRow = null,
  html = null,
  gazetteer = null,
  db,
  targetVersion = 1
}) {
  if (!url) throw new Error('analyzePage requires a url');

  const context = inferContext(db, url, title || null, section || null);
  const analysis = buildAnalysis({
    url,
    html,
    title,
    section,
    articleRow,
    fetchRow,
    gazetteer,
    context,
    targetVersion
  });

  const places = Array.isArray(analysis.findings?.places) ? analysis.findings.places : [];
  const latestWordCount = extractWordCount(analysis);

  const hubCandidate = detectPlaceHub({
    url,
    urlPlaces: gazetteer ? extractPlacesFromUrl(url, gazetteer) : [],
    analysisPlaces: places,
    section,
    fetchClassification: fetchRow?.classification || null,
    navLinksCount: fetchRow?.nav_links_count ?? null,
    articleLinksCount: fetchRow?.article_links_count ?? null,
    wordCount: latestWordCount
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

function buildAnalysis({
  url,
  html,
  title,
  section,
  articleRow,
  fetchRow,
  gazetteer,
  context,
  targetVersion
}) {
  const base = {
    analysis_version: targetVersion,
    kind: 'minimal',
    findings: {},
    notes: [],
    meta: {}
  };

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

      if (gazetteer) {
        for (const place of extractPlacesFromUrl(url, gazetteer)) {
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

    if (!base.meta.articleXPath && html) {
      try {
        const virtualConsole = new VirtualConsole();
        virtualConsole.on('jsdomError', () => {});
        const dom = new JSDOM(html, { url, virtualConsole });
        const readable = new Readability(dom.window.document).parse();
        if (readable && readable.textContent) {
          base.meta.wordCount =
            base.meta.wordCount ?? readable.textContent.trim().split(/\s+/).filter(Boolean).length;
        }
      } catch (_) {
        // ignore readability errors
      }
    }

    base.meta.method = 'readability+heuristics@v1';
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
