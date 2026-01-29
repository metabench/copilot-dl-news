// Shared heuristics for classifying anchor tags into navigation and article buckets.

const ARTICLE_PATH_REGEX = /\/\d{4}\/\w{3}\/\d{1,2}\//;
const MAX_SAMPLE_SIZE = 5;

function summarizeLinks({ url, document, anchors } = {}) {
  if (!url) {
    throw new Error('summarizeLinks requires a base url');
  }

  let baseHost = null;
  try {
    baseHost = new URL(url).hostname;
  } catch (_) {
    baseHost = null;
  }

  let nodes = anchors;
  if (!nodes && document) {
    try {
      nodes = Array.from(document.querySelectorAll('a[href]'));
    } catch (_) {
      nodes = [];
    }
  }

  if (!Array.isArray(nodes)) {
    nodes = [];
  }

  let total = 0;
  let scanned = 0;
  let navigation = 0;
  let article = 0;
  let external = 0;
  const navigationSamples = [];
  const articleSamples = [];

  for (const node of nodes) {
    let href = null;
    if (node && typeof node.getAttribute === 'function') {
      href = node.getAttribute('href');
    } else if (node && typeof node.href === 'string') {
      href = node.href;
    } else if (typeof node === 'string') {
      href = node;
    }

    if (!href || typeof href !== 'string') {
      continue;
    }
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    scanned++;

    let normalized = null;
    try {
      normalized = new URL(trimmed, url);
    } catch (_) {
      continue;
    }

    if (baseHost && normalized.hostname !== baseHost) {
      external++;
      continue;
    }

    const path = normalized.pathname || '/';
    const segments = path.split('/').filter(Boolean);
    const isLikelyArticle = ARTICLE_PATH_REGEX.test(path) || segments.length > 4;

    if (isLikelyArticle) {
      total++;
      article++;
      if (articleSamples.length < MAX_SAMPLE_SIZE) {
        articleSamples.push(normalized.href);
      }
    } else {
      total++;
      navigation++;
      if (navigationSamples.length < MAX_SAMPLE_SIZE) {
        navigationSamples.push(normalized.href);
      }
    }
  }

  return {
    total,
    navigation,
    article,
    external,
    skipped: Math.max(0, scanned - total - external),
    navigationSamples,
    articleSamples
  };
}

module.exports = {
  summarizeLinks
};
