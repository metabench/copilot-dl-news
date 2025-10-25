const { URL } = require('url');

// Default topic tokens - loaded from database on first use
let DEFAULT_TOPIC_TOKENS = null;

function getDefaultTopicTokens(db) {
  if (!DEFAULT_TOPIC_TOKENS && db) {
    const { getTopicTermsForLanguage } = require('../db/sqlite/v1/queries/topicKeywords');
    DEFAULT_TOPIC_TOKENS = getTopicTermsForLanguage(db, 'en');
  }
  // Fallback to minimal set if no database provided
  if (!DEFAULT_TOPIC_TOKENS) {
    DEFAULT_TOPIC_TOKENS = new Set([
      'news', 'world', 'politics', 'sport', 'sports', 'culture', 'business', 'money',
      'travel', 'opinion', 'technology', 'tech', 'science', 'health', 'environment',
      'lifestyle', 'education', 'finance', 'economy', 'markets', 'analysis'
    ]);
  }
  return DEFAULT_TOPIC_TOKENS;
}

const COUNTRY_CODE_SYNONYMS = {
  US: ['usa', 'u.s', 'u.s.', 'u-s', 'america', 'american', 'united-states'],
  GB: ['uk', 'u.k', 'u-k', 'britain', 'great-britain', 'united-kingdom'],
  AU: ['aus', 'australia'],
  CA: ['canada'],
  NZ: ['nz', 'new-zealand'],
  AE: ['uae', 'u.a.e', 'emirates', 'united-arab-emirates'],
  EU: ['eu', 'european-union'],
  RU: ['russia', 'russian-federation'],
  CN: ['china', 'prc', 'people-s-republic-of-china', 'peoples-republic-of-china'],
  IN: ['india', 'bharat'],
  ZA: ['south-africa', 'sa'],
  BR: ['brazil'],
  JP: ['japan']
};

const MAX_HIERARCHY_DEPTH = 5;

function normName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addToArrayMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

function ensurePlaceRecord(matchers, row) {
  const id = row.place_id;
  let record = matchers.placeIndex.get(id);
  if (!record) {
    record = {
      id,
      place_id: id,
      kind: row.kind,
      country_code: row.country_code || null,
      countryCode: row.country_code || null,
      population: Number(row.population) || 0,
      names: new Set(),
      slugs: new Set(),
      synonyms: new Set(),
      nameOrder: [],
      canonicalSlug: null,
      name: null
    };
    matchers.placeIndex.set(id, record);
  }
  return record;
}

function addNameToRecord(record, row) {
  const name = String(row.name || '').trim();
  if (!name) return;
  record.names.add(name);
  record.nameOrder.push(name);
  if (!record.name) {
    record.name = name;
  }
}

function addSlugToRecord(record, matchers, value, source = 'name') {
  const slug = slugify(value);
  if (!slug) return;
  record.slugs.add(slug);
  addToArrayMap(matchers.slugMap, slug, record);
  if (source === 'code') {
    record.synonyms.add(slug);
  }
}

function addNameKey(matchers, key, record) {
  if (!key) return;
  addToArrayMap(matchers.nameMap, key, record);
}

function finalizePlaceRecords(matchers) {
  for (const record of matchers.placeIndex.values()) {
    if (!record.name) {
      const first = record.nameOrder[0] || null;
      if (first) record.name = first;
    }
    if (!record.canonicalSlug && record.name) {
      record.canonicalSlug = slugify(record.name);
    }
    if (!record.canonicalSlug) {
      const firstSlug = record.slugs.values().next().value || null;
      record.canonicalSlug = firstSlug;
    }
    if (record.canonicalSlug) {
      record.synonyms.add(record.canonicalSlug);
      record.slugs.add(record.canonicalSlug);
    }

    for (const slug of record.slugs) {
      record.synonyms.add(slug);
    }

    const code = record.country_code;
    if (code) {
      record.synonyms.add(code.toLowerCase());
      const custom = COUNTRY_CODE_SYNONYMS[code.toUpperCase()];
      if (Array.isArray(custom)) {
        for (const token of custom) {
          const slug = slugify(token);
          if (slug) record.synonyms.add(slug);
        }
      }
    }

    record.synonyms = Array.from(new Set(Array.from(record.synonyms).filter(Boolean)));

    for (const synonym of record.synonyms) {
      addToArrayMap(matchers.slugMap, synonym, record);
    }
  }
}

