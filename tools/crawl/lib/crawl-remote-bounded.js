'use strict';

function normalizeDomains(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(list.map(item => String(item).trim()).filter(Boolean))];
}

function resolveTargetDomains(args, statusData) {
  if (args.domain) return normalizeDomains([args.domain]);
  if (args.domains) return normalizeDomains(args.domains);
  return normalizeDomains((statusData?.domains || []).map(domain => domain.domain));
}

function summarizeBoundedRun(statusData, targetDomains) {
  const targets = normalizeDomains(targetDomains);
  const byDomain = new Map((statusData?.domains || []).map(domain => [domain.domain, domain]));
  const running = [];
  const completed = [];
  const notStarted = [];
  const unknown = [];

  for (const domain of targets) {
    const status = byDomain.get(domain);
    if (!status) {
      unknown.push({ domain, reason: 'missing' });
      continue;
    }

    const hasEverStarted = Boolean(
      status.startedAt ||
      status.stoppedAt ||
      status.isRunning ||
      status.state === 'running' ||
      status.stats?.fetched ||
      status.stats?.done ||
      status.stats?.stored ||
      status.stats?.errors
    );

    if (status.isRunning || status.state === 'running') {
      running.push(status);
      continue;
    }

    if (!hasEverStarted) {
      notStarted.push(status);
      continue;
    }

    completed.push(status);
  }

  return {
    targetDomains: targets,
    running,
    completed,
    notStarted,
    unknown,
    allDone: running.length === 0 && notStarted.length === 0 && unknown.length === 0,
  };
}

function findMissingDomains(statusData, targetDomains) {
  const configured = new Set((statusData?.domains || []).map(domain => domain.domain));
  return normalizeDomains(targetDomains).filter(domain => !configured.has(domain));
}

module.exports = {
  findMissingDomains,
  normalizeDomains,
  resolveTargetDomains,
  summarizeBoundedRun,
};