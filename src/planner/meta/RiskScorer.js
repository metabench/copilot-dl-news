'use strict';

const GEO_RISK = Object.freeze({
  default: 0.2,
  'cn': 0.5,
  'ru': 0.45,
  'ir': 0.6,
  'sy': 0.55,
  'us': 0.2,
  'de': 0.18,
  'fr': 0.18,
  'uk': 0.2
});

/**
 * RiskScorer – compliance/privacy risk estimates for plan gating.
 */
class RiskScorer {
  constructor({ baseScore = 0.2, denyList = [], logger = console } = {}) {
    this.baseScore = baseScore;
    this.denyList = new Set(denyList);
    this.logger = logger;
  }

  score({ domain, blueprint, policies = {} }) {
    if (!domain) {
      return { score: this.baseScore, action: 'allow' };
    }

    const tld = this._extractTld(domain);
    const geo = GEO_RISK[tld] ?? GEO_RISK.default;
    let score = Math.max(this.baseScore, geo);

    if (policies.highRiskHosts && policies.highRiskHosts.includes(domain)) {
      score += 0.3;
    }

    if (this.denyList.has(domain)) {
      score = 1;
    }

    if (Array.isArray(blueprint?.seedQueue)) {
      for (const seed of blueprint.seedQueue) {
        if (seed?.url && this._isSensitivePath(seed.url)) {
          score += 0.15;
          break;
        }
      }
    }

    score = Math.min(1, score);
    const action = score >= 0.8 ? 'deny' : (score >= 0.6 ? 'review' : 'allow');
    return { score, action };
  }

  _extractTld(domain) {
    const segments = domain.split('.');
    return segments[segments.length - 1]?.toLowerCase() || 'default';
  }

  _isSensitivePath(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      return path.includes('/admin') || path.includes('/login') || path.includes('/account');
    } catch (_) {
      return false;
    }
  }
}

module.exports = {
  RiskScorer
};
