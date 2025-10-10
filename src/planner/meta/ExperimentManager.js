'use strict';

/**
 * ExperimentManager – coordinates online experiments across planner sources.
 */
class ExperimentManager {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.mode = 'shadow';
    this.epsilon = 0.1;
  }

  configure({ mode, epsilon }) {
    if (mode) {
      this.mode = mode;
    }
    if (typeof epsilon === 'number') {
      this.epsilon = Math.max(0, Math.min(1, epsilon));
    }
  }

  chooseArm({ microScore, altScores }) {
    if (this.mode === 'team-draft') {
      return this._teamDraftArm(microScore, altScores);
    }
    if (this.mode === 'bandit') {
      return this._epsilonGreedyArm(microScore, altScores);
    }
    return 'shadow';
  }

  _teamDraftArm(microScore, altScores) {
    const microValue = microScore?.totalScore ?? 0.5;
    const altValue = (altScores && altScores[0]?.score?.totalScore) || 0.5;
    return microValue >= altValue ? 'microprolog' : 'alternative';
  }

  _epsilonGreedyArm(microScore, altScores) {
    const rand = Math.random();
    if (rand < this.epsilon) {
      return rand < this.epsilon / 2 ? 'microprolog' : 'alternative';
    }
    const microValue = microScore?.totalScore ?? 0.5;
    const altValue = (altScores && altScores[0]?.score?.totalScore) || 0.5;
    return microValue >= altValue ? 'microprolog' : 'alternative';
  }
}

module.exports = {
  ExperimentManager
};
