'use strict';

/**
 * PlanFusion – merge seeds and hubs across planning sources under budgets.
 */
class PlanFusion {
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * Fuse multiple plans.
   * @param {Object} params
   * @returns {Object} { plan, stats, confidence }
   */
  fuse({
    microprologPlan,
    alternativePlans = [],
    validatorResult,
    context = {},
    floor = 0.2,
    maxSeeds = 200
  } = {}) {
    if (!microprologPlan && alternativePlans.length === 0) {
      return null;
    }

    const dedupeUrl = (url) => {
      try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.toString();
      } catch (_) {
        return url;
      }
    };

    const microSeeds = Array.isArray(microprologPlan?.seedQueue) ? microprologPlan.seedQueue : [];
    const altSeedLists = alternativePlans.map(plan => Array.isArray(plan.seedQueue) ? plan.seedQueue : []);
    const microQuota = Math.max(0, Math.floor(maxSeeds * floor));

    const chosenSeeds = [];
    const seenUrls = new Set();

    const addSeed = (seed, source) => {
      if (!seed || !seed.url) return;
      const key = dedupeUrl(seed.url);
      if (!key || seenUrls.has(key)) return;
      seenUrls.add(key);
      chosenSeeds.push({ ...seed, source });
    };

    // Step 1: include top MicroProlog seeds that passed validation
    let microAdded = 0;
    for (const seed of microSeeds) {
      if (validatorResult?.reasons?.includes('trap_risk_high')) break;
      addSeed(seed, 'microprolog');
      microAdded++;
      if (microAdded >= microQuota) break;
    }

    // Step 2: interleave with alternative lists
    const iterators = altSeedLists.map(list => ({ list, index: 0 }));
    let added = chosenSeeds.length;
    while (added < maxSeeds && iterators.some(it => it.index < it.list.length)) {
      for (const iterator of iterators) {
        if (iterator.index >= iterator.list.length || added >= maxSeeds) continue;
        addSeed(iterator.list[iterator.index], 'alternative');
        iterator.index += 1;
        added = chosenSeeds.length;
      }
    }

    const fusedHubs = this._fuseHubs({ microprologPlan, alternativePlans, seenUrls });

    return {
      plan: {
        ...alternativePlans[0],
        ...microprologPlan,
        fused: true,
        seedQueue: chosenSeeds,
        proposedHubs: fusedHubs
      },
      stats: {
        microSeeds: microAdded,
        totalSeeds: chosenSeeds.length,
        altSources: iterators.length,
        hubs: fusedHubs.length
      },
      confidence: 0.55 + Math.min(0.15, microAdded * 0.01)
    };
  }

  _fuseHubs({ microprologPlan, alternativePlans, seenUrls }) {
    const hubs = [];
    const addHub = (hub, source) => {
      if (!hub || !hub.url) return;
      const key = this._dedupeUrl(hub.url);
      if (!key || seenUrls.has(key)) return;
      seenUrls.add(key);
      hubs.push({ ...hub, source });
    };

    for (const hub of Array.isArray(microprologPlan?.proposedHubs) ? microprologPlan.proposedHubs : []) {
      addHub(hub, 'microprolog');
    }

    for (const plan of alternativePlans) {
      for (const hub of Array.isArray(plan?.proposedHubs) ? plan.proposedHubs : []) {
        addHub(hub, 'alternative');
      }
    }

    return hubs;
  }

  _dedupeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return url;
    }
  }
}

module.exports = {
  PlanFusion
};
