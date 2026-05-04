"use strict";

function parseResultDate(result) {
  const value = result && (result.date || result.published_at || result.publishedAt || result.fetched_at || result.fetchedAt);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ageDays(date, now) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function computeSearchFreshness(results = [], now = new Date()) {
  const rows = Array.isArray(results) ? results : [];
  const dated = rows
    .map((row) => parseResultDate(row))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  if (rows.length === 0) {
    return {
      freshnessLabel: "No Results",
      confidenceBand: "Low",
      confidenceScore: 0,
      coveragePct: 0,
      totalResults: 0,
      datedResults: 0,
      newestAgeDays: null,
      oldestAgeDays: null,
      newestDate: null,
      oldestDate: null,
      staleResults: 0,
      summary: "No results",
    };
  }

  const newest = dated[0] || null;
  const oldest = dated[dated.length - 1] || null;
  const newestAge = newest ? ageDays(newest, now) : null;
  const oldestAge = oldest ? ageDays(oldest, now) : null;
  const staleResults = dated.filter((date) => ageDays(date, now) > 30).length;
  const coveragePct = Math.round((dated.length / rows.length) * 100);

  let freshnessLabel = "Unknown";
  if (newestAge !== null) {
    if (newestAge <= 2) freshnessLabel = "Fresh";
    else if (newestAge <= 14) freshnessLabel = "Recent";
    else if (newestAge <= 30) freshnessLabel = "Aging";
    else freshnessLabel = "Stale";
  }

  const recencyScore = newestAge === null ? 20 : Math.max(0, 100 - newestAge * 3);
  const confidenceScore = Math.round((recencyScore * 0.7) + (coveragePct * 0.3));
  const confidenceBand = confidenceScore >= 80 ? "High" : confidenceScore >= 50 ? "Medium" : "Low";

  return {
    freshnessLabel,
    confidenceBand,
    confidenceScore,
    coveragePct,
    totalResults: rows.length,
    datedResults: dated.length,
    newestAgeDays: newestAge,
    oldestAgeDays: oldestAge,
    newestDate: newest ? newest.toISOString().slice(0, 10) : null,
    oldestDate: oldest ? oldest.toISOString().slice(0, 10) : null,
    staleResults,
    summary: `${freshnessLabel} · ${confidenceBand} confidence (${confidenceScore}%)`,
  };
}

module.exports = { computeSearchFreshness };