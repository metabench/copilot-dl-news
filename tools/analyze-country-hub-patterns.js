#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../src/db/sqlite');
const { PatternAggregator } = require('./lib/dspl/patternAggregator');
const { loadPlaceMetadata } = require('./lib/dspl/placeMetadata');
const { extractDomain, derivePatternFromUrl } = require('./lib/dspl/patternUtils');

function normalizeDomain(value) {
  if (!value) return null;
  return value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
}

function buildArticleQuery(domain) {
  let whereClause = '';
  const params = [];
  if (domain) {
    const host = domain.toLowerCase();
    whereClause = `
      AND (
        LOWER(host) = ? OR LOWER(host) = ?
        OR LOWER(url) LIKE ? OR LOWER(url) LIKE ?
      )
    `;
    params.push(host, `www.${host}`, `https://${host}%`, `https://www.${host}%`);
  }
  const sql = `
    SELECT url, title
      FROM articles
     WHERE title LIKE '%|%'
       AND url NOT LIKE '%/%/%/%/%'
       AND LENGTH(url) < 100
       ${whereClause}
  `;
  return { sql, params };
}

function shouldSkipSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return true;
  if (segments.length > 4) return true;
  if (segments.includes('live')) return true;
  if (segments.some((segment) => /\d{4}/.test(segment))) return true;
  return false;
}

function isLikelyCountryHub(title, country, token) {
  if (!title) return false;
  const lowerTitle = title.toLowerCase();
  const tokenLower = token ? token.toLowerCase() : null;
  const canonicalLower = country?.name ? country.name.toLowerCase() : null;
  const candidates = [];
  if (tokenLower) candidates.push(tokenLower);
  if (canonicalLower && canonicalLower !== tokenLower) candidates.push(canonicalLower);
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (lowerTitle.startsWith(candidate)) return true;
    if (lowerTitle.includes(`| ${candidate} |`)) return true;
    if (lowerTitle.includes(`${candidate} |`)) return true;
  }
  return false;
}

function collectCountryPatternsFromArticles(db, countryMetadata, domain, { silent = false } = {}) {
  const { sql, params } = buildArticleQuery(domain);
  const rows = db.prepare(sql).all(...params);
  if (!silent) {
    console.log(`Found ${rows.length} potential hub pages`);
  }
  const byDomain = new Map();

  for (const row of rows) {
    const domainKey = extractDomain(row.url);
    if (!domainKey) continue;

    let urlObj;
    try {
      urlObj = new URL(row.url);
    } catch (err) {
      continue;
    }

    const segments = urlObj.pathname.split('/').filter(Boolean);
    if (shouldSkipSegments(segments)) continue;

    let matchedCountry = null;
    let matchedToken = null;
    for (const segment of segments) {
      const country = countryMetadata.matchSegment(segment);
      if (country) {
        matchedCountry = country;
        matchedToken = segment;
        break;
      }
    }

    if (!matchedCountry) continue;
    if (!isLikelyCountryHub(row.title, matchedCountry, matchedToken)) continue;

    const placeholders = {
      slug: matchedToken,
      code: matchedCountry.code ? matchedCountry.code.toLowerCase() : null
    };
    const pattern = derivePatternFromUrl(row.url, placeholders);
    if (!pattern) continue;

    if (!byDomain.has(domainKey)) {
      byDomain.set(domainKey, new PatternAggregator());
    }
    const aggregator = byDomain.get(domainKey);
    aggregator.record(pattern, {
      url: row.url,
      title: row.title,
      country: matchedCountry.name
    });
  }

  return byDomain;
}

