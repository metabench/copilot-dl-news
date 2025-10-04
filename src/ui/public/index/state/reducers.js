import { initialState, createInitialPatternInsightsState } from './initialState.js';
import { PIPELINE_DEFAULTS } from '../pipelineView.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStatusKey(status) {
  if (!status) return 'idle';
  const key = String(status).toLowerCase();
  if (['idle', 'running', 'pending', 'ready', 'applied', 'blocked', 'error', 'failed'].includes(key)) {
    return key;
  }
  if (key === 'completed' || key === 'complete' || key === 'success') return 'ready';
  if (key === 'paused') return 'pending';
  if (key === 'failure') return 'failed';
  return 'idle';
}

function mergePipeline(prevPipeline, patch) {
  const next = {
    analysis: clone(prevPipeline.analysis || PIPELINE_DEFAULTS.analysis),
    planner: clone(prevPipeline.planner || PIPELINE_DEFAULTS.planner),
    execution: clone(prevPipeline.execution || PIPELINE_DEFAULTS.execution)
  };
  for (const [stageKey, stagePatch] of Object.entries(patch || {})) {
    if (!next[stageKey] || !stagePatch) continue;
    for (const [prop, value] of Object.entries(stagePatch)) {
      if (prop === 'status') {
        next[stageKey][prop] = normalizeStatusKey(value);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        next[stageKey][prop] = { ...(next[stageKey][prop] || {}), ...value };
      } else if (Array.isArray(value)) {
        next[stageKey][prop] = value.slice();
      } else {
        next[stageKey][prop] = value;
      }
    }
  }
  return next;
}

const MAX_PATTERN_LOG_LENGTH = 40;
let patternEventSeq = 0;