function buildHierarchyIndex(db, placeIndex) {
  if (!db || typeof db.prepare !== 'function' || !placeIndex || placeIndex.size === 0) {
    return {
      parents: new Map(),
      children: new Map(),
      isAncestor: () => false
    };
  }

  let rows = [];
  try {
    rows = db.prepare(`
      SELECT parent_id, child_id,
             COALESCE(relation, NULL) AS relation,
             COALESCE(depth, NULL) AS depth
        FROM place_hierarchy
    `).all();
  } catch (_) {
    return {
      parents: new Map(),
      children: new Map(),
      isAncestor: () => false
    };
  }

  const parents = new Map();
  const children = new Map();

  for (const row of rows) {
    const parentId = row.parent_id;
    const childId = row.child_id;
    if (!placeIndex.has(parentId) || !placeIndex.has(childId)) continue;
    addToArrayMap(parents, childId, {
      parentId,
      relation: row.relation || null,
      depth: Number(row.depth) || null
    });
    addToArrayMap(children, parentId, {
      childId,
      relation: row.relation || null,
      depth: Number(row.depth) || null
    });
  }

  const memo = new Map();

  const isAncestor = (ancestorId, descendantId, maxDepth = MAX_HIERARCHY_DEPTH) => {
    if (ancestorId === descendantId) return false;
    const key = `${ancestorId}->${descendantId}`;
    if (memo.has(key)) return memo.get(key);
    let found = false;
    const visited = new Set();
    const queue = [{ id: descendantId, depth: 0 }];
    while (queue.length) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth) continue;
      const parentEntries = parents.get(id);
      if (!parentEntries || !parentEntries.length) continue;
      for (const entry of parentEntries) {
        const pid = entry.parentId;
        if (pid === ancestorId) {
          found = true;
          queue.length = 0;
          break;
        }
        if (!visited.has(pid)) {
          visited.add(pid);
          queue.push({ id: pid, depth: depth + 1 });
        }
      }
    }
    memo.set(key, found);
    return found;
  };

  return {
    parents,
    children,
    isAncestor
  };
}

function buildGazetteerMatchers(db, options = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('buildGazetteerMatchers requires a database handle with prepare()');
  }

  const matchers = {
    nameMap: new Map(),
    slugMap: new Map(),
    placeIndex: new Map(),
    topicTokens: options.topicTokens instanceof Set ? options.topicTokens : getDefaultTopicTokens(db)
  };

  const TEST_FAST = process.env.TEST_FAST === '1' || process.env.TEST_FAST === 'true';
  const CITY_LIMIT = TEST_FAST ? 500 : 5000;

  const countryRows = db.prepare(`
      SELECT pn.name,
             COALESCE(pn.normalized, LOWER(pn.name)) AS norm,
             p.id AS place_id,
             p.kind,
             p.country_code,
             COALESCE(p.population, 0) AS population
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
       WHERE (pn.lang IS NULL OR pn.lang = 'en')
         AND pn.name_kind IN ('common', 'official', 'alias', 'endonym', 'exonym')
         AND p.kind IN ('country', 'region', 'planet')
    `).all();

  for (const row of countryRows) {
    const record = ensurePlaceRecord(matchers, row);
    addNameToRecord(record, row);
    const key = normName(row.norm || row.name);
    addNameKey(matchers, key, record);
    addSlugToRecord(record, matchers, row.name);
  }

  const cityRows = db.prepare(`
      SELECT pn.name,
             COALESCE(pn.normalized, LOWER(pn.name)) AS norm,
             p.id AS place_id,
             p.kind,
             p.country_code,
             COALESCE(p.population, 0) AS population
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
       WHERE (pn.lang IS NULL OR pn.lang = 'en')
         AND pn.name_kind IN ('common', 'official', 'alias')
         AND p.kind = 'city'
    ORDER BY COALESCE(p.population, 0) DESC
       LIMIT ${CITY_LIMIT}
    `).all();

  for (const row of cityRows) {
    const record = ensurePlaceRecord(matchers, row);
    addNameToRecord(record, row);
    const key = normName(row.norm || row.name);
    addNameKey(matchers, key, record);
    addSlugToRecord(record, matchers, row.name);
  }

  // Add country code synonyms
  for (const record of matchers.placeIndex.values()) {
    if (record.country_code) {
      addSlugToRecord(record, matchers, record.country_code, 'code');
    }
  }

  finalizePlaceRecords(matchers);

  const dbHandle = db; // better-sqlite3 handle
  matchers.hierarchy = buildHierarchyIndex(dbHandle, matchers.placeIndex);

  return matchers;
}

