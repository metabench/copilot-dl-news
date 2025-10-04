'use strict';

const { extractDomain } = require('../../../utils/domainUtils');

const DEFAULT_SUMMARY = { count: 0, items: [] };
const DEFAULT_ACHIEVEMENTS_LIMIT = 12;

function safeSummary(baseSummary) {
  if (!baseSummary || typeof baseSummary !== 'object') return { ...DEFAULT_SUMMARY };
  const count = Number.isFinite(baseSummary.count) ? baseSummary.count : Array.isArray(baseSummary.items) ? baseSummary.items.length : 0;
  const items = Array.isArray(baseSummary.items) ? baseSummary.items.slice() : [];
  return { ...baseSummary, count, items };
}

function normalizeQueueRow(row) {
  if (!row) return null;
  const startedRaw = row.started_at ?? row.startedAt ?? null;
  let startedAt = null;
  let startedAtIso = null;
  if (startedRaw != null) {
    const numeric = Number(startedRaw);
    if (Number.isFinite(numeric) && numeric > 0) {
      startedAt = numeric;
      try {
        startedAtIso = new Date(numeric).toISOString();
      } catch (_) {
        startedAtIso = null;
      }
    } else if (typeof startedRaw === 'string' && startedRaw.trim()) {
      startedAtIso = startedRaw.trim();
    }
  }
  return {
    id: row.id,
    url: row.url || null,
    args: row.args || null,
    status: row.status || null,
    startedAt,
    startedAtIso
  };
}

function computeResumeInputs(queue) {
  const info = {
    args: [],
    hasArgs: false,
    hasUrl: typeof queue?.url === 'string' && queue.url.trim().length > 0,
    argsError: null
  };
  if (queue && queue.args != null) {
    try {
      const parsed = JSON.parse(queue.args);
      if (Array.isArray(parsed)) {
        info.args = parsed.map((value) => (typeof value === 'string' ? value : String(value)));
      } else if (parsed != null) {
        info.argsError = 'not-array';
      }
    } catch (err) {
      info.argsError = 'parse-error';
    }
  }
  info.hasArgs = Array.isArray(info.args) && info.args.length > 0;
  return info;
}

class IntelligentCrawlerManager {
  constructor({
    baseSummaryFn = null,
    achievementsLimit = DEFAULT_ACHIEVEMENTS_LIMIT
  } = {}) {
    this.baseSummaryFn = typeof baseSummaryFn === 'function' ? baseSummaryFn : (() => ({ ...DEFAULT_SUMMARY }));
    this.achievementsLimit = Number.isFinite(achievementsLimit) && achievementsLimit > 0 ? achievementsLimit : DEFAULT_ACHIEVEMENTS_LIMIT;
    this.jobRegistry = null;
    this.jobAchievements = new Map();
    this.jobLifecycle = new Map();
  }

  setJobRegistry(jobRegistry) {
    this.jobRegistry = jobRegistry || null;
  }

  buildJobsSummary(jobs) {
    const base = safeSummary(this.baseSummaryFn(jobs));
    if (!Array.isArray(base.items)) {
      base.items = [];
    }
    base.items = base.items.map((item) => {
      const jobId = item && item.id ? item.id : null;
      const achievements = jobId ? this.getRecentAchievements(jobId) : [];
      const lifecycle = jobId ? (this.jobLifecycle.get(jobId) || null) : null;
      return {
        ...item,
        achievements,
        lifecycle
      };
    });
    base.count = base.items.length;
    return base;
  }

  recordMilestone(jobId, milestone = {}) {
    if (!jobId || !milestone || typeof milestone !== 'object') return;
    const sanitized = { ...milestone };
    if (!sanitized.kind) {
      sanitized.kind = 'milestone';
    }
    if (!sanitized.scope) {
      sanitized.scope = null;
    }
    sanitized.recordedAt = sanitized.recordedAt || new Date().toISOString();
    const list = this.jobAchievements.get(jobId) || [];
    list.unshift(sanitized);
    if (list.length > this.achievementsLimit) {
      list.splice(this.achievementsLimit);
    }
    this.jobAchievements.set(jobId, list);
  }

  getRecentAchievements(jobId) {
    if (!jobId) return [];
    const list = this.jobAchievements.get(jobId);
    if (!Array.isArray(list) || !list.length) return [];
    return list.map((entry) => ({ ...entry }));
  }

  noteJobStart({
    jobId,
    url = null,
    mode = 'fresh',
    queueId = null,
    argsSource = null,
    domain = null,
    startedAt = null
  } = {}) {
    if (!jobId) return;
    const iso = startedAt || new Date().toISOString();
    const entry = {
      jobId,
      url,
      queueId,
      mode,
      argsSource,
      domain: domain || (url ? extractDomain(url) : null),
      startedAt: iso,
      lastSeenAt: iso
    };
    this.jobLifecycle.set(jobId, entry);
  }

