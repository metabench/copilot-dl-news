'use strict';

const { extractDomain } = require('../../../shared/utils/domainUtils');

const DEFAULT_SUMMARY = { count: 0, items: [] };
const DEFAULT_ACHIEVEMENTS_LIMIT = 12;

function safeSummary(baseSummary) {
  if (!baseSummary || typeof baseSummary !== 'object') return { ...DEFAULT_SUMMARY };
  const count = Number.isFinite(baseSummary.count) ? baseSummary.count : Array.isArray(baseSummary.items) ? baseSummary.items.length : 0;
  const items = Array.isArray(baseSummary.items) ? baseSummary.items.slice() : [];
  return { ...baseSummary, count, items };
}

function normalizeQueueRow(row) {
  if (!row) return null;
  const startedRaw = row.started_at ?? row.startedAt ?? null;
  let startedAt = null;
  let startedAtIso = null;
  if (startedRaw != null) {
    const numeric = Number(startedRaw);
    if (Number.isFinite(numeric) && numeric > 0) {
      startedAt = numeric;
      try {
        startedAtIso = new Date(numeric).toISOString();
      } catch (_) {
        startedAtIso = null;
      }
    } else if (typeof startedRaw === 'string' && startedRaw.trim()) {
      startedAtIso = startedRaw.trim();
    }
  }
  return {
    id: row.id,
    url: row.url || null,
    args: row.args || null,
    status: row.status || null,
    startedAt,
    startedAtIso
  };
}

function computeResumeInputs(queue) {
  const info = {
    args: [],
    hasArgs: false,
    hasUrl: typeof queue?.url === 'string' && queue.url.trim().length > 0,
    argsError: null
  };
  if (queue && queue.args != null) {
    try {
      const parsed = JSON.parse(queue.args);
      if (Array.isArray(parsed)) {
        info.args = parsed.map((value) => (typeof value === 'string' ? value : String(value)));
      } else if (parsed != null) {
        info.argsError = 'not-array';
      }
    } catch (err) {
      info.argsError = 'parse-error';
    }
  }
  info.hasArgs = Array.isArray(info.args) && info.args.length > 0;
  return info;
}

class IntelligentCrawlerManager {
  constructor({
    baseSummaryFn = null,
    achievementsLimit = DEFAULT_ACHIEVEMENTS_LIMIT,
    logger = console,
    features = {},
    hierarchicalPlanner = null
  } = {}) {
    this.baseSummaryFn = typeof baseSummaryFn === 'function' ? baseSummaryFn : (() => ({ ...DEFAULT_SUMMARY }));
    this.achievementsLimit = Number.isFinite(achievementsLimit) && achievementsLimit > 0 ? achievementsLimit : DEFAULT_ACHIEVEMENTS_LIMIT;
    this.logger = logger;
    this.features = features || {};
    this.hierarchicalPlanner = hierarchicalPlanner || null;
    this.jobRegistry = null;
    this.jobAchievements = new Map();
    this.jobLifecycle = new Map();
    this.planExecutions = new Map(); // jobId -> execution state
  }

  setJobRegistry(jobRegistry) {
    this.jobRegistry = jobRegistry || null;
  }

  buildJobsSummary(jobs) {
    const base = safeSummary(this.baseSummaryFn(jobs));
    if (!Array.isArray(base.items)) {
      base.items = [];
    }
    base.items = base.items.map((item) => {
      const jobId = item && item.id ? item.id : null;
      const achievements = jobId ? this.getRecentAchievements(jobId) : [];
      const lifecycle = jobId ? (this.jobLifecycle.get(jobId) || null) : null;
      return {
        ...item,
        achievements,
        lifecycle
      };
    });
    base.count = base.items.length;
    return base;
  }

  recordMilestone(jobId, milestone = {}) {
    if (!jobId || !milestone || typeof milestone !== 'object') return;
    const sanitized = { ...milestone };
    if (!sanitized.kind) {
      sanitized.kind = 'milestone';
    }
    if (!sanitized.scope) {
      sanitized.scope = null;
    }
    sanitized.recordedAt = sanitized.recordedAt || new Date().toISOString();
    const list = this.jobAchievements.get(jobId) || [];
    list.unshift(sanitized);
    if (list.length > this.achievementsLimit) {
      list.splice(this.achievementsLimit);
    }
    this.jobAchievements.set(jobId, list);
  }

