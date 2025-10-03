import { PIPELINE_DEFAULTS } from '../pipelineView.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const PATTERN_SUMMARY_TEMPLATE = {
  totalEvents: 0,
  updatedAt: null,
  lastEventAt: null,
  lastSource: '',
  lastStage: '',
  lastStatus: '',
  lastHomepageSource: '',
  lastNotModified: false,
  lastHadError: false,
  lastContextHost: '',
  lastSummary: '',
  lastSectionsSample: [],
  lastHintsSample: [],
  uniqueSections: 0,
  uniqueHints: 0,
  topSections: [],
  topHints: [],
  homepageSourceCounts: {}
};

export function createInitialPatternInsightsState() {
  return {
    summary: { ...PATTERN_SUMMARY_TEMPLATE },
    sectionCounts: {},
    hintCounts: {},
    homepageSourceCounts: {},
    log: []
  };
}

export const initialState = {
  crawlType: '',
  insights: {
    coverage: null,
    coverageDetail: '',
    seededHubs: null,
    seededDetail: '',
    problems: [],
    problemsDetail: '',
    goals: null,
    goalsDetail: '',
    queueMix: null,
    queueMixDetail: '',
    highlights: [],
    updatedAt: null,
    hint: 'Insights appear once planner telemetry streams in.'
  },
  milestones: [],
  plannerTimeline: [],
  diagrams: {
    pipeline: null,
    queueHeatmapData: null
  },
  pipeline: {
    analysis: clone(PIPELINE_DEFAULTS.analysis),
    planner: clone(PIPELINE_DEFAULTS.planner),
    execution: clone(PIPELINE_DEFAULTS.execution)
  },
  cache: {
    coverageSummary: null
  },
  patternInsights: createInitialPatternInsightsState()
};
