const { URL } = require('url');

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

function detectPlaceHub({
  url,
  urlPlaces = [],
  analysisPlaces = [],
  section = null,
  fetchClassification = null,
  navLinksCount = null,
  articleLinksCount = null,
  wordCount = null
} = {}) {
  if (!url) return null;
  let isNavLike = fetchClassification === 'nav' || (typeof navLinksCount === 'number' && navLinksCount >= 10);
  let isLightContent = typeof wordCount === 'number' && wordCount < 200;
  if (!isNavLike && !isLightContent) {
    return null;
  }

  let chosen = null;
  if (urlPlaces && urlPlaces.length) {
    chosen = urlPlaces[0];
  }
  if (!chosen && Array.isArray(analysisPlaces) && analysisPlaces.length) {
    const dominant = pickDominantPlace(analysisPlaces);
    if (dominant) {
      chosen = {
        name: dominant.place || dominant.name,
        kind: dominant.place_kind || dominant.kind || null,
        place_id: dominant.place_id || null,
        country_code: dominant.country_code || null
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
  let placeSource = chosen ? (chosen.place_id ? 'gazetteer' : 'analysis') : null;

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
    if (slugTopic && slugTopic !== placeSlug) {
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

  const evidence = {
    reason: 'nav-or-hub',
    slug: placeSlug,
    placeKind,
    placeLabel,
    placeSource,
    urlMatches: Array.from(new Set((urlPlaces || []).map((p) => slugify(p.name || p.place || '')))).filter(Boolean),
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