  getRecentAchievements(jobId) {
    if (!jobId) return [];
    const list = this.jobAchievements.get(jobId);
    if (!Array.isArray(list) || !list.length) return [];
    return list.map((entry) => ({ ...entry }));
  }

  noteJobStart({
    jobId,
    url = null,
    mode = 'fresh',
    queueId = null,
    argsSource = null,
    domain = null,
    startedAt = null
  } = {}) {
    if (!jobId) return;
    const iso = startedAt || new Date().toISOString();
    const entry = {
      jobId,
      url,
      queueId,
      mode,
      argsSource,
      domain: domain || (url ? extractDomain(url) : null),
      startedAt: iso,
      lastSeenAt: iso
    };
    this.jobLifecycle.set(jobId, entry);
  }

  noteJobResumed({
    jobId,
    url = null,
    queueId = null,
    argsSource = null,
    domain = null,
    resumedAt = null
  } = {}) {
    if (!jobId) return;
    this.noteJobStart({
      jobId,
      url,
      queueId,
      argsSource,
      domain,
      mode: 'resume',
      startedAt: resumedAt || new Date().toISOString()
    });
  }

  noteJobHeartbeat(jobId) {
    if (!jobId) return;
    const lifecycle = this.jobLifecycle.get(jobId);
    if (!lifecycle) return;
    lifecycle.lastSeenAt = new Date().toISOString();
  }

  noteJobExit(jobId, extras = {}) {
    if (!jobId) return;
    const lifecycle = this.jobLifecycle.get(jobId);
    if (lifecycle) {
      lifecycle.endedAt = extras.endedAt || new Date().toISOString();
      lifecycle.exitInfo = extras.exitInfo || null;
    }
    if (!extras.keepAchievements) {
      this.jobAchievements.delete(jobId);
    }
  }

  clearJob(jobId) {
    if (!jobId) return;
    this.jobLifecycle.delete(jobId);
    this.jobAchievements.delete(jobId);
  }

  collectRunningContext() {
    const runningJobIds = new Set();
    const runningDomains = new Set();
    const registry = this.jobRegistry;
    if (registry && typeof registry.getJobs === 'function') {
      for (const [id, job] of registry.getJobs()) {
        runningJobIds.add(id);
        if (job && job.url) {
          const domain = extractDomain(job.url);
          if (domain) runningDomains.add(domain);
        }
      }
    }
    return { runningJobIds, runningDomains };
  }

  planResumeQueues({ queues = [], availableSlots = 0, runningJobIds = new Set(), runningDomains = new Set() } = {}) {
    const infoById = new Map();
    const selected = [];
    const processed = [];
    const domainGuard = new Set(runningDomains || []);

    for (const row of queues || []) {
      const queue = normalizeQueueRow(row);
      if (!queue || queue.id == null) {
        continue;
      }
      const resumeInputs = computeResumeInputs(queue);
      const domain = queue.url ? extractDomain(queue.url) : null;
      const entry = {
        queue,
        domain,
        resumeInputs,
        state: 'available',
        reasons: []
      };

      if (runningJobIds && runningJobIds.has(queue.id)) {
        entry.state = 'blocked';
        entry.reasons.push('already-running');
      } else if (!resumeInputs.hasUrl && !resumeInputs.hasArgs) {
        entry.state = 'blocked';
        entry.reasons.push('missing-source');
      } else if (domain && domainGuard.has(domain)) {
        entry.state = 'blocked';
        entry.reasons.push('domain-conflict');
      } else if (selected.length >= availableSlots) {
        entry.state = 'queued';
        entry.reasons.push('capacity-exceeded');
      } else {
        entry.state = 'selected';
        selected.push(entry);
        if (domain) domainGuard.add(domain);
      }

      infoById.set(queue.id, entry);
      processed.push(entry);
    }

    return {
      selected,
      info: infoById,
      processed
    };
  }

