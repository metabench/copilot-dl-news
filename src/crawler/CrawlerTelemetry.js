 'use strict';

const { safeCall } = require('./utils');

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
    if (this.events && typeof this.events.emitQueueEvent === 'function') {
      this.events.emitQueueEvent({
        ...eventData
      });
    }
  }

  enhancedQueueEvent(eventData = {}) {
    if (!eventData || typeof eventData !== 'object') return;
    if (this.events && typeof this.events.emitEnhancedQueueEvent === 'function') {
      this.events.emitEnhancedQueueEvent({
        ...eventData
      });
      return;
    }
    this.queueEvent(eventData);
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
