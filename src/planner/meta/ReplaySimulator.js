'use strict';

/**
 * ReplaySimulator – offline evaluation against archived site snapshots.
 */
class ReplaySimulator {
  constructor({ snapshotStore = null, logger = console } = {}) {
    this.snapshotStore = snapshotStore;
    this.logger = logger;
  }

  async simulate({ domain, blueprint }) {
    if (!this.snapshotStore || typeof this.snapshotStore.fetch !== 'function') {
      return {
        supported: false,
        noveltyEstimate: null,
        duplicateRate: null,
        costEstimate: null
      };
    }

    try {
      const snapshot = await this.snapshotStore.fetch(domain);
      if (!snapshot) {
        return {
          supported: false,
          noveltyEstimate: null,
          duplicateRate: null,
          costEstimate: null
        };
      }
      const noveltyEstimate = this._estimateNovelty(snapshot, blueprint);
      const duplicateRate = Math.max(0, 1 - noveltyEstimate);
      const costEstimate = snapshot.averageFetchCost ?? 1;
      return {
        supported: true,
        noveltyEstimate,
        duplicateRate,
        costEstimate
      };
    } catch (error) {
      this._log('warn', 'ReplaySimulator failed', error?.message || error);
      return {
        supported: false,
        noveltyEstimate: null,
        duplicateRate: null,
        costEstimate: null
      };
    }
  }

  _estimateNovelty(snapshot, blueprint) {
    const known = new Set(snapshot?.seenUrls || []);
    const seeds = Array.isArray(blueprint?.seedQueue) ? blueprint.seedQueue : [];
    let novel = 0;
    for (const seed of seeds) {
      if (!seed?.url) continue;
      if (!known.has(seed.url)) {
        novel++;
      }
    }
    return seeds.length ? Number((novel / seeds.length).toFixed(3)) : 0;
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
  ReplaySimulator
};
