const { CompletionReporter } = require('./planner/CompletionReporter');
const { createDefaultMilestones } = require('./milestones');

class MilestoneTracker {
  constructor({
    telemetry,
    state,
    domain,
    getStats,
    getPlanSummary,
    plannerEnabled = false,
    scheduleWideHistoryCheck = null,
    milestones = null,
    milestoneFactory = null,
    milestoneOptions = null,
    goalPlanExecutor = null
  } = {}) {
    if (!telemetry) {
      throw new Error('MilestoneTracker requires telemetry');
    }
    if (!state) {
      throw new Error('MilestoneTracker requires crawler state');
    }
    if (typeof getStats !== 'function') {
      throw new Error('MilestoneTracker requires a getStats function');
    }
    this.telemetry = telemetry;
    this.state = state;
    this.domain = domain || null;
    this.getStats = getStats;
    this.getPlanSummary = typeof getPlanSummary === 'function' ? getPlanSummary : () => ({});
    this.plannerEnabled = !!plannerEnabled;
    this.scheduleWideHistoryCheck = typeof scheduleWideHistoryCheck === 'function' ? scheduleWideHistoryCheck : null;
    this.completionReporter = null;

    if (Array.isArray(milestones)) {
      this.milestones = milestones;
    } else if (typeof milestoneFactory === 'function') {
      this.milestones = milestoneFactory(milestoneOptions || {});
    } else {
      this.milestones = createDefaultMilestones(milestoneOptions || {});
    }
    this.awardedMilestones = new Set();
    this.goalPlanExecutor = typeof goalPlanExecutor === 'function' ? goalPlanExecutor : null;
    this.goalStates = new Map();
    this.goalPlanSignatures = new Map();

    for (const milestone of this.milestones) {
      if (milestone?.goal?.id) {
        const { id: goalId, description = null } = milestone.goal;
        if (!this.goalStates.has(goalId)) {
          this.goalStates.set(goalId, {
            id: goalId,
            milestoneId: milestone.id,
            description: description || milestone.id,
            progress: 0,
            completed: false,
            details: null,
            nextSteps: []
          });
        }
      }
    }
  }

  checkAnalysisMilestones(context = {}) {
    const stats = this.getStats() || {};
    const { depth, isArticle } = context;

    if (this.plannerEnabled && isArticle && this.scheduleWideHistoryCheck) {
      try {
        this.scheduleWideHistoryCheck({
          depth,
          articlesFound: stats.articlesFound
        });
      } catch (_) {
        // best-effort only
      }
    }

    if (!Array.isArray(this.milestones) || this.milestones.length === 0) {
      return;
    }

    const evaluationContext = {
      ...context,
      stats,
      state: this.state,
      domain: this.domain,
      tracker: this
    };

    for (const milestone of this.milestones) {
      if (!milestone || milestone.enabled === false) {
        continue;
      }
      const milestoneId = milestone.id || milestone.key;
      if (!milestoneId || this.awardedMilestones.has(milestoneId)) {
        if (milestone?.goal?.id) {
          this._updateGoalProgress(milestone, evaluationContext, { markCompleted: true });
        }
        continue;
      }

      if (milestone?.goal?.id) {
        this._updateGoalProgress(milestone, evaluationContext);
      }

      let result;
      try {
        result = typeof milestone.evaluate === 'function' ? milestone.evaluate(evaluationContext) : null;
      } catch (_) {
        continue;
      }

      if (!result) {
        continue;
      }

      const payload = result.telemetry || null;
      if (!payload || typeof payload !== 'object') {
        continue;
      }

      if (result.details && payload.details == null) {
        payload.details = result.details;
      }

      try {
        this.telemetry.milestoneOnce(milestoneId, payload);
        this.awardedMilestones.add(milestoneId);
      } catch (_) {
        continue;
      }

      if (milestone?.goal?.id) {
        this._updateGoalProgress(milestone, evaluationContext, { markCompleted: true, milestonePayload: result });
      }

      const onAward = typeof result.onAward === 'function' ? result.onAward : milestone.onAward;
      if (typeof onAward === 'function') {
        try {
          onAward(evaluationContext);
        } catch (_) {
          // best effort
        }
      }
    }
  }

