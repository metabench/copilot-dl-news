'use strict';

const DEFAULT_THRESHOLDS = Object.freeze({
  acceptScore: 0.7,
  explainability: 0.6,
  precision: 0.6,
  fuseLower: 0.5,
  confidenceMin: 0.5,
  microprologFloor: 0.2
});

/**
 * PlanArbitrator – decide between MicroProlog, alternative plans, or fusion.
 */
class PlanArbitrator {
  constructor({
    planFusion,
    decisionLogger,
    thresholds = DEFAULT_THRESHOLDS,
    logger = console
  } = {}) {
    this.planFusion = planFusion;
    this.decisionLogger = decisionLogger;
    this.thresholds = thresholds;
    this.logger = logger;
  }

  /**
   * Execute arbitration.
   * @param {Object} params
   * @param {Object|null} params.microprologPlan
   * @param {Array<Object>} params.alternativePlans
   * @param {Object} params.microScore
   * @param {Array<Object>} params.altScores (array of { plan, score })
   * @param {Object} params.validatorResult
   * @param {Object} params.context (domain, policies, history)
   * @returns {Object} decision
   */
  decide({
    microprologPlan,
    alternativePlans = [],
    microScore,
    altScores = [],
    validatorResult,
    context = {}
  } = {}) {
    const decision = {
      outcome: 'accept_alternative',
      rationale: [],
      confidence: microScore?.confidence ?? 0.4,
      chosenPlan: null,
      fusedPlan: null
    };

    // Early exit on validation failure
    if (validatorResult && validatorResult.valid === false) {
      decision.outcome = 'replan';
      decision.rationale.push('validator_reject');
      decision.chosenPlan = alternativePlans[0] || microprologPlan || null;
      return this._finalise(decision, context);
    }

    if (!microprologPlan) {
      decision.outcome = 'accept_alternative';
      decision.rationale.push('microprolog_unavailable');
      decision.chosenPlan = alternativePlans[0] || null;
      return this._finalise(decision, context);
    }

    if (!microScore) {
      decision.outcome = 'seek_human_confirmation';
      decision.rationale.push('microprolog_no_score');
      decision.chosenPlan = alternativePlans[0] || microprologPlan;
      return this._finalise(decision, context);
    }

    // Hard thresholds
    if (microScore.totalScore >= this.thresholds.acceptScore &&
        microScore.metrics.explainability >= this.thresholds.explainability &&
        microScore.metrics.precision_proxy >= this.thresholds.precision) {
      decision.outcome = 'accept_microprolog';
      decision.rationale.push('microprolog_threshold_pass');
      decision.chosenPlan = microprologPlan;
      decision.confidence = Math.max(decision.confidence, microScore.confidence || 0.6);
      return this._finalise(decision, context);
    }

    // Evaluate best alternative score
    const bestAlt = altScores
      .filter(item => item && item.score)
      .sort((a, b) => (b.score.totalScore || 0) - (a.score.totalScore || 0))[0];

    if (bestAlt && (bestAlt.score.totalScore || 0) >= this.thresholds.acceptScore) {
      decision.outcome = 'accept_alternative';
      decision.rationale.push('alternative_threshold_pass');
      decision.chosenPlan = bestAlt.plan;
      decision.confidence = Math.max(decision.confidence, bestAlt.score.confidence || 0.6);
      return this._finalise(decision, context);
    }

    // Safety-first fusion: keep validated MicroProlog seeds, fill with best alternative
    if (microScore.totalScore >= this.thresholds.fuseLower ||
        decision.confidence < this.thresholds.confidenceMin) {
      if (this.planFusion && typeof this.planFusion.fuse === 'function') {
        const fusion = this.planFusion.fuse({
          microprologPlan,
          alternativePlans,
          validatorResult,
          context,
          floor: this.thresholds.microprologFloor
        });
        if (fusion && fusion.plan) {
          decision.outcome = 'fuse';
          decision.rationale.push('fusion_applied');
          decision.chosenPlan = fusion.plan;
          decision.fusedPlan = fusion;
          decision.confidence = Math.max(decision.confidence, fusion.confidence || 0.55);
          return this._finalise(decision, context);
        }
      }
      decision.rationale.push('fusion_unavailable');
    }

    // Default fallback
    decision.outcome = 'accept_alternative';
    decision.rationale.push('fallback_alternative');
    decision.chosenPlan = alternativePlans[0] || microprologPlan;
    decision.confidence = Math.max(decision.confidence, 0.5);
    return this._finalise(decision, context);
  }

  _finalise(decision, context) {
    if (this.decisionLogger && typeof this.decisionLogger.log === 'function') {
      try {
        this.decisionLogger.log({
          timestamp: new Date().toISOString(),
          outcome: decision.outcome,
          confidence: decision.confidence,
          rationale: decision.rationale,
          context
        });
      } catch (error) {
        this._log('warn', 'DecisionLogger.log failed', error?.message || error);
      }
    }
    return decision;
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
  PlanArbitrator
};
