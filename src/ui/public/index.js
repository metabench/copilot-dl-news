import { createStatusIndicators } from './index/statusIndicators.js';
import { formatNumber, formatTimestamp, formatRelativeTime } from './index/formatters.js';
import { createPipelineView } from './index/pipelineView.js';
import { createMetricsView } from './index/metricsView.js';
import { createSseClient } from './index/sseClient.js';
import { createSseHandlers } from './index/sseHandlers.js';
import { createCrawlControls } from './index/crawlControls.js';
import { createJobsAndResumeManager } from './index/jobsAndResumeManager.js';
import { createAdvancedFeaturesPanel } from './index/advancedFeaturesPanel.js';
import { createAnalysisHandlers } from './index/analysisHandlers.js';
import { createInitialization } from './index/initialization.js';
import { createApp } from './index/app.js';
import { showElement, hideElement, setElementVisibility } from './index/domUtils.js';
import { createBrowserThemeController } from './theme/browserController.js';
import { createBackgroundTasksWidget } from './index/backgroundTasksWidget.js';
import {
  compactDetails,
  formatFeatureName,
  numericValue,
  describeEntry,
  renderFeatureFlags as renderFeatureFlagsBase,
  renderAnalysisStatus as renderAnalysisStatusBase,
  renderPriorityBonuses as renderPriorityBonusesBase,
  renderPriorityWeights as renderPriorityWeightsBase,
  renderStructureSummary as renderStructureSummaryBase
} from './index/renderingHelpers.js';

