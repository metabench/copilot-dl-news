'use strict';

const DEFAULT_WEIGHTS = Object.freeze({
  coverage_novelty: 0.18,
  policy_compliance: 0.14,
  trap_risk: 0.12,
  feasibility: 0.14,
  cost_time: 0.12,
  precision_proxy: 0.12,
  explainability: 0.09,
  stability: 0.05,
  diversity: 0.04
});

/**
 * PlanEvaluator – converts blueprint + telemetry into scorecard metrics.
 */
class PlanEvaluator {
  constructor({
    weights = DEFAULT_WEIGHTS,
    effectivenessTracker = null,
    logger = console
  } = {}) {
    this.weights = weights;
    this.effectivenessTracker = effectivenessTracker;
    this.logger = logger;
  }

  /**
   * Score a blueprint.
   * @param {Object} blueprint
   * @param {Object} context { validatorMetrics, telemetry, history }
   * @returns {Object} planScore
   */
  score(blueprint, context = {}) {
    if (!blueprint || typeof blueprint !== 'object') {
      throw new Error('PlanEvaluator requires blueprint');
    }

    const metrics = this._calculateMetrics(blueprint, context);
    const totalScore = this._weightedScore(metrics);
    const recommendedAction = this._recommend(metrics, totalScore);

    const planScore = {
      totalScore,
      confidence: this._confidence(metrics, context),
      recommendedAction,
      metrics
    };

    if (this.effectivenessTracker) {
      try {
        this.effectivenessTracker.observePreviewScore(planScore, blueprint, context);
      } catch (error) {
        this._log('warn', 'EffectivenessTracker.observePreviewScore failed', error?.message || error);
      }
    }

    return planScore;
  }

  _calculateMetrics(blueprint, context) {
    const validatorMetrics = context.validatorMetrics || {};
    const telemetry = context.telemetry || {};
    const history = context.history || {};

    const seeds = Array.isArray(blueprint.seedQueue) ? blueprint.seedQueue : [];
    const hubs = Array.isArray(blueprint.proposedHubs) ? blueprint.proposedHubs : [];
    const dedupSeeds = new Set(seeds.map(seed => this._normaliseUrl(seed?.url))); // includes undefined
    const dedupHubs = new Set(hubs.map(h => this._normaliseUrl(h?.url)));

    const coverage = this._coverageNovelty(seeds, history);
    const compliance = validatorMetrics.robotsOk && validatorMetrics.concurrencyOk ? 1 : 0.4;
    const trapRisk = 1 - Math.min(1, validatorMetrics.trapRisk ?? 0.5);
    const feasibility = this._feasibilityScore(blueprint, validatorMetrics);
    const costTime = this._costTimeScore(blueprint, telemetry, history);
    const precisionProxy = this._precisionProxy(history, blueprint);
    const explainability = this._explainabilityScore(blueprint);
    const stability = this._stabilityScore(blueprint, context);
    const diversity = this._diversityScore(dedupSeeds, dedupHubs);

    return {
      coverage_novelty: coverage,
      policy_compliance: compliance,
      trap_risk: trapRisk,
      feasibility,
      cost_time: costTime,
      precision_proxy: precisionProxy,
      explainability,
      stability,
      diversity
    };
  }

