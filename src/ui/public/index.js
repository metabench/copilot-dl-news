import { createStatusIndicators } from './index/statusIndicators.js';
import { formatNumber, formatTimestamp, formatRelativeTime } from './index/formatters.js';
import { createPipelineView } from './index/pipelineView.js';
import { createMetricsView } from './index/metricsView.js';
import { createSseClient } from './index/sseClient.js';
import { createApp } from './index/app.js';

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
  function compactDetails(details) {
    if (!details) return '';
    if (typeof details === 'string') return details;
    try {
      const json = JSON.stringify(details, null, 2) || '';
      return json.length > 400 ? json.slice(0, 400) + '…' : json;
    } catch (_) {
      return '';
    }
  }
  function formatFeatureName(key) {
    if (!key) return 'Unknown feature';
    const str = String(key);
    const spaced = str
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function numericValue(entry) {
    if (entry == null) return 0;
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if (typeof entry === 'object' && entry.value != null) {
      const n = Number(entry.value);
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(entry);
    return Number.isFinite(n) ? n : 0;
  }
  function describeEntry(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (entry.description) return String(entry.description);
    if (entry.category) return String(entry.category);
    return '';
  }
  function renderFeatureFlags(features) {
    if (!featureFlagsList) return;
    featureFlagsList.innerHTML = '';
    featureFlagsList.setAttribute('role', 'list');
    const entries = Object.entries(features || {});
    if (!entries.length) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'No advanced feature flags configured.';
      featureFlagsList.appendChild(span);
      return;
    }
    entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.setAttribute('role', 'listitem');
      const badge = document.createElement('span');
      badge.className = value ? 'badge badge-ok' : 'badge badge-neutral';
      badge.textContent = value ? 'On' : 'Off';
      row.appendChild(badge);
      const label = document.createElement('span');
      label.textContent = formatFeatureName(key);
      row.appendChild(label);
      featureFlagsList.appendChild(row);
    }
  }

  function renderAnalysisStatus(summary, options = {}) {
    if (!analysisStatus) return;
    const {
      metrics = [],
      muted = false
    } = options;
    const summaryText = summary || 'No analysis runs yet.';
    if (analysisStatusSummary) {
      analysisStatusSummary.textContent = summaryText;
    } else {
      const metricsText = metrics.length
        ? ' · ' + metrics.map((entry) => `${entry.label}: ${entry.value}`).join(' · ')
        : '';
      analysisStatus.textContent = summaryText + metricsText;
    }
    if (analysisStatusMetrics) {
      analysisStatusMetrics.textContent = '';
      if (metrics.length) {
        for (const entry of metrics) {
          if (!entry || !entry.label || entry.value == null) continue;
          const li = document.createElement('li');
          li.className = 'analysis-status__metric';
          const label = document.createElement('span');
          label.className = 'analysis-status__metric-label';
          label.textContent = entry.label;
          const value = document.createElement('span');
          value.className = 'analysis-status__metric-value';
          value.textContent = entry.value;
          if (entry.title) value.title = entry.title;
          li.appendChild(label);
          li.appendChild(value);
          analysisStatusMetrics.appendChild(li);
        }
      }
    }
    analysisStatus.classList.toggle('muted', muted || (!summary && !metrics.length));
  }
  function renderPriorityBonuses(queueConfig) {
    if (!priorityBonusesList) return;
    priorityBonusesList.innerHTML = '';
    priorityBonusesList.setAttribute('role', 'list');
    const bonuses = queueConfig && typeof queueConfig === 'object' ? queueConfig.bonuses : null;
    const entries = bonuses && typeof bonuses === 'object' ? Object.entries(bonuses) : [];
    if (!entries.length) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'No priority bonuses configured.';
      priorityBonusesList.appendChild(span);
      return;
    }
    entries.sort((a, b) => numericValue(b[1]) - numericValue(a[1]));
    const subset = entries.slice(0, 4);
    for (const [key, raw] of subset) {
      const val = numericValue(raw);
  const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '2px';
  row.setAttribute('role', 'listitem');
      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.gap = '8px';
      const badge = document.createElement('span');
      badge.className = 'badge badge-neutral';
      badge.textContent = `+${val}`;
      head.appendChild(badge);
      const label = document.createElement('strong');
      label.textContent = formatFeatureName(key);
      head.appendChild(label);
      row.appendChild(head);
      const desc = describeEntry(raw);
      if (desc) {
        const detail = document.createElement('span');
        detail.className = 'muted';
        detail.textContent = desc;
        row.appendChild(detail);
      }
      priorityBonusesList.appendChild(row);
    }
  }
  function renderPriorityWeights(queueConfig) {
    if (!priorityWeightsList) return;
    priorityWeightsList.innerHTML = '';
    priorityWeightsList.setAttribute('role', 'list');
    const weights = queueConfig && typeof queueConfig === 'object' ? queueConfig.weights : null;
    const entries = weights && typeof weights === 'object' ? Object.entries(weights) : [];
    if (!entries.length) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'No queue weights configured.';
      priorityWeightsList.appendChild(span);
      return;
    }
    entries.sort((a, b) => numericValue(a[1]) - numericValue(b[1]));
    const subset = entries.slice(0, 4);
    for (const [key, raw] of subset) {
      const val = numericValue(raw);
  const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '2px';
  row.setAttribute('role', 'listitem');
      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.gap = '8px';
      const badge = document.createElement('span');
      badge.className = 'badge badge-neutral';
      badge.textContent = `${val}`;
      head.appendChild(badge);
      const label = document.createElement('strong');
      label.textContent = formatFeatureName(key);
      head.appendChild(label);
      row.appendChild(head);
      const desc = describeEntry(raw);
      if (desc) {
        const detail = document.createElement('span');
        detail.className = 'muted';
        detail.textContent = desc;
        row.appendChild(detail);
      }
      priorityWeightsList.appendChild(row);
    }
  }
  function setAdvancedCapabilitiesState({ state, message, busy }) {
    if (!advancedFeaturesPanelEl) return;
    if (typeof state === 'string') advancedFeaturesPanelEl.dataset.state = state;
    if (typeof busy === 'boolean') advancedFeaturesPanelEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (advancedFeaturesStatus && typeof message === 'string') {
      advancedFeaturesStatus.textContent = message;
    }
  }

  async function loadAdvancedCapabilities({ quiet = false } = {}) {
    if (!advancedFeaturesPanelEl || !advancedFeaturesStatus) return;
    try {
      setAdvancedCapabilitiesState({ busy: true });
      if (!quiet) {
        advancedFeaturesPanelEl.style.display = '';
        setAdvancedCapabilitiesState({ state: 'loading', message: 'Loading configuration…', busy: true });
      }
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const config = payload?.config || {};
      renderFeatureFlags(config.features || {});
      renderPriorityBonuses(config.queue || {});
      renderPriorityWeights(config.queue || {});
      try { window.__advancedConfig = config; } catch (_) {}
      advancedFeaturesPanelEl.style.display = '';
      setAdvancedCapabilitiesState({ state: 'ready', message: `Updated ${formatTimestamp()}`, busy: false });
    } catch (error) {
      advancedFeaturesPanelEl.style.display = '';
      const message = error && error.message ? error.message : String(error || 'unknown error');
      setAdvancedCapabilitiesState({ state: 'error', message: `Failed to load advanced config (${message})`, busy: false });
      if (!quiet) {
        renderFeatureFlags({});
        renderPriorityBonuses({});
        renderPriorityWeights({});
      }
    }
  }
  function refreshCoverageMetric() {
    if (!metricCoverage) return;
    const summary = uiApp.getState().cache?.coverageSummary;
    metricCoverage.textContent = summary && typeof summary.value === 'number'
      ? `${summary.value.toFixed(0)}%`
      : '—';
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
    crawlTypeBadge.classList.remove('badge-neutral', 'badge-intelligent', 'badge-basic');
    const pretty = norm ? norm.replace(/-/g, ' ') : 'unknown';
    crawlTypeBadge.textContent = `Type: ${pretty}`;
    if (!norm) {
      crawlTypeBadge.classList.add('badge-neutral');
      if (insightsPanel && insightsPanel.dataset.hasData !== '1') insightsPanel.style.display = 'none';
      return;
    }
    if (norm === 'intelligent') {
      crawlTypeBadge.classList.add('badge-intelligent');
      if (insightsPanel) {
        if (insightsPanel.dataset.hasData !== '1') insightsPanel.style.display = '';
        if (insightsHint && insightsPanel.dataset.hasData !== '1') insightsHint.textContent = 'Collecting planner telemetry…';
      }
    } else {
      crawlTypeBadge.classList.add('badge-basic');
      if (insightsPanel && insightsPanel.dataset.hasData !== '1') insightsPanel.style.display = 'none';
      if (!window.__coverageSummary) refreshCoverageMetric();
    }
  }
  function handleMilestone(m) {
    if (!m) return;
    appActions.pushMilestone(m);
    if (m.kind === 'patterns-learned') {
      const tsRaw = m.ts ? Date.parse(m.ts) : Date.now();
      const timestamp = Number.isFinite(tsRaw) ? tsRaw : Date.now();
      const details = m.details && typeof m.details === 'object' ? m.details : {};
      const sections = Array.isArray(details.sections) ? details.sections : [];
      const articleHints = Array.isArray(details.articleHints) ? details.articleHints : [];
      const summaryParts = [];
      summaryParts.push(`sections ${sections.length}`);
      if (articleHints.length) summaryParts.push(`hints ${articleHints.length}`);
      const summary = summaryParts.length ? summaryParts.join(' · ') : (m.message || 'Patterns inferred');
      appActions.recordPatternEvent({
        source: 'milestone',
        stage: 'patterns-learned',
        status: 'completed',
        label: m.message || 'patterns learned',
        summary,
        sections,
        articleHints,
        timestamp,
        details,
        message: m.message,
        contextHost: m.scope || ''
      });
    }
    if (m.kind === 'intelligent-completion') {
      setCrawlType('intelligent');
      const milestoneTs = m.ts ? Date.parse(m.ts) : Date.now();
      const safeTs = Number.isFinite(milestoneTs) ? milestoneTs : Date.now();
      updateIntelligentInsights(m.details || {}, {
        source: 'milestone',
        timestamp: safeTs,
        pipelinePatch: {
          analysis: { status: 'applied', statusLabel: 'Applied', lastRun: safeTs }
        }
      });
    }
  }
  function handleAnalysisProgress(payload) {
    if (!payload || typeof payload !== 'object') return;
    const state = getAnalysisState();
    state.history = Array.isArray(state.history) ? state.history : [];
    const incomingRunId = payload.runId ? String(payload.runId) : null;
    const runId = incomingRunId || state.runId || null;
    const newRunDetected = incomingRunId && incomingRunId !== state.runId;
    if (newRunDetected) state.history = [];
    state.runId = runId;
    const tsRaw = payload.ts != null ? payload.ts : payload.endedAt || payload.startedAt || Date.now();
    const tsParsed = typeof tsRaw === 'number' ? tsRaw : Date.parse(tsRaw);
    const ts = Number.isFinite(tsParsed) ? tsParsed : Date.now();
    const stageLabel = payload.stage ? payload.stage.replace(/[_-]+/g, ' ') : 'analysis';
    const progressInfo = payload.progress && typeof payload.progress === 'object' ? payload.progress : null;
    let summary = payload.summary;
    if (!summary && progressInfo) {
      const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0);
      if (Number.isFinite(processed) && processed > 0) {
        summary = `${stageLabel} · processed ${formatNumber(processed)}`;
      }
    }
    if (!summary) {
      summary = payload.status ? `${stageLabel} · ${payload.status}` : `${stageLabel} update`;
    }
    const highlightState = {
      ...(payload.details && typeof payload.details === 'object' ? payload.details : {}),
      analysisHighlights: Array.isArray(payload.analysisHighlights) ? payload.analysisHighlights : undefined
    };
    const highlightList = buildAnalysisHighlights(highlightState);
    renderAnalysisHighlights(highlightList);
    const signals = Array.isArray(payload.signals) && payload.signals.length
      ? payload.signals.filter(Boolean).map(String)
      : highlightList;
    const statusKey = payload.status || (payload.final ? 'completed' : 'running');
    const statusLabel = statusKey ? statusKey.replace(/[_-]+/g, ' ') : 'running';
    const detailUrl = runId ? `/analysis/${encodeURIComponent(runId)}/ssr` : state.detailUrl || null;
    const pipelinePatch = {
      analysis: {
        status: statusKey,
        statusLabel: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
        summary,
        signals: signals.slice(0, 5),
        lastRun: payload.final ? ts : (state.lastRun || ts),
        updatedAt: ts
      }
    };
    if (detailUrl) pipelinePatch.analysis.detailUrl = detailUrl;
    if (runId) pipelinePatch.analysis.runId = runId;
  appActions.patchPipeline(pipelinePatch);
    state.lastRun = pipelinePatch.analysis.lastRun;
    state.detailUrl = detailUrl || null;
    state.lastPayload = payload;
    const historyEntry = {
      ts,
      stage: payload.stage || stageLabel,
      status: statusKey,
      summary
    };
    state.history.push(historyEntry);
    if (state.history.length > 40) state.history.shift();
    renderAnalysisHistory(state.history, { detailUrl });
    persistAnalysisHistory(state.history);
    try { window.__analysisState = state; } catch (_) {}
    if (analysisStatus) {
      const metrics = [];
      if (progressInfo) {
        const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? NaN);
        const saved = Number(progressInfo.saved ?? progressInfo.articlesSaved ?? NaN);
        const found = Number(progressInfo.found ?? progressInfo.articlesFound ?? NaN);
        if (Number.isFinite(processed)) metrics.push({ label: 'Processed', value: formatNumber(processed) });
        if (Number.isFinite(saved)) metrics.push({ label: 'Saved', value: formatNumber(saved) });
        if (Number.isFinite(found) && (!Number.isFinite(saved) || found !== saved)) {
          metrics.push({ label: 'Found', value: formatNumber(found) });
        }
      }
      if (statusLabel) metrics.push({ label: 'Status', value: statusLabel });
      if (payload.stage) metrics.push({ label: 'Stage', value: stageLabel.charAt(0).toUpperCase() + stageLabel.slice(1) });
      metrics.push({ label: 'Updated', value: formatRelativeTime(ts), title: new Date(ts).toLocaleString() });
      if (payload.exit && payload.exit.error) {
        metrics.push({ label: 'Error', value: String(payload.exit.error) });
      }
      renderAnalysisStatus(summary, { metrics });
    }
    if (detailUrl) {
      renderAnalysisLink(detailUrl, runId);
      try {
        localStorage.setItem('analysisLastDetailUrl', detailUrl);
        if (runId) localStorage.setItem('analysisLastRunId', runId);
        localStorage.setItem('analysisLastRunAt', String(ts));
      } catch (_) {}
    }
    if (payload.details || payload.analysisHighlights) {
      const extras = { source: payload.final ? 'analysis-final' : 'analysis-progress', timestamp: ts };
      if (Array.isArray(payload.analysisHighlights)) extras.analysisHighlights = payload.analysisHighlights;
      updateIntelligentInsights(payload.details || {}, extras);
    }
  }
  function handlePlannerStage(ev) {
    if (!ev) return;
    setCrawlType('intelligent');
    appActions.pushPlannerStage(ev);

    const status = ev.status || 'started';
    const statusLabel = status.replace(/[_-]+/g, ' ');
    const durationLabel = Number.isFinite(ev.durationMs) ? `${ev.durationMs}ms` : null;
    const summary = [statusLabel, durationLabel].filter(Boolean).join(' · ');
    const tsRaw = ev.ts ? Date.parse(ev.ts) : Date.now();
    const timestamp = Number.isFinite(tsRaw) ? tsRaw : Date.now();

    appActions.patchPipeline({
      planner: {
        status,
        statusLabel: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
        stage: ev.stage || 'stage',
        summary: summary || undefined
      }
    });

    if (ev.stage === 'infer-patterns') {
      const stageDetails = ev.details && typeof ev.details === 'object' ? ev.details : {};
      const context = stageDetails.context && typeof stageDetails.context === 'object' ? stageDetails.context : {};
      const result = stageDetails.result && typeof stageDetails.result === 'object' ? stageDetails.result : stageDetails;
      const sections = Array.isArray(result.sectionsPreview) ? result.sectionsPreview : [];
      const hints = Array.isArray(result.articleHintsPreview) ? result.articleHintsPreview : [];
      const timestamp = ev.ts ? Date.parse(ev.ts) : Date.now();
      const sectionCount = Number.isFinite(result.sectionCount) ? result.sectionCount : sections.length;
      const hintsCount = Number.isFinite(result.articleHintsCount) ? result.articleHintsCount : hints.length;
      const summaryParts = [];
      if (Number.isFinite(sectionCount)) summaryParts.push(`sections ${sectionCount}`);
      if (Number.isFinite(hintsCount) && hintsCount > 0) summaryParts.push(`hints ${hintsCount}`);
      if (result.homepageSource) summaryParts.push(`source ${result.homepageSource}`);
      appActions.recordPatternEvent({
        source: 'stage',
        stage: ev.stage,
        status: ev.status,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        durationMs: Number.isFinite(ev.durationMs) ? ev.durationMs : undefined,
        sections,
        sectionCount,
        articleHints: hints,
        articleHintsCount: hintsCount,
        homepageSource: result.homepageSource,
        notModified: !!result.notModified,
        hadError: !!result.hadError,
        summary: summaryParts.length ? summaryParts.join(' · ') : `Stage ${ev.status || 'update'}`,
        details: result,
        contextHost: context.host || ev.scope || ''
      });
    }
    if (ev.details || Array.isArray(ev.goalStates) || Array.isArray(ev.analysisHighlights)) {
      const insightDetails = { ...(ev.details && typeof ev.details === 'object' ? ev.details : {}) };
      if (!insightDetails.goalStates && Array.isArray(ev.goalStates)) {
        insightDetails.goalStates = ev.goalStates;
      }
      updateIntelligentInsights(insightDetails, {
        source: 'planner-stage',
        timestamp,
        analysisHighlights: Array.isArray(ev.analysisHighlights) ? ev.analysisHighlights : undefined
      });
    }
  }
  function updateIntelligentInsights(details, extras = {}) {
    appActions.applyInsights(details || {}, extras);
    if (extras && extras.pipelinePatch) {
      appActions.patchPipeline(extras.pipelinePatch);
    }
    const coverageSource = (details && details.coverage) || extras.coverage;
    if (coverageSource && typeof coverageSource === 'object') {
      let pct = null;
      if (typeof coverageSource.coveragePct === 'number') pct = coverageSource.coveragePct;
      else if (typeof coverageSource.visitedCoveragePct === 'number') pct = coverageSource.visitedCoveragePct;
      if (pct != null && pct <= 1) pct *= 100;
      if (pct != null) {
        appActions.patchPipeline({ execution: { coverage: pct } });
      }
    }
    refreshCoverageMetric();
  }
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
      // Restore saved logs height
      (function(){
        const savedH = parseInt(localStorage.getItem('logsH')||'', 10);
        if (!isNaN(savedH) && savedH >= 120) {
          logs.style.height = savedH + 'px';
        }
      })();
      // Logs font size controls with persistence
      (function(){
        if (!logs) return;
        const clamp = (v) => Math.max(10, Math.min(28, v|0));
        const getSize = () => {
          const cs = parseInt((getComputedStyle(logs).fontSize||'').replace('px',''), 10);
          return isNaN(cs) ? 16 : cs;
        };
        const saved = parseInt(localStorage.getItem('logsFontSize')||'', 10);
        const base = getSize();
        const sz = clamp(isNaN(saved) ? base : saved);
        logs.style.fontSize = sz + 'px';
        if (logsFontVal) logsFontVal.textContent = sz + 'px';
        const setSz = (v) => {
          const n = clamp(v);
          logs.style.fontSize = n + 'px';
          localStorage.setItem('logsFontSize', String(n));
          if (logsFontVal) logsFontVal.textContent = n + 'px';
        };
        if (logsFontMinus) logsFontMinus.onclick = () => setSz((parseInt(localStorage.getItem('logsFontSize')||'',10)||getSize()) - 1);
        if (logsFontPlus) logsFontPlus.onclick = () => setSz((parseInt(localStorage.getItem('logsFontSize')||'',10)||getSize()) + 1);
      })();
      // Drag-to-resize for logs area (works even if CSS resize is ignored)
      (function(){
        if (!logsResizer) return;
        let startY = 0, startH = 0, active = false;
        const onMove = (e) => {
          if (!active) return;
          const dy = e.clientY - startY;
          const maxH = Math.max(200, Math.floor(window.innerHeight * 0.75));
          const newH = Math.min(maxH, Math.max(120, startH + dy));
          logs.style.height = newH + 'px';
        };
        const onUp = () => {
          if (!active) return;
          active = false;
          document.body.classList.remove('resizing');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          const h = parseInt(getComputedStyle(logs).height, 10);
          if (!isNaN(h)) localStorage.setItem('logsH', String(h));
        };
        logsResizer.addEventListener('mousedown', (e) => {
          startY = e.clientY;
          startH = parseInt(getComputedStyle(logs).height, 10) || logs.clientHeight || 240;
          active = true;
          document.body.classList.add('resizing');
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
          e.preventDefault();
        });
      })();
      // Batch log updates to avoid frequent DOM writes (structured to allow styling)
      let logEntries = []; // { text, isErr }
      let flushTimer = null;
      function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          try {
            const frag = document.createDocumentFragment();
            for (const ent of logEntries) {
              const span = document.createElement('span');
              span.textContent = ent.text;
              if (ent.isErr) span.classList.add('log-error');
              frag.appendChild(span);
            }
            logs.appendChild(frag);
            logs.scrollTop = logs.scrollHeight;
          } catch (_) {
            // Fallback to plain text append if something goes wrong
            try { logs.textContent += logEntries.map(e => e.text).join(''); } catch (_) {}
          }
          logEntries = [];
          flushTimer = null;
        }, 200);
      }

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

      (function initAnalysisLink(){
        const state = getAnalysisState();
        const savedUrl = state.detailUrl || null;
        const savedId = state.runId || null;
        if (analysisLink) {
          if (savedUrl) {
            renderAnalysisLink(savedUrl, savedId);
          } else {
            renderAnalysisLink(null, null);
            if (analysisLink) {
              analysisLink.textContent = 'No analysis runs yet.';
              analysisLink.classList.add('muted');
            }
          }
        }
        if (analysisStatus) {
          if (state.lastRun != null && Number.isFinite(state.lastRun)) {
            const dt = new Date(state.lastRun);
            if (!Number.isNaN(dt.getTime())) {
              const metrics = [];
              if (state.runId) metrics.push({ label: 'Run', value: state.runId });
              metrics.push({ label: 'Updated', value: formatRelativeTime(state.lastRun), title: dt.toLocaleString() });
              renderAnalysisStatus(`Last run started ${dt.toLocaleString()}`, { metrics });
            } else {
              renderAnalysisStatus('No analysis runs yet.', { muted: true });
            }
          } else {
            renderAnalysisStatus('No analysis runs yet.', { muted: true });
          }
        }
        renderAnalysisHistory(state.history || [], { detailUrl: savedUrl });
      })();
      if (pipelineAnalysisHistoryClear) {
        pipelineAnalysisHistoryClear.addEventListener('click', () => {
          const state = getAnalysisState();
          state.history = [];
          persistAnalysisHistory(state.history);
          renderAnalysisHistory([], { detailUrl: state.detailUrl || null });
          try { window.__analysisState = state; } catch (_) {}
        });
      }
      function createSseHandlers() {
        let lastProgressAt = 0;
        return {
          log(e) {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              const line = String(payload.line || '');
              logEntries.push({ text: line, isErr: false });
              scheduleFlush();
            } catch (_) {}
          },
          error(e) {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              const message = payload.message || (payload.code ? `HTTP ${payload.code}` : 'Error');
              const url = payload.url || '';
              logEntries.push({ text: `[ERROR] ${message} ${url}\n`, isErr: true });
              scheduleFlush();
            } catch (_) {}
          },
          jobs(e) {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              renderJobs(payload);
            } catch (_) {}
          },
          problem(e) {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              const list = document.getElementById('problemsList');
              if (!list) return;
              const ts = new Date().toLocaleTimeString();
              const kind = payload.kind || 'problem';
              const scope = payload.scope ? ` [${payload.scope}]` : '';
              const target = payload.target ? ` — ${payload.target}` : '';
              const message = payload.message || '';
              const details = payload.details ? ` · details: ${((typeof payload.details === 'string') ? payload.details : JSON.stringify(payload.details)).slice(0, 200)}` : '';
              const line = `<div><span class="muted">${ts}</span> <strong>${kind}</strong>${scope}${target} — ${message}${details}</div>`;
              if (list.classList.contains('muted')) list.classList.remove('muted');
              if (list.textContent === 'None') list.textContent = '';
              try {
                const div = document.createElement('div');
                div.innerHTML = line;
                if (list.firstChild) list.insertBefore(div.firstChild, list.firstChild);
                else list.appendChild(div.firstChild);
                let count = 0;
                const max = 200;
                for (const child of Array.from(list.children)) {
                  count += 1;
                  if (count > max) child.remove();
                }
              } catch (_) {
                list.innerHTML = line + (list.innerHTML || '');
              }
            } catch (_) {}
          },
          progress(e) {
            markSseLive();
            const now = Date.now();
            if (now - lastProgressAt < 200) return;
            lastProgressAt = now;
            try {
              const payload = JSON.parse(e.data);
              updateStartupStatus(payload.startup, payload.statusText);
              try {
                const lastLog = window.__lastProgressLogAt || 0;
                if (now - lastLog > 2000) {
                  const line = `[PROGRESS] visited=${payload.visited || 0} downloaded=${payload.downloaded || 0} found=${payload.found || 0} saved=${payload.saved || 0} queue=${payload.queueSize || 0}\n`;
                  logEntries.push({ text: line, isErr: false });
                  scheduleFlush();
                  window.__lastProgressLogAt = now;
                }
              } catch (_) {}
              const baseStage = payload.stage || null;
              let stageDisplay = baseStage;
              if (payload.slowMode) {
                const reason = payload.slowModeReason ? ` (${payload.slowModeReason})` : '';
                stageDisplay = stageDisplay
                  ? `${stageDisplay} [slow mode${reason}]`
                  : `slow mode${reason}`;
              }
              if (stageDisplay) {
                setStage(stageDisplay);
              } else if (baseStage) {
                setStage(baseStage);
              }
              if (Object.prototype.hasOwnProperty.call(payload, 'paused')) {
                setPausedBadge(!!payload.paused);
              }
              if (payload.crawlType && (!currentCrawlType || currentCrawlType !== payload.crawlType)) {
                setCrawlType(payload.crawlType);
              }
              if (!currentCrawlType && payload.plannerActive) {
                setCrawlType('intelligent');
              }
              if (metricVisited) metricVisited.textContent = formatNumber(payload.visited || 0);
              if (metricDownloaded) metricDownloaded.textContent = formatNumber(payload.downloaded || 0);
              if (metricSaved) metricSaved.textContent = formatNumber(payload.saved || 0);
              if (metricFound) metricFound.textContent = formatNumber(payload.found || 0);
              if (metricErrors) metricErrors.textContent = formatNumber(payload.errors || 0);

              const metricsResult = handleMetricsProgress(payload, now) || {};
              const queueValue = metricsResult.queueDisplay != null
                ? metricsResult.queueDisplay
                : getQueueDisplayValue(payload.queueSize || 0);
              if (metricQueue && queueValue != null) {
                metricQueue.textContent = formatNumber(queueValue);
              }

              const stageLabel = payload.stage ? String(payload.stage).replace(/[_-]+/g, ' ') : '';
              const statusLabel = payload.statusText || stageLabel;
              const prefix = statusLabel ? `${statusLabel} · ` : '';
              progress.textContent = `${prefix}visited: ${payload.visited || 0}, downloaded: ${payload.downloaded || 0}, found: ${payload.found || 0}, saved: ${payload.saved || 0}`;

              if (typeof payload.paused === 'boolean') {
                pauseBtn.disabled = !!payload.paused;
                resumeBtn.disabled = !payload.paused;
              }

              const count = payload.currentDownloadsCount || (Array.isArray(payload.currentDownloads) ? payload.currentDownloads.length : 0) || 0;
              inflightDiv.firstChild.nodeValue = `current downloads: ${count}`;
              if (Array.isArray(payload.currentDownloads)) {
                const groups = new Map();
                for (const download of payload.currentDownloads) {
                  let host = '';
                  try { host = new URL(download.url).hostname.toLowerCase(); } catch (_) { host = ''; }
                  if (!groups.has(host)) groups.set(host, []);
                  groups.get(host).push(download);
                }
                const limiterInfo = (payload && payload.perHostLimits) ? payload.perHostLimits : {};
                const lines = [];
                for (const [host, arr] of groups.entries()) {
                  const items = arr.slice(0, 3).map((download) => {
                    const age = typeof download.ageMs === 'number' ? ` ${(Math.round(download.ageMs / 100) / 10).toFixed(1)}s` : '';
                    const displayUrl = String(download.url || '').replace(/^https?:\/\//, '');
                    return `<a href="/url?url=${encodeURIComponent(download.url)}">${displayUrl}</a><span style="color:#666;">${age}</span>`;
                  }).join(' · ');
                  let badge = '';
                  try {
                    const info = limiterInfo[host];
                    if (info && info.rateLimited) {
                      const tip = [`limit: ${info.limit ?? 'n/a'}/min`, info.intervalMs != null ? `interval: ~${info.intervalMs}ms` : null, info.backoffMs != null ? `backoff: ~${Math.ceil(info.backoffMs / 1000)}s` : null]
                        .filter(Boolean)
                        .join(' \n');
                      badge = ` <span class="bad" title="${tip}">RATE LIMITED</span>`;
                    }
                  } catch (_) {}
                  lines.push(`<li><strong>${host || '(unknown)'}</strong>${badge} — ${arr.length} ${items ? '· ' + items : ''}</li>`);
                }
                inflightList.innerHTML = lines.join('');
              }

              const executionPatch = {
                jobs: count,
                status: payload.paused ? 'pending' : 'running',
                statusLabel: payload.paused ? 'Paused' : 'Running'
              };
              if (typeof payload.queueSize === 'number') {
                executionPatch.queue = queueValue != null ? queueValue : payload.queueSize;
              }
              const progressTs = payload.ts ? Date.parse(payload.ts) : now;
              appActions.patchPipeline({ execution: executionPatch });

              const insightDetails = {};
              const insightExtras = { source: 'progress', timestamp: Number.isFinite(progressTs) ? progressTs : now };
              let shouldUpdateInsights = false;
              if (payload.coverage) {
                insightDetails.coverage = payload.coverage;
                shouldUpdateInsights = true;
              }
              if (Array.isArray(payload.goalStates)) {
                insightDetails.goalStates = payload.goalStates;
                shouldUpdateInsights = true;
              }
              if (payload.goalSummary) {
                insightDetails.goalSummary = payload.goalSummary;
                shouldUpdateInsights = true;
              }
              if (payload.seededHubs) {
                insightDetails.seededHubs = payload.seededHubs;
                shouldUpdateInsights = true;
              }
              if (Array.isArray(payload.problems)) {
                insightDetails.problems = payload.problems;
                shouldUpdateInsights = true;
              }
              if (payload.queueHeatmap) {
                insightExtras.queueHeatmap = payload.queueHeatmap;
                shouldUpdateInsights = true;
              }
              if (shouldUpdateInsights) {
                updateIntelligentInsights(insightDetails, insightExtras);
              }
            } catch (_) {}
          },
          milestone(e) {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              handleMilestone(payload);
            } catch (_) {}
          },
          'planner-stage': (e) => {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              handlePlannerStage(payload);
            } catch (_) {}
          },
          'analysis-progress': (e) => {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              handleAnalysisProgress(payload);
            } catch (_) {}
          },
          done(e) {
            markSseLive();
            try {
              const key = `done:${e.data}`;
              if (!window.__seenDone) window.__seenDone = new Set();
              if (window.__seenDone.has(key)) return;
              window.__seenDone.add(key);
            } catch (_) {}
            logs.textContent += `\nDONE: ${e.data}\n`;
          },
          cache(e) {
            markSseLive();
            try {
              const payload = JSON.parse(e.data);
              handleCacheEvent(payload);
              try {
                const src = payload.source || 'cache';
                const age = typeof payload.ageSeconds === 'number' ? `${payload.ageSeconds}s` : 'unknown';
                const url = payload.url || '';
                const line = `CACHE hit (${src}, age ${age}) ${url}\n`;
                logEntries.push({ text: line, isErr: false });
                scheduleFlush();
              } catch (_) {}
            } catch (_) {}
          }
        };
      }

      refreshServerMetrics();
      startServerMetricsPolling();
      startDlpsTicker();
      // Load recent domains for navigation
      (async function loadDomains(){
        try {
          const r = await fetch('/api/recent-domains?limit=20');
          if (!r.ok) {
            let reason = `HTTP ${r.status}`;
            try { const j = await r.json(); if (j && j.error) reason = j.error; } catch(_) {}
            domains.textContent = 'Failed to load (' + reason + ')';
            return;
          }
          const j = await r.json();
          if (!Array.isArray(j.domains) || j.domains.length === 0) { domains.textContent = 'No recent domains.'; return; }
          domains.innerHTML = j.domains.map(d => {
            const h = d.host;
            const url = `/domain?host=${encodeURIComponent(h)}`;
            return `<a href="${url}">${h}</a> <span class="muted">(${d.article_count} articles)</span>`;
          }).join(' · ');
        } catch (e) { domains.textContent = 'Failed to load (network)'; }
      })();
      // Load recent errors panel
      (async function loadErrors(){
        try {
          const r = await fetch('/api/recent-errors');
          if (!r.ok) return;
          const j = await r.json();
          const el = document.getElementById('errorsList');
          if (!el) return;
          el.textContent = '';
          const items = Array.isArray(j.errors) ? j.errors : [];
          if (items.length === 0) {
            el.textContent = 'No recent errors.';
            return;
          }
          el.innerHTML = '';
          for (const err of items) {
            const row = document.createElement('div');
            row.className = 'error-row';
            const host = err && err.host ? String(err.host) : '(unknown)';
            const statusLabel = err && err.status ? String(err.status) : (err && err.kind ? String(err.kind) : 'error');
            const params = new URLSearchParams();
            if (host && host !== '(unknown)') params.set('host', host);
            if (/^\d+$/.test(statusLabel)) params.set('status', statusLabel);
            params.set('dir', 'desc');
            params.set('details', '1');
            const link = document.createElement('a');
            link.href = `/urls?${params.toString()}`;
            link.className = 'error-link';
            const statusSpan = document.createElement('span');
            statusSpan.className = 'muted';
            statusSpan.textContent = statusLabel;
            link.appendChild(statusSpan);
            link.appendChild(document.createTextNode(' '));
            link.appendChild(document.createTextNode(host));
            row.appendChild(link);
            const countText = typeof err?.count === 'number' ? formatNumber(err.count) : '0';
            row.appendChild(document.createTextNode(' — ' + countText));
            const latestAt = err && err.latestAt ? new Date(err.latestAt) : null;
            if (latestAt && !Number.isNaN(latestAt.getTime())) {
              const tsSpan = document.createElement('span');
              tsSpan.className = 'muted';
              tsSpan.textContent = ` · latest ${latestAt.toLocaleString()}`;
              row.appendChild(tsSpan);
            }
            const firstMessage = Array.isArray(err?.messages) && err.messages.length ? err.messages[0] : null;
            if (firstMessage) {
              const maxLen = 160;
              const truncated = firstMessage.length > maxLen ? (firstMessage.slice(0, maxLen - 1) + '…') : firstMessage;
              const msgSpan = document.createElement('span');
              msgSpan.className = 'muted';
              msgSpan.textContent = ` · ${truncated}`;
              row.appendChild(msgSpan);
            }
            const ex = Array.isArray(err?.examples) ? err.examples : [];
            const exampleLinks = ex.filter(x => x && x.url).slice(0, 3);
            if (exampleLinks.length) {
              row.appendChild(document.createTextNode(' · '));
              for (let i = 0; i < exampleLinks.length; i++) {
                const sample = exampleLinks[i];
                const a = document.createElement('a');
                a.href = `/url?url=${encodeURIComponent(sample.url)}`;
                a.textContent = `example${i+1}`;
                a.rel = 'noopener noreferrer';
                a.target = '_blank';
                row.appendChild(a);
                if (i < exampleLinks.length - 1) {
                  row.appendChild(document.createTextNode(' · '));
                }
              }
            }
            el.appendChild(row);
          }
        } catch (_) {}
      })();

      function openEventStream(withLogs) {
        const listeners = createSseHandlers();
        sseClient.open({
          url: `/events?logs=${withLogs ? '1' : '0'}`,
          listeners
        });
      }

  // Initialize logs toggle from localStorage (default ON if unset)
  (function initLogsToggle(){
    const pref = localStorage.getItem('showLogs');
    const enabled = (pref == null) ? true : (pref === '1');
    if (pref == null) localStorage.setItem('showLogs', '1');
    document.getElementById('showLogs').checked = enabled;
    if (!enabled) logs.textContent = 'Logs are disabled. Enable "Show logs" to stream stdout/stderr here.';
    openEventStream(enabled);
  })();
      // Load crawl types and initialize the dropdown
      (async function initCrawlTypes(){
        const sel = document.getElementById('crawlType');
        if (!sel) return;
        const storedType = localStorage.getItem('ctrl_crawlType') || '';
        const legacyMode = localStorage.getItem('ctrl_mode');
        const saved = storedType || (legacyMode === 'intelligent' ? 'intelligent' : '');
        try {
          const r = await fetch('/api/crawl-types');
          if (!r.ok) throw new Error('HTTP '+r.status);
          const j = await r.json();
          const items = Array.isArray(j.items) ? j.items : [];
          sel.innerHTML = '';
          for (const it of items) {
            const opt = document.createElement('option');
            opt.value = it.name;
            opt.textContent = it.name;
            opt.title = it.description || '';
            sel.appendChild(opt);
          }
          const def = items.find(x => x.name === 'basic-with-sitemap') ? 'basic-with-sitemap' : (items[0]?.name || 'basic');
          sel.value = saved && items.some(x => x.name === saved) ? saved : def;
        } catch (e) {
          sel.innerHTML = '<option value="basic-with-sitemap">basic-with-sitemap</option><option value="intelligent">intelligent</option><option value="basic">basic</option><option value="sitemap-only">sitemap-only</option>';
          if (saved && Array.from(sel.options).some(opt => opt.value === saved)) {
            sel.value = saved;
          }
        }
        // Apply sitemap checkboxes based on selected type
        const applyByType = () => {
          const v = sel.value;
          const useEl = document.getElementById('useSitemap');
          const soEl = document.getElementById('sitemapOnly');
          if (!useEl || !soEl) return;
          if (v === 'basic') {
            useEl.checked = false; useEl.disabled = false; soEl.checked = false; soEl.disabled = false;
          } else if (v === 'sitemap-only') {
            useEl.checked = true; useEl.disabled = true; soEl.checked = true; soEl.disabled = true;
          } else if (v === 'intelligent') {
            useEl.checked = true; useEl.disabled = false; soEl.checked = false; soEl.disabled = false;
          } else {
            // basic-with-sitemap
            useEl.checked = true; useEl.disabled = false; soEl.checked = false; soEl.disabled = false;
          }
        };
        sel.addEventListener('change', () => {
          localStorage.setItem('ctrl_crawlType', sel.value);
          applyByType();
        });
        applyByType();
      })();
  // Persist key controls
  (function persistControls(){
  const ids = ['startUrl','depth','maxPages','refetchIfOlderThan','refetchArticleIfOlderThan','refetchHubIfOlderThan','concurrency','requestTimeoutMs','pacerJitterMinMs','pacerJitterMaxMs','slowMode','useSitemap','sitemapOnly'];
  try { localStorage.removeItem('ctrl_mode'); } catch (_) {}
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const key = `ctrl_${id}`;
      const val = localStorage.getItem(key);
      if (val != null) {
        if (el.type === 'checkbox') el.checked = val === '1';
        else el.value = val;
      }
      el.addEventListener('change', () => {
        localStorage.setItem(key, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
        // Enforce sitemap-only implies useSitemap
        if (id === 'sitemapOnly') {
          const useEl = document.getElementById('useSitemap');
          if (el.checked) {
            useEl.checked = true;
            useEl.disabled = true;
            localStorage.setItem('ctrl_useSitemap', '1');
          } else {
            useEl.disabled = false;
          }
        }
      });
      el.addEventListener('input', () => {
        if (el.type !== 'checkbox') localStorage.setItem(key, el.value);
      });
    }
    // Apply initial disable state on load
    try {
      const so = document.getElementById('sitemapOnly');
      const useEl = document.getElementById('useSitemap');
      if (so && useEl && so.checked) { useEl.checked = true; useEl.disabled = true; }
    } catch (_) {}
  })();
      if (analysisBtn) {
        analysisBtn.onclick = async () => {
          const prevLabel = analysisBtn.textContent;
          analysisBtn.disabled = true;
          analysisBtn.textContent = 'Starting…';
          if (analysisLink) analysisLink.textContent = 'Starting analysis…';
          if (analysisStatus) renderAnalysisStatus('Analysis run is starting…');
          const runStartTs = Date.now();
          appActions.patchPipeline({ analysis: { status: 'running', statusLabel: 'Running', summary: 'Manual analysis run starting…', lastRun: runStartTs } });
          try {
            const r = await fetch('/api/analysis/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
            let payload = null;
            try { payload = await r.json(); } catch (_) {}
            if (!r.ok) {
              const detail = payload && payload.error ? payload.error : `HTTP ${r.status}`;
              if (analysisLink) analysisLink.textContent = `Failed: ${detail}`;
              if (analysisStatus) {
                renderAnalysisStatus(`Analysis start failed: ${detail}`, {
                  metrics: [{ label: 'Error', value: String(detail) }]
                });
              }
              logs.textContent += `\nAnalysis start failed: ${detail}\n`;
              appActions.patchPipeline({ analysis: { status: 'failed', statusLabel: 'Failed', summary: `Start failed: ${detail}` } });
            } else {
              const runId = payload && payload.runId ? String(payload.runId) : '';
              const detailUrl = payload && payload.detailUrl ? String(payload.detailUrl) : (runId ? `/analysis/${runId}/ssr` : '');
              renderAnalysisLink(detailUrl, runId);
              try {
                if (detailUrl) localStorage.setItem('analysisLastDetailUrl', detailUrl);
                if (runId) localStorage.setItem('analysisLastRunId', runId);
                localStorage.setItem('analysisLastRunAt', String(Date.now()));
              } catch (_) {}
              if (analysisStatus) {
                const stamp = new Date();
                const ts = stamp.getTime();
                const metrics = [];
                if (runId) metrics.push({ label: 'Run', value: runId });
                metrics.push({ label: 'Started', value: formatRelativeTime(ts), title: stamp.toLocaleString() });
                renderAnalysisStatus('Analysis run launched.', { metrics });
              }
              logs.textContent += `\nAnalysis started: ${runId || detailUrl}\n`;
            }
          } catch (err) {
            const message = err && err.message ? err.message : String(err);
            if (analysisLink) analysisLink.textContent = `Failed: ${message}`;
            if (analysisStatus) {
              renderAnalysisStatus(`Last attempt failed: ${message}`, {
                metrics: [{ label: 'Error', value: String(message) }],
                muted: false
              });
            }
            logs.textContent += `\nAnalysis start error: ${message}\n`;
          } finally {
            analysisBtn.disabled = false;
            analysisBtn.textContent = prevLabel;
          }
        };
      }
      document.getElementById('startBtn').onclick = async () => {
        const selectedType = document.getElementById('crawlType')?.value || '';
        resetInsights();
        if (selectedType) setCrawlType(selectedType);
        else setCrawlType('');
        const body = {
          startUrl: document.getElementById('startUrl').value,
          depth: parseInt(document.getElementById('depth').value, 10),
          maxPages: document.getElementById('maxPages').value ? parseInt(document.getElementById('maxPages').value, 10) : undefined,
          refetchIfOlderThan: document.getElementById('refetchIfOlderThan').value || undefined,
          refetchArticleIfOlderThan: document.getElementById('refetchArticleIfOlderThan').value || undefined,
          refetchHubIfOlderThan: document.getElementById('refetchHubIfOlderThan').value || undefined,
          concurrency: parseInt(document.getElementById('concurrency').value, 10),
          crawlType: selectedType || undefined,
          slow: document.getElementById('slowMode').checked,
          requestTimeoutMs: document.getElementById('requestTimeoutMs').value ? parseInt(document.getElementById('requestTimeoutMs').value, 10) : undefined,
          pacerJitterMinMs: document.getElementById('pacerJitterMinMs').value ? parseInt(document.getElementById('pacerJitterMinMs').value, 10) : undefined,
          pacerJitterMaxMs: document.getElementById('pacerJitterMaxMs').value ? parseInt(document.getElementById('pacerJitterMaxMs').value, 10) : undefined,
  // Enforce: if sitemapOnly is checked, useSitemap must be true
  useSitemap: (function(){ const u = document.getElementById('useSitemap'); const so = document.getElementById('sitemapOnly'); return so.checked ? true : u.checked; })(),
  sitemapOnly: document.getElementById('sitemapOnly').checked,
  // sitemapMaxUrls removed: we cap sitemap by maxPages server-side
        };
        const btn = document.getElementById('startBtn');
        const prevLabel = btn.textContent;
        btn.disabled = true; btn.textContent = 'Starting…';
        try {
          const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          let payload = null;
          try { payload = await r.json(); } catch (_) { /* ignore */ }
          if (!r.ok) {
            const detail = payload?.error || `HTTP ${r.status}`;
              const summary = runId ? `Run ${runId} launched` : 'Analysis run launched';
              appActions.patchPipeline({ analysis: { status: 'running', statusLabel: 'Running', summary } });
            if (r.status === 409) {
              logs.textContent += `\nStart: already running (409)\n`;
              try {
                progress.textContent = 'running (already in progress)…';
                // Briefly poll status to reflect activity
                const until = Date.now() + 4000;
            appActions.patchPipeline({ analysis: { status: 'error', statusLabel: 'Error', summary: `Request failed: ${message}` } });
                (async function poll(){
                  try { const rs = await fetch('/api/status'); if (rs.ok) { const js = await rs.json(); if (js.running) progress.textContent = 'running…'; } } catch {}
                  if (Date.now() < until) setTimeout(poll, 300);
                })();
              } catch(_) {}
            } else {
              logs.textContent += `\nStart failed: ${detail}\n`;
            }
          } else {
            logs.textContent += `\nStarted: ${JSON.stringify(payload)}\n`;
            // Immediate UI feedback in Progress area so users see action even if SSE connects late
            try {
              progress.textContent = 'starting… (visited: 0, downloaded: 0, found: 0, saved: 0)';
              updateStartupStatus(null, 'Starting crawler…');
              // Kick a short status poll to reflect running state without waiting for SSE
              window.__startPollUntil = Date.now() + 4000; // 4s window
              (async function pollOnce(){
                try {
                  const now = Date.now();
                  if (now > (window.__startPollUntil||0)) return;
                  const rs = await fetch('/api/status');
                  if (rs.ok) {
                    const js = await rs.json();
                    if (js && js.running) {
                      // Mark UI as running if no progress yet
                      if ((window.__lastProgress?.visited||0) === 0) {
                        progress.textContent = 'running… (visited: 0, downloaded: 0, found: 0, saved: 0)';
                      }
                    }
                  }
                } catch(_) {}
                setTimeout(pollOnce, 250);
              })();
            } catch(_) {}
          }
        } catch (e) {
          logs.textContent += `\nStart error: ${e?.message || e}\n`;
        } finally {
          btn.disabled = false; btn.textContent = prevLabel;
        }
      };
      document.getElementById('stopBtn').onclick = async () => {
        try {
          const r = await fetch('/api/stop', { method: 'POST' });
          let j = null; try { j = await r.json(); } catch (_) {}
          if (!r.ok) logs.textContent += `\nStop failed: HTTP ${r.status}\n`;
          else logs.textContent += `\nStop requested: ${JSON.stringify(j)}\n`;
        } catch (e) {
          logs.textContent += `\nStop error: ${e?.message || e}\n`;
        }
      };
      pauseBtn.onclick = async () => {
        try {
          const r = await fetch('/api/pause', { method: 'POST' });
          let j = null; try { j = await r.json(); } catch (_) {}
          if (!r.ok) logs.textContent += `\nPause failed: HTTP ${r.status}\n`;
          else {
            logs.textContent += `\nPause requested: ${JSON.stringify(j)}\n`;
            if (j && (j.paused === true || j.ok === true)) { pauseBtn.disabled = true; resumeBtn.disabled = false; }
          }
        } catch (e) { logs.textContent += `\nPause error: ${e?.message || e}\n`; }
      };
      resumeBtn.onclick = async () => {
        try {
          const r = await fetch('/api/resume', { method: 'POST' });
          let j = null; try { j = await r.json(); } catch (_) {}
          if (!r.ok) logs.textContent += `\nResume failed: HTTP ${r.status}\n`;
          else {
            logs.textContent += `\nResume requested: ${JSON.stringify(j)}\n`;
            if (j && (j.paused === false || j.ok === true)) { pauseBtn.disabled = false; resumeBtn.disabled = true; }
          }
        } catch (e) { logs.textContent += `\nResume error: ${e?.message || e}\n`; }
      };
      const resumeAllCheckbox = document.getElementById('resumeAllQueues');
      if (resumeAllCheckbox) {
        resumeAllCheckbox.addEventListener('change', async (e) => {
          if (!e.target.checked) return;
          e.target.checked = false;
          e.target.disabled = true;
          try {
            logs.textContent += '\nResume all: requesting...\n';
            const r = await fetch('/api/resume-all', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ maxConcurrent: 8 })
            });
            let j = null; 
            try { j = await r.json(); } catch (_) {}
            if (!r.ok) {
              const detail = j?.error || `HTTP ${r.status}`;
              logs.textContent += `\nResume all failed: ${detail}\n`;
            } else {
              const count = j?.resumed || 0;
              const message = j?.message || `Resumed ${count} crawl(s)`;
              logs.textContent += `\n${message}\n`;
              if (Array.isArray(j?.queues)) {
                for (const q of j.queues) {
                  logs.textContent += `  - ${q.url} (pid ${q.pid})\n`;
                }
              }
              if (Array.isArray(j?.errors) && j.errors.length > 0) {
                logs.textContent += `  Errors: ${j.errors.length}\n`;
                for (const err of j.errors.slice(0, 3)) {
                  logs.textContent += `    - ${err}\n`;
                }
              }
            }
          } catch (err) {
            logs.textContent += `\nResume all error: ${err?.message || err}\n`;
          } finally {
            setTimeout(() => { e.target.disabled = false; }, 2000);
          }
        });
      }
      document.getElementById('showLogs').onchange = (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('showLogs', enabled ? '1' : '0');
        if (!enabled) logs.textContent = 'Logs are disabled. Enable "Show logs" to stream stdout/stderr here.';
        else logs.textContent = '';
        openEventStream(enabled);
      };

      function renderJobs(jobs) {
        try {
          const el = document.getElementById('jobsList');
          if (!el) return;
          el.setAttribute('aria-busy', 'true');
          if (!jobs || !Array.isArray(jobs.items) || jobs.items.length === 0) {
            el.textContent = 'None';
            setStage('idle');
            hidePausedBadge();
            el.setAttribute('aria-busy', 'false');
            return;
          }
          const rows = jobs.items.map(it => {
            const url = it.url || '(unknown)';
            const v = it.visited ?? 0;
            const d = it.downloaded ?? 0;
            const e = it.errors ?? 0;
            const q = it.queueSize ?? 0;
            const act = it.lastActivityAt ? ` · active ${Math.round((Date.now() - it.lastActivityAt)/1000)}s ago` : '';
            const pid = it.pid ? ` · pid ${it.pid}` : '';
            const stage = it.stage || '';
            const status = it.status || stage || 'running';
            const stageHint = stage && stage !== status ? ` (${stage})` : '';
            const statusLine = [];
            if (it.statusText) statusLine.push(it.statusText);
            const startupSummary = it.startup && typeof it.startup === 'object' ? it.startup.summary : null;
            if (startupSummary && startupSummary.done === false && Number.isFinite(startupSummary.progress)) {
              statusLine.push(`startup ${(Math.round(Math.max(0, Math.min(1, startupSummary.progress)) * 100))}%`);
            }
            const statusMeta = statusLine.length ? ` · ${statusLine.join(' · ')}` : '';
            return `<div><strong>${status}${stageHint}</strong>${pid}${statusMeta} — <a href="/url?url=${encodeURIComponent(url)}">${url}</a> — v:${v} d:${d} e:${e} q:${q}${act}</div>`;
          }).join('');
          el.innerHTML = rows;
          el.setAttribute('aria-busy', 'false');
          if (jobs.items.length === 1) {
            const job = jobs.items[0];
            if (job.startup || job.statusText) updateStartupStatus(job.startup, job.statusText);
            setStage(job.stage || job.status || 'running');
            if (job.paused != null) setPausedBadge(!!job.paused);
            else if (job.status === 'done') hidePausedBadge();
            if (job.stage && /intelligent/i.test(job.stage)) setCrawlType('intelligent');
          } else {
            setStage('multi-run');
            setPausedBadge(null);
            updateStartupStatus(null, null);
          }
        } catch (_) {
        } finally {
          const el = document.getElementById('jobsList');
          if (el) el.setAttribute('aria-busy', 'false');
        }
      }

      // One-time poll as a fallback in case SSE arrives late
      (async function initialJobs(){
        try {
          const r = await fetch('/api/crawls');
          if (!r.ok) return; const j = await r.json(); renderJobs(j);
        } catch (_) {}
      })();

      // Persist open/closed state of collapsible panels
      (function persistPanels(){
        const pairs = [ ['secErrors', secErrors], ['secDomains', secDomains], ['secLogs', secLogs] ];
        for (const [key, el] of pairs) {
          const v = localStorage.getItem(key);
          if (v === '0') el.open = false;
          el.addEventListener('toggle', () => {
            localStorage.setItem(key, el.open ? '1' : '0');
          });
        }
      })();

      function applyThemePreference(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        if (themeBtn) {
          themeBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
          themeBtn.textContent = isDark ? 'Light' : 'Dark';
          const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
          themeBtn.setAttribute('aria-label', label);
          themeBtn.title = label;
        }
      }

      // Theme toggle persisted
      (function initTheme(){
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialDark = savedTheme ? savedTheme === 'dark' : prefersDark;
        applyThemePreference(initialDark);
        if (themeBtn) {
          themeBtn.addEventListener('click', () => {
            const nextDark = !document.documentElement.classList.contains('dark');
            applyThemePreference(nextDark);
            localStorage.setItem('theme', nextDark ? 'dark' : 'light');
          });
        }
      })();

      // Health strip: sizes
      (async function loadHealth(){
        try {
          const r = await fetch('/api/system-health');
          if (r.ok) {
            const j = await r.json();
            const fmt = (b)=> b==null? 'n/a' : (b >= 1073741824 ? (b/1073741824).toFixed(2)+' GB' : (b/1048576).toFixed(1)+' MB');
            badgeDb.textContent = 'db: ' + fmt(j.dbSizeBytes);
            badgeDisk.textContent = 'disk: ' + fmt(j.freeDiskBytes);
            if (j && j.cpu) {
              const pct = (j.cpu.percent != null) ? j.cpu.percent : (j.cpu.percentOfOneCore != null ? j.cpu.percentOfOneCore : null);
              if (pct != null) badgeCpu.textContent = 'cpu: ' + pct.toFixed(1) + '%';
            }
            if (j && j.memory) {
              badgeMem.textContent = 'mem: ' + fmt(j.memory.rss);
            }
            if (j && (j.walAutocheckpoint != null || j.journalMode != null)) {
              const jm = j.journalMode ? ('jm=' + j.journalMode) : '';
              const wal = (typeof j.walAutocheckpoint === 'number') ? ('auto_cp=' + j.walAutocheckpoint) : '';
              const both = [jm, wal].filter(Boolean).join(' ');
              badgeWal.textContent = both ? ('sqlite: ' + both) : 'sqlite: n/a';
            }
          }
        } catch (_) {}
      })();