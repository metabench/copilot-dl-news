'use strict';

class PlannerBootstrap {
  constructor({ telemetry, plannerVerbosity = 0 } = {}) {
    this.telemetry = telemetry || null;
    this.plannerVerbosity = plannerVerbosity;
  }

  async run({ host, targetHosts } = {}) {
    const normalizedHost = typeof host === 'string' ? host.toLowerCase() : host;
    if (Array.isArray(targetHosts) && targetHosts.length > 0) {
      const allowed = targetHosts.some((pattern) => this._hostMatchesPattern(normalizedHost, pattern));
      if (!allowed) {
        this._emitSkippedHostProblem(normalizedHost, targetHosts);
        return {
          allowed: false,
          skipPlan: true,
          targetHosts,
          plannerVerbosity: this.plannerVerbosity
        };
      }
    }
    return {
      allowed: true,
      skipPlan: false,
      targetHosts: targetHosts && targetHosts.length ? targetHosts : null,
      plannerVerbosity: this.plannerVerbosity
    };
  }

  _hostMatchesPattern(host, pattern) {
    if (!host || !pattern) return false;
    const normalizedPattern = String(pattern).toLowerCase();
    return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`) || host.endsWith(normalizedPattern);
  }

  _emitSkippedHostProblem(host, targetHosts) {
    if (!this.telemetry || typeof this.telemetry.problem !== 'function') {
      return;
    }
    this.telemetry.problem({
      kind: 'planner-skipped-host',
      host,
      targetHosts
    });
  }
}

module.exports = {
  PlannerBootstrap
};
