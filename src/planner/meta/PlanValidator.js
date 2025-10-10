'use strict';

/**
 * PlanValidator – deterministic gate checks prior to scoring or arbitration.
 *
 * This component sanitises plan blueprints and enforces hard safety/performance
 * guardrails. It does NOT mutate the original blueprint and is designed to run
 * in preview mode before any live crawl is committed.
 */
class PlanValidator {
  constructor({
    riskScorer,
    logger = console,
    thresholds = null
  } = {}) {
    this.riskScorer = riskScorer || null;
    this.logger = logger;
    this.thresholds = Object.assign({
      trapRiskMax: 0.2,
      maxHostParallelism: 3,
      minSeedCount: 1,
      maxSeedCount: 500,
      maxParamEntropy: 0.6,
      requireSections: ['proposedHubs', 'seedQueue', 'schedulingConstraints']
    }, thresholds || {});
  }

  /**
   * Validate a plan blueprint.
   * @param {Object} blueprint
   * @param {Object} context { options, policies }
   * @returns {Object} { valid, reasons, sanitizedBlueprint, metrics }
   */
  validate(blueprint, context = {}) {
    const reasons = [];
    const metrics = {
      robotsOk: true,
      concurrencyOk: true,
      trapRisk: 0,
      urlHygieneScore: 1,
      requiredSections: new Map(),
      riskScore: 0,
      sanitisedSeedCount: 0,
      sanitisedHubCount: 0
    };

    if (!blueprint || typeof blueprint !== 'object') {
      reasons.push('blueprint_missing');
      return { valid: false, reasons, sanitizedBlueprint: null, metrics };
    }

    const sanitized = this._sanitizeBlueprint(blueprint, metrics);
    this._checkRequiredSections(sanitized, metrics, reasons);
    this._checkSeedCounts(sanitized, metrics, reasons);
    this._checkHostParallelism(sanitized, metrics, reasons);
    this._checkUrlHygiene(sanitized, metrics, reasons);
    this._checkTrapRisk(sanitized, metrics, reasons);
    this._checkRobots(sanitized, metrics, reasons, context);
    this._checkTemporalRequirements(sanitized, metrics, reasons, context);
    this._runRiskScoring(sanitized, metrics, reasons, context);

    const valid = reasons.length === 0;
    if (!valid) {
      this._log('warn', 'PlanValidator rejected blueprint', { reasons, metrics });
    }

    return {
      valid,
      reasons,
      sanitizedBlueprint: sanitized,
      metrics
    };
  }

  _sanitizeBlueprint(blueprint, metrics) {
    const dedupeBy = (items, keyFn) => {
      const seen = new Set();
      const out = [];
      for (const item of Array.isArray(items) ? items : []) {
        try {
          const key = keyFn(item);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push(item);
        } catch (_) {}
      }
      return out;
    };

    const sanitized = {
      ...blueprint,
      proposedHubs: dedupeBy(blueprint.proposedHubs, (hub) => hub?.url || hub?.id || null),
      seedQueue: dedupeBy(blueprint.seedQueue, (seed) => seed?.url || seed?.id || null),
      schedulingConstraints: Array.isArray(blueprint.schedulingConstraints)
        ? blueprint.schedulingConstraints.slice()
        : [],
      rationale: Array.isArray(blueprint.rationale) ? blueprint.rationale.slice(0, 200) : []
    };

    metrics.sanitisedHubCount = sanitized.proposedHubs.length;
    metrics.sanitisedSeedCount = sanitized.seedQueue.length;
    return sanitized;
  }

  _checkRequiredSections(sanitized, metrics, reasons) {
    for (const section of this.thresholds.requireSections) {
      const exists = sanitized[section] && sanitized[section].length !== undefined
        ? sanitized[section].length > 0
        : Boolean(sanitized[section]);
      metrics.requiredSections.set(section, exists);
      if (!exists) {
        reasons.push(`missing_section:${section}`);
      }
    }
  }