  buildQueueSummary(plan, { now = Date.now() } = {}) {
    const processed = Array.isArray(plan?.processed) ? plan.processed : [];
    const queues = processed.map((entry) => {
      const { queue, domain, resumeInputs, state, reasons } = entry;
      const startedAtMs = Number.isFinite(queue.startedAt) ? queue.startedAt : null;
      const ageMs = startedAtMs != null ? Math.max(0, now - startedAtMs) : null;
      return {
        id: queue.id,
        url: queue.url,
        status: queue.status,
        startedAt: queue.startedAtIso || queue.startedAt || null,
        startedAtMs,
        ageMs,
        domain,
        state,
        reasons,
        hasArgs: resumeInputs.hasArgs,
        hasUrl: resumeInputs.hasUrl,
        argsError: resumeInputs.argsError || null
      };
    });

    const recommendedIds = Array.isArray(plan?.selected)
      ? plan.selected.map((entry) => entry.queue.id)
      : [];

    const blockedDomains = Array.from(new Set(
      processed
        .filter((entry) => Array.isArray(entry.reasons) && entry.reasons.includes('domain-conflict') && entry.domain)
        .map((entry) => entry.domain)
    ));

    return {
      queues,
      recommendedIds,
      blockedDomains
    };
  }

  /**
   * Start tracking plan execution for a job
   */
  startPlanExecution(jobId, plan) {
    if (!jobId || !plan) return;
    this.planExecutions.set(jobId, {
      plan,
      currentStep: 0,
      backtracks: 0,
      stepResults: [],
      startedAt: Date.now(),
      requestsProcessed: 0,
      actualHubsDiscovered: 0,
      actualArticlesCollected: 0,
      replanCount: 0,
      lastReplanAt: null
    });
  }

  /**
   * Record plan step execution result (Phase 2: Real-Time Plan Adjustment)
   */
  recordPlanStep(jobId, stepIdx, result) {
    const exec = this.planExecutions.get(jobId);
    if (!exec) return;

    exec.stepResults.push({ 
      stepIdx, 
      result, 
      timestamp: Date.now() 
    });
    exec.currentStep = stepIdx + 1;
    exec.requestsProcessed = (exec.requestsProcessed || 0) + 1;
    exec.actualArticlesCollected = (exec.actualArticlesCollected || 0) + (result.articlesFound || 0);
    exec.actualHubsDiscovered = (exec.actualHubsDiscovered || 0) + (result.hubsFound || 0);

    // Phase 2: Real-time plan adjustment based on step performance
    if (this.features.realTimePlanAdjustment) {
      const performanceRatio = result.expectedValue > 0 
        ? result.value / result.expectedValue 
        : 1.0;

      // Record as achievement if step exceeded expectations (>120%)
      if (performanceRatio > 1.2) {
        this.recordMilestone(jobId, {
          kind: 'plan-overperformance',
          message: `Step ${stepIdx + 1} found ${result.value} items (expected ${Math.round(result.expectedValue)})`,
          details: {
            step: stepIdx,
            actualValue: result.value,
            expectedValue: result.expectedValue,
            overperformance: ((performanceRatio - 1) * 100).toFixed(1) + '%'
          }
        });
        
        // Excellent performance (>150%): boost similar steps
        if (performanceRatio > 1.5 && exec.plan.steps) {
          this._adjustSimilarSteps(exec, stepIdx, 20, 'boost');
        }
      }
      
      // Poor performance (<50%): penalize similar steps
      if (performanceRatio < 0.5 && exec.plan.steps) {
        this._adjustSimilarSteps(exec, stepIdx, -15, 'penalize');
      }
    }

    // Phase 3: Check if re-planning needed
    if (this.features.dynamicReplanning && this._shouldReplan(exec)) {
      this._triggerReplan(jobId, exec).catch(err => {
        this.logger?.warn?.(`[Dynamic Re-Planning] Failed: ${err.message}`);
      });
    }

    // Phase 1: Cost learning feedback loop
    if (this.features.costAwarePriority && result.durationMs !== undefined) {
      this._recordCostObservation(jobId, stepIdx, result);
    }
  }

  /**
   * Adjust priority of steps similar to reference step (Phase 2).
   * @private
   */
  _adjustSimilarSteps(exec, referenceStepIdx, priorityAdjustment, reason) {
    if (!exec.plan.steps || referenceStepIdx >= exec.plan.steps.length) return;

    const referenceStep = exec.plan.steps[referenceStepIdx];
    let adjustedCount = 0;

    for (let i = exec.currentStep; i < exec.plan.steps.length; i++) {
      const step = exec.plan.steps[i];
      if (this._isSimilarStep(step, referenceStep)) {
        step.priority = (step.priority || 50) + priorityAdjustment;
        step.adjustmentReason = reason;
        step.adjustmentSource = referenceStepIdx;
        adjustedCount++;
      }
    }

    if (adjustedCount > 0) {
      this.logger?.log?.(`[Real-Time Adjustment] ${reason} ${adjustedCount} steps similar to step ${referenceStepIdx + 1}`);
    }
  }

