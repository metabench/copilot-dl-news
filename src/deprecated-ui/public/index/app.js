import { createStore } from './state/store.js';
import { initialState } from './state/initialState.js';
import { registerReducers } from './state/reducers.js';
import { createTimelineControl } from './controls/timelineControl.js';
import { createInsightsControl } from './controls/insightsControl.js';
import { createPipelineControl } from './controls/pipelineControl.js';
import { formatTimestamp } from './formatters.js';
import { createPatternInsightsControl } from './controls/patternInsightsControl.js';

function ensureControls(controls) {
  for (const control of controls) {
    if (control && typeof control.activate === 'function') {
      control.activate();
    }
  }
}

function createMilestoneEntry(payload) {
  if (!payload) return null;
  const timestamp = payload.ts || payload.timestamp || Date.now();
  const detail = payload.details && typeof payload.details === 'object'
    ? JSON.stringify(payload.details).slice(0, 400)
    : payload.details || '';
  return {
    id: payload.id || `milestone-${timestamp}`,
    title: payload.kind || 'milestone',
    meta: [payload.scope, payload.message].filter(Boolean).join(' — '),
    detail,
    timestamp,
    badgeClass: 'badge badge-ok'
  };
}

function createPlannerEntry(payload) {
  if (!payload) return null;
  const timestamp = payload.ts || payload.timestamp || Date.now();
  const status = payload.status || 'started';
  const duration = Number.isFinite(payload.durationMs) ? `${payload.durationMs}ms` : null;
  const meta = [status, duration].filter(Boolean).join(' · ');
  const detail = payload.details && typeof payload.details === 'object'
    ? JSON.stringify(payload.details).slice(0, 400)
    : payload.details || '';
  const badge = status === 'failed'
    ? 'badge badge-bad'
    : status === 'completed'
      ? 'badge badge-ok'
      : 'badge badge-neutral';
  return {
    id: payload.id || `planner-${timestamp}`,
    title: payload.stage || 'stage',
    meta,
    detail,
    timestamp,
    badgeClass: badge
  };
}

function createInsightsPayload(details, extras = {}) {
  return {
    details,
    extras,
    timestamp: extras.timestamp || Date.now()
  };
}

export function createApp({ elements, formatters }) {
  const store = createStore(initialState);
  registerReducers(store);

  const pipelineControl = createPipelineControl({
    store,
    dom: elements.pipeline,
    formatters
  });
  const insightsControl = createInsightsControl({
    store,
    elements: elements.insights
  });
  const patternInsightsControl = elements.patterns
    ? createPatternInsightsControl({
        store,
        elements: elements.patterns
      })
    : null;
  const milestonesControl = createTimelineControl({
    store,
    element: elements.milestones,
    stateKey: 'milestones',
    emptyMessage: 'No milestones yet.'
  });
  const plannerControl = createTimelineControl({
    store,
    element: elements.planner,
    stateKey: 'plannerTimeline',
    emptyMessage: 'Planner telemetry appears when intelligent crawls run.'
  });

  ensureControls([pipelineControl, insightsControl, patternInsightsControl, milestonesControl, plannerControl]);

  const actions = {
    resetInsights(hint) {
      store.dispatch('insights/reset', { hint });
      store.dispatch('pipeline/reset');
    },
    resetPatternInsights() {
      store.dispatch('patterns/reset');
    },
    applyInsights(details, extras) {
      store.dispatch('insights/update', createInsightsPayload(details, extras));
      if (extras && extras.pipelinePatch) {
        store.dispatch('pipeline/patch', extras.pipelinePatch);
      }
    },
    pushMilestone(payload) {
      const entry = createMilestoneEntry(payload);
      if (entry) {
        store.dispatch('timeline/milestone:add', entry);
      }
    },
    pushPlannerStage(payload) {
      const entry = createPlannerEntry(payload);
      if (entry) {
        store.dispatch('timeline/planner:add', entry);
      }
    },
    patchPipeline(patch) {
      store.dispatch('pipeline/patch', patch);
    },
    recordPatternEvent(event) {
      store.dispatch('patterns/addEvent', event);
    },
    setCrawlType(type) {
      store.dispatch('crawl/setType', type);
    },
    captureAnalysisHistory(history) {
      if (!Array.isArray(history)) return;
      const latest = history[0];
      if (!latest) return;
      store.dispatch('timeline/milestone:add', {
        id: `analysis-${latest.ts}`,
        title: 'analysis',
        meta: latest.summary,
        detail: `Updated ${formatTimestamp(latest.ts)}`,
        timestamp: latest.ts,
        badgeClass: 'badge badge-neutral'
      });
    }
  };

  return {
    store,
    controls: {
      pipeline: pipelineControl,
      insights: insightsControl,
      patterns: patternInsightsControl,
      milestones: milestonesControl,
      planner: plannerControl
    },
    actions,
    getState: store.getState,
    subscribe: store.subscribe
  };
}