  noteJobResumed({
    jobId,
    url = null,
    queueId = null,
    argsSource = null,
    domain = null,
    resumedAt = null
  } = {}) {
    if (!jobId) return;
    this.noteJobStart({
      jobId,
      url,
      queueId,
      argsSource,
      domain,
      mode: 'resume',
      startedAt: resumedAt || new Date().toISOString()
    });
  }

  noteJobHeartbeat(jobId) {
    if (!jobId) return;
    const lifecycle = this.jobLifecycle.get(jobId);
    if (!lifecycle) return;
    lifecycle.lastSeenAt = new Date().toISOString();
  }

  noteJobExit(jobId, extras = {}) {
    if (!jobId) return;
    const lifecycle = this.jobLifecycle.get(jobId);
    if (lifecycle) {
      lifecycle.endedAt = extras.endedAt || new Date().toISOString();
      lifecycle.exitInfo = extras.exitInfo || null;
    }
    if (!extras.keepAchievements) {
      this.jobAchievements.delete(jobId);
    }
  }

  clearJob(jobId) {
    if (!jobId) return;
    this.jobLifecycle.delete(jobId);
    this.jobAchievements.delete(jobId);
  }

  collectRunningContext() {
    const runningJobIds = new Set();
    const runningDomains = new Set();
    const registry = this.jobRegistry;
    if (registry && typeof registry.getJobs === 'function') {
      for (const [id, job] of registry.getJobs()) {
        runningJobIds.add(id);
        if (job && job.url) {
          const domain = extractDomain(job.url);
          if (domain) runningDomains.add(domain);
        }
      }
    }
    return { runningJobIds, runningDomains };
  }

  planResumeQueues({ queues = [], availableSlots = 0, runningJobIds = new Set(), runningDomains = new Set() } = {}) {
    const infoById = new Map();
    const selected = [];
    const processed = [];
    const domainGuard = new Set(runningDomains || []);

    for (const row of queues || []) {
      const queue = normalizeQueueRow(row);
      if (!queue || queue.id == null) {
        continue;
      }
      const resumeInputs = computeResumeInputs(queue);
      const domain = queue.url ? extractDomain(queue.url) : null;
      const entry = {
        queue,
        domain,
        resumeInputs,
        state: 'available',
        reasons: []
      };

      if (runningJobIds && runningJobIds.has(queue.id)) {
        entry.state = 'blocked';
        entry.reasons.push('already-running');
      } else if (!resumeInputs.hasUrl && !resumeInputs.hasArgs) {
        entry.state = 'blocked';
        entry.reasons.push('missing-source');
      } else if (domain && domainGuard.has(domain)) {
        entry.state = 'blocked';
        entry.reasons.push('domain-conflict');
      } else if (selected.length >= availableSlots) {
        entry.state = 'queued';
        entry.reasons.push('capacity-exceeded');
      } else {
        entry.state = 'selected';
        selected.push(entry);
        if (domain) domainGuard.add(domain);
      }

      infoById.set(queue.id, entry);
      processed.push(entry);
    }

    return {
      selected,
      info: infoById,
      processed
    };
  }

  buildQueueSummary(plan, { now = Date.now() } = {}) {
    const processed = Array.isArray(plan?.processed) ? plan.processed : [];
    const queues = processed.map((entry) => {
      const { queue, domain, resumeInputs, state, reasons } = entry;
      const startedAtMs = Number.isFinite(queue.startedAt) ? queue.startedAt : null;
      const ageMs = startedAtMs != null ? Math.max(0, now - startedAtMs) : null;
      return {
        id: queue.id,
        url: queue.url,
        status: queue.status,
        startedAt: queue.startedAtIso || queue.startedAt || null,
        startedAtMs,
        ageMs,
        domain,
        state,
        reasons,
        hasArgs: resumeInputs.hasArgs,
        hasUrl: resumeInputs.hasUrl,
        argsError: resumeInputs.argsError || null
      };
    });

    const recommendedIds = Array.isArray(plan?.selected)
      ? plan.selected.map((entry) => entry.queue.id)
      : [];

    const blockedDomains = Array.from(new Set(
      processed
        .filter((entry) => Array.isArray(entry.reasons) && entry.reasons.includes('domain-conflict') && entry.domain)
        .map((entry) => entry.domain)
    ));

    return {
      queues,
      recommendedIds,
      blockedDomains
    };
  }
}

module.exports = {
  IntelligentCrawlerManager,
  normalizeQueueRow,
  computeResumeInputs
};