  _weightedScore(metrics) {
    let score = 0;
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(this.weights)) {
      const metric = typeof metrics[key] === 'number' ? metrics[key] : 0;
      score += metric * weight;
      totalWeight += weight;
    }
    if (totalWeight === 0) return 0;
    return Number((score / totalWeight).toFixed(3));
  }

  _recommend(metrics, totalScore) {
    if (totalScore >= 0.7 && metrics.explainability >= 0.6 && metrics.precision_proxy >= 0.6) {
      return 'accept_microprolog';
    }
    if (totalScore >= 0.5) {
      return 'fuse';
    }
    if (metrics.policy_compliance < 0.8 || metrics.trap_risk < 0.4) {
      return 'replan';
    }
    return 'accept_alternative';
  }

  _confidence(metrics, context) {
    const variance = this._variance(Object.values(metrics));
    const historyStrength = context.history?.similarDomains || 0;
    const adjustment = Math.min(0.2, historyStrength * 0.05);
    const base = variance > 0.05 ? 0.5 : 0.7;
    return Number(Math.max(0, Math.min(1, base + adjustment)).toFixed(3));
  }

  _coverageNovelty(seeds, history) {
    if (!seeds.length) return 0;
    const unique = new Set(seeds.map(seed => this._normaliseUrl(seed?.url))).size;
    const noveltyBonus = history.noveltyLift || 0.1;
    return Number(Math.min(1, (unique / Math.max(5, seeds.length)) + noveltyBonus).toFixed(3));
  }

  _feasibilityScore(blueprint, validatorMetrics) {
    const constraints = Array.isArray(blueprint.schedulingConstraints)
      ? blueprint.schedulingConstraints
      : [];
    const constraintPenalty = constraints.some(c => c?.status === 'infeasible') ? 0.3 : 0;
    const robotsPenalty = validatorMetrics.robotsOk ? 0 : 0.5;
    return Number(Math.max(0, 1 - constraintPenalty - robotsPenalty).toFixed(3));
  }

  _costTimeScore(blueprint, telemetry, history) {
    const estRequests = blueprint.costEstimates?.estimatedRequests ?? history.avgRequests ?? 10;
    const estDuration = blueprint.costEstimates?.estimatedDurationMs ?? history.avgDurationMs ?? 30000;
    const cost = estRequests / Math.max(history.baselineRequests || 20, 1);
    const time = estDuration / Math.max(history.baselineDurationMs || 60000, 1);
    const value = 1 - Math.min(1, (cost + time) / 2);
    return Number(value.toFixed(3));
  }

  _precisionProxy(history, blueprint) {
    const priorPrecision = history.precisionProxy ?? 0.5;
    const hubQuality = Array.isArray(blueprint.proposedHubs) && blueprint.proposedHubs.length > 0 ? 0.15 : 0;
    return Number(Math.min(1, priorPrecision + hubQuality).toFixed(3));
  }

  _explainabilityScore(blueprint) {
    const rationale = Array.isArray(blueprint.rationale) ? blueprint.rationale : [];
    if (!rationale.length) return 0.3;
    const depthScore = Math.min(1, rationale.length / 20);
    const hasProof = rationale.some(entry => typeof entry === 'object' && entry?.type === 'proof');
    return Number(Math.max(0.4, depthScore + (hasProof ? 0.2 : 0)).toFixed(3));
  }

  _stabilityScore(blueprint, context) {
    const sensitivity = context.history?.planSensitivityIndex ?? 0.2;
    return Number(Math.max(0, 1 - sensitivity).toFixed(3));
  }

  _diversityScore(seedSet, hubSet) {
    const hostSet = new Set();
    for (const url of seedSet) {
      const host = this._extractHost(url);
      if (host) hostSet.add(host);
    }
    for (const url of hubSet) {
      const host = this._extractHost(url);
      if (host) hostSet.add(host);
    }
    const entropy = hostSet.size / Math.max(seedSet.size + hubSet.size, 1);
    return Number(Math.min(1, entropy).toFixed(3));
  }

  _variance(values) {
    if (!values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sumSq = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
    return sumSq / values.length;
  }

  _normaliseUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return url;
    }
  }

  _extractHost(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  _log(level, message, meta) {
    const logger = this.logger || console;
    try {
      if (level === 'warn' && typeof logger.warn === 'function') {
        logger.warn(message, meta);
      } else if (level === 'error' && typeof logger.error === 'function') {
        logger.error(message, meta);
      } else if (typeof logger.log === 'function') {
        logger.log(message, meta);
      }
    } catch (_) {}
  }
}

module.exports = {
  PlanEvaluator
};
