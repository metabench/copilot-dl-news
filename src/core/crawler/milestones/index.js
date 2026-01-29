const { each, tof } = require('lang-tools');

function defineMilestone({ id, enabled = true, evaluate, onAward = null, goal = null }) {
  if (!id) {
    throw new Error('Milestone definitions require an id');
  }
  if (tof(evaluate) !== 'function') {
    throw new Error(`Milestone '${id}' requires an evaluate(context) function`);
  }
  if (goal != null) {
    if (tof(goal) !== 'object') {
      throw new Error(`Milestone '${id}' goal definition must be an object`);
    }
    if (!goal.id) {
      throw new Error(`Milestone '${id}' goal definition requires an id`);
    }
    if (goal.getProgress && tof(goal.getProgress) !== 'function') {
      throw new Error(`Milestone '${id}' goal.getProgress must be a function`);
    }
    if (goal.planActions && tof(goal.planActions) !== 'function') {
      throw new Error(`Milestone '${id}' goal.planActions must be a function`);
    }
  }
  return {
    id,
    enabled: enabled !== false,
    evaluate,
    onAward: tof(onAward) === 'function' ? onAward : null,
    goal: goal || null
  };
}

function createDepthCoverageMilestone({
  id = 'depth2-coverage-10',
  enabled = true,
  countThreshold = 10,
  message,
  kind = 'coverage-depth2'
} = {}) {
  return defineMilestone({
    id,
    enabled,
    evaluate: ({ stats }) => {
      const processed = stats && tof(stats.depth2PagesProcessed) === 'number' ? stats.depth2PagesProcessed : 0;
      if (processed < countThreshold) {
        return null;
      }
      const resolvedMessage = tof(message) === 'function'
        ? message({ countThreshold, processed })
        : (message || `Processed ${processed} depth-2 pages (threshold ${countThreshold})`);
      return {
        telemetry: {
          kind,
          message: resolvedMessage,
          details: {
            depth: 2,
            countThreshold,
            processed
          }
        },
        details: {
          depth: 2,
          countThreshold,
          processed
        }
      };
    }
  });
}

function createDownloadsMilestone({
  id = 'downloads-1k',
  enabled = true,
  countThreshold = 1000,
  message,
  kind = 'downloads'
} = {}) {
  return defineMilestone({
    id,
    enabled,
    evaluate: ({ stats }) => {
      const downloaded = stats && tof(stats.pagesDownloaded) === 'number' ? stats.pagesDownloaded : 0;
      if (downloaded < countThreshold) {
        return null;
      }
      const resolvedMessage = tof(message) === 'function'
        ? message({ countThreshold, downloaded })
        : (message || `Downloaded ${downloaded} pages (threshold ${countThreshold})`);
      return {
        telemetry: {
          kind,
          message: resolvedMessage,
          details: {
            countThreshold,
            downloaded
          }
        },
        details: {
          countThreshold,
          downloaded
        }
      };
    }
  });
}

function createArticlesFoundMilestone({
  id = 'articles-found-1k',
  enabled = true,
  countThreshold = 1000,
  message,
  kind = 'articles-found'
} = {}) {
  return defineMilestone({
    id,
    enabled,
    evaluate: ({ stats }) => {
      const count = stats && tof(stats.articlesFound) === 'number' ? stats.articlesFound : 0;
      if (count < countThreshold) {
        return null;
      }
      const resolvedMessage = tof(message) === 'function'
        ? message({ countThreshold, count })
        : (message || `Found ${count} articles (threshold ${countThreshold})`);
      return {
        telemetry: {
          kind,
          message: resolvedMessage,
          details: {
            countThreshold,
            count
          }
        },
        details: {
          countThreshold,
          count
        }
      };
    }
  });
}