function pickBestCandidate(candidates, ctx, isTitle) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    let score = 0;
    if (ctx) {
      if (ctx.domain_cc && candidate.country_code && ctx.domain_cc === candidate.country_code) score += 5;
      if (ctx.tld_cc && candidate.country_code && ctx.tld_cc === candidate.country_code) score += 3;
      if (ctx.url_ccs && candidate.country_code && ctx.url_ccs.includes(candidate.country_code)) score += 4;
      if (ctx.section && typeof ctx.section === 'string') {
        const section = ctx.section.toLowerCase();
        if (candidate.country_code && section.includes(candidate.country_code.toLowerCase())) score += 2;
      }
      if (isTitle) score += 1;
    }

    const population = Number(candidate.population || 0);
    if (population > 0) score += Math.log10(population + 1) * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function extractGazetteerPlacesFromText(text, matchers, ctx, isTitle) {
  const results = [];
  if (!text || !matchers) return results;

  const tokenRegex = /[A-Za-z][A-Za-z'\-]*/g;
  const tokens = [];
  const normalizedTokens = [];
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    const word = match[0];
    const normalized = normName(word);
    if (!normalized) {
      continue;
    }
    tokens.push({ word, start: match.index, end: match.index + word.length });
    normalizedTokens.push(normalized);
  }

  const maxWindow = 4;
  for (let i = 0; i < tokens.length; i++) {
    let bestMatch = null;
    let phraseNormalized = '';

    for (
      let windowSize = 1;
      windowSize <= maxWindow && i + windowSize <= tokens.length;
      windowSize += 1
    ) {
      const tokenIndex = i + windowSize - 1;
      const normalizedToken = normalizedTokens[tokenIndex];
      if (!normalizedToken) {
        phraseNormalized = '';
        continue;
      }
      phraseNormalized = windowSize === 1
        ? normalizedToken
        : `${phraseNormalized} ${normalizedToken}`;

      const candidates = matchers.nameMap.get(phraseNormalized);
      if (candidates && candidates.length) {
        const record = pickBestCandidate(candidates, ctx, isTitle);
        if (record) {
          bestMatch = {
            record,
            windowSize,
            start: tokens[i].start,
            end: tokens[tokenIndex].end
          };
        }
      }
    }

    if (bestMatch) {
      results.push({
        name: bestMatch.record.name,
        kind: bestMatch.record.kind,
        country_code: bestMatch.record.country_code,
        place_id: bestMatch.record.place_id,
        start: bestMatch.start,
        end: bestMatch.end
      });
      i += bestMatch.windowSize - 1;
    }
  }

  return results;
}

