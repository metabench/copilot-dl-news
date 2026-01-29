'use strict';

const MAX_SECTION_PREVIEW = 12;
const MAX_NAVIGATION_LINKS = 25;
const MAX_SEEDED_SAMPLE = 20;
const MAX_COUNTRY_SAMPLE = 25;
const MAX_NAVIGATION_SAMPLE = 20;
const MAX_TARGETED_SAMPLES = 15;

class PlanBlueprintBuilder {
  constructor({ sessionId = null, domain = null } = {}) {
    this.sessionId = sessionId || null;
    this.domain = domain || null;
    this.sections = {
      learned: [],
      hints: []
    };
    this.navigation = {
      summary: null,
      candidates: [],
      seeded: []
    };
    this.countryCandidates = [];
    this.seedPlan = {
      requested: 0,
      seeded: 0,
      entries: [],
      seededEntries: []
    };
    this.targetedAnalysis = null;
    this.patternBootstrap = null;
  }

  recordBootstrap(result) {
    if (!result || typeof result !== 'object') return;
    this.patternBootstrap = {
      allowed: result.allowed !== false,
      skipPlan: !!result.skipPlan,
      plannerVerbosity: result.plannerVerbosity || null,
      targetHosts: Array.isArray(result.targetHosts) ? result.targetHosts.slice(0, 8) : null
    };
  }

  recordPatternInference(result) {
    if (!result || typeof result !== 'object') return;
    const sections = Array.isArray(result.learned?.sections) ? result.learned.sections : [];
    const hints = Array.isArray(result.learned?.articleHints) ? result.learned.articleHints : [];
    this.sections.learned = sections.slice(0, MAX_SECTION_PREVIEW);
    this.sections.hints = hints.slice(0, MAX_SECTION_PREVIEW);
  }

  recordNavigation(result, linkCandidates = []) {
    if (result && typeof result === 'object') {
      this.navigation.summary = this._trimNavigationSummary(result.summary || result);
    }
    const candidates = Array.isArray(linkCandidates) ? linkCandidates : [];
    this.navigation.candidates = candidates.slice(0, MAX_NAVIGATION_LINKS).map((candidate) => this._trimNavigationCandidate(candidate));
  }