function createIdentifiedCountryHubsMilestone({
  id = 'identified-country-hubs',
  enabled = true,
  visitRatioThreshold = 0.95,
  minSeeded = 5,
  message,
  kind = 'country-hubs-identified',
  goalId = 'goal-identify-country-hubs',
  description = 'Identify nearly every country hub available on the site',
  maxMissingSample = 5,
  maxPlanActions = 25
} = {}) {
  const buildSummary = (state) => {
    if (!state || typeof state.getHubVisitStats !== 'function') {
      return null;
    }
    const summary = state.getHubVisitStats();
    if (!summary || typeof summary !== 'object') {
      return null;
    }
    const country = summary.perKind && summary.perKind.country;
    const seeded = country?.seeded || 0;
    const visited = country?.visited || 0;
    const missingCount = Math.max(seeded - visited, 0);

    const missingSample = [];
    const missingUrls = [];
    if (state.getSeededHubSet && typeof state.getSeededHubSet === 'function') {
      const seededSet = state.getSeededHubSet();
      if (seededSet && typeof seededSet.forEach === 'function') {
        // Convert Set to Array for reliable iteration with each()
        const seededArray = Array.from(seededSet);
        each(seededArray, (url) => {
          if (!url) {
            return;
          }
          let meta = null;
          if (state.getSeededHubMeta) {
            try {
              meta = state.getSeededHubMeta(url) || {};
            } catch (_) {
              meta = null;
            }
          }
          const kind = meta?.kind;
          if (kind && kind !== 'country') {
            return;
          }
          try {
            if (state.hasVisitedHub && state.hasVisitedHub(url)) {
              return;
            }
          } catch (_) {
            // fall through, treat as unvisited if error
          }
          missingUrls.push(url);
          if (missingSample.length < maxMissingSample) {
            missingSample.push(url);
          }
        });
      }
    }

    const ratio = seeded > 0 ? visited / seeded : 0;
    return {
      seeded,
      visited,
      missingCount,
      ratio,
      missingSample,
      missingUrls
    };
  };

  const goal = {
    id: goalId,
    description,
    getProgress: ({ state } = {}) => {
      const summary = buildSummary(state);
      if (!summary) {
        return null;
      }
      const { seeded, visited, missingCount, ratio, missingSample, missingUrls } = summary;
      const planTargets = missingUrls.length ? missingUrls : missingSample;
      const nextTargetUrls = Number.isFinite(maxPlanActions) && maxPlanActions > 0
        ? planTargets.slice(0, maxPlanActions)
        : planTargets;
      return {
        completed: seeded >= minSeeded && (missingCount === 0 || ratio >= visitRatioThreshold),
        progress: seeded > 0 ? Math.min(1, ratio) : 0,
        details: {
          seeded,
          visited,
          missingCount,
          ratio,
          threshold: visitRatioThreshold,
          minSeeded,
          missingSample,
          missingUrlsCount: missingUrls.length
        },
        nextSteps: nextTargetUrls.map((url) => ({
          type: 'fetch-country-hub',
          url,
          depth: 1
        }))
      };
    },
    planActions: ({ state } = {}) => {
      const summary = buildSummary(state);
      if (!summary || summary.missingCount === 0) {
        return null;
      }
      const planTargets = summary.missingUrls.length ? summary.missingUrls : summary.missingSample;
      if (!planTargets.length) {
        return null;
      }
      const targetUrls = Number.isFinite(maxPlanActions) && maxPlanActions > 0
        ? planTargets.slice(0, maxPlanActions)
        : planTargets;
      return {
        actions: targetUrls.map((url) => ({
          type: 'enqueue-hub-fetch',
          url,
          depth: 1
        })),
        rationale: `Fetch remaining country hub pages to satisfy the goal (targeting ${targetUrls.length} of ${summary.missingCount}).`
      };
    }
  };

  return defineMilestone({
    id,
    enabled,
    goal,
    evaluate: ({ state }) => {
      const summary = buildSummary(state);
      if (!summary) {
        return null;
      }
      const { seeded, visited, missingCount, ratio, missingSample, missingUrls } = summary;
      if (seeded < minSeeded) {
        return null;
      }
      if (missingCount > 0 && ratio < visitRatioThreshold) {
        return null;
      }
      const resolvedMessage = tof(message) === 'function'
        ? message({ seeded, visited, missingCount, ratio })
        : (message || `Identified country hubs for ${visited} of ${seeded} countries`);
      return {
        telemetry: {
          kind,
          message: resolvedMessage,
          details: {
            seeded,
            visited,
            missingCount,
            ratio,
            threshold: visitRatioThreshold,
            minSeeded,
            missingSample,
            missingUrlsCount: missingUrls.length
          }
        },
        details: {
          seeded,
          visited,
          missingCount,
          ratio,
          threshold: visitRatioThreshold,
          minSeeded,
          missingSample,
          missingUrlsCount: missingUrls.length
        }
      };
    }
  });
}

function createRepeatedCrawlsMilestone({
  id = 'repeated-depth-crawls',
  enabled = false,
  depthThreshold = 2,
  countThreshold = 10,
  message,
  kind = 'repeated-depth-crawls'
} = {}) {
  return defineMilestone({
    id,
    enabled,
    evaluate: ({ stats }) => {
      if (!stats || tof(stats.depth2PagesProcessed) !== 'number') {
        return null;
      }
      if (depthThreshold > 2) {
        // Currently only depth==2 statistics are tracked; bail out gracefully for deeper thresholds.
        return null;
      }
      const processed = stats.depth2PagesProcessed;
      if (processed < countThreshold) {
        return null;
      }
      const resolvedMessage = tof(message) === 'function'
        ? message({ depthThreshold, countThreshold, processed })
        : (message || `Completed ${processed} depth-${depthThreshold} page visits (threshold ${countThreshold})`);
      return {
        telemetry: {
          kind,
          message: resolvedMessage,
          details: {
            depthThreshold,
            countThreshold,
            processed
          }
        },
        details: {
          depthThreshold,
          countThreshold,
          processed
        }
      };
    }
  });
}

function createDefaultMilestones(options = {}) {
  const {
    depthCoverage,
    downloads,
    articlesFound,
    repeatedDepthCrawls,
    identifiedCountryHubs
  } = options;

  return [
    createDepthCoverageMilestone(depthCoverage || {}),
    createDownloadsMilestone(downloads || {}),
    createArticlesFoundMilestone(articlesFound || {}),
    createRepeatedCrawlsMilestone(repeatedDepthCrawls || {}),
    createIdentifiedCountryHubsMilestone(identifiedCountryHubs || {})
  ];
}

module.exports = {
  defineMilestone,
  createDepthCoverageMilestone,
  createDownloadsMilestone,
  createArticlesFoundMilestone,
  createIdentifiedCountryHubsMilestone,
  createRepeatedCrawlsMilestone,
  createDefaultMilestones
};