const logs = document.getElementById('logs');
  const logsResizer = document.getElementById('logsResizer');
  const logsFontMinus = document.getElementById('logsFontMinus');
  const logsFontPlus = document.getElementById('logsFontPlus');
  const logsFontVal = document.getElementById('logsFontVal');
  const secErrors = document.getElementById('secErrors');
  const secDomains = document.getElementById('secDomains');
  const secLogs = document.getElementById('secLogs');
  const progress = document.getElementById('progress');
  const startupStatusEl = document.getElementById('startupStatus');
  const startupStatusText = document.getElementById('startupStatusText');
  const startupProgressFill = document.getElementById('startupProgressFill');
  const startupStagesList = document.getElementById('startupStagesList');
  if (startupStatusEl) {
    startupStatusEl.dataset.active = '0';
    startupStatusEl.setAttribute('aria-hidden', 'true');
  }
  const mReqps = document.getElementById('m_reqps');
  const mDlps = document.getElementById('m_dlps');
  const mReqpsLabel = document.getElementById('m_reqps_label');
  const mDlpsLabel = document.getElementById('m_dlps_label');
  const mErrpm = document.getElementById('m_errpm');
  const mQsize = document.getElementById('m_qsize');
  const mErrs = document.getElementById('m_errs');
  const mDomRpm = document.getElementById('m_domrpm');
  const mDomLim = document.getElementById('m_domlim');
  const mDomBk = document.getElementById('m_dombk');
  const mDomRl = document.getElementById('m_domrl');
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const analysisBtn = document.getElementById('analysisBtn');
  const analysisLink = document.getElementById('analysisLink');
  const analysisStatus = document.getElementById('analysisStatus');
  const analysisStatusSummary = document.getElementById('analysisStatusSummary');
  const analysisStatusMetrics = document.getElementById('analysisStatusMetrics');
  const domains = document.getElementById('domains');
  const inflightDiv = document.getElementById('inflight');
  const inflightList = document.getElementById('inflightList');
  const qPoly = document.getElementById('q_poly');
  const qTitle = document.getElementById('q_title');
  const reqpsPoly = document.getElementById('reqps_poly');
  const reqpsTitle = document.getElementById('reqps_title');
  const dlpsPoly = document.getElementById('dlps_poly');
  const dlpsTitle = document.getElementById('dlps_title');
  const themeBtn = document.getElementById('themeBtn');
  const etaEl = document.getElementById('eta');
  const cacheGauge = document.getElementById('cacheGauge');
  const cacheInfo = document.getElementById('cacheInfo');
  const badgeDb = document.getElementById('badgeDb');
  const badgeDisk = document.getElementById('badgeDisk');
  const badgeRobots = document.getElementById('badgeRobots');
  const badgeSitemap = document.getElementById('badgeSitemap');
  const badgeConn = document.getElementById('badgeConn');
  const badgeCpu = document.createElement('span');
  const badgeMem = document.createElement('span');
  const badgeWal = document.createElement('span');
  badgeCpu.className = 'muted';
  badgeMem.className = 'muted';
  badgeWal.className = 'muted';
  const crawlTypeBadge = document.getElementById('crawlTypeBadge');
  let currentCrawlType = '';
  const stageBadge = document.getElementById('stageBadge');
  const pausedBadge = document.getElementById('pausedBadge');
  const {
    setStage,
    setPausedBadge,
    hidePausedBadge,
    updateStartupStatus
  } = createStatusIndicators({
    stageBadge,
    pausedBadge,
    startupStatusEl,
    startupStatusText,
    startupProgressFill,
    startupStagesList
  });
  const metricVisited = document.getElementById('metricVisited');
  const metricDownloaded = document.getElementById('metricDownloaded');
  const metricSaved = document.getElementById('metricSaved');
  const metricFound = document.getElementById('metricFound');
  const metricQueue = document.getElementById('metricQueue');
  const metricErrors = document.getElementById('metricErrors');
  const metricCoverage = document.getElementById('metricCoverage');
  const insightsPanel = document.getElementById('insightsPanel');
  const insightsHint = document.getElementById('insightsHint');
  const insightCoverage = document.getElementById('insightCoverage');
  const insightCoverageDetail = document.getElementById('insightCoverageDetail');
  const insightHubs = document.getElementById('insightHubs');
  const insightHubsDetail = document.getElementById('insightHubsDetail');
  const insightProblems = document.getElementById('insightProblems');
  const insightProblemsDetail = document.getElementById('insightProblemsDetail');
  const insightGoals = document.getElementById('insightGoals');
  const insightGoalsDetail = document.getElementById('insightGoalsDetail');
  const insightQueueMix = document.getElementById('insightQueueMix');
  const insightQueueMixDetail = document.getElementById('insightQueueMixDetail');
  const insightAnalysisHighlights = document.getElementById('insightAnalysisHighlights');
  const structurePanel = document.getElementById('structurePanel');
  const structureHint = document.getElementById('structureHint');
  const structureNavPages = document.getElementById('structureNavPages');
  const structureArticlesSkipped = document.getElementById('structureArticlesSkipped');
  const structureTopSections = document.getElementById('structureTopSections');
  const structureUpdated = document.getElementById('structureUpdated');
  if (structurePanel) {
    structurePanel.dataset.active = '0';
  }
  const patternPanel = document.getElementById('patternInsightsPanel');
  const patternHint = document.getElementById('patternInsightsHint');
  const patternTotal = document.getElementById('patternInsightsTotal');
  const patternSections = document.getElementById('patternInsightsSections');
  const patternHints = document.getElementById('patternInsightsHints');
  const patternLastSummary = document.getElementById('patternInsightsLastSummary');
  const patternLastStage = document.getElementById('patternInsightsLastStage');
  const patternLastUpdated = document.getElementById('patternInsightsLastUpdated');
  const patternTopSections = document.getElementById('patternInsightsTopSections');
  const patternTopHints = document.getElementById('patternInsightsTopHints');
  const patternSources = document.getElementById('patternInsightsSources');
  const patternLog = document.getElementById('patternInsightsLog');
  const pipelinePanel = document.getElementById('pipelinePanel');
  const pipelineUpdated = document.getElementById('pipelineUpdated');
  const pipelineDiagram = document.getElementById('pipelineDiagram');
  const pipelineAnalysisLink = document.getElementById('pipelineAnalysisLink');
  const pipelineAnalysisHistorySection = document.getElementById('pipelineAnalysisHistorySection');
  const pipelineAnalysisHistoryClear = document.getElementById('pipelineAnalysisHistoryClear');
  const pipelineAnalysisHistory = document.getElementById('pipelineAnalysisHistory');
  const pipelineCards = {
    analysis: document.querySelector('[data-pipeline-stage="analysis"]'),
    planner: document.querySelector('[data-pipeline-stage="planner"]'),
    execution: document.querySelector('[data-pipeline-stage="execution"]')
  };
  const pipelineEls = {
    analysis: {
      status: document.getElementById('pipelineAnalysisStatus'),
      summary: document.getElementById('pipelineAnalysisSummary'),
      lastRun: document.getElementById('pipelineAnalysisLastRun'),
      signals: document.getElementById('pipelineAnalysisSignals'),
      link: pipelineAnalysisLink
    },
    planner: {
      status: document.getElementById('pipelinePlannerStatus'),
      summary: document.getElementById('pipelinePlannerSummary'),
      stage: document.getElementById('pipelinePlannerStage'),
      goals: document.getElementById('pipelinePlannerGoals')
    },
    execution: {
      status: document.getElementById('pipelineExecutionStatus'),
      summary: document.getElementById('pipelineExecutionSummary'),
      jobs: document.getElementById('pipelineExecutionJobs'),
      queue: document.getElementById('pipelineExecutionQueue'),
      coverage: document.getElementById('pipelineExecutionCoverage')
    }
  };
  const insightHighlightsList = document.getElementById('insightHighlightsList');
  const insightQueueHeatmapContainer = document.getElementById('insightQueueHeatmap');
  const milestonesList = document.getElementById('milestonesList');
  const plannerStagesList = document.getElementById('plannerStagesList');
  const resumeSection = document.getElementById('resumeSection');
  const resumeSummary = document.getElementById('resumeSummary');
  const resumeList = document.getElementById('resumeList');
  const resumeStatus = document.getElementById('resumeStatus');
  const resumeAllBtn = document.getElementById('resumeAllBtn');
  const resumeRefreshBtn = document.getElementById('resumeRefreshBtn');

  let lastStructureSummary = null;

  const RESUME_REASON_LABELS = {
    'domain-conflict': 'Blocked: another crawl from this domain is already running',
    'missing-source': 'Blocked: queue is missing saved resume data',
    'capacity-exceeded': 'Waiting for a free worker slot',
    'already-running': 'Already running'
  };
  const RESUME_STATE_WEIGHT = {
    selected: 0,
    queued: 1,
    available: 1,
    blocked: 2
  };
  let resumeInventoryState = { loading: false, lastFetch: 0, data: null };
  let resumeActionPending = false;
  let resumeRefreshTimer = null;

  const uiApp = createApp({
    elements: {
      pipeline: {
        panel: pipelinePanel,
        updatedEl: pipelineUpdated,
        cards: pipelineCards,
        elements: pipelineEls,
        analysisHistorySection: pipelineAnalysisHistorySection,
        analysisHistoryList: pipelineAnalysisHistory,
        analysisHistoryClearButton: pipelineAnalysisHistoryClear,
        analysisHighlightsEl: insightAnalysisHighlights,
        diagramContainer: pipelineDiagram
      },
      insights: {
        panel: insightsPanel,
        hint: insightsHint,
        coverage: insightCoverage,
        coverageDetail: insightCoverageDetail,
        hubs: insightHubs,
        hubsDetail: insightHubsDetail,
        problems: insightProblems,
        problemsDetail: insightProblemsDetail,
        goals: insightGoals,
        goalsDetail: insightGoalsDetail,
        queueMix: insightQueueMix,
        queueMixDetail: insightQueueMixDetail,
        highlightsList: insightHighlightsList,
        heatmapContainer: insightQueueHeatmapContainer
      },
      patterns: {
        panel: patternPanel,
        hint: patternHint,
        totalCount: patternTotal,
        uniqueSections: patternSections,
        uniqueHints: patternHints,
        lastSummary: patternLastSummary,
        lastStage: patternLastStage,
        lastUpdated: patternLastUpdated,
        topSectionsList: patternTopSections,
        topHintsList: patternTopHints,
        sourceList: patternSources,
        logContainer: patternLog
      },
  milestones: milestonesList,
  planner: plannerStagesList
    },
    formatters: {
      formatNumber,
      formatRelativeTime
    }
  });

  const {
    controls: { pipeline: pipelineControl },
    actions: appActions
  } = uiApp;

  const {
    getAnalysisState,
    persistAnalysisHistory,
    renderAnalysisHistory,
    buildAnalysisHighlights,
    renderAnalysisHighlights
  } = pipelineControl;
  const advancedFeaturesPanelEl = document.getElementById('advancedFeaturesPanel');
  const advancedFeaturesStatus = document.getElementById('advancedFeaturesStatus');
  const featureFlagsList = document.getElementById('featureFlagsList');
  const priorityBonusesList = document.getElementById('priorityBonusesList');
  const priorityWeightsList = document.getElementById('priorityWeightsList');
  const metrics = createMetricsView({
    elements: {
      reqpsLabel: mReqpsLabel,
      dlpsLabel: mDlpsLabel,
      errpm: mErrpm,
      qsize: mQsize,
      errs: mErrs,
      qPoly,
      qTitle,
      cacheGauge,
      cacheInfo,
      reqpsPoly,
      reqpsTitle,
      dlpsPoly,
      dlpsTitle,
      badgeRobots,
      badgeSitemap,
      domRpm: mDomRpm,
      domLim: mDomLim,
      domBk: mDomBk,
      domRl: mDomRl,
      eta: etaEl
    },
    formatNumber
  });
  const {
    getQueueDisplayValue,
    handleProgress: handleMetricsProgress,
    refreshServerMetrics,
    startServerMetricsPolling,
    startDlpsTicker,
    handleCacheEvent
  } = metrics;
  try {
    badgeCpu.style.marginLeft = '12px';
    badgeMem.style.marginLeft = '12px';
    badgeWal.style.marginLeft = '12px';
    const hs = document.getElementById('healthStrip');
    hs.appendChild(badgeCpu);
    hs.appendChild(badgeMem);
    hs.appendChild(badgeWal);
  } catch(_) {}
  const sseClient = createSseClient({ badgeEl: badgeConn });
  const markSseLive = () => sseClient.markLive();

  // ========================================
  // Background Tasks Widget
  // ========================================
  const backgroundTasksWidget = createBackgroundTasksWidget({
    widgetSection: document.getElementById('backgroundTasksWidget'),
    tasksList: document.getElementById('activeTasksList')
  });
  
  // Initialize the widget to load current tasks
  backgroundTasksWidget.init();
  
  // Connect widget to SSE when available (after sseClient.open is called)
  // The widget will listen for task-* events from the global window.evt EventSource
  setTimeout(() => {
    if (window.evt) {
      backgroundTasksWidget.connectSSE(window.evt);
    }
  }, 1000);

  // Rendering helper functions extracted to ./index/renderingHelpers.js
  // Pure functions: compactDetails, formatFeatureName, numericValue, describeEntry
  // Rendering functions (require DOM elements passed): renderFeatureFlags, renderAnalysisStatus,
  // renderPriorityBonuses, renderPriorityWeights, renderStructureSummary

  // ========================================
  // Advanced Features Panel
  // ========================================
  const advancedFeaturesPanel = createAdvancedFeaturesPanel({
    panelEl: advancedFeaturesPanelEl,
    statusEl: advancedFeaturesStatus,
    featureFlagsList,
    priorityBonusesList,
    priorityWeightsList
  });

  // Alias panel methods for backward compatibility
  const setAdvancedCapabilitiesState = advancedFeaturesPanel.setState.bind(advancedFeaturesPanel);
  const loadAdvancedCapabilities = advancedFeaturesPanel.load.bind(advancedFeaturesPanel);
  const renderFeatureFlags = advancedFeaturesPanel.renderFeatureFlags.bind(advancedFeaturesPanel);
  const renderPriorityBonuses = advancedFeaturesPanel.renderPriorityBonuses.bind(advancedFeaturesPanel);
  const renderPriorityWeights = advancedFeaturesPanel.renderPriorityWeights.bind(advancedFeaturesPanel);

  function renderAnalysisStatus(summary, options = {}) {
    renderAnalysisStatusBase(summary, options, {
      statusEl: analysisStatus,
      summaryEl: analysisStatusSummary,
      metricsEl: analysisStatusMetrics
    });
  }

  function refreshCoverageMetric() {
    if (!metricCoverage) return;
    const summary = uiApp.getState().cache?.coverageSummary;
    metricCoverage.textContent = summary && typeof summary.value === 'number'
      ? `${summary.value.toFixed(0)}%`
      : '—';
  }
  
  function renderStructureSummary(structure) {
    lastStructureSummary = renderStructureSummaryBase(structure, {
      panel: structurePanel,
      navPages: structureNavPages,
      articlesSkipped: structureArticlesSkipped,
      topSections: structureTopSections,
      updated: structureUpdated
    }, formatNumber, formatRelativeTime);
  }
  function resetInsights(hint = 'Insights appear once planner telemetry streams in.') {
    appActions.resetInsights(hint);
    appActions.resetPatternInsights();
    refreshCoverageMetric();
  }
  function setCrawlType(type) {
    if (!crawlTypeBadge) return;
    const norm = type ? String(type) : '';
    currentCrawlType = norm;
    appActions.setCrawlType(norm);
  crawlTypeBadge.classList.remove('badge-neutral', 'badge-intelligent', 'badge-basic', 'badge-structure');
    const pretty = norm ? norm.replace(/-/g, ' ') : 'unknown';
    crawlTypeBadge.textContent = `Type: ${pretty}`;
    if (!norm) {
      crawlTypeBadge.classList.add('badge-neutral');
      if (insightsPanel && insightsPanel.dataset.hasData !== '1') hideElement(insightsPanel);
      if (structurePanel) {
        structurePanel.dataset.active = '0';
        hideElement(structurePanel);
      }
      return;
    }
    if (norm === 'intelligent') {
      crawlTypeBadge.classList.add('badge-intelligent');
      if (insightsPanel) {
        if (insightsPanel.dataset.hasData !== '1') showElement(insightsPanel);
        if (insightsHint && insightsPanel.dataset.hasData !== '1') insightsHint.textContent = 'Collecting planner telemetry…';
      }
      if (structurePanel) {
        structurePanel.dataset.active = '0';
        hideElement(structurePanel);
      }
    } else if (norm === 'discover-structure') {
      crawlTypeBadge.classList.add('badge-structure');
      if (insightsPanel) {
        if (insightsPanel.dataset.hasData !== '1') showElement(insightsPanel);
        if (insightsHint && insightsPanel.dataset.hasData !== '1') insightsHint.textContent = 'Discovering site structure (planner only)…';
      }
      if (structurePanel) {
        structurePanel.dataset.active = '1';
        if (structureHint) {
          structureHint.textContent = 'Discovering navigation scaffolding; article bodies are skipped.';
        }
        renderStructureSummary(lastStructureSummary);
      }
    } else {
      crawlTypeBadge.classList.add('badge-basic');
      if (insightsPanel && insightsPanel.dataset.hasData !== '1') hideElement(insightsPanel);
      if (!window.__coverageSummary) refreshCoverageMetric();
      if (structurePanel) {
        structurePanel.dataset.active = '0';
        hideElement(structurePanel);
      }
    }
  }

  // ========================================
  // Analysis & Planner Event Handlers
  // ========================================
  const analysisHandlers = createAnalysisHandlers({
    appActions,
    pipelineControl,
    setCrawlType,
    renderAnalysisLink,
    renderAnalysisStatus,
    refreshCoverageMetric,
    getCurrentCrawlType: () => currentCrawlType,
    analysisStatus
  });

  // Extract handler methods for use in SSE listeners
  const handleMilestone = analysisHandlers.handleMilestone.bind(analysisHandlers);
  const handleAnalysisProgress = analysisHandlers.handleAnalysisProgress.bind(analysisHandlers);
  const handlePlannerStage = analysisHandlers.handlePlannerStage.bind(analysisHandlers);
  const updateIntelligentInsights = analysisHandlers.updateIntelligentInsights.bind(analysisHandlers);

  resetInsights();
  refreshCoverageMetric();
  try {
    if (typeof window !== 'undefined') {
      window.__insightState = window.__insightState || {};
    }
  } catch (_) {}
  if (advancedFeaturesPanelEl) {
    loadAdvancedCapabilities();
    try {
      setInterval(() => loadAdvancedCapabilities({ quiet: true }), 60000);
    } catch (_) {}
  }

  // ========================================
  // SSE Event Stream
  // ========================================
  function openEventStream(enableLogs = true) {
    // Close existing connection if any
    sseClient.close();
    
    // Open new SSE connection with logs parameter  
    const url = `/events?logs=${enableLogs ? '1' : '0'}`;
    const source = sseClient.open({
      url,
      listeners: {} // Listeners can be attached later if needed
    });
    
    return source;
  }

  // ========================================
  // Initialization
  // ========================================
  const initialization = createInitialization({
    elements: {
      logs, logsResizer, logsFontMinus, logsFontPlus, logsFontVal,
      secErrors, secDomains, secLogs, themeBtn,
      badgeDb, badgeDisk, badgeCpu, badgeMem, badgeWal
    },
    openEventStream
  });

  // Run all initialization
  const { themeController, scheduleLogFlush } = await initialization.initialize();
  const scheduleFlush = scheduleLogFlush;

  // ========================================
  // Analysis Link Rendering
  // ========================================
  function renderAnalysisLink(url, runId) {
    if (analysisLink) {
      analysisLink.textContent = '';
      analysisLink.classList.remove('muted');
      if (url) {
        const label = document.createElement('span');
        label.textContent = 'View analysis: ';
        analysisLink.appendChild(label);
        const link = document.createElement('a');
        link.href = url;
        link.textContent = runId ? runId : url;
        link.target = '_blank';
        link.rel = 'noopener';
        analysisLink.appendChild(link);
      } else {
        analysisLink.textContent = 'No analysis runs yet.';
        analysisLink.classList.add('muted');
      }
    }
    if (pipelineAnalysisLink) {
      pipelineAnalysisLink.textContent = '';
      pipelineAnalysisLink.classList.remove('muted');
      if (url) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = runId || 'View';
        pipelineAnalysisLink.appendChild(anchor);
      } else {
        pipelineAnalysisLink.textContent = '—';
        pipelineAnalysisLink.classList.add('muted');
      }
    }
  }