const { safeCall } = require('./utils');

class ExitManager {
  constructor({ telemetry = null } = {}) {
    this.telemetry = telemetry;
  }

  recordExit(crawler, reason, details = {}) {
    if (!reason || crawler.exitSummary) return;
    const payload = typeof details === 'object' && details !== null ? { ...details } : {};
    crawler.exitSummary = {
      reason,
      at: new Date().toISOString(),
      details: payload
    };
    safeCall(() => {
      const telemetryDetails = { reason, ...payload };
      this.telemetry?.milestoneOnce?.(`crawl-exit:${reason}`, {
        kind: 'crawl-exit',
        message: `Crawler exit: ${reason}`,
        details: telemetryDetails
      });
    });
  }

  describeExitSummary(summary) {
    if (!summary) {
      return 'not recorded';
    }
    const parts = [summary.reason];
    const details = summary.details || {};
    if (typeof details.downloads === 'number') parts.push(`downloads=${details.downloads}`);
    if (typeof details.limit === 'number') parts.push(`limit=${details.limit}`);
    if (typeof details.visited === 'number') parts.push(`visited=${details.visited}`);
    if (details.message) parts.push(details.message);
    return parts.filter(Boolean).join(' | ');
  }

  determineOutcomeError(errorTracker, stats) {
    return errorTracker?.determineOutcomeError(stats) || null;
  }

  getExitSummary(crawler) {
    return crawler.exitSummary || null;
  }
}

module.exports = ExitManager;