  recordCountryCandidates(candidates = []) {
    if (!Array.isArray(candidates)) return;
    this.countryCandidates = candidates.slice(0, MAX_COUNTRY_SAMPLE).map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      return {
        url: candidate.url || null,
        slug: candidate.slug || null,
        source: candidate.source || null,
        reason: candidate.reason || null,
        score: candidate.score || null
      };
    }).filter(Boolean);
  }

  recordSeedCandidates(entries = []) {
    if (!Array.isArray(entries)) return;
    const trimmed = entries.slice(0, MAX_NAVIGATION_LINKS).map((entry) => this._trimSeedEntry(entry));
    this.seedPlan.entries = trimmed;
  }

  recordSeedOutcome({ entry, enqueued, normalized } = {}) {
    if (!entry || typeof entry !== 'object') return;
    const trimmed = {
      url: entry.url || null,
      meta: this._trimSeedMeta(entry.meta),
      normalized: normalized || null,
      enqueued: !!enqueued
    };
    this.seedPlan.seededEntries.push(trimmed);
    if (trimmed.enqueued) {
      this.navigation.seeded.push(trimmed.url);
    }
    if (this.seedPlan.seededEntries.length > MAX_SEEDED_SAMPLE) {
      this.seedPlan.seededEntries.splice(0, this.seedPlan.seededEntries.length - MAX_SEEDED_SAMPLE);
    }
    if (this.navigation.seeded.length > MAX_NAVIGATION_SAMPLE) {
      this.navigation.seeded.splice(0, this.navigation.seeded.length - MAX_NAVIGATION_SAMPLE);
    }
  }

  recordSeedResult(result) {
    if (!result || typeof result !== 'object') return;
    this.seedPlan.requested = Number(result.requestedCount) || 0;
    this.seedPlan.seeded = Number(result.seededCount) || 0;
    if (Array.isArray(result.sampleSeeded)) {
      this.seedPlan.sampleSeeded = result.sampleSeeded.slice(0, MAX_SEEDED_SAMPLE);
    }
    if (Array.isArray(result.navigationSample)) {
      this.navigation.seedSample = result.navigationSample.slice(0, MAX_NAVIGATION_SAMPLE);
    }
  }

  recordTargetedAnalysis(result) {
    if (!result || typeof result !== 'object') {
      this.targetedAnalysis = null;
      return;
    }
    const samples = Array.isArray(result.samples) ? result.samples.slice(0, MAX_TARGETED_SAMPLES).map((sample) => this._trimTargetedSample(sample)) : [];
    const coverage = result.coverage && typeof result.coverage === 'object' ? { ...result.coverage } : null;
    const topKeywords = Array.isArray(result.topKeywords) ? result.topKeywords.slice(0, 10) : [];
    this.targetedAnalysis = {
      analysedCount: samples.length,
      samples,
      coverage,
      topKeywords
    };
  }

  build({ plannerSummary = null, intelligentSummary = null } = {}) {
    return {
      sessionId: this.sessionId,
      domain: this.domain,
      bootstrap: this.patternBootstrap,
      sections: {
        learned: this.sections.learned.slice(),
        hints: this.sections.hints.slice()
      },
      navigation: {
        summary: this.navigation.summary,
        candidates: this.navigation.candidates.slice(),
        seeded: this.navigation.seeded.slice(),
        seedSample: Array.isArray(this.navigation.seedSample) ? this.navigation.seedSample.slice() : undefined
      },
      countryCandidates: this.countryCandidates.slice(),
      seedPlan: {
        requested: this.seedPlan.requested,
        seeded: this.seedPlan.seeded,
        entries: this.seedPlan.entries.slice(),
        seededEntries: this.seedPlan.seededEntries.slice(),
        sampleSeeded: Array.isArray(this.seedPlan.sampleSeeded) ? this.seedPlan.sampleSeeded.slice() : undefined
      },
      targetedAnalysis: this.targetedAnalysis ? { ...this.targetedAnalysis } : null,
      plannerSummary: plannerSummary ? { ...plannerSummary } : null,
      intelligentSummary: intelligentSummary ? { ...intelligentSummary } : null
    };
  }

  _trimNavigationSummary(summary) {
    if (!summary || typeof summary !== 'object') {
      return null;
    }
    const keys = ['totalLinks', 'primary', 'secondary', 'categories', 'meta', 'analysedPages', 'topLinks', 'samples', 'focusSections'];
    const trimmed = {};
    for (const key of keys) {
      if (summary[key] !== undefined) {
        if (Array.isArray(summary[key])) {
          trimmed[key] = summary[key].slice(0, MAX_NAVIGATION_LINKS);
        } else {
          trimmed[key] = summary[key];
        }
      }
    }
    return trimmed;
  }

  _trimNavigationCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    return {
      url: candidate.url || null,
      labels: Array.isArray(candidate.labels) ? candidate.labels.slice(0, 3) : null,
      type: candidate.type || null,
      occurrences: Number(candidate.occurrences) || null,
      scores: candidate.scores && typeof candidate.scores === 'object' ? { ...candidate.scores } : undefined
    };
  }

  _trimSeedEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
      url: entry.url || null,
      meta: this._trimSeedMeta(entry.meta)
    };
  }

  _trimSeedMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const allowed = ['kind', 'source', 'reason', 'slug', 'label', 'priorityBias', 'occurrences'];
    const trimmed = {};
    for (const key of allowed) {
      if (meta[key] !== undefined) {
        trimmed[key] = meta[key];
      }
    }
    return Object.keys(trimmed).length ? trimmed : null;
  }

  _trimTargetedSample(sample) {
    if (!sample || typeof sample !== 'object') return null;
    return {
      url: sample.url || null,
      section: sample.section || null,
      headline: sample.headline || null,
      classification: sample.classification || null,
      wordCount: typeof sample.wordCount === 'number' ? sample.wordCount : null,
      keyPhrases: Array.isArray(sample.keyPhrases) ? sample.keyPhrases.slice(0, 5) : []
    };
  }
}

module.exports = {
  PlanBlueprintBuilder
};