function tokenizeSegment(segment) {
  if (!segment) return [];
  return segment
    .split(/[\s_\.\-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function deriveMatchType(record, normalizedToken) {
  if (normalizedToken === record.canonicalSlug) return 'canonical';
  if (record.slugs && record.slugs.has && record.slugs.has(normalizedToken)) return 'alias';
  if (record.slug && normalizedToken === record.slug) return 'alias';
  if (record.country_code && normalizedToken === record.country_code.toLowerCase()) return 'country-code';
  if (record.synonyms && record.synonyms.includes && record.synonyms.includes(normalizedToken)) return 'synonym';
  return 'synonym';
}

function scoreMatch(record, matchType, source) {
  let score;
  switch (matchType) {
    case 'canonical':
      score = 1.0;
      break;
    case 'alias':
      score = 0.95;
      break;
    case 'country-code':
      score = 0.9;
      break;
    default:
      score = 0.85;
      break;
  }
  if (source === 'token') {
    score -= 0.05;
  }
  const population = Number(record.population || 0);
  if (population > 0) {
    score += Math.min(0.1, Math.log10(population + 1) * 0.02);
  }
  return Math.min(1, Math.max(0.2, score));
}

function toPublicPlace(record) {
  return {
    id: record.id,
    place_id: record.place_id,
    name: record.name,
    kind: record.kind,
    country_code: record.country_code,
    countryCode: record.country_code,
    slug: record.canonicalSlug,
    canonicalSlug: record.canonicalSlug,
    population: record.population
  };
}

function analyzeSegment(segment, segmentIndex, matchers) {
  const slugMap = matchers?.slugMap || new Map();
  const tokens = tokenizeSegment(segment);
  const placeMatches = [];
  const usedTokens = new Set();

  const candidateEntries = [];
  const segmentSlug = slugify(segment);
  if (segmentSlug) {
    candidateEntries.push({ token: segment, normalized: segmentSlug, source: 'segment' });
  }
  for (const token of tokens) {
    const slug = slugify(token);
    if (slug) {
      candidateEntries.push({ token, normalized: slug, source: 'token' });
    }
  }

  for (const candidate of candidateEntries) {
    const records = slugMap.get(candidate.normalized);
    if (!records || !records.length) continue;
    for (const record of records) {
      const matchType = deriveMatchType(record, candidate.normalized);
      const score = scoreMatch(record, matchType, candidate.source);
      const match = {
        placeId: record.id,
        place: toPublicPlace(record),
        segmentIndex,
        segment,
        token: candidate.token,
        normalizedToken: candidate.normalized,
        matchType,
        score,
        source: candidate.source
      };
      placeMatches.push(match);
      usedTokens.add(candidate.normalized);
    }
  }

  const normalizedTokens = tokens.map((token) => slugify(token)).filter(Boolean);
  const topicTokens = [];
  const recognizedTopics = [];
  for (let i = 0; i < normalizedTokens.length; i++) {
    const normalized = normalizedTokens[i];
    if (usedTokens.has(normalized)) continue;
    const original = tokens[i];
    topicTokens.push(original);
    const topicNormalized = normalized;
    if (matchers?.topicTokens?.has(topicNormalized) || DEFAULT_TOPIC_TOKENS.has(topicNormalized)) {
      recognizedTopics.push(original);
    }
  }

  return {
    segment,
    segmentIndex,
    tokens,
    normalizedTokens,
    placeMatches,
    topicTokens,
    recognizedTopics
  };
}

function cloneMatch(match) {
  return {
    placeId: match.placeId,
    place: { ...match.place },
    segmentIndex: match.segmentIndex,
    segment: match.segment,
    token: match.token,
    normalizedToken: match.normalizedToken,
    matchType: match.matchType,
    score: match.score,
    source: match.source
  };
}

function chainKey(chain) {
  return chain.places.map((match) => `${match.placeId}@${match.segmentIndex}:${match.normalizedToken}`).join('>');
}

function isMatchCompatible(prevMatch, nextMatch, hierarchy) {
  if (prevMatch.placeId === nextMatch.placeId) return false;
  if (nextMatch.segmentIndex < prevMatch.segmentIndex) return false;
  if (!hierarchy || typeof hierarchy.isAncestor !== 'function') {
    return prevMatch.segmentIndex !== nextMatch.segmentIndex;
  }
  return hierarchy.isAncestor(prevMatch.placeId, nextMatch.placeId);
}

function buildChains(segmentAnalyses, matchers) {
  const hierarchy = matchers?.hierarchy || null;
  if (!segmentAnalyses || !segmentAnalyses.length) return [];

  const matchesPerSegment = segmentAnalyses.map((analysis) => analysis.placeMatches || []);
  const chains = [];

  for (let index = 0; index < matchesPerSegment.length; index++) {
    const matches = matchesPerSegment[index];
    for (const match of matches) {
      let bestPrevChain = null;
      for (let prevIdx = index - 1; prevIdx >= 0; prevIdx--) {
        const prevMatches = matchesPerSegment[prevIdx];
        for (const prevMatch of prevMatches) {
          if (!isMatchCompatible(prevMatch, match, hierarchy)) continue;
          const prevChain = prevMatch._bestChain;
          if (!prevChain) continue;
          const candidateScore = prevChain.score + match.score + 0.15;
          if (!bestPrevChain || candidateScore > bestPrevChain.score) {
            bestPrevChain = {
              places: [...prevChain.places, match],
              score: candidateScore
            };
          }
        }
      }

      if (!bestPrevChain) {
        bestPrevChain = {
          places: [match],
          score: match.score + 0.01 * match.segmentIndex
        };
      }

      match._bestChain = bestPrevChain;
      chains.push(bestPrevChain);
    }
  }

  const uniqueChains = [];
  const seen = new Set();
  for (const chain of chains) {
    const key = chainKey(chain);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueChains.push(chain);
  }
  return uniqueChains;
}

function chooseBestChain(chains) {
  if (!chains || !chains.length) return null;
  return chains.reduce((best, chain) => {
    if (!best) return chain;
    const bestLen = best.places.length;
    const chainLen = chain.places.length;
    if (chainLen > bestLen) return chain;
    if (chainLen === bestLen && chain.score > best.score) return chain;
    if (chainLen === bestLen && chain.score === best.score) {
      const bestSpan = best.places[bestLen - 1].segmentIndex - best.places[0].segmentIndex;
      const chainSpan = chain.places[chainLen - 1].segmentIndex - chain.places[0].segmentIndex;
      if (chainSpan < bestSpan) return chain;
    }
    return best;
  }, null);
}

function collectTopics(segmentAnalyses, bestChain) {
  const recognized = new Set();
  const all = new Set();
  const perSegment = segmentAnalyses.map((analysis) => ({
    segment: analysis.segment,
    segmentIndex: analysis.segmentIndex,
    topics: analysis.topicTokens.slice(),
    recognized: analysis.recognizedTopics.slice()
  }));

  for (const analysis of segmentAnalyses) {
    for (const token of analysis.topicTokens) {
      all.add(token);
    }
    for (const token of analysis.recognizedTopics) {
      recognized.add(token);
    }
  }

  const bestIndices = new Set();
  if (bestChain && Array.isArray(bestChain.places)) {
    for (const match of bestChain.places) {
      bestIndices.add(match.segmentIndex);
    }
  }

  const firstPlaceIdx = bestChain?.places?.[0]?.segmentIndex ?? Infinity;
  const lastPlaceIdx = bestChain?.places?.[bestChain.places.length - 1]?.segmentIndex ?? -1;
  const leading = [];
  const trailing = [];

  for (const analysis of segmentAnalyses) {
    const isPlaceSegment = bestIndices.has(analysis.segmentIndex);
    if (!isPlaceSegment && analysis.segmentIndex < firstPlaceIdx) {
      leading.push(...(analysis.recognizedTopics.length ? analysis.recognizedTopics : analysis.topicTokens));
    } else if (!isPlaceSegment && analysis.segmentIndex > lastPlaceIdx) {
      trailing.push(...(analysis.recognizedTopics.length ? analysis.recognizedTopics : analysis.topicTokens));
    }
  }

  return {
    all: Array.from(all),
    recognized: Array.from(recognized),
    segments: perSegment,
    leading,
    trailing
  };
}

function cleanupMatchArtifacts(segmentAnalyses) {
  for (const analysis of segmentAnalyses) {
    for (const match of analysis.placeMatches) {
      delete match._bestChain;
    }
  }
}

function resolveUrlPlaces(url, matchers, options = {}) {
  if (!matchers) {
    return {
      matches: [],
      segments: [],
      chains: [],
      bestChain: null,
      topics: { all: [], recognized: [], segments: [], leading: [], trailing: [] }
    };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return {
      matches: [],
      segments: [],
      chains: [],
      bestChain: null,
      topics: { all: [], recognized: [], segments: [], leading: [], trailing: [] },
      error: error?.message || String(error)
    };
  }

  const segmentsRaw = parsed.pathname.split('/').filter(Boolean);
  const segmentAnalyses = segmentsRaw.map((segment, idx) => analyzeSegment(segment, idx, matchers));

  const chains = buildChains(segmentAnalyses, matchers);
  const bestChain = chooseBestChain(chains);
  const topics = collectTopics(segmentAnalyses, bestChain);

  cleanupMatchArtifacts(segmentAnalyses);

  const chainedKeys = new Map();
  const sanitizedChains = chains.map((chain) => {
    const key = chainKey(chain);
    chainedKeys.set(key, true);
    return {
      key,
      places: chain.places.map(cloneMatch),
      score: Number(chain.score.toFixed(4))
    };
  });

  const bestKey = bestChain ? chainKey(bestChain) : null;
  let sanitizedBestChain = null;
  if (bestKey) {
    sanitizedBestChain = sanitizedChains.find((chain) => chain.key === bestKey) || null;
  }

  const sanitizedSegments = segmentAnalyses.map((analysis) => ({
    segment: analysis.segment,
    segmentIndex: analysis.segmentIndex,
    tokens: analysis.tokens.slice(),
    placeMatches: analysis.placeMatches.map(cloneMatch),
    topicTokens: analysis.topicTokens.slice(),
    recognizedTopics: analysis.recognizedTopics.slice()
  }));

  const allMatches = sanitizedSegments.flatMap((analysis) => analysis.placeMatches);

  const outputChains = sanitizedChains.map(({ key, ...rest }) => rest);
  const outputBestChain = sanitizedBestChain ? { places: sanitizedBestChain.places, score: sanitizedBestChain.score } : null;

  return {
    matches: allMatches,
    segments: sanitizedSegments,
    chains: outputChains,
    bestChain: outputBestChain,
    topics
  };
}

function extractPlacesFromUrl(url, matchers, options = {}) {
  return resolveUrlPlaces(url, matchers, options);
}

function dedupeDetections(detections) {
  const seen = new Set();
  const output = [];

  for (const detection of detections || []) {
    const key = `${detection.source || 'unknown'}:${detection.place_id || detection.place || detection.name}:${detection.offset_start ?? detection.start}:${detection.offset_end ?? detection.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(detection);
  }

  return output;
}

function inferContext(db, url, title, section) {
  const context = { host: null, tld_cc: null, domain_cc: null, url_ccs: [], langs: [], section: section || null, title: title || null };

  try {
    const parsed = new URL(url);
    context.host = parsed.hostname.toLowerCase();
    const tld = context.host.split('.').pop();
    const tldMap = {
      uk: 'GB',
      gb: 'GB',
      ie: 'IE',
      fr: 'FR',
      de: 'DE',
      es: 'ES',
      it: 'IT',
      us: 'US',
      ca: 'CA',
      au: 'AU',
      nz: 'NZ',
      in: 'IN',
      cn: 'CN',
      jp: 'JP'
    };
    context.tld_cc = tldMap[tld] || null;

    try {
      const row = db.prepare('SELECT country_code, primary_langs FROM domain_locales WHERE host = ?').get(context.host);
      if (row) {
        context.domain_cc = row.country_code || null;
        if (row.primary_langs) {
          try {
            context.langs = JSON.parse(row.primary_langs);
          } catch (_) {
            context.langs = String(row.primary_langs)
              .split(/[;,\s]+/)
              .filter(Boolean);
          }
        }
      }
    } catch (_) {
      // ignore DB lookup failures
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    for (const segment of segments) {
      const lower = segment.toLowerCase();
      if (lower.length === 2 && /^[a-z]{2}$/.test(lower)) context.url_ccs.push(lower.toUpperCase());
      if (lower === 'uk') context.url_ccs.push('GB');
      if (lower === 'us') context.url_ccs.push('US');
      if (lower === 'ie') context.url_ccs.push('IE');
    }
  } catch (_) {
    // ignore URL parse failures
  }

  return context;
}

module.exports = {
  normName,
  slugify,
  buildGazetteerMatchers,
  pickBestCandidate,
  extractGazetteerPlacesFromText,
  resolveUrlPlaces,
  extractPlacesFromUrl,
  dedupeDetections,
  inferContext
};