  emitCompletionMilestone({ outcomeErr } = {}) {
    if (!this.plannerEnabled) return;

    const dependencyPayload = {
      state: this.state,
      telemetry: this.telemetry,
      domain: this.domain,
      getPlanSummary: this.getPlanSummary,
      getStats: this.getStats
    };

    if (!this.completionReporter) {
      this.completionReporter = new CompletionReporter(dependencyPayload);
    } else {
      this.completionReporter.updateDependencies(dependencyPayload);
    }

    this.completionReporter.emit({
      outcomeErr
    });
  }

  _updateGoalProgress(milestone, evaluationContext, { markCompleted = false, milestonePayload = null } = {}) {
    if (!milestone?.goal?.id) {
      return;
    }
    const goalDef = milestone.goal;
    const goalId = goalDef.id;
    const existing = this.goalStates.get(goalId) || {
      id: goalId,
      milestoneId: milestone.id,
      description: goalDef.description || milestone.id,
      progress: 0,
      completed: false,
      details: null,
      nextSteps: []
    };

    let progressData = null;
    if (goalDef.getProgress) {
      try {
        progressData = goalDef.getProgress(evaluationContext) || null;
      } catch (_) {
        progressData = null;
      }
    }

    const completed = markCompleted || !!progressData?.completed;
    const progressValue = completed ? 1 : (typeof progressData?.progress === 'number' ? Math.max(0, Math.min(1, progressData.progress)) : existing.progress || 0);
    const nextSteps = Array.isArray(progressData?.nextSteps) ? progressData.nextSteps : existing.nextSteps || [];
    const details = progressData?.details != null ? progressData.details : existing.details;

    const goalState = {
      ...existing,
      milestoneId: milestone.id,
      description: goalDef.description || existing.description,
      progress: progressValue,
      completed,
      details,
      nextSteps,
      lastUpdatedAt: Date.now()
    };

    if (completed && milestonePayload?.details) {
      goalState.details = {
        ...(goalState.details || {}),
        milestoneDetails: milestonePayload.details
      };
    }

    this.goalStates.set(goalId, goalState);

    if (!completed && goalDef.planActions) {
      let plan = null;
      try {
        plan = goalDef.planActions(evaluationContext) || null;
      } catch (_) {
        plan = null;
      }
      if (plan) {
        const signature = safePlanSignature(plan);
        goalState.plan = plan;
        if (signature) {
          const prevSignature = this.goalPlanSignatures.get(goalId);
          if (signature !== prevSignature) {
            this.goalPlanSignatures.set(goalId, signature);
            if (this.goalPlanExecutor) {
              try {
                this.goalPlanExecutor({
                  goalId,
                  milestoneId: milestone.id,
                  plan,
                  context: evaluationContext
                });
              } catch (_) { }
            }
          }
        } else if (this.goalPlanExecutor) {
          try {
            this.goalPlanExecutor({
              goalId,
              milestoneId: milestone.id,
              plan,
              context: evaluationContext
            });
          } catch (_) { }
        }
      }
    }
  }

  getGoalsSummary() {
    return Array.from(this.goalStates.values()).map((state) => ({
      id: state.id,
      milestoneId: state.milestoneId,
      description: state.description,
      progress: state.progress,
      completed: state.completed,
      details: state.details,
      nextSteps: state.nextSteps,
      plan: state.plan || null,
      lastUpdatedAt: state.lastUpdatedAt
    }));
  }

  getGoalState(goalId) {
    return this.goalStates.get(goalId) || null;
  }
}

module.exports = {
  MilestoneTracker
};

function safePlanSignature(plan) {
  try {
    return JSON.stringify(plan);
  } catch (_) {
    return null;
  }
}
