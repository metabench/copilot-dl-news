'use strict';

function getWorkerPm2Name(domain) {
  return `crawl-worker-${String(domain).replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

function getRunningCount(workers) {
  let count = 0;
  for (const [, entry] of workers) {
    if (entry.state === 'running') count++;
  }
  return count;
}

function getDomainsToSchedule(workers, maxConcurrent, scopeDomains = null) {
  const scheduledDomains = [];
  let openSlots = Math.max(0, maxConcurrent - getRunningCount(workers));
  if (openSlots === 0) return scheduledDomains;

  for (const [domain, entry] of workers) {
    if (openSlots === 0) break;
    if (scopeDomains && !scopeDomains.has(domain)) continue;
    if (entry.state !== 'idle') continue;
    scheduledDomains.push(domain);
    openSlots--;
  }

  return scheduledDomains;
}

function shouldStopOrchestrator(workers, scopeDomains = null) {
  for (const [domain, entry] of workers) {
    if (scopeDomains && !scopeDomains.has(domain)) continue;
    if (entry.state === 'running' || entry.state === 'idle') {
      return false;
    }
  }
  return true;
}

function normalizeManagedWorkerStatus(previousState, diskStatus) {
  if (!diskStatus) return null;
  if (previousState === 'running' && diskStatus.state !== 'running') {
    if (diskStatus.state === 'idle' && !diskStatus.isRunning) {
      return {
        ...diskStatus,
        state: 'stopped',
        isRunning: false,
      };
    }
  }
  return diskStatus;
}

module.exports = {
  getDomainsToSchedule,
  getRunningCount,
  getWorkerPm2Name,
  normalizeManagedWorkerStatus,
  shouldStopOrchestrator,
};