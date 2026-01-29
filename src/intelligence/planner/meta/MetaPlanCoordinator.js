'use strict';

const {
  PlanValidator,
  PlanEvaluator,
  PlanArbitrator,
  PlanFusion,
  EffectivenessTracker,
  ExperimentManager,
  ReplaySimulator,
  RiskScorer,
  DecisionLogger
} = require('./index');

/**
 * MetaPlanCoordinator – orchestrates validation, scoring, and arbitration.
 */
class MetaPlanCoordinator {
  constructor({
    validator = null,
    evaluator = null,
    arbitrator = null,
    planFusion = null,
    effectivenessTracker = null,
    experimentManager = null,
    replaySimulator = null,
    riskScorer = null,
    decisionLogger = null,
    logger = console
  } = {}) {
    const risk = riskScorer || new RiskScorer();
    const fusion = planFusion || new PlanFusion({ logger });
    const tracker = effectivenessTracker || new EffectivenessTracker({ logger });
    const decLogger = decisionLogger || new DecisionLogger({ logger });

    this.validator = validator || new PlanValidator({ riskScorer: risk, logger });
    this.effectivenessTracker = tracker;
    this.evaluator = evaluator || new PlanEvaluator({
      logger,
      effectivenessTracker: tracker
    });
    this.planFusion = fusion;
    this.decisionLogger = decLogger;
    this.arbitrator = arbitrator || new PlanArbitrator({
      planFusion: fusion,
      decisionLogger: decLogger,
      logger
    });
    this.experimentManager = experimentManager || new ExperimentManager({ logger });
    this.replaySimulator = replaySimulator || new ReplaySimulator({ logger });
    this.logger = logger;
  }

  /**
   * Run meta-planning pipeline.
   * @param {Object} params
   * @returns {Promise<Object>} result
   * 
   * NOTE: MicroProlog is currently DISABLED. The microprologPlan parameter is accepted
   * for architectural compatibility but will not be used. Meta-planning layer will not
   * allocate resources to testing MicroProlog until it determines MicroProlog can produce
   * viable plans. For now, decisions are based solely on alternativePlans and blueprint.
   */
  async process({
    blueprint,
    context = {},
    microprologPlan = null, // DISABLED: Not used until meta-planning determines viability
    alternativePlans = []
  } = {}) {
    const validatorResult = this.validator.validate(blueprint, context);
    const sanitizedBlueprint = validatorResult.sanitizedBlueprint || blueprint;

    const history = context.history || {};
    const telemetry = context.telemetry || {};

    // DISABLED: MicroProlog scoring disabled to avoid allocating CPU resources
    const microScore = null; // Was: microprologPlan ? this.evaluator.score(...) : null;

    const scoredAlternatives = alternativePlans.map(plan => ({
      plan,
      score: this.evaluator.score(plan, {
        validatorMetrics: validatorResult.metrics,
        history,
        telemetry,
        options: context.options
      })
    }));

    // Always score the provided blueprint so the UI has data even if no alt plan
    if (!alternativePlans.includes(sanitizedBlueprint)) {
      scoredAlternatives.unshift({
        plan: sanitizedBlueprint,
        score: this.evaluator.score(sanitizedBlueprint, {
          validatorMetrics: validatorResult.metrics,
          history,
          telemetry,
          options: context.options
        })
      });
    }

    // DISABLED: Pass null for microprologPlan to ensure arbitrator uses only alternatives
    const decision = this.arbitrator.decide({
      microprologPlan: null, // DISABLED: Force arbitrator to choose from alternatives only
      alternativePlans: scoredAlternatives.map(item => item.plan),
      microScore: null, // DISABLED: No MicroProlog score
      altScores: scoredAlternatives,
      validatorResult,
      context
    });

    const replay = await this.replaySimulator.simulate({
      domain: context?.options?.domain || sanitizedBlueprint?.domain,
      blueprint: decision.chosenPlan || sanitizedBlueprint
    });

    return {
      validatorResult,
      microScore,
      alternativeScores: scoredAlternatives,
      decision,
      replay,
      sanitizedBlueprint
    };
  }
}

module.exports = {
  MetaPlanCoordinator
};
