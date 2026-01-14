'use strict';

const { CountryHubGapAnalyzer } = require('./CountryHubGapAnalyzer');

function ensureOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('createCountryHubGapReporter requires an options object');
  }
  if (!options.db) {
    throw new Error('createCountryHubGapReporter requires a database connection (options.db)');
  }
}

function normalizeHost(domain) {
  if (!domain) return '';
  const trimmed = String(domain).trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }
}

function formatMissingCountries(missingCountries, {
  lineLimit = 25,
  previewLimit = 5,
  includeStatus = true
} = {}) {
  const list = Array.isArray(missingCountries) ? missingCountries : [];
  const lines = list.slice(0, lineLimit).map((country) => {
    const name = country?.name || 'Unknown';
    const code = country?.code ? ` (${country.code})` : '';
    const status = includeStatus ? ` [${country?.status || 'unmapped'}]` : '';
    const urlSuffix = country?.url ? ` → ${country.url}` : '';
    return `  • ${name}${code}${status}${urlSuffix}`;
  });

  const previewNames = list
    .slice(0, previewLimit)
    .map((country) => country?.name || 'Unknown');

  const moreAfterLines = Math.max(list.length - lineLimit, 0);
  const moreAfterPreview = Math.max(list.length - previewLimit, 0);

  return {
    lines,
    previewNames,
    moreAfterLines,
    moreAfterPreview,
    total: list.length
  };
}

function formatAnalysis(analysis, {
  missingLineLimit = 25,
  includeStatus = true
} = {}) {
  const lines = [];
  lines.push(`Seeded:           ${analysis.seeded}`);
  lines.push(`Visited:          ${analysis.visited}`);
  lines.push(`Missing:          ${analysis.missing}`);
  lines.push(`Coverage:         ${analysis.coveragePercent}%`);
  lines.push(`Complete:         ${analysis.isComplete ? 'Yes' : 'No'}`);

  const missing = formatMissingCountries(analysis.missingCountries, {
    lineLimit: missingLineLimit,
    includeStatus
  });

  return {
    headerLines: lines,
    missing,
    totalLines: lines.length + missing.lines.length,
    timestamp: analysis.timestamp,
    domain: analysis.domain
  };
}

function createCountryHubGapReporter({ db, analyzer = null, logger = console } = {}) {
  ensureOptions({ db });
  const gapAnalyzer = analyzer || new CountryHubGapAnalyzer({ db, logger });

  function analyzeDomain(domain, hubStats = {}) {
    return gapAnalyzer.analyzeGaps(domain, hubStats);
  }

  function analyzeHost(host, hubStats = {}) {
    return analyzeDomain(normalizeHost(host), hubStats);
  }

  function analyzeAndFormat(domain, options = {}) {
    const analysis = analyzeDomain(domain, options.hubStats || {});
    const formatted = formatAnalysis(analysis, options);
    return { analysis, formatted };
  }

  return {
    analyzer: gapAnalyzer,
    analyzeDomain,
    analyzeHost,
    analyzeAndFormat
  };
}

module.exports = {
  createCountryHubGapReporter,
  formatAnalysis,
  formatMissingCountries,
  normalizeHost
};

