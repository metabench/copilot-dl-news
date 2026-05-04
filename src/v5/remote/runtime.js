'use strict';

const fs = require('fs');
const path = require('path');

function toIso(now) {
  return now().toISOString();
}

function createNotFoundError(message) {
  const error = new Error(message);
  error.code = 'NOT_FOUND';
  return error;
}

function normalizeDomainConfigs(rawConfigs, maxPagesDefault) {
  const seen = new Set();
  const normalized = [];

  for (const rawConfig of rawConfigs || []) {
    const config = typeof rawConfig === 'string'
      ? { domain: rawConfig, maxPages: maxPagesDefault }
      : {
          domain: rawConfig?.domain || rawConfig?.host,
          maxPages: rawConfig?.maxPages || maxPagesDefault,
          seedUrls: Array.isArray(rawConfig?.seedUrls) ? rawConfig.seedUrls : [],
        };

    const domain = String(config.domain || '').trim();
    if (!domain || seen.has(domain)) {
      continue;
    }

    seen.add(domain);
    normalized.push({
      domain,
      maxPages: Number.isFinite(Number(config.maxPages)) ? Number(config.maxPages) : maxPagesDefault,
      seedUrls: config.seedUrls || [],
    });
  }

  return normalized;
}

function loadDomainConfigs({ domains, configPath, maxPagesDefault = 50 }) {
  if (configPath) {
    const resolved = path.resolve(configPath);
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return normalizeDomainConfigs(parsed.domains || [], maxPagesDefault);
  }

  if (domains) {
    return normalizeDomainConfigs(
      String(domains)
        .split(',')
        .map((domain) => domain.trim())
        .filter(Boolean),
      maxPagesDefault
    );
  }

  return [];
}

function serializeDomainEntry(domain, entry) {
  return {
    domain,
    state: entry.state,
    isRunning: entry.state === 'running',
    maxPages: entry.maxPages,
    seedUrls: entry.seedUrls.length,
    startedAt: entry.startedAt,
    stoppedAt: entry.stoppedAt,
    lastTransitionAt: entry.lastTransitionAt,
  };
}