function collectPatternsFromPlaceHubs(db, metadata, domain) {
  const normalizedDomain = normalizeDomain(domain);
  const params = [];
  let whereClause = `place_kind IN ('country','region','city')`;
  if (normalizedDomain) {
    whereClause += ` AND (
      LOWER(host) = ? OR LOWER(host) = ?
      OR LOWER(url) LIKE ? OR LOWER(url) LIKE ?
    )`;
    params.push(normalizedDomain, `www.${normalizedDomain}`, `https://${normalizedDomain}%`, `https://www.${normalizedDomain}%`);
  }
  const rows = db.prepare(`
    SELECT host, url, place_slug AS slug, place_kind AS kind
      FROM place_hubs
     WHERE ${whereClause}
       AND url LIKE 'http%'
       AND place_slug IS NOT NULL
  `).all(...params);

  const byDomain = new Map();

  for (const row of rows) {
    const domainKey = normalizeDomain(row.host) || extractDomain(row.url);
    if (!domainKey) continue;
    if (!byDomain.has(domainKey)) {
      byDomain.set(domainKey, {
        country: new PatternAggregator(),
        region: new PatternAggregator(),
        city: new PatternAggregator()
      });
    }

    const entry = byDomain.get(domainKey);
    const slug = row.slug?.toLowerCase();
    if (!slug) continue;

    const placeholders = { slug };
    if (row.kind === 'country') {
      const country = metadata.countries.getBySlug(slug);
      if (country?.code) placeholders.code = country.code.toLowerCase();
    } else if (row.kind === 'region') {
      const region = metadata.regions.get(slug);
      if (region?.countryCode) placeholders.code = region.countryCode;
      if (region?.regionCode) placeholders.regionCode = region.regionCode;
    } else if (row.kind === 'city') {
      const city = metadata.cities.get(slug);
      if (city?.countryCode) placeholders.code = city.countryCode;
      if (city?.regionCode) placeholders.regionCode = city.regionCode;
    }

    const pattern = derivePatternFromUrl(row.url, placeholders);
    if (!pattern) continue;

    const bucket = entry[row.kind];
    if (!bucket) continue;

    bucket.record(pattern, {
      url: row.url,
      slug: row.slug,
      kind: row.kind
    });
  }

  return byDomain;
}

function mergeAggregators(primary, secondary) {
  if (!primary && !secondary) return null;
  const combined = new PatternAggregator();
  if (primary) combined.mergeAggregator(primary);
  if (secondary) combined.mergeAggregator(secondary);
  return combined.isEmpty() ? null : combined;
}

function summarisePatterns(aggregator) {
  if (!aggregator) {
    return { patterns: [], totalExamples: 0, verifiedCount: 0 };
  }
  const summary = aggregator.summary();
  const verifiedCount = summary.patterns.filter((item) => item.verified).length;
  return { ...summary, verifiedCount };
}

function buildDspl(domain, countryAgg, hubAggs, generatedAt) {
  const combinedCountry = mergeAggregators(countryAgg, hubAggs?.country);
  const countrySummary = summarisePatterns(combinedCountry);
  const regionSummary = summarisePatterns(hubAggs?.region);
  const citySummary = summarisePatterns(hubAggs?.city);

  return {
    domain,
    generated: generatedAt,
    countryHubPatterns: countrySummary.patterns,
    regionHubPatterns: regionSummary.patterns,
    cityHubPatterns: citySummary.patterns,
    stats: {
      totalPatterns: countrySummary.patterns.length,
      verifiedPatterns: countrySummary.verifiedCount,
      totalExamples: countrySummary.totalExamples,
      regionPatterns: {
        total: regionSummary.patterns.length,
        verified: regionSummary.verifiedCount,
        totalExamples: regionSummary.totalExamples
      },
      cityPatterns: {
        total: citySummary.patterns.length,
        verified: citySummary.verifiedCount,
        totalExamples: citySummary.totalExamples
      }
    }
  };
}

function formatHumanReport(domain, dspl, countryAgg, hubAggs) {
  const lines = [];
  lines.push(`\n${'='.repeat(70)}`);
  lines.push(`Domain: ${domain}`);
  lines.push(`${'='.repeat(70)}`);
  lines.push(`Country patterns: ${dspl.stats.totalPatterns} (verified: ${dspl.stats.verifiedPatterns})`);
  lines.push(`Region patterns: ${dspl.stats.regionPatterns.total} (verified: ${dspl.stats.regionPatterns.verified})`);
  lines.push(`City patterns:   ${dspl.stats.cityPatterns.total} (verified: ${dspl.stats.cityPatterns.verified})`);
  lines.push('');

  const listPatterns = (label, aggregator) => {
    if (!aggregator || aggregator.isEmpty()) return;
    lines.push(`  ${label}:`);
    const entries = aggregator.toDebugArray().slice(0, 10);
    for (const entry of entries) {
      const status = entry.count >= 3 ? '✓' : '?';
      const confidence = (Math.min(entry.count / 5, 1) * 100).toFixed(0);
      lines.push(`    ${status} ${entry.pattern.padEnd(36)} (confidence: ${confidence}%, examples: ${entry.examplesCount || 0})`);
    }
    lines.push('');
  };

  const combinedCountry = mergeAggregators(countryAgg, hubAggs?.country);
  listPatterns('Country patterns', combinedCountry);
  listPatterns('Region patterns', hubAggs?.region);
  listPatterns('City patterns', hubAggs?.city);

  if (combinedCountry && !combinedCountry.isEmpty()) {
    const topEntry = combinedCountry.toDebugArray()[0];
    if (topEntry) {
      lines.push(`  Examples of top country pattern (${topEntry.pattern}):`);
      const samples = Array.isArray(topEntry.examples) ? topEntry.examples.slice(0, 3) : [];
      for (const sample of samples) {
        if (!sample) continue;
        const label = sample.title || sample.slug || '';
        const context = sample.country || sample.slug || '';
        lines.push(`    • ${sample.url}`);
        lines.push(`      "${label}..."${context ? ` [${context}]` : ''}`);
      }
      lines.push('');
    }
  }

  lines.push('Tip: Use --json to export as DSPL for automatic import');
  return lines.join('\n');
}