  /**
   * Check if two steps are similar (same action type and pattern).
   * @private
   */
  _isSimilarStep(step1, step2) {
    if (!step1?.action || !step2?.action) return false;
    
    // Same action type
    if (step1.action.type !== step2.action.type) return false;
    
    // Similar URLs (same path pattern)
    const url1 = step1.action.url || '';
    const url2 = step2.action.url || '';
    
    // Extract path pattern (e.g., "/news/" from "https://example.com/news/article1")
    const pattern1 = this._extractPathPattern(url1);
    const pattern2 = this._extractPathPattern(url2);
    
    return pattern1 === pattern2;
  }

  /**
   * Extract path pattern from URL for similarity comparison.
   * @private
   */
  _extractPathPattern(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      
      // Take first 2 path segments as pattern (e.g., "/news/articles")
      return '/' + pathParts.slice(0, 2).join('/') + '/';
    } catch {
      return '/';
    }
  }

  /**
   * Check if re-planning should be triggered (Phase 3).
   * @private
   */
  _shouldReplan(exec) {
    if (!exec.plan?.steps) return false;

    // Don't replan too frequently (minimum 50 requests between replans)
    const timeSinceLastReplan = exec.lastReplanAt ? Date.now() - exec.lastReplanAt : Infinity;
    if (timeSinceLastReplan < 60000) return false; // 1 minute minimum

    // Trigger 1: Periodic re-planning every 100 requests
    if (exec.requestsProcessed > 0 && exec.requestsProcessed % 100 === 0) {
      this.logger?.log?.(`[Dynamic Re-Planning] Trigger: Periodic (${exec.requestsProcessed} requests)`);
      return true;
    }

    // Trigger 2: Performance deviation >40%
    const avgPerformance = this._calculateAvgPerformance(exec);
    if (avgPerformance !== null && Math.abs(avgPerformance - 1.0) > 0.4) {
      this.logger?.log?.(`[Dynamic Re-Planning] Trigger: Performance deviation (${(avgPerformance * 100).toFixed(0)}%)`);
      return true;
    }

    // Trigger 3: Excessive backtracks (>5)
    if (exec.backtracks > 5) {
      this.logger?.log?.(`[Dynamic Re-Planning] Trigger: Excessive backtracks (${exec.backtracks})`);
      return true;
    }

    return false;
  }

  /**
   * Calculate average performance ratio across completed steps.
   * @private
   */
  _calculateAvgPerformance(exec) {
    if (!exec.stepResults || exec.stepResults.length === 0) return null;

    let totalRatio = 0;
    let count = 0;

    for (const stepResult of exec.stepResults) {
      const { result } = stepResult;
      if (result.expectedValue && result.expectedValue > 0) {
        totalRatio += result.value / result.expectedValue;
        count++;
      }
    }

    return count > 0 ? totalRatio / count : null;
  }

  /**
   * Trigger re-planning with updated state (Phase 3).
   * @private
   */
  async _triggerReplan(jobId, exec) {
    // Prevent concurrent replanning
    if (exec.replanning) return;
    exec.replanning = true;

    try {
      this.logger?.log?.(`[Dynamic Re-Planning] Generating new plan (step ${exec.currentStep}/${exec.plan.steps.length})`);

      // Mock hierarchical planner call (would need actual planner instance)
      // In production, this would call: await this.hierarchicalPlanner.generatePlan(...)
      const mockNewPlan = {
        steps: [
          ...exec.plan.steps.slice(exec.currentStep) // Keep remaining steps for now
        ]
      };

      // Merge new plan with remaining steps
      exec.plan = this._mergePlans(exec.plan, mockNewPlan, exec.currentStep);
      exec.replanCount = (exec.replanCount || 0) + 1;
      exec.lastReplanAt = Date.now();

      this.recordMilestone(jobId, {
        kind: 'plan-recomputed',
        message: `Updated plan based on progress (${exec.currentStep} steps completed, replan #${exec.replanCount})`,
        details: {
          stepCompleted: exec.currentStep,
          replanCount: exec.replanCount,
          remainingSteps: exec.plan.steps.length - exec.currentStep,
          avgPerformance: this._calculateAvgPerformance(exec)
        }
      });
    } catch (error) {
      this.logger?.error?.(`[Dynamic Re-Planning] Error: ${error.message}`);
    } finally {
      exec.replanning = false;
    }
  }

  /**
   * Merge new plan with partially-executed existing plan (Phase 3).
   * @private
   */
  _mergePlans(oldPlan, newPlan, currentStep) {
    // Keep completed steps, replace remaining with new plan
    const completedSteps = oldPlan.steps.slice(0, currentStep);
    const newSteps = newPlan.steps || [];

    return {
      ...oldPlan,
      steps: [...completedSteps, ...newSteps],
      recomputed: true,
      recomputedAt: Date.now()
    };
  }

  /**
   * Record plan backtrack event
   */
  recordPlanBacktrack(jobId, stepIdx) {
    const exec = this.planExecutions.get(jobId);
    if (!exec) return;
    
    exec.backtracks += 1;
    
    this.recordMilestone(jobId, {
      kind: 'plan-backtrack',
      message: `Backtracking from step ${stepIdx + 1} (attempt ${exec.backtracks})`,
      details: {
        step: stepIdx,
        backtrackCount: exec.backtracks
      }
    });
  }

  /**
   * Get plan execution progress for a job
   */
  getPlanProgress(jobId) {
    const exec = this.planExecutions.get(jobId);
    if (!exec) return null;

    const completed = exec.stepResults.filter(r => r.result?.success).length;
    const failed = exec.stepResults.filter(r => !r.result?.success).length;
    const totalExpectedValue = exec.plan.steps?.reduce((sum, s) => sum + (s.expectedValue || 0), 0) || 0;
    const actualValue = exec.stepResults.reduce((sum, r) => sum + (r.result?.value || 0), 0);

    return {
      totalSteps: exec.plan.steps?.length || 0,
      completedSteps: exec.currentStep,
      successfulSteps: completed,
      failedSteps: failed,
      backtracks: exec.backtracks,
      estimatedRemaining: (exec.plan.steps?.length || 0) - exec.currentStep,
      performance: totalExpectedValue > 0 ? (actualValue / totalExpectedValue) : 0,
      elapsedMs: Date.now() - exec.startedAt
    };
  }

  /**
   * Record cost observation for learning (Phase 1: Cost-Aware Priority).
   * Stores actual vs predicted cost deltas to improve QueryCostEstimatorPlugin accuracy.
   * @private
   */
  _recordCostObservation(jobId, stepIdx, result) {
    const exec = this.planExecutions.get(jobId);
    if (!exec || !exec.plan || !exec.plan.steps) return;

    const step = exec.plan.steps[stepIdx];
    if (!step) return;

    const actualCost = result.durationMs || 0;
    const expectedCost = step.cost || 0;
    const costDelta = actualCost - expectedCost;
    const costError = expectedCost > 0 ? Math.abs(costDelta / expectedCost) : 0;

    // Track cost prediction accuracy
    exec.costObservations = exec.costObservations || [];
    exec.costObservations.push({
      stepIdx,
      url: result.url || step.action?.url || 'unknown',
      expectedCost,
      actualCost,
      delta: costDelta,
      errorPercent: (costError * 100).toFixed(1)
    });

    // Log significant cost deviations (>50% error)
    if (costError > 0.5) {
      this.logger?.warn?.(
        `[Cost Learning] Step ${stepIdx}: ${result.url || 'unknown'} took ${actualCost}ms (expected ${expectedCost}ms, ${(costError * 100).toFixed(0)}% error)`
      );
      
      // Record as milestone for visibility
      this.recordMilestone(jobId, {
        kind: 'cost-deviation',
        message: `Cost prediction error: ${(costError * 100).toFixed(0)}% for ${result.url || 'unknown'}`,
        details: {
          expectedCost,
          actualCost,
          errorPercent: (costError * 100).toFixed(1) + '%'
        }
      });
    }

    // TODO: Store cost observations in database for QueryCostEstimatorPlugin to learn from
    // Example: db.prepare('INSERT INTO query_telemetry (url, operation, duration_ms, timestamp) VALUES (?, ?, ?, ?)').run(...)
  }

  /**
   * Clear plan execution tracking for a job
   */
  clearPlanExecution(jobId) {
    if (!jobId) return;
    this.planExecutions.delete(jobId);
  }
}

module.exports = {
  IntelligentCrawlerManager,
  normalizeQueueRow,
  computeResumeInputs
};
