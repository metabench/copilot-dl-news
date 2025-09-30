'use strict';

class CrawlerTelemetry {
  constructor(options = {}) {
    const {
      events
    } = options;

    this.events = events || null;
  }

  progress(options = {}) {
    const force = typeof options === 'boolean' ? options : !!options.force;
    if (this.events && typeof this.events.emitProgress === 'function') {
      this.events.emitProgress({
        force
      });
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