function normaliseString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normaliseSlugList(values) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (raw == null) continue;
    const str = String(raw).trim();
    if (!str) continue;
    const cleaned = str
      .replace(/^https?:\/\//i, '')
      .replace(/^\/*/, '')
      .replace(/\/*$/, '')
      .toLowerCase();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 20) break;
  }
  return out;
}

function normaliseHintList(values) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (raw == null) continue;
    const str = String(raw).trim().toLowerCase();
    if (!str) continue;
    if (seen.has(str)) continue;
    seen.add(str);
    out.push(str);
    if (out.length >= 20) break;
  }
  return out;
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalisePatternEvent(payload = {}) {
  const ts = numberOrNull(payload.timestamp) ?? Date.now();
  patternEventSeq = (patternEventSeq + 1) % Number.MAX_SAFE_INTEGER;
  const id = payload.id || `pattern-${ts}-${patternEventSeq}`;
  const source = normaliseString(payload.source) || 'unknown';
  const stage = normaliseString(payload.stage);
  const status = normaliseString(payload.status) || (source === 'milestone' ? 'recorded' : '');
  const label = normaliseString(payload.label) || (stage ? stage.replace(/[-_]+/g, ' ') : (source === 'milestone' ? 'patterns learned' : 'pattern insight'));
  const message = normaliseString(payload.message);
  const sections = normaliseSlugList(payload.sections || payload.sectionSlugs || payload.learnedSections || []);
  const articleHints = normaliseHintList(payload.articleHints || payload.hints || []);
  const sectionCount = numberOrNull(payload.sectionCount) ?? numberOrNull(payload.sectionsCount) ?? (sections.length || null);
  const articleHintsCount = numberOrNull(payload.articleHintsCount) ?? (articleHints.length || null);
  const durationMs = numberOrNull(payload.durationMs);
  const homepageSource = normaliseString(payload.homepageSource || payload.homepageFetchSource || '');
  const notModified = !!payload.notModified;
  const hadError = !!payload.hadError;
  const contextHost = normaliseString(payload.contextHost).toLowerCase();
  const summaryPieces = [];
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  if (statusLabel) summaryPieces.push(statusLabel);
  if (sectionCount != null) summaryPieces.push(`sections ${sectionCount}`);
  if (articleHintsCount != null) summaryPieces.push(`hints ${articleHintsCount}`);
  if (homepageSource) summaryPieces.push(`source ${homepageSource}`);
  if (notModified) summaryPieces.push('not-modified');
  if (hadError) summaryPieces.push('with error');
  const summaryText = normaliseString(payload.summary) || message || summaryPieces.join(' · ');
  const rawDetails = payload.details && typeof payload.details === 'object' ? payload.details : (payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : null);

  return {
    id,
    timestamp: ts,
    source,
    stage,
    status,
    label,
    message,
    sections,
    articleHints,
    sectionCount,
    articleHintsCount,
    durationMs,
    homepageSource,
    notModified,
    hadError,
    contextHost,
    summary: summaryText,
    rawDetails: rawDetails ? JSON.parse(JSON.stringify(rawDetails)) : null
  };
}

function updateCounts(counts = {}, items = []) {
  if (!Array.isArray(items) || !items.length) {
    return counts;
  }
  const next = { ...counts };
  for (const item of items) {
    next[item] = (next[item] || 0) + 1;
  }
  return next;
}

function computeTopList(counts = {}, limit = 5) {
  return Object.entries(counts)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function mergeHomepageSourceCounts(prev = {}, source) {
  if (!source) return prev;
  const key = source.toLowerCase();
  const next = { ...prev };
  next[key] = (next[key] || 0) + 1;
  return next;
}

function createPatternLogEntry(event) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    source: event.source,
    stage: event.stage,
    status: event.status,
    label: event.label,
    summary: event.summary,
    sections: event.sections,
    articleHints: event.articleHints,
    homepageSource: event.homepageSource,
    notModified: event.notModified,
    hadError: event.hadError,
    contextHost: event.contextHost,
    durationMs: event.durationMs,
    sectionCount: event.sectionCount,
    articleHintsCount: event.articleHintsCount,
    message: event.message,
    details: event.rawDetails
  };
}

function describeProblems(problems = []) {
  if (!Array.isArray(problems) || problems.length === 0) {
    return { total: 0, detail: 'No unresolved planner problems recorded.' };
  }
  const total = problems.reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
  const top = problems
    .filter((item) => item && item.kind)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 3)
    .map((item) => `${item.kind}: ${item.count}`)
    .join(' · ');
  return { total, detail: top };
}

function describeGoals(goalStates = [], goalSummary) {
  if (goalSummary && typeof goalSummary === 'string') {
    return { label: goalSummary, detail: '' };
  }
  if (!Array.isArray(goalStates) || goalStates.length === 0) {
    return {
      label: 'No planner goals yet.',
      detail: 'Planner goals will appear once intelligent crawling begins.'
    };
  }
  const total = goalStates.length;
  const completed = goalStates.filter((goal) => goal && goal.completed).length;
  const active = goalStates.filter((goal) => goal && !goal.completed).slice(0, 2);
  const detail = active.map((goal) => {
    const pct = Math.round((Number(goal.progress) || 0) * 100);
    return `${goal.description || goal.id || 'Goal'}: ${pct}%`;
  }).join(' · ');
  return {
    label: `${completed}/${total} complete`,
    detail: detail || 'All planner goals completed.'
  };
}

function describeCoverage(coverage) {
  if (!coverage || typeof coverage !== 'object') {
    return { pct: null, detail: '' };
  }
  let pct = null;
  if (typeof coverage.coveragePct === 'number') {
    pct = coverage.coveragePct;
  } else if (typeof coverage.visitedCoveragePct === 'number') {
    pct = coverage.visitedCoveragePct;
  }
  if (pct != null && pct <= 1) {
    pct *= 100;
  }
  let detail = '';
  if (coverage.expected != null) {
    const seeded = coverage.seeded != null ? coverage.seeded : coverage.visited;
    detail = `${seeded ?? 0} of ${coverage.expected} expected hubs`;
  } else if (coverage.seeded != null) {
    detail = `${coverage.seeded} hubs seeded`;
  }
  return { pct, detail };
}

function describeQueueMix(queueHeatmap) {
  if (!queueHeatmap || typeof queueHeatmap !== 'object' || !queueHeatmap.cells) {
    return { label: 'Queue idle', detail: 'Queue telemetry not yet available.' };
  }
  const totals = { article: 0, hub: 0, other: 0 };
  let total = 0;
  for (const counts of Object.values(queueHeatmap.cells)) {
    for (const type of Object.keys(totals)) {
      const value = Number(counts?.[type]) || 0;
      totals[type] += value;
      total += value;
    }
  }
  if (total === 0) {
    return { label: 'Queue idle', detail: 'No pending URLs in planner heatmap.' };
  }
  const parts = Object.entries(totals)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key} ${Math.round((value / total) * 100)}%`);
  let detail = '';
  if (queueHeatmap.depthBuckets) {
    const buckets = Object.entries(queueHeatmap.depthBuckets)
      .map(([depth, count]) => ({ depth, count: Number(count) || 0 }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
    if (buckets.length) {
      const [top] = buckets;
      detail = `Depth focus ${top.depth}: ${top.count}`;
    }
  }
  return {
    label: parts.join(' · '),
    detail: detail || 'Queue telemetry updated.'
  };
}

function mergeHighlights(extras = {}, details = {}) {
  const highlights = [];
  const analysisHighlights = Array.isArray(extras.analysisHighlights)
    ? extras.analysisHighlights
    : Array.isArray(details.analysisHighlights)
      ? details.analysisHighlights
      : [];
  if (analysisHighlights.length) {
    highlights.push(...analysisHighlights.filter(Boolean));
  }
  if (details.seededHubs && details.seededHubs.sample) {
    highlights.push(`Seeded hubs sample: ${details.seededHubs.sample.slice(0, 2).join(', ')}`);
  }
  if (details.problems && details.problems.length) {
    const top = details.problems[0];
    if (top && top.kind) {
      highlights.push(`Problem ${top.kind}: ${top.count}`);
    }
  }

    const navigation = details.navigation || extras.navigation;
    if (navigation && navigation.totalLinks) {
      const pieces = [`Nav links ${navigation.totalLinks}`];
      if (navigation.primary) pieces.push(`${navigation.primary} primary`);
      if (Array.isArray(navigation.focusSections) && navigation.focusSections.length) {
        const sectionLabels = navigation.focusSections
          .slice(0, 2)
          .map((entry) => entry.section)
          .filter(Boolean);
        if (sectionLabels.length) {
          pieces.push(`Focus: ${sectionLabels.join(', ')}`);
        }
      }
      highlights.push(pieces.join(' · '));
    }
  return highlights.slice(0, 6);
}

export function registerReducers(store) {
  store.register('crawl/setType', (_state, type) => ({ crawlType: type || '' }));

  store.register('insights/reset', (state, payload = {}) => {
    const hint = payload.hint || initialState.insights.hint;
    return {
      insights: { ...clone(initialState.insights), hint },
      diagrams: { ...state.diagrams, queueHeatmapData: null }
    };
  });

  store.register('insights/update', (state, payload = {}) => {
    const prev = state.insights || initialState.insights;
    const details = payload.details || payload;
    const extras = payload.extras || {};
    const coverageInfo = describeCoverage(details.coverage || extras.coverage);
    const problemsInfo = describeProblems(details.problems);
    const goalInfo = describeGoals(details.goalStates, details.goalSummary || extras.goalSummary);
    const queueInfo = describeQueueMix(extras.queueHeatmap || details.queueHeatmap);
    const highlights = mergeHighlights(extras, details);
    const seeded = details.seededHubs || extras.seededHubs;
    const seededCount = seeded && (seeded.unique ?? seeded.requested ?? seeded.count ?? seeded.visited ?? null);
    const seededDetailParts = [];
    if (seeded) {
      if (seeded.sectionsFromPatterns != null) seededDetailParts.push(`${seeded.sectionsFromPatterns} sections inferred`);
      if (seeded.countryCandidates != null) seededDetailParts.push(`${seeded.countryCandidates} country candidates`);
      if (Array.isArray(seeded.sample) && seeded.sample.length) seededDetailParts.push(`sample: ${seeded.sample.slice(0, 2).join(', ')}`);
    }

    return {
      insights: {
        ...prev,
        coverage: coverageInfo.pct,
        coverageDetail: coverageInfo.detail,
        seededHubs: seededCount,
        seededDetail: seededDetailParts.join(' · '),
        problemsTotal: problemsInfo.total,
        problemsDetail: problemsInfo.detail,
        goals: goalInfo.label,
        goalsDetail: goalInfo.detail,
        queueMix: queueInfo.label,
        queueMixDetail: queueInfo.detail,
        highlights,
        updatedAt: payload.timestamp || Date.now(),
        hint: payload.hint || prev.hint
      },
      diagrams: {
        ...state.diagrams,
        queueHeatmapData: extras.queueHeatmap || details.queueHeatmap || null
      },
      cache: {
        ...state.cache,
        coverageSummary: coverageInfo.pct != null ? { value: coverageInfo.pct } : null
      }
    };
  });

  store.register('timeline/milestone:add', (state, entry) => {
    const list = Array.isArray(state.milestones) ? state.milestones.slice(0, 119) : [];
    return {
      milestones: [entry, ...list]
    };
  });

  store.register('timeline/planner:add', (state, entry) => {
    const list = Array.isArray(state.plannerTimeline) ? state.plannerTimeline.slice(0, 149) : [];
    return {
      plannerTimeline: [entry, ...list]
    };
  });

  store.register('pipeline/reset', () => ({
    pipeline: {
      analysis: clone(PIPELINE_DEFAULTS.analysis),
      planner: clone(PIPELINE_DEFAULTS.planner),
      execution: clone(PIPELINE_DEFAULTS.execution)
    }
  }));

  store.register('pipeline/patch', (state, patch) => ({
    pipeline: mergePipeline(state.pipeline || initialState.pipeline, patch)
  }));

  store.register('patterns/reset', () => ({
    patternInsights: createInitialPatternInsightsState()
  }));

  store.register('patterns/addEvent', (state, payload = {}) => {
    const prev = state.patternInsights || createInitialPatternInsightsState();
    const event = normalisePatternEvent(payload);
    if (!event) {
      return { patternInsights: prev };
    }

    const sectionCounts = updateCounts(prev.sectionCounts, event.sections);
    const hintCounts = updateCounts(prev.hintCounts, event.articleHints);
    const homepageSourceCounts = mergeHomepageSourceCounts(prev.homepageSourceCounts, event.homepageSource);
    const totalEvents = (prev.summary?.totalEvents || 0) + 1;
    const uniqueSections = Object.keys(sectionCounts).length;
    const uniqueHints = Object.keys(hintCounts).length;
    const topSections = computeTopList(sectionCounts);
    const topHints = computeTopList(hintCounts);

    const summary = {
      ...prev.summary,
      totalEvents,
      updatedAt: Date.now(),
      lastEventAt: event.timestamp,
      lastSource: event.source,
      lastStage: event.stage || prev.summary?.lastStage || '',
      lastStatus: event.status || prev.summary?.lastStatus || '',
      lastHomepageSource: event.homepageSource || prev.summary?.lastHomepageSource || '',
      lastNotModified: event.notModified,
      lastHadError: event.hadError,
      lastContextHost: event.contextHost || prev.summary?.lastContextHost || '',
      lastSummary: event.summary || prev.summary?.lastSummary || '',
      lastSectionsSample: event.sections.slice(0, 6),
      lastHintsSample: event.articleHints.slice(0, 6),
      uniqueSections,
      uniqueHints,
      topSections,
      topHints,
      homepageSourceCounts
    };

    const logEntry = createPatternLogEntry(event);
    const log = [logEntry, ...(Array.isArray(prev.log) ? prev.log : [])].slice(0, MAX_PATTERN_LOG_LENGTH);

    return {
      patternInsights: {
        summary,
        sectionCounts,
        hintCounts,
        homepageSourceCounts,
        log
      }
    };
  });
}
