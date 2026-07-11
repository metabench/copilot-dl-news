 'use strict';

const { safeCall } = require('./utils');

// Queue-event actions that explain why a URL did or did not progress. When the
// CRAWLER_LOG_QUEUE_DROPS env knob is set, these are mirrored to stderr so a
// failing crawl self-explains without DB spelunking (usability bar: failures
// self-explain). 'dequeued' is included so a silent post-dequeue loss (cycle 9/10
// seed-fetched gap) is bracketed by a visible dequeue line.
const QUEUE_STDERR_ACTIONS = new Set(['drop', 'fetch-skip', 'seed-enqueue', 'dequeued']);

function isQueueDropLoggingEnabled() {
  const flag = process.env.CRAWLER_LOG_QUEUE_DROPS;
  if (flag == null) return false;
  const normalized = String(flag).trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

class CrawlerTelemetry {
  constructor(options = {}) {
    const {
      events
    } = options;

    this.events = events || null;
  }

  progress(options = {}) {
    let payload;
    if (typeof options === 'boolean') {
      payload = { force: options };
    } else if (options && typeof options === 'object') {
      payload = { ...options };
    } else {
      payload = {};
    }
    payload.force = !!payload.force;
    if (this.events && typeof this.events.emitProgress === 'function') {
      this.events.emitProgress(payload);
    }
  }

  queueEvent(eventData = {}) {
    if (!eventData || typeof eventData !== 'object') return;
    this._maybeLogQueueEventToStderr(eventData);
    if (this.events && typeof this.events.emitQueueEvent === 'function') {
      this.events.emitQueueEvent({
        ...eventData
      });
    }
  }

  enhancedQueueEvent(eventData = {}) {
    if (!eventData || typeof eventData !== 'object') return;
    if (this.events && typeof this.events.emitEnhancedQueueEvent === 'function') {
      this._maybeLogQueueEventToStderr(eventData);
      this.events.emitEnhancedQueueEvent({
        ...eventData
      });
      return;
    }
    // Fallback delegates to queueEvent, which does its own stderr mirroring.
    this.queueEvent(eventData);
  }

  // Mirror drop/skip decisions to stderr when CRAWLER_LOG_QUEUE_DROPS is set.
  // Compact one-line format, resilient to weird payloads, never throws.
  _maybeLogQueueEventToStderr(eventData) {
    try {
      if (!isQueueDropLoggingEnabled()) return;
      const action = eventData && eventData.action;
      if (!QUEUE_STDERR_ACTIONS.has(action)) return;
      const parts = [`[queue] action=${action}`];
      if (eventData.reason != null) parts.push(`reason=${eventData.reason}`);
      if (eventData.url != null) parts.push(`url=${eventData.url}`);
      if (eventData.depth != null) parts.push(`depth=${eventData.depth}`);
      if (eventData.host != null) parts.push(`host=${eventData.host}`);
      if (eventData.queueSize != null) parts.push(`queueSize=${eventData.queueSize}`);
      process.stderr.write(parts.join(' ') + '\n');
    } catch (_) { /* visibility must never break the crawl */ }
  }

  problem(problemData = {}) {
    if (!problemData || typeof problemData !== 'object') return;
    if (this.events && typeof this.events.emitProblem === 'function') {
      this.events.emitProblem(problemData);
    }
  }

  milestone(milestone = {}) {
    if (!milestone || typeof milestone !== 'object') return;
    if (this.events && typeof this.events.emitMilestone === 'function') {
      this.events.emitMilestone({
        ...milestone
      });
    }
  }

  milestoneOnce(key, milestone = {}) {
    if (!key) return;
    if (this.events && typeof this.events.emitMilestoneOnce === 'function') {
      this.events.emitMilestoneOnce(key, {
        ...milestone
      });
      return;
    }
    this.milestone(milestone);
  }

  plannerStage(event = {}) {
    if (!event || typeof event !== 'object') return;
    if (this.events && typeof this.events.emitPlannerStage === 'function') {
      this.events.emitPlannerStage(event);
    }
  }

  telemetry(entry = {}) {
    if (!entry || typeof entry !== 'object') return;
    if (this.events && typeof this.events.emitTelemetry === 'function') {
      this.events.emitTelemetry({
        ts: new Date().toISOString(),
        source: 'crawler',
        severity: 'info',
        ...entry
      });
    } else {
      // Fallback: emit as console message so it gets picked up
      safeCall(() => {
        console.log('TELEMETRY ' + JSON.stringify({
          ts: new Date().toISOString(),
          source: 'crawler',
          severity: 'info',
          ...entry
        }));
      });
    }
  }

  getProblemSummary() {
    if (this.events && typeof this.events.getProblemSummary === 'function') {
      return this.events.getProblemSummary() || null;
    }
    return null;
  }

  resetMilestones() {
    if (this.events && typeof this.events.resetMilestones === 'function') {
      this.events.resetMilestones();
    }
  }
}

module.exports = {
  CrawlerTelemetry
};
