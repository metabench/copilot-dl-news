const { URL } = require('url');
const { is_array, tof } = require('lang-tools');

function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(s) {
  return normName(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  if (match.place) {
    const base = normalizePlaceMatch(match.place);
    if (!base) return null;
    return {
      ...base,
      source: base.source || match.source || 'url-chain',
      segmentIndex: match.segmentIndex ?? base.segmentIndex ?? null,
      score: match.score ?? base.score ?? null
    };
  }
  const name = match.name || match.place || null;
  if (!name) return null;
  return {
    name,
    kind: match.kind || match.place_kind || null,
    place_id: match.place_id || match.id || null,
    country_code: match.country_code || match.countryCode || null,
    source: match.source || null,
    segmentIndex: match.segmentIndex ?? null,
    score: match.score ?? null
  };
}

function collectUrlPlaceCandidates(urlPlaceAnalysis, urlPlaces = []) {
  const candidates = [];

  const addMatches = (matches = []) => {
    for (const match of matches) {
      const normalized = normalizePlaceMatch(match);
      if (!normalized) continue;
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

function detectPlaceHub({
  url,
  urlPlaceAnalysis = null,
  urlPlaces = [],
  analysisPlaces = [],
  section = null,
  fetchClassification = null,
  navLinksCount = null,
  articleLinksCount = null,
  wordCount = null
} = {}) {
  if (!url) return null;

  const isNavLike = fetchClassification === 'nav' || (tof(navLinksCount) === 'number' && navLinksCount >= 10);
  const isLightContent = tof(wordCount) === 'number' && wordCount < 200;
  if (!isNavLike && !isLightContent) {
    return null;
  }

  const urlCandidates = collectUrlPlaceCandidates(urlPlaceAnalysis, urlPlaces);

  let chosen = null;
  if (urlCandidates.length) {
    chosen = urlCandidates.reduce((best, candidate) => {
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
  }
  if (!chosen && is_array(analysisPlaces) && analysisPlaces.length) {
    const dominant = pickDominantPlace(analysisPlaces);
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

  const urlObj = new URL(url);
  const host = urlObj.hostname.toLowerCase();
  const segments = urlObj.pathname.split('/').filter(Boolean);
  const normalizedSegments = segments.map((seg) => slugify(seg));

  let placeSlug = chosen ? slugify(chosen.name || chosen.place) : null;
  let placeLabel = chosen ? (chosen.name || chosen.place) : null;
  let placeKind = chosen ? (chosen.kind || null) : null;
  let placeSource = chosen ? (chosen.place_id ? 'gazetteer' : chosen.source || 'analysis') : null;
  let placeId = chosen ? (chosen.place_id || null) : null;
  let placeCountry = chosen ? (chosen.country_code || null) : null;

  if (!placeSlug && segments.length) {
    const fallbackSegment = segments[segments.length - 1];
    const fallbackSlug = slugify(fallbackSegment);
    if (fallbackSlug) {
      placeSlug = fallbackSlug;
      placeLabel = humanizeSegment(fallbackSegment) || fallbackSegment;
      placeKind = null;
      placeSource = 'url';
    }
  }

  if (!placeSlug) {
    return null;
  }

  const placeIndex = normalizedSegments.lastIndexOf(placeSlug);
  let topicSlug = null;
  let topicLabel = null;
  let topicKind = null;
  let topicSource = null;

  if (placeIndex > 0) {
    const rawTopic = segments[placeIndex - 1] || '';
    const slugTopic = normalizedSegments[placeIndex - 1];
    const isCountryCodeSegment = placeCountry && slugTopic === placeCountry.toLowerCase();
    const isShortSegment = tof(slugTopic) === 'string' && slugTopic.length <= 2;
    if (slugTopic && slugTopic !== placeSlug && !isCountryCodeSegment && !isShortSegment) {
      const sectionMatches = section && slugify(section) === slugTopic;
      topicSlug = slugTopic;
      topicLabel = sectionMatches ? section : (humanizeSegment(rawTopic) || rawTopic || null);
      topicKind = sectionMatches ? 'section' : 'path-segment';
      topicSource = sectionMatches ? 'section' : 'url';
    }
  }

  if (!topicSlug && section && slugify(section) !== placeSlug) {
    topicSlug = slugify(section);
    topicLabel = section;
    topicKind = 'section';
    topicSource = 'section';
  }

  if (!topicSlug && urlPlaceAnalysis && urlPlaceAnalysis.topics) {
    const derived = deriveTopicFromAnalysisTopics(urlPlaceAnalysis.topics);
    if (derived) {
      topicSlug = derived.slug;
      topicLabel = derived.label;
      topicKind = derived.kind;
      topicSource = derived.source;
    }
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
    word_count: wordCount ?? null
  };

  if (topicSlug) {
    evidence.topic = {
      slug: topicSlug,
      label: topicLabel,
      kind: topicKind,
      source: topicSource
    };
  }

  return {
    host,
    placeSlug,
    placeKind,
    placeLabel,
    placeSource,
    placeId,
    placeCountry,
    topic: topicSlug ? { slug: topicSlug, label: topicLabel, kind: topicKind, source: topicSource } : null,
    navLinksCount: navLinksCount ?? null,
    articleLinksCount: articleLinksCount ?? null,
    wordCount: wordCount ?? null,
    isNavLike,
    isLightContent,
    evidence
  };
}

module.exports = {
  detectPlaceHub,
  slugify,
  humanizeSegment
};
