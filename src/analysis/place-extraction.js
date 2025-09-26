const { URL } = require('url');

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

function buildGazetteerMatchers(db) {
  const nameMap = new Map();
  const slugMap = new Map();

  const TEST_FAST = process.env.TEST_FAST === '1' || process.env.TEST_FAST === 'true';
  const CITY_LIMIT = TEST_FAST ? 500 : 5000;

  const countryRows = db
    .prepare(`
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
         AND p.kind IN ('country', 'region')
    `)
    .all();

  for (const row of countryRows) {
    const key = normName(row.norm || row.name);
    const record = {
      place_id: row.place_id,
      kind: row.kind,
      country_code: row.country_code || null,
      name: row.name,
      population: row.population
    };

    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(record);

    const slug = slugify(row.name);
    if (!slugMap.has(slug)) slugMap.set(slug, []);
    slugMap.get(slug).push(record);
  }

  const cityRows = db
    .prepare(`
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
    `)
    .all();

  for (const row of cityRows) {
    const key = normName(row.norm || row.name);
    const record = {
      place_id: row.place_id,
      kind: row.kind,
      country_code: row.country_code || null,
      name: row.name,
      population: row.population
    };

    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(record);

    const slug = slugify(row.name);
    if (!slugMap.has(slug)) slugMap.set(slug, []);
    slugMap.get(slug).push(record);
  }

  return { nameMap, slugMap };
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
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    tokens.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }

  const maxWindow = 4;
  for (let i = 0; i < tokens.length; i++) {
    let matched = false;
    for (let windowSize = Math.min(maxWindow, tokens.length - i); windowSize >= 1; windowSize--) {
      const phrase = tokens.slice(i, i + windowSize).map(t => t.word).join(' ');
      const key = normName(phrase);
      const candidates = matchers.nameMap.get(key);
      if (candidates && candidates.length) {
        const record = pickBestCandidate(candidates, ctx, isTitle);
        results.push({
          name: record.name,
          kind: record.kind,
          country_code: record.country_code,
          place_id: record.place_id,
          start: tokens[i].start,
          end: tokens[i + windowSize - 1].end
        });
        i += windowSize - 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      continue;
    }
  }

  return results;
}

function extractPlacesFromUrl(url, matchers) {
  const results = [];
  if (!matchers) return results;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);

    for (const segment of segments) {
      const parts = segment.split('-');
      const candidates = [segment, ...parts];

      for (const part of candidates) {
        const slug = slugify(part);
        if (!slug) continue;
        const records = matchers.slugMap.get(slug);
        if (records && records.length) {
          const record = records[0];
          results.push({
            name: record.name,
            kind: record.kind,
            country_code: record.country_code,
            place_id: record.place_id
          });
        }
      }
    }
  } catch (_) {
    // ignore URL parse failures
  }

  return results;
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
  extractPlacesFromUrl,
  dedupeDetections,
  inferContext
};
