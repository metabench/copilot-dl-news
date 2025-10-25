const { URL } = require('url');
const { is_array, tof } = require('lang-tools');
const { slugify, normalizeForMatching } = require('./slugify');
const {
  evaluateArticleCandidate,
  createArticleSignalsService
} = require('../analysis/articleDetection');

const ARTICLE_REJECTION_KIND = 'article-screened';
const ARTICLE_CONFIDENCE_THRESHOLD = 0.65;
const ARTICLE_SCORE_THRESHOLD = 2;
const articleSignalsService = createArticleSignalsService();

const COUNTRY_HINT_BY_SLUG = new Map([
  ['us', 'US'],
  ['us-news', 'US'],
  ['usa', 'US'],
  ['united-states', 'US'],
  ['united-states-news', 'US'],
  ['uk', 'GB'],
  ['uk-news', 'GB'],
  ['united-kingdom', 'GB'],
  ['great-britain', 'GB'],
  ['gb', 'GB'],
  ['australia', 'AU'],
  ['australia-news', 'AU'],
  ['canada', 'CA'],
  ['canada-news', 'CA'],
  ['new-zealand', 'NZ'],
  ['nz', 'NZ']
]);

const SHORT_TOKEN_COUNTRY_MAP = new Map([
  ['us', 'US'],
  ['uk', 'GB'],
  ['gb', 'GB'],
  ['au', 'AU'],
  ['ca', 'CA'],
  ['nz', 'NZ'],
  ['eu', 'EU']
]);

function deriveCountryHint({ sectionSlug, recognizedTopicSlugs }) {
  const lookup = (slug) => {
    if (!slug) return null;
    return COUNTRY_HINT_BY_SLUG.get(slug);
  };

  const direct = lookup(sectionSlug);
  if (direct) return direct;

  if (recognizedTopicSlugs && recognizedTopicSlugs.size) {
    for (const slug of recognizedTopicSlugs) {
      const hint = lookup(slug);
      if (hint) return hint;
    }
  }

  return null;
}

function getCandidateHintRank(candidate, countryHint) {
  if (!countryHint || !candidate) return 0;
  const code = (candidate.country_code || candidate.countryCode || '').toUpperCase();
  if (!code) return -1;
  if (code === countryHint) return 2;
  return -2;
}

function humanizeSegment(s) {
  const text = String(s || '').replace(/[-_]+/g, ' ').trim();
  if (!text) return null;
  return text
    .split(/\s+/)
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function pickDominantPlace(detections = []) {
  const counts = new Map();
  for (const entry of detections) {
    const key = entry.place_id || entry.place || entry.name;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  if (!bestKey) return null;
  return detections.find((entry) => (entry.place_id || entry.place || entry.name) === bestKey) || null;
}

function normalizePlaceMatch(match) {
  if (!match) return null;

  const base = match.place ? match.place : match;
  const name = base.name || base.place || match.name || match.place || null;
  if (!name) return null;

  const token = match.token || base.token || null;
  const normalized = {
    name,
    kind: base.kind || base.place_kind || match.kind || match.place_kind || null,
    place_id: base.place_id || base.id || match.place_id || match.id || null,
    place_slug: base.place_slug || base.slug || match.place_slug || null,
    bbox: base.bbox || match.bbox || null,
    lat: base.lat ?? base.latitude ?? match.lat ?? match.latitude ?? null,
    lon: base.lon ?? base.longitude ?? match.lon ?? match.longitude ?? null,
    country_code: base.country_code || base.countryCode || match.country_code || match.countryCode || null,
    country_name: base.country_name || match.country_name || null,
    state: base.state || match.state || null,
    state_code: base.state_code || base.stateCode || match.state_code || match.stateCode || null,
    segmentIndex: match.segmentIndex ?? base.segmentIndex ?? null,
    score: match.score ?? base.score ?? null,
    source: match.source || base.source || (match.place ? 'url-chain' : null),
    token: token || null,
    normalizedToken: match.normalizedToken || base.normalizedToken || null
  };

  if (!normalized.source) {
    normalized.source = 'url';
  }

  if (!normalized.normalizedToken && typeof normalized.token === 'string') {
    normalized.normalizedToken = slugify(normalized.token);
  }

  return normalized;
}

function collectUrlPlaceCandidates(urlPlaceAnalysis, urlPlaces = []) {
  const candidates = [];

  const addMatches = (matches = []) => {
    for (const match of matches) {
      const normalized = normalizePlaceMatch(match);
      if (!normalized) continue;
      if (normalized.normalizedToken && normalized.normalizedToken.length <= 2) {
        const expectedCountry = SHORT_TOKEN_COUNTRY_MAP.get(normalized.normalizedToken);
        if (!expectedCountry) {
          continue;
        }
        if (normalized.country_code && normalized.country_code.toUpperCase() !== expectedCountry) {
          continue;
        }
      }
      if (typeof normalized.segmentIndex !== 'number' && match && typeof match.segmentIndex === 'number') {
        normalized.segmentIndex = match.segmentIndex;
      }
      candidates.push(normalized);
    }
  };

  if (urlPlaceAnalysis) {
    if (urlPlaceAnalysis.bestChain && is_array(urlPlaceAnalysis.bestChain.places) && urlPlaceAnalysis.bestChain.places.length) {
      addMatches(urlPlaceAnalysis.bestChain.places);
    } else if (is_array(urlPlaceAnalysis.matches) && urlPlaceAnalysis.matches.length) {
      addMatches(urlPlaceAnalysis.matches);
    }
  }

  if (!candidates.length && is_array(urlPlaces)) {
    addMatches(urlPlaces);
  }

  return candidates;
}

function deriveTopicFromAnalysisTopics(topics) {
  if (!topics) return null;
  const priorityBuckets = [topics.recognized, topics.leading, topics.trailing, topics.all];
  for (const bucket of priorityBuckets) {
    if (!bucket || !bucket.length) continue;
    const raw = bucket.find(Boolean);
    if (!raw) continue;
    const slug = slugify(raw);
    if (!slug) continue;
    return {
      slug,
      label: humanizeSegment(raw) || raw,
      kind: 'topic',
      source: 'url-analysis'
    };
  }
  return null;
}

function analyzeHubVariant(urlObj) {
  const canonicalUrl = `${urlObj.origin}${urlObj.pathname}`;
  let variantKind = null;
  let variantValue = null;

  if (urlObj.searchParams && urlObj.searchParams.has('page')) {
    variantKind = 'pagination';
    variantValue = urlObj.searchParams.get('page');
  }

  const pathMatch = urlObj.pathname.match(/\/page\/(\d+)(?:\/|$)/i);
  if (!variantKind && pathMatch) {
    variantKind = 'pagination';
    variantValue = pathMatch[1];
  }

  return {
    canonicalUrl,
    variantKind,
    variantValue,
    isFrontPage: !variantKind
  };
}

function detectPlaceHub({
  url,
  title = null,
  urlPlaceAnalysis = null,
  urlPlaces = [],
  analysisPlaces = [],
  section = null,
  fetchClassification = null,
  latestClassification = null,
  navLinksCount = null,
  articleLinksCount = null,
  wordCount = null,
  articleWordCount = null,
  fetchWordCount = null,
  articleAnalysis = null,
  fetchAnalysis = null,
  gazetteerPlaceNames = null,
  minNavLinksThreshold = 10,
  nonGeoTopicSlugs = null,
  db = null
} = {}) {
  if (!url) return null;

  const nonGeoSlugSet = nonGeoTopicSlugs && typeof nonGeoTopicSlugs.has === 'function'
    ? nonGeoTopicSlugs
    : null;

  const navLinks = tof(navLinksCount) === 'number' ? navLinksCount : null;
  const articleLinks = tof(articleLinksCount) === 'number' ? articleLinksCount : null;
  const words = tof(wordCount) === 'number' ? wordCount : null;
  const articleWords = tof(articleWordCount) === 'number' ? articleWordCount : null;
  const fetchWords = tof(fetchWordCount) === 'number' ? fetchWordCount : null;

  const normalizedThreshold = Number.isFinite(minNavLinksThreshold)
    ? Math.max(1, Math.floor(minNavLinksThreshold))
    : 10;
  const NAV_LINK_THRESHOLD = Math.max(10, normalizedThreshold);
  const isNavClassification = fetchClassification === 'nav';
  const navLinksSuggestHub = navLinks !== null && navLinks >= NAV_LINK_THRESHOLD;
  const qualifiesByNavLinks = navLinksSuggestHub;
  if (!isNavClassification && !qualifiesByNavLinks) {
    return null;
  }

  const isNavLike = isNavClassification || navLinksSuggestHub;
  const isLightContent = words !== null && words < 200;

  const classificationForArticleDetection = latestClassification || fetchClassification || null;
  let articleAssessment = null;
  try {
    articleAssessment = evaluateArticleCandidate({
      url,
      title: title || null,
      articleWordCount: articleWords ?? null,
      fetchWordCount: fetchWords ?? words ?? null,
      articleAnalysis: articleAnalysis || null,
      fetchAnalysis: fetchAnalysis || null,
      latestClassification: classificationForArticleDetection,
      navLinksCount: navLinks,
      articleLinksCount: articleLinks
    }, { signalsService: articleSignalsService });
  } catch (_) {
    articleAssessment = null;
  }

  const articleEvidence = articleAssessment ? {
    isArticle: articleAssessment.isArticle,
    score: articleAssessment.score,
    confidence: articleAssessment.confidence,
    reasons: articleAssessment.reasons,
    rejections: articleAssessment.rejections,
    signals: articleAssessment.signals
  } : null;

  const urlObj = new URL(url);
  const host = urlObj.hostname.toLowerCase();
  const segments = urlObj.pathname.split('/').filter(Boolean);
  const normalizedSegments = segments.map((seg) => slugify(seg));
  const variantInfo = analyzeHubVariant(urlObj);

  const schemaScore = articleEvidence?.signals?.schemaScore;
  const hasStrongSchema = typeof schemaScore === 'number' && schemaScore >= 5;
  const schemaHasArticleType = articleEvidence?.signals?.schemaHasArticleType === true;

  const shouldScreenByArticle = Boolean(
    articleAssessment &&
    articleAssessment.isArticle &&
    articleAssessment.confidence >= ARTICLE_CONFIDENCE_THRESHOLD &&
    articleAssessment.score >= ARTICLE_SCORE_THRESHOLD &&
    (hasStrongSchema || schemaHasArticleType)
  );

  if (shouldScreenByArticle) {
    return {
      kind: ARTICLE_REJECTION_KIND,
      host,
      canonicalUrl: variantInfo.canonicalUrl,
      isFrontPage: variantInfo.isFrontPage,
      variantKind: variantInfo.variantKind,
      variantValue: variantInfo.variantValue,
      navLinksCount: navLinks,
      articleLinksCount: articleLinks,
      wordCount: words,
      articleDetection: articleEvidence
    };
  }

  const urlCandidates = collectUrlPlaceCandidates(urlPlaceAnalysis, urlPlaces);

  const sectionSlug = section ? slugify(section) : null;
  const recognizedTopicSlugs = new Set();
  const addRecognized = (values) => {
    if (!values) return;
    for (const value of values) {
      const slug = slugify(value);
      if (slug) recognizedTopicSlugs.add(slug);
    }
  };

  if (urlPlaceAnalysis?.topics) {
    addRecognized(urlPlaceAnalysis.topics.recognized);
    addRecognized(urlPlaceAnalysis.topics.leading);
    addRecognized(urlPlaceAnalysis.topics.trailing);
  }

  if (Array.isArray(urlPlaceAnalysis?.segments)) {
    for (const segmentInfo of urlPlaceAnalysis.segments) {
      addRecognized(segmentInfo?.recognizedTopics);
    }
  }

  const countryHint = deriveCountryHint({ sectionSlug, recognizedTopicSlugs });

  let chosen = null;
  if (urlCandidates.length) {
    chosen = urlCandidates.reduce((best, candidate) => {
      if (!best) return candidate;
      const bestHint = getCandidateHintRank(best, countryHint);
      const candHint = getCandidateHintRank(candidate, countryHint);
      if (candHint !== bestHint) {
        return candHint > bestHint ? candidate : best;
      }
      const bestIdx = typeof best.segmentIndex === 'number' ? best.segmentIndex : -Infinity;
      const candIdx = typeof candidate.segmentIndex === 'number' ? candidate.segmentIndex : -Infinity;
      if (candIdx !== bestIdx) {
        return candIdx > bestIdx ? candidate : best;
      }
      const bestScore = typeof best.score === 'number' ? best.score : -Infinity;
      const candScore = typeof candidate.score === 'number' ? candidate.score : -Infinity;
      if (candScore !== bestScore) {
        return candScore > bestScore ? candidate : best;
      }
      return best;
    }, null);
  }
  if (!chosen && is_array(analysisPlaces) && analysisPlaces.length) {
    const shortlist = (() => {
      if (!countryHint) return analysisPlaces;
      const filtered = analysisPlaces.filter((entry) => {
        const code = entry?.country_code || entry?.countryCode;
        return !code || String(code).toUpperCase() === countryHint;
      });
      return filtered.length ? filtered : analysisPlaces;
    })();
    const dominant = pickDominantPlace(shortlist);
    if (dominant) {
      chosen = {
        name: dominant.place || dominant.name,
        kind: dominant.place_kind || dominant.kind || null,
        place_id: dominant.place_id || null,
        country_code: dominant.country_code || null,
        source: 'analysis'
      };
    }
  }

  const unknownTerms = [];
  let unknownReason = null;
  let nonGeoBlocker = null;

  let placeSlug = chosen ? slugify(chosen.name || chosen.place) : null;
  let placeLabel = chosen ? (chosen.name || chosen.place) : null;
  let placeKind = chosen ? (chosen.kind || null) : null;
  let placeSource = chosen ? (chosen.place_id ? 'gazetteer' : chosen.source || 'analysis') : null;
  let placeId = chosen ? (chosen.place_id || null) : null;
  let placeCountry = chosen ? (chosen.country_code || null) : null;

  let isWorldOverride = false;

  if (segments.includes('world') && db) {
    try {
      const planet = db.prepare("SELECT p.id, p.kind, p.country_code, pn.name FROM places p JOIN place_names pn ON p.id = pn.place_id WHERE p.kind = 'planet' AND pn.name = 'Earth' LIMIT 1").get();
      if (planet) {
        placeId = planet.id;
        placeKind = planet.kind;
        placeCountry = planet.country_code;
        placeLabel = planet.name;
        placeSlug = 'world';
        placeSource = 'gazetteer-override';
        isWorldOverride = true;
      }
    } catch (dbError) {
      // ignore db errors during detection
    }
  }

  let fallbackInfo = null;

  if (segments.length && !isWorldOverride) {
    const fallbackSegment = segments[segments.length - 1];
    const fallbackSlug = slugify(fallbackSegment);
    if (fallbackSlug) {
      const fallbackNormalized = normalizeForMatching(fallbackSlug);
      const currentNormalized = placeSlug ? normalizeForMatching(placeSlug) : null;
      let fallbackMatchesGazetteer = false;
      if (gazetteerPlaceNames && fallbackNormalized) {
        for (const gazetteerName of gazetteerPlaceNames) {
          if (normalizeForMatching(gazetteerName) === fallbackNormalized) {
            fallbackMatchesGazetteer = true;
            break;
          }
        }
      }

      const shouldOverride = !placeSlug || (fallbackMatchesGazetteer && fallbackNormalized !== currentNormalized);

      if (shouldOverride && fallbackMatchesGazetteer) {
        placeSlug = fallbackSlug;
        placeLabel = humanizeSegment(fallbackSegment) || fallbackSegment;
        placeKind = fallbackMatchesGazetteer ? null : placeKind;
        placeSource = fallbackMatchesGazetteer ? (placeSource === 'gazetteer' ? 'gazetteer' : 'url-gazetteer') : 'url';
      } else if (!placeSlug && !fallbackMatchesGazetteer) {
        unknownTerms.push({
          slug: fallbackSlug,
          label: humanizeSegment(fallbackSegment) || fallbackSegment,
          source: 'url-segment',
          reason: 'segment-not-in-gazetteer',
          confidence: 'unproven'
        });
        unknownReason = unknownReason || 'segment-not-in-gazetteer';
      }

      fallbackInfo = {
        segment: fallbackSegment,
        slug: fallbackSlug,
        matchedGazetteer: fallbackMatchesGazetteer,
        applied: shouldOverride && fallbackMatchesGazetteer
      };
    }
  }

  // Normalize place slug against gazetteer if available
  // This handles cases like "srilanka" -> "sri-lanka" to match gazetteer "Sri Lanka"
  if (placeSlug && gazetteerPlaceNames) {
    const normalizedSlug = normalizeForMatching(placeSlug);
    
    // Check if any gazetteer name matches this slug
    for (const gazetteerName of gazetteerPlaceNames) {
      if (normalizeForMatching(gazetteerName) === normalizedSlug) {
        // Use the proper slugified version of the gazetteer name
        placeSlug = slugify(gazetteerName);
        // Update label to match gazetteer if from URL
        if (placeSource === 'url') {
          placeLabel = gazetteerName;
        }
        break;
      }
    }
  }

  if (placeSlug && countryHint && placeCountry && placeCountry.toUpperCase() !== countryHint) {
    const hintCandidates = urlCandidates.filter((candidate) => candidate && candidate.country_code && candidate.country_code.toUpperCase() === countryHint);
    if (hintCandidates.length) {
      const preferred = hintCandidates.reduce((best, candidate) => {
        if (!best) return candidate;
        const bestIdx = typeof best.segmentIndex === 'number' ? best.segmentIndex : -Infinity;
        const candIdx = typeof candidate.segmentIndex === 'number' ? candidate.segmentIndex : -Infinity;
        if (candIdx !== bestIdx) {
          return candIdx > bestIdx ? candidate : best;
        }
        const bestScore = typeof best.score === 'number' ? best.score : -Infinity;
        const candScore = typeof candidate.score === 'number' ? candidate.score : -Infinity;
        if (candScore !== bestScore) {
          return candScore > bestScore ? candidate : best;
        }
        return best;
      }, null);
      if (preferred) {
        const preferredSlug = slugify(preferred.name || preferred.place || '');
        if (preferredSlug) {
          placeSlug = preferredSlug;
          placeLabel = preferred.name || preferred.place || placeLabel;
          placeKind = preferred.kind || placeKind;
          placeSource = preferred.place_id ? 'gazetteer' : (preferred.source || 'url');
          placeId = preferred.place_id || null;
          placeCountry = preferred.country_code || countryHint;
        } else {
          placeSlug = null;
          placeLabel = null;
          placeKind = null;
          placeSource = null;
          placeId = null;
          placeCountry = null;
        }
      }
    } else {
      placeSlug = null;
      placeLabel = null;
      placeKind = null;
      placeSource = null;
      placeId = null;
      placeCountry = null;
    }
  }

  const placeIndex = normalizedSegments.lastIndexOf(placeSlug);
  let topicSlug = null;
  let topicLabel = null;
  let topicKind = null;
  let topicSource = null;
  let topicConfidence = null;

  if (placeIndex > 0) {
    const rawTopic = segments[placeIndex - 1] || '';
    const slugTopic = normalizedSegments[placeIndex - 1];
    const isCountryCodeSegment = placeCountry && slugTopic === placeCountry.toLowerCase();
    const isShortSegment = tof(slugTopic) === 'string' && slugTopic.length <= 2;
    if (slugTopic && slugTopic !== placeSlug && !isCountryCodeSegment && !isShortSegment) {
      const sectionMatches = sectionSlug && sectionSlug === slugTopic;
      topicSlug = slugTopic;
      topicLabel = sectionMatches ? section : (humanizeSegment(rawTopic) || rawTopic || null);
      topicKind = sectionMatches ? 'section' : 'path-segment';
      topicSource = sectionMatches ? 'section' : 'url';
      topicConfidence = sectionMatches ? 'confirmed' : 'probable';
    }
  }

  if (!topicSlug && sectionSlug && sectionSlug !== placeSlug) {
    topicSlug = sectionSlug;
    topicLabel = section;
    topicKind = 'section';
    topicSource = 'section';
    topicConfidence = 'confirmed';
  }

  if (!topicSlug && urlPlaceAnalysis && urlPlaceAnalysis.topics) {
    const derived = deriveTopicFromAnalysisTopics(urlPlaceAnalysis.topics);
    if (derived) {
      topicSlug = derived.slug;
      topicLabel = derived.label;
      topicKind = derived.kind;
      topicSource = derived.source;
      topicConfidence = 'unproven';
    }
  }

  if (topicSlug && recognizedTopicSlugs.has(topicSlug)) {
    topicKind = 'topic-place';
    if (!topicConfidence || topicConfidence === 'unproven') {
      topicConfidence = 'recognized';
    }
  }

  if (placeSlug === 'world' && db && !isWorldOverride) {
    try {
      const planet = db.prepare("SELECT id, kind, country_code FROM places WHERE kind = 'planet' LIMIT 1").get();
      if (planet) {
        placeId = planet.id;
        placeKind = planet.kind;
        placeCountry = planet.country_code;
        placeSource = 'gazetteer-override';
      }
    } catch (dbError) {
      // ignore db errors during detection
    }
  }

  if (placeSlug && nonGeoSlugSet) {
    const parentSegmentSlug = placeIndex > 0 ? normalizedSegments[placeIndex - 1] : null;
    const blockers = [topicSlug, sectionSlug, parentSegmentSlug].filter((slug) => slug && nonGeoSlugSet.has(slug));
    if (blockers.length) {
      nonGeoBlocker = blockers[0];
      const unknownSlug = placeSlug;
      const alreadyTracked = unknownTerms.some((entry) => entry.slug === unknownSlug);
      if (!alreadyTracked) {
        unknownTerms.push({
          slug: unknownSlug,
          label: placeLabel || humanizeSegment(segments[segments.length - 1]) || unknownSlug,
          source: 'non-geo-topic',
          reason: 'non-geo-context',
          confidence: 'blocked'
        });
      }
      unknownReason = 'non-geo-context';
      placeSlug = null;
      placeLabel = null;
      placeKind = null;
      placeSource = null;
      placeId = null;
      placeCountry = null;
    }
  }

  if (!placeSlug) {
    if (unknownTerms.length) {
      const unknownEvidence = {
        reason: unknownReason || 'unknown-term',
        nav_links_count: navLinksCount ?? null,
        article_links_count: articleLinksCount ?? null,
        word_count: wordCount ?? null,
        canonical_url: variantInfo.canonicalUrl,
        is_front_page: variantInfo.isFrontPage,
        variant: variantInfo.variantKind ? {
          kind: variantInfo.variantKind,
          value: variantInfo.variantValue
        } : null,
        fallback: fallbackInfo,
        non_geo_blocker: nonGeoBlocker,
        urlTopics: urlPlaceAnalysis?.topics ? {
          leading: urlPlaceAnalysis.topics.leading || [],
          trailing: urlPlaceAnalysis.topics.trailing || [],
          recognized: urlPlaceAnalysis.topics.recognized || []
        } : null,
        segments
      };
      if (articleEvidence) {
        unknownEvidence.article_detection = articleEvidence;
      }
      return {
        kind: 'unknown',
        host,
        navLinksCount: navLinksCount ?? null,
        articleLinksCount: articleLinksCount ?? null,
        wordCount: wordCount ?? null,
        canonicalUrl: variantInfo.canonicalUrl,
        isFrontPage: variantInfo.isFrontPage,
        variantKind: variantInfo.variantKind,
        variantValue: variantInfo.variantValue,
        unknownTerms,
        evidence: unknownEvidence
      };
    }
    return null;
  }

  const urlMatchSlugs = Array.from(new Set(urlCandidates.map((candidate) => slugify(candidate.name || '')).filter(Boolean)));

  const evidence = {
    reason: 'nav-or-hub',
    slug: placeSlug,
    placeKind,
    placeLabel,
    placeSource,
    place_id: placeId,
    country_code: placeCountry,
    urlMatches: urlMatchSlugs,
    urlChain: urlCandidates.map((candidate) => ({
      place_id: candidate.place_id,
      slug: slugify(candidate.name || ''),
      kind: candidate.kind || null,
      source: candidate.source || null,
      segmentIndex: candidate.segmentIndex,
      score: candidate.score
    })),
    urlTopics: urlPlaceAnalysis?.topics ? {
      leading: urlPlaceAnalysis.topics.leading || [],
      trailing: urlPlaceAnalysis.topics.trailing || [],
      recognized: urlPlaceAnalysis.topics.recognized || []
    } : null,
    nav_links_count: navLinksCount ?? null,
    article_links_count: articleLinksCount ?? null,
    word_count: wordCount ?? null,
    canonical_url: variantInfo.canonicalUrl,
    is_front_page: variantInfo.isFrontPage,
    variant: variantInfo.variantKind ? {
      kind: variantInfo.variantKind,
      value: variantInfo.variantValue
    } : null,
    fallback: fallbackInfo
  };

  if (articleEvidence) {
    evidence.article_detection = articleEvidence;
  }

  if (topicSlug) {
    evidence.topic = {
      slug: topicSlug,
      label: topicLabel,
      kind: topicKind,
      source: topicSource,
      confidence: topicConfidence || null
    };
  }

  return {
    kind: 'place',
    host,
    placeSlug,
    placeKind,
    placeLabel,
    placeSource,
    placeId,
    placeCountry,
  topic: topicSlug ? { slug: topicSlug, label: topicLabel, kind: topicKind, source: topicSource, confidence: topicConfidence || null } : null,
    navLinksCount: navLinksCount ?? null,
    articleLinksCount: articleLinksCount ?? null,
    wordCount: wordCount ?? null,
    isNavLike,
    isLightContent,
    canonicalUrl: variantInfo.canonicalUrl,
    isFrontPage: variantInfo.isFrontPage,
    variantKind: variantInfo.variantKind,
    variantValue: variantInfo.variantValue,
    evidence
  };
}

module.exports = {
  detectPlaceHub,
  slugify,
  humanizeSegment
};
