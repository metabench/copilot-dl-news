'use strict';

class CompletionReporter {
  constructor(deps = {}) {
    this._setDefaults();
    this.updateDependencies(deps);
  }

  _setDefaults() {
    this.state = null;
    this.telemetry = null;
    this.domain = null;
    this.getPlanSummary = () => ({});
    this.getStats = () => ({});
  }

  updateDependencies({
    state,
    telemetry,
    domain,
    getPlanSummary,
    getStats
  } = {}) {
    if (state) this.state = state;
    if (telemetry) this.telemetry = telemetry;
    if (domain !== undefined) this.domain = domain;
    if (typeof getPlanSummary === 'function') this.getPlanSummary = getPlanSummary;
    if (typeof getStats === 'function') this.getStats = getStats;
  }

  emit({ outcomeErr } = {}) {
    if (!this.telemetry || typeof this.telemetry.milestone !== 'function') {
      return;
    }

    const seededUnique = this._getSeededHubCount();
    const summary = this._coerceObject(this.getPlanSummary());
    const sections = this._numeric(summary.sectionHubCount);
    const countryCandidates = this._numeric(summary.countryCandidateCount);
    const requested = summary.requestedCount != null ? summary.requestedCount : sections + countryCandidates;
    const expected = Math.max(requested || 0, sections + countryCandidates, seededUnique);
    const coveragePct = expected > 0 ? Math.min(1, seededUnique / expected) : null;

    const problems = this._collectProblems();
    problems.sort((a, b) => (b.count || 0) - (a.count || 0));

    const stats = this._coerceObject(this.getStats());

    const details = {
      outcome: outcomeErr ? 'failed' : 'completed',
      seededHubs: {
        unique: seededUnique,
        requested: requested || 0,
        sectionsFromPatterns: sections,
        countryCandidates,
        sample: Array.isArray(summary.sampleSeeded) ? summary.sampleSeeded.slice(0, 5) : undefined
      },
      coverage: coveragePct != null ? {
        expected,
        seeded: seededUnique,
        coveragePct
      } : undefined,
      problems: problems.length ? problems : undefined,
      stats: {
        visited: this._numeric(stats.pagesVisited),
        downloaded: this._numeric(stats.pagesDownloaded),
        articlesFound: this._numeric(stats.articlesFound),
        articlesSaved: this._numeric(stats.articlesSaved),
        errors: this._numeric(stats.errors)
      }
    };

    this.telemetry.milestone({
      kind: 'intelligent-completion',
      scope: this.domain,
      message: outcomeErr ? 'Intelligent crawl ended with errors' : 'Intelligent crawl completed',
      details
    });
  }

  _collectProblems() {
    const problems = [];
    const telemetrySummary = typeof this.telemetry?.getProblemSummary === 'function'
      ? this.telemetry.getProblemSummary()
      : null;

    if (telemetrySummary) {
      const counters = Array.isArray(telemetrySummary.counters)
        ? telemetrySummary.counters
        : (telemetrySummary.counters ? Array.from(telemetrySummary.counters) : []);
      const samples = this._coerceObject(telemetrySummary.samples);
      for (const item of counters) {
        if (!item || !item.kind) continue;
        const sample = this._coerceObject(samples[item.kind]);
        problems.push({
          kind: item.kind,
          count: this._numeric(item.count),
          sample: sample && Object.keys(sample).length ? sample : undefined
        });
      }
    }

    if (!problems.length) {
      const counters = this.state?.getProblemCounters ? this.state.getProblemCounters() : null;
      const samples = this.state?.getProblemSamples ? this.state.getProblemSamples() : null;
      if (counters && typeof counters[Symbol.iterator] === 'function') {
        for (const [kind, entry] of counters) {
          if (!entry || !entry.count) continue;
          const sample = typeof samples?.get === 'function' ? samples.get(kind) : undefined;
          const normalizedSample = this._coerceObject(sample);
          problems.push({
            kind,
            count: this._numeric(entry.count),
            sample: normalizedSample && Object.keys(normalizedSample).length ? normalizedSample : undefined
          });
        }
      }
    }

    return problems;
  }

  _getSeededHubCount() {
    if (!this.state || typeof this.state.getSeededHubCount !== 'function') {
      return 0;
    }
    try {
      return this._numeric(this.state.getSeededHubCount());
    } catch (_) {
      return 0;
    }
  }

  _numeric(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  _coerceObject(value) {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return value;
  }
}

module.exports = {
  CompletionReporter
};