function createBootstrapRuntime(options = {}) {
  const {
    domainConfigs = [],
    maxPagesDefault = 50,
    maxConcurrent = 5,
    suggestionProvider = null,
    now = () => new Date(),
  } = options;

  const runtimeStartedAt = now();
  let currentMaxConcurrent = Math.max(1, Number(maxConcurrent) || 5);
  const workers = new Map();

  for (const config of normalizeDomainConfigs(domainConfigs, maxPagesDefault)) {
    workers.set(config.domain, {
      state: 'idle',
      maxPages: config.maxPages,
      seedUrls: config.seedUrls || [],
      startedAt: null,
      stoppedAt: null,
      lastTransitionAt: toIso(now),
    });
  }

  function getRunningCount() {
    let count = 0;
    for (const [, entry] of workers) {
      if (entry.state === 'running') {
        count += 1;
      }
    }
    return count;
  }

  function getTotals() {
    const totals = {
      domains: workers.size,
      running: 0,
      idle: 0,
      stopped: 0,
    };

    for (const [, entry] of workers) {
      totals[entry.state] = (totals[entry.state] || 0) + 1;
    }

    return totals;
  }

  function getDomainEntry(domain) {
    const entry = workers.get(domain);
    if (!entry) {
      throw createNotFoundError(`Unknown domain: ${domain}`);
    }
    return entry;
  }

  function listDomains() {
    return Array.from(workers.entries()).map(([domain, entry]) => serializeDomainEntry(domain, entry));
  }

  function getDomainStatus(domain) {
    return serializeDomainEntry(domain, getDomainEntry(domain));
  }

  function startDomains(domainsToStart, maxPagesOverride) {
    const results = [];
    let openSlots = Math.max(0, currentMaxConcurrent - getRunningCount());

    for (const domain of domainsToStart) {
      const entry = workers.get(domain);
      if (!entry) {
        results.push({ domain, status: 'not_found' });
        continue;
      }
      if (entry.state === 'running') {
        results.push({ domain, status: 'already_running', maxPages: entry.maxPages });
        continue;
      }
      if (openSlots === 0) {
        results.push({ domain, status: 'deferred', reason: 'max_concurrent' });
        continue;
      }

      entry.state = 'running';
      entry.maxPages = maxPagesOverride || entry.maxPages;
      entry.startedAt = toIso(now);
      entry.lastTransitionAt = entry.startedAt;
      openSlots -= 1;

      results.push({ domain, status: 'started', maxPages: entry.maxPages });
    }

    return results;
  }

  function stopDomains(domainsToStop) {
    const results = [];

    for (const domain of domainsToStop) {
      const entry = workers.get(domain);
      if (!entry) {
        results.push({ domain, status: 'not_found' });
        continue;
      }
      if (entry.state !== 'running') {
        results.push({ domain, status: 'already_stopped' });
        continue;
      }

      entry.state = 'stopped';
      entry.stoppedAt = toIso(now);
      entry.lastTransitionAt = entry.stoppedAt;

      results.push({ domain, status: 'stopped' });
    }

    return results;
  }

  async function getSuggestions({ domain, kind = 'all' }) {
    getDomainEntry(domain);

    if (suggestionProvider && typeof suggestionProvider.getSuggestions === 'function') {
      return suggestionProvider.getSuggestions({ domain, kind });
    }

    return {
      domain,
      kind,
      status: 'unconfigured',
      suggestions: [],
    };
  }

  function getStatus() {
    return {
      version: '5.0.0-alpha',
      mode: 'v5-bootstrap',
      startedAt: runtimeStartedAt.toISOString(),
      uptimeMs: now().getTime() - runtimeStartedAt.getTime(),
      orchestrator: {
        totalDomains: workers.size,
        currentlyRunning: getRunningCount(),
        maxConcurrent: currentMaxConcurrent,
      },
      totals: getTotals(),
      capabilities: {
        crawlControl: true,
        hubSuggestions: true,
        articleLibrary: false,
        bundleJobs: false,
      },
      domains: listDomains(),
    };
  }

  return {
    getStatus,
    listDomains,
    getDomainStatus,
    getConfig() {
      return {
        maxPagesDefault,
        maxConcurrent: currentMaxConcurrent,
        totalDomains: workers.size,
      };
    },
    start({ domain, domains, maxPages, maxConcurrent: maxConcurrentOverride } = {}) {
      if (maxConcurrentOverride !== undefined) {
        const parsed = Number(maxConcurrentOverride);
        if (Number.isFinite(parsed) && parsed > 0) {
          currentMaxConcurrent = parsed;
        }
      }

      const maxPagesOverride = maxPages !== undefined && Number.isFinite(Number(maxPages))
        ? Number(maxPages)
        : undefined;

      if (domain) {
        return {
          started: 1,
          maxConcurrent: currentMaxConcurrent,
          results: startDomains([domain], maxPagesOverride),
        };
      }

      if (Array.isArray(domains) && domains.length > 0) {
        return {
          started: domains.length,
          maxConcurrent: currentMaxConcurrent,
          results: startDomains(domains, maxPagesOverride),
        };
      }

      return {
        started: workers.size,
        maxConcurrent: currentMaxConcurrent,
        results: startDomains(Array.from(workers.keys()), maxPagesOverride),
      };
    },
    stop({ domain } = {}) {
      if (domain) {
        return {
          stopped: 1,
          results: stopDomains([domain]),
        };
      }

      return {
        stopped: workers.size,
        results: stopDomains(Array.from(workers.keys())),
      };
    },
    getSuggestions,
    async close() {},
  };
}

module.exports = {
  createBootstrapRuntime,
  loadDomainConfigs,
  normalizeDomainConfigs,
};