  _checkSeedCounts(sanitized, metrics, reasons) {
    if (metrics.sanitisedSeedCount < this.thresholds.minSeedCount) {
      reasons.push('insufficient_seeds');
    }
    if (metrics.sanitisedSeedCount > this.thresholds.maxSeedCount) {
      reasons.push('excessive_seeds');
    }
  }

  _checkHostParallelism(sanitized, metrics, reasons) {
    const hostCounts = new Map();
    for (const constraint of sanitized.schedulingConstraints) {
      const host = constraint?.host || constraint?.domain || null;
      if (!host) continue;
      hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    }
    for (const [host, count] of hostCounts) {
      if (count > this.thresholds.maxHostParallelism) {
        metrics.concurrencyOk = false;
        reasons.push(`host_parallelism:${host}:${count}`);
      }
    }
  }

  _checkUrlHygiene(sanitized, metrics, reasons) {
    const calcEntropy = (url) => {
      if (!url) return 0;
      try {
        const parsed = new URL(url);
        const params = Array.from(parsed.searchParams.keys());
        if (params.length === 0) return 0;
        const unique = new Set(params);
        return unique.size / Math.max(params.length, 1);
      } catch (_) {
        return 1;
      }
    };

    const entropies = sanitized.seedQueue.map(seed => calcEntropy(seed?.url));
    const avg = entropies.length ? entropies.reduce((a, b) => a + b, 0) / entropies.length : 0;
    metrics.urlHygieneScore = 1 - Math.min(1, avg);
    if (avg > this.thresholds.maxParamEntropy) {
      reasons.push('url_entropy_high');
    }
  }

  _checkTrapRisk(sanitized, metrics, reasons) {
    const keywords = ['calendar', 'paginator', 'session', 'infinite scroll'];
    const text = JSON.stringify(sanitized.rationale || []).toLowerCase();
    let hits = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) hits++;
    }
    const ratio = sanitized.seedQueue.length > 0 ? hits / sanitized.seedQueue.length : hits > 0 ? 1 : 0;
    metrics.trapRisk = Math.min(1, ratio);
    if (metrics.trapRisk > this.thresholds.trapRiskMax) {
      reasons.push('trap_risk_high');
    }
  }

  _checkRobots(sanitized, metrics, reasons, context) {
    const policy = context?.policies?.robots || {}; // { allow: [], deny: [] }
    const allowList = new Set(Array.isArray(policy.allow) ? policy.allow : []);
    const denyList = Array.isArray(policy.deny) ? policy.deny : [];
    for (const seed of sanitized.seedQueue) {
      const url = seed?.url;
      if (!url) continue;
      if (denyList.some(pattern => url.includes(pattern))) {
        metrics.robotsOk = false;
        reasons.push('robots_deny_seed');
        break;
      }
      if (allowList.size > 0) {
        const allowed = Array.from(allowList).some(pattern => url.includes(pattern));
        if (!allowed) {
          metrics.robotsOk = false;
          reasons.push('robots_unlisted_seed');
          break;
        }
      }
    }
  }

  _checkTemporalRequirements(sanitized, metrics, reasons, context) {
    const required = context?.policies?.requiredSections || [];
    for (const section of required) {
      const exists = Boolean(sanitized[section]) && (Array.isArray(sanitized[section]) ? sanitized[section].length > 0 : true);
      if (!exists) {
        reasons.push(`temporal_missing:${section}`);
      }
    }
  }

  _runRiskScoring(sanitized, metrics, reasons, context) {
    if (!this.riskScorer) {
      return;
    }
    try {
      const risk = this.riskScorer.score({
        domain: context?.options?.domain || sanitized.domain || null,
        blueprint: sanitized,
        policies: context?.policies || {}
      });
      metrics.riskScore = risk.score;
      if (risk.action === 'deny') {
        reasons.push('risk_high');
      }
    } catch (error) {
      this._log('warn', 'RiskScorer failed, continuing without risk gate', error?.message || error);
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
  PlanValidator
};