function saveDsplToDisk(domain, dspl, outputDir) {
  const filepath = path.join(outputDir, `${domain}.json`);
  const data = { [domain]: dspl };
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  return filepath;
}

function main() {
  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');
  if (showHelp) {
    console.log(`
Usage: node tools/analyze-country-hub-patterns.js [domain] [options]

Examples:
  node tools/analyze-country-hub-patterns.js theguardian.com
  node tools/analyze-country-hub-patterns.js --all

Options:
  --all     Analyze all domains in database
  --json    Output as JSON
  --save    Save DSPL to data/dspls/ directory
  --help    Show this help
`);
    process.exit(0);
  }

  const domainArg = args.find((value) => !value.startsWith('--')) || null;
  const domain = domainArg === '--all' ? null : domainArg;
  const jsonMode = args.includes('--json');
  const saveMode = args.includes('--save');

  const dbPath = path.join(__dirname, '..', 'data', 'news.db');
  const db = ensureDatabase(dbPath);
  const metadata = loadPlaceMetadata(db);

  const silentAnalysis = jsonMode || saveMode;
  const countryPatterns = collectCountryPatternsFromArticles(db, metadata.countries, domain, { silent: silentAnalysis });
  const hubPatterns = collectPatternsFromPlaceHubs(db, metadata, domain);

  const domainSet = new Set();
  for (const key of countryPatterns.keys()) domainSet.add(key);
  for (const key of hubPatterns.keys()) domainSet.add(key);
  if (domain) domainSet.add(normalizeDomain(domain));
  const domains = Array.from(domainSet).sort();

  const generatedAt = new Date().toISOString();
  const dsplMap = new Map();

  for (const d of domains) {
    const countryAgg = countryPatterns.get(d) || null;
    const hubAggs = hubPatterns.get(d) || null;
    const dspl = buildDspl(d, countryAgg, hubAggs, generatedAt);
    if (
      dspl.countryHubPatterns.length === 0 &&
      dspl.regionHubPatterns.length === 0 &&
      dspl.cityHubPatterns.length === 0
    ) {
      continue;
    }
    dsplMap.set(d, { dspl, countryAgg, hubAggs });
  }

  if (saveMode) {
    const outputDir = path.join(__dirname, '..', 'data', 'dspls');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    for (const [domainKey, entry] of dsplMap.entries()) {
      const filepath = saveDsplToDisk(domainKey, entry.dspl, outputDir);
      const stats = entry.dspl.stats;
      console.log(
        `✓ Saved DSPL: ${path.basename(filepath)} ` +
        `(countries: ${stats.verifiedPatterns}/${stats.totalPatterns}, ` +
        `regions: ${stats.regionPatterns.verified}/${stats.regionPatterns.total}, ` +
        `cities: ${stats.cityPatterns.verified}/${stats.cityPatterns.total})`
      );
    }
    if (dsplMap.size === 0) {
      console.log('No domains with hub patterns found.');
    }
    console.log(`\nDSPLs saved to: ${path.join('data', 'dspls')}`);
    db.close();
    return;
  }

  if (jsonMode) {
    const payload = {};
    for (const [domainKey, entry] of dsplMap.entries()) {
      payload[domainKey] = entry.dspl;
    }
    console.log(JSON.stringify(payload, null, 2));
    db.close();
    return;
  }

  for (const [domainKey, entry] of dsplMap.entries()) {
    const report = formatHumanReport(domainKey, entry.dspl, entry.countryAgg, entry.hubAggs);
    console.log(report);
  }

  if (dsplMap.size === 0) {
    console.log('No patterns discovered.');
  }

  db.close();
}

if (require.main === module) {
  main();
}
