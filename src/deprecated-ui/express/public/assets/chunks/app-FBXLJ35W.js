import {
  PIPELINE_DEFAULTS,
  createPipelineView
} from "./chunk-KBXANEST.js";
import {
  formatNumber,
  formatRelativeTime,
  formatTimestamp
} from "./chunk-HLEII6OW.js";
import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  setElementVisibility
} from "./chunk-R3BBB6IF.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/state/store.js
var import_lang_tools = __toESM(require_lang());

// src/ui/public/index/state/utils.js
var counter = 0;
function nanoid(prefix = "id") {
  counter += 1;
  const salt = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${salt}-${counter}`;
}

// src/ui/public/index/state/store.js
function createStore(initialState2 = {}) {
  let state = Object.freeze({ ...initialState2 });
  const listeners = /* @__PURE__ */ new Map();
  const reducers = /* @__PURE__ */ new Map();
  function getState() {
    return state;
  }
  function setState(updater, meta = null) {
    const nextState = (0, import_lang_tools.tof)(updater) === "function" ? Object.freeze({ ...state, ...updater(state) }) : Object.freeze({ ...state, ...updater });
    if (nextState === state) {
      return state;
    }
    state = nextState;
    const payload = { state: nextState, meta };
    for (const [, subscription] of listeners) {
      try {
        subscription(payload);
      } catch (err) {
        console.error("[store] subscriber error", err);
      }
    }
    return state;
  }
  function subscribe(listener) {
    const id = nanoid();
    listeners.set(id, listener);
    return () => listeners.delete(id);
  }
  function register(type, reducer) {
    if (typeof type !== "string" || !type) {
      throw new TypeError("Action type must be a non-empty string");
    }
    if (typeof reducer !== "function") {
      throw new TypeError("Reducer must be a function");
    }
    reducers.set(type, reducer);
    return () => reducers.delete(type);
  }
  function dispatch(type, payload) {
    const reducer = reducers.get(type);
    if (!reducer) {
      console.warn(`[store] missing reducer for action "${type}"`);
      return state;
    }
    const partial = reducer(state, payload);
    if (partial == null) {
      return state;
    }
    return setState((prev) => ({ ...prev, ...partial }), { type, payload });
  }
  return {
    getState,
    setState,
    subscribe,
    register,
    dispatch
  };
}

// src/ui/public/index/state/initialState.js
var clone = (value) => JSON.parse(JSON.stringify(value));
var PATTERN_SUMMARY_TEMPLATE = {
  totalEvents: 0,
  updatedAt: null,
  lastEventAt: null,
  lastSource: "",
  lastStage: "",
  lastStatus: "",
  lastHomepageSource: "",
  lastNotModified: false,
  lastHadError: false,
  lastContextHost: "",
  lastSummary: "",
  lastSectionsSample: [],
  lastHintsSample: [],
  uniqueSections: 0,
  uniqueHints: 0,
  topSections: [],
  topHints: [],
  homepageSourceCounts: {}
};
function createInitialPatternInsightsState() {
  return {
    summary: { ...PATTERN_SUMMARY_TEMPLATE },
    sectionCounts: {},
    hintCounts: {},
    homepageSourceCounts: {},
    log: []
  };
}
var initialState = {
  crawlType: "",
  insights: {
    coverage: null,
    coverageDetail: "",
    seededHubs: null,
    seededDetail: "",
    problems: [],
    problemsDetail: "",
    goals: null,
    goalsDetail: "",
    queueMix: null,
    queueMixDetail: "",
    highlights: [],
    updatedAt: null,
    hint: "Insights appear once planner telemetry streams in."
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

// src/ui/public/index/state/reducers.js
var import_lang_tools2 = __toESM(require_lang());
function normalizeStatusKey(status) {
  if (!status) return "idle";
  const key = String(status).toLowerCase();
  if (["idle", "running", "pending", "ready", "applied", "blocked", "error", "failed"].includes(key)) {
    return key;
  }
  if (key === "completed" || key === "complete" || key === "success") return "ready";
  if (key === "paused") return "pending";
  if (key === "failure") return "failed";
  return "idle";
}
function mergePipeline(prevPipeline, patch) {
  const next = {
    analysis: (0, import_lang_tools2.clone)(prevPipeline.analysis || PIPELINE_DEFAULTS.analysis),
    planner: (0, import_lang_tools2.clone)(prevPipeline.planner || PIPELINE_DEFAULTS.planner),
    execution: (0, import_lang_tools2.clone)(prevPipeline.execution || PIPELINE_DEFAULTS.execution)
  };
  for (const [stageKey, stagePatch] of Object.entries(patch || {})) {
    if (!next[stageKey] || !stagePatch) continue;
    for (const [prop, value] of Object.entries(stagePatch)) {
      if (prop === "status") {
        next[stageKey][prop] = normalizeStatusKey(value);
      } else if (value && (0, import_lang_tools2.tof)(value) === "object" && !(0, import_lang_tools2.is_array)(value)) {
        next[stageKey][prop] = { ...next[stageKey][prop] || {}, ...value };
      } else if ((0, import_lang_tools2.is_array)(value)) {
        next[stageKey][prop] = value.slice();
      } else {
        next[stageKey][prop] = value;
      }
    }
  }
  return next;
}
var MAX_PATTERN_LOG_LENGTH = 40;
var patternEventSeq = 0;
function normaliseString(value) {
  if (value == null) return "";
  return String(value).trim();
}
function normaliseSlugList(values) {
  if (!values) return [];
  const list = (0, import_lang_tools2.is_array)(values) ? values : [values];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of list) {
    if (raw == null) continue;
    const str = String(raw).trim();
    if (!str) continue;
    const cleaned = str.replace(/^https?:\/\//i, "").replace(/^\/*/, "").replace(/\/*$/, "").toLowerCase();
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
  const list = (0, import_lang_tools2.is_array)(values) ? values : [values];
  const seen = /* @__PURE__ */ new Set();
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
  const source = normaliseString(payload.source) || "unknown";
  const stage = normaliseString(payload.stage);
  const status = normaliseString(payload.status) || (source === "milestone" ? "recorded" : "");
  const label = normaliseString(payload.label) || (stage ? stage.replace(/[-_]+/g, " ") : source === "milestone" ? "patterns learned" : "pattern insight");
  const message = normaliseString(payload.message);
  const sections = normaliseSlugList(payload.sections || payload.sectionSlugs || payload.learnedSections || []);
  const articleHints = normaliseHintList(payload.articleHints || payload.hints || []);
  const sectionCount = numberOrNull(payload.sectionCount) ?? numberOrNull(payload.sectionsCount) ?? (sections.length || null);
  const articleHintsCount = numberOrNull(payload.articleHintsCount) ?? (articleHints.length || null);
  const durationMs = numberOrNull(payload.durationMs);
  const homepageSource = normaliseString(payload.homepageSource || payload.homepageFetchSource || "");
  const notModified = !!payload.notModified;
  const hadError = !!payload.hadError;
  const contextHost = normaliseString(payload.contextHost).toLowerCase();
  const summaryPieces = [];
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : "";
  if (statusLabel) summaryPieces.push(statusLabel);
  if (sectionCount != null) summaryPieces.push(`sections ${sectionCount}`);
  if (articleHintsCount != null) summaryPieces.push(`hints ${articleHintsCount}`);
  if (homepageSource) summaryPieces.push(`source ${homepageSource}`);
  if (notModified) summaryPieces.push("not-modified");
  if (hadError) summaryPieces.push("with error");
  const summaryText = normaliseString(payload.summary) || message || summaryPieces.join(" \xB7 ");
  const rawDetails = payload.details && (0, import_lang_tools2.tof)(payload.details) === "object" ? payload.details : payload.metadata && (0, import_lang_tools2.tof)(payload.metadata) === "object" ? payload.metadata : null;
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
    rawDetails: rawDetails ? (0, import_lang_tools2.clone)(rawDetails) : null
  };
}
function updateCounts(counts = {}, items = []) {
  if (!(0, import_lang_tools2.is_array)(items) || !items.length) {
    return counts;
  }
  const next = { ...counts };
  for (const item of items) {
    next[item] = (next[item] || 0) + 1;
  }
  return next;
}
function computeTopList(counts = {}, limit = 5) {
  return Object.entries(counts).filter(([, count]) => Number.isFinite(count) && count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([label, count]) => ({ label, count }));
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
  if (!(0, import_lang_tools2.is_array)(problems) || problems.length === 0) {
    return { total: 0, detail: "No unresolved planner problems recorded." };
  }
  const total = problems.reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
  const top = problems.filter((item) => item && item.kind).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 3).map((item) => `${item.kind}: ${item.count}`).join(" \xB7 ");
  return { total, detail: top };
}
function describeGoals(goalStates = [], goalSummary) {
  if (goalSummary && (0, import_lang_tools2.tof)(goalSummary) === "string") {
    return { label: goalSummary, detail: "" };
  }
  if (!(0, import_lang_tools2.is_array)(goalStates) || goalStates.length === 0) {
    return {
      label: "No planner goals yet.",
      detail: "Planner goals will appear once intelligent crawling begins."
    };
  }
  const total = goalStates.length;
  const completed = goalStates.filter((goal) => goal && goal.completed).length;
  const active = goalStates.filter((goal) => goal && !goal.completed).slice(0, 2);
  const detail = active.map((goal) => {
    const pct = Math.round((Number(goal.progress) || 0) * 100);
    return `${goal.description || goal.id || "Goal"}: ${pct}%`;
  }).join(" \xB7 ");
  return {
    label: `${completed}/${total} complete`,
    detail: detail || "All planner goals completed."
  };
}
function describeCoverage(coverage) {
  if (!coverage || (0, import_lang_tools2.tof)(coverage) !== "object") {
    return { pct: null, detail: "" };
  }
  let pct = null;
  if ((0, import_lang_tools2.tof)(coverage.coveragePct) === "number") {
    pct = coverage.coveragePct;
  } else if ((0, import_lang_tools2.tof)(coverage.visitedCoveragePct) === "number") {
    pct = coverage.visitedCoveragePct;
  }
  if (pct != null && pct <= 1) {
    pct *= 100;
  }
  let detail = "";
  if (coverage.expected != null) {
    const seeded = coverage.seeded != null ? coverage.seeded : coverage.visited;
    detail = `${seeded ?? 0} of ${coverage.expected} expected hubs`;
  } else if (coverage.seeded != null) {
    detail = `${coverage.seeded} hubs seeded`;
  }
  return { pct, detail };
}
function describeQueueMix(queueHeatmap) {
  if (!queueHeatmap || (0, import_lang_tools2.tof)(queueHeatmap) !== "object" || !queueHeatmap.cells) {
    return { label: "Queue idle", detail: "Queue telemetry not yet available." };
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
    return { label: "Queue idle", detail: "No pending URLs in planner heatmap." };
  }
  const parts = Object.entries(totals).filter(([, value]) => value > 0).map(([key, value]) => `${key} ${Math.round(value / total * 100)}%`);
  let detail = "";
  if (queueHeatmap.depthBuckets) {
    const buckets = Object.entries(queueHeatmap.depthBuckets).map(([depth, count]) => ({ depth, count: Number(count) || 0 })).filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count);
    if (buckets.length) {
      const [top] = buckets;
      detail = `Depth focus ${top.depth}: ${top.count}`;
    }
  }
  return {
    label: parts.join(" \xB7 "),
    detail: detail || "Queue telemetry updated."
  };
}
function mergeHighlights(extras = {}, details = {}) {
  const highlights = [];
  const analysisHighlights = (0, import_lang_tools2.is_array)(extras.analysisHighlights) ? extras.analysisHighlights : (0, import_lang_tools2.is_array)(details.analysisHighlights) ? details.analysisHighlights : [];
  if (analysisHighlights.length) {
    highlights.push(...analysisHighlights.filter(Boolean));
  }
  if (details.seededHubs && details.seededHubs.sample) {
    highlights.push(`Seeded hubs sample: ${details.seededHubs.sample.slice(0, 2).join(", ")}`);
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
      const sectionLabels = navigation.focusSections.slice(0, 2).map((entry) => entry.section).filter(Boolean);
      if (sectionLabels.length) {
        pieces.push(`Focus: ${sectionLabels.join(", ")}`);
      }
    }
    highlights.push(pieces.join(" \xB7 "));
  }
  return highlights.slice(0, 6);
}
function registerReducers(store) {
  store.register("crawl/setType", (_state, type) => ({ crawlType: type || "" }));
  store.register("insights/reset", (state, payload = {}) => {
    const hint = payload.hint || initialState.insights.hint;
    return {
      insights: { ...(0, import_lang_tools2.clone)(initialState.insights), hint },
      diagrams: { ...state.diagrams, queueHeatmapData: null }
    };
  });
  store.register("insights/update", (state, payload = {}) => {
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
      if (Array.isArray(seeded.sample) && seeded.sample.length) seededDetailParts.push(`sample: ${seeded.sample.slice(0, 2).join(", ")}`);
    }
    return {
      insights: {
        ...prev,
        coverage: coverageInfo.pct,
        coverageDetail: coverageInfo.detail,
        seededHubs: seededCount,
        seededDetail: seededDetailParts.join(" \xB7 "),
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
  store.register("timeline/milestone:add", (state, entry) => {
    const list = Array.isArray(state.milestones) ? state.milestones.slice(0, 119) : [];
    return {
      milestones: [entry, ...list]
    };
  });
  store.register("timeline/planner:add", (state, entry) => {
    const list = Array.isArray(state.plannerTimeline) ? state.plannerTimeline.slice(0, 149) : [];
    return {
      plannerTimeline: [entry, ...list]
    };
  });
  store.register("pipeline/reset", () => ({
    pipeline: {
      analysis: (0, import_lang_tools2.clone)(PIPELINE_DEFAULTS.analysis),
      planner: (0, import_lang_tools2.clone)(PIPELINE_DEFAULTS.planner),
      execution: (0, import_lang_tools2.clone)(PIPELINE_DEFAULTS.execution)
    }
  }));
  store.register("pipeline/patch", (state, patch) => ({
    pipeline: mergePipeline(state.pipeline || initialState.pipeline, patch)
  }));
  store.register("patterns/reset", () => ({
    patternInsights: createInitialPatternInsightsState()
  }));
  store.register("patterns/addEvent", (state, payload = {}) => {
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
      lastStage: event.stage || prev.summary?.lastStage || "",
      lastStatus: event.status || prev.summary?.lastStatus || "",
      lastHomepageSource: event.homepageSource || prev.summary?.lastHomepageSource || "",
      lastNotModified: event.notModified,
      lastHadError: event.hadError,
      lastContextHost: event.contextHost || prev.summary?.lastContextHost || "",
      lastSummary: event.summary || prev.summary?.lastSummary || "",
      lastSectionsSample: event.sections.slice(0, 6),
      lastHintsSample: event.articleHints.slice(0, 6),
      uniqueSections,
      uniqueHints,
      topSections,
      topHints,
      homepageSourceCounts
    };
    const logEntry = createPatternLogEntry(event);
    const log = [logEntry, ...Array.isArray(prev.log) ? prev.log : []].slice(0, MAX_PATTERN_LOG_LENGTH);
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

// src/ui/public/index/jsgui/dataModel.js
var import_lang_tools5 = __toESM(require_lang());

// src/ui/public/index/jsgui/events.js
var import_lang_tools3 = __toESM(require_lang());
function createEventHub() {
  const listeners = /* @__PURE__ */ new Map();
  let counter3 = 0;
  function on(event, handler, options = {}) {
    if ((0, import_lang_tools3.tof)(handler) !== "function") {
      throw new TypeError("Event handler must be a function");
    }
    const key = `${event}:${++counter3}`;
    if (!listeners.has(event)) {
      listeners.set(event, /* @__PURE__ */ new Map());
    }
    const bucket = listeners.get(event);
    let wrapped = handler;
    if (options.once) {
      wrapped = (payload, meta) => {
        off();
        handler(payload, meta);
      };
    }
    bucket.set(key, wrapped);
    let active = true;
    function off() {
      if (!active) return;
      active = false;
      if (!listeners.has(event)) return;
      const store = listeners.get(event);
      store.delete(key);
      if (store.size === 0) {
        listeners.delete(event);
      }
    }
    return off;
  }
  function emit(event, payload, meta = {}) {
    const store = listeners.get(event);
    if (!store || store.size === 0) return;
    const txFromMeta = (() => {
      if (meta && (0, import_lang_tools3.tof)(meta) === "object" && meta.tx !== void 0) {
        return meta.tx;
      }
      if (payload && (0, import_lang_tools3.tof)(payload) === "object" && payload.tx !== void 0) {
        return payload.tx;
      }
      return void 0;
    })();
    const preparedPayload = (() => {
      if (payload && (0, import_lang_tools3.tof)(payload) === "object") {
        if (txFromMeta !== void 0 && payload.tx !== txFromMeta) {
          return { ...payload, tx: txFromMeta };
        }
        return payload;
      }
      if (txFromMeta === void 0) {
        return payload;
      }
      return { value: payload, tx: txFromMeta };
    })();
    const descriptor = {
      event,
      tx: txFromMeta,
      payload: preparedPayload
    };
    for (const handler of Array.from(store.values())) {
      try {
        handler(preparedPayload, descriptor);
      } catch (err) {
        console.error("[eventHub] handler error", err);
      }
    }
  }
  function clear() {
    listeners.clear();
  }
  return {
    on,
    emit,
    clear
  };
}

// src/ui/public/index/jsgui/tx.js
var import_lang_tools4 = __toESM(require_lang());
var counter2 = 0;
function nextCounter() {
  counter2 = (counter2 + 1) % 2147483647;
  return counter2 || nextCounter();
}
function createTx(prefix = "tx") {
  const stamp = Date.now().toString(36);
  const id = nextCounter().toString(36);
  return `${prefix}-${stamp}-${id}`;
}

// src/ui/public/index/jsgui/dataModel.js
function cloneValue(value) {
  if ((0, import_lang_tools5.is_array)(value)) {
    return value.slice();
  }
  if (value && (0, import_lang_tools5.tof)(value) === "object") {
    return { ...value };
  }
  return value;
}
var DataModel = class {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._events = createEventHub();
  }
  get(prop) {
    if ((0, import_lang_tools5.tof)(prop) === "undefined") {
      return { ...this._state };
    }
    return this._state[prop];
  }
  set(prop, value, options = {}) {
    if (prop && (0, import_lang_tools5.tof)(prop) === "object" && !(0, import_lang_tools5.is_array)(prop)) {
      return this.replace(prop, options);
    }
    if ((0, import_lang_tools5.tof)(prop) !== "string") {
      throw new TypeError("DataModel.set requires a property name string");
    }
    const previous = this._state[prop];
    const same = Object.is(previous, value);
    if (same && !options.force) {
      return previous;
    }
    const tx = options.tx || createTx();
    const stored = options.mutate ? value : cloneValue(value);
    this._state[prop] = stored;
    if (!options.silent) {
      const payload = { name: prop, value: stored, previous, model: this, tx };
      const meta = { tx };
      this._events.emit("change", payload, meta);
      this._events.emit(`change:${prop}`, payload, meta);
    }
    return stored;
  }
  update(prop, updater, options = {}) {
    if (typeof updater !== "function") {
      throw new TypeError("DataModel.update requires an updater function");
    }
    const current = this.get(prop);
    const next = updater(current);
    return this.set(prop, next, options);
  }
  replace(next = {}, options = {}) {
    const tx = options.tx || createTx();
    const keys = /* @__PURE__ */ new Set([
      ...Object.keys(this._state),
      ...Object.keys(next)
    ]);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        if (Object.prototype.hasOwnProperty.call(this._state, key)) {
          const previous = this._state[key];
          delete this._state[key];
          if (!options.silent) {
            const payload = { name: key, value: void 0, previous, removed: true, model: this, tx };
            const meta = { tx };
            this._events.emit("change", payload, meta);
            this._events.emit(`change:${key}`, payload, meta);
          }
        }
      } else {
        this.set(key, next[key], { ...options, force: options.force ?? true, tx });
      }
    }
    return this;
  }
  on(event, handler) {
    return this._events.on(event, handler);
  }
  onChange(prop, handler) {
    return this._events.on(`change:${prop}`, handler);
  }
  emit(event, payload) {
    this._events.emit(event, payload);
  }
  snapshot() {
    return { ...this._state };
  }
  clear() {
    this._state = {};
    this._events.clear();
  }
};

// src/ui/public/index/controls/baseControl.js
function createControl({
  id = nanoid("control"),
  activate,
  update,
  deactivate,
  initialData,
  initialView
} = {}) {
  if (activate && typeof activate !== "function") {
    throw new TypeError("activate must be a function");
  }
  if (update && typeof update !== "function") {
    throw new TypeError("update must be a function");
  }
  if (deactivate && typeof deactivate !== "function") {
    throw new TypeError("deactivate must be a function");
  }
  let isActive = false;
  const events = createEventHub();
  const dataModel = new DataModel(initialData);
  const viewModel = new DataModel(initialView);
  const control = {
    id,
    dataModel,
    viewModel,
    on: events.on,
    emit: events.emit,
    activate(context) {
      if (isActive) return;
      if (activate) activate({ control, context });
      isActive = true;
      events.emit("activate", { control, context });
    },
    update(context) {
      if (!isActive) {
        if (activate) activate({ control, context });
        isActive = true;
        events.emit("activate", { control, context });
      }
      if (update) update({ control, context });
      events.emit("update", { control, context });
    },
    deactivate(context) {
      if (!isActive) return;
      if (deactivate) deactivate({ control, context });
      isActive = false;
      events.emit("deactivate", { control, context });
    }
  };
  return control;
}

// src/ui/public/index/jsgui/derivedBinding.js
var import_lang_tools6 = __toESM(require_lang());
function ensureArray(value) {
  if ((0, import_lang_tools6.is_array)(value)) return value;
  if (value == null) return [];
  return [value];
}
function readValues(model, props) {
  const snapshot = {};
  for (const prop of props) {
    snapshot[prop] = typeof model.get === "function" ? model.get(prop) : void 0;
  }
  return snapshot;
}
function createDerivedBinding({
  source,
  inputs,
  derive,
  target,
  targetProp,
  targetOptions,
  apply,
  immediate = true,
  txFactory = createTx
}) {
  if (!source || typeof source.onChange !== "function") {
    throw new TypeError("createDerivedBinding requires a source DataModel with onChange");
  }
  if (typeof derive !== "function") {
    throw new TypeError("createDerivedBinding requires a derive function");
  }
  const props = ensureArray(inputs);
  if (props.length === 0) {
    throw new Error("createDerivedBinding requires at least one input property");
  }
  let currentTx = null;
  let stopped = false;
  const writer = (() => {
    if ((0, import_lang_tools6.tof)(apply) === "function") {
      return apply;
    }
    if (!target || (0, import_lang_tools6.tof)(target.set) !== "function") {
      return null;
    }
    return (value, meta) => {
      const tx = meta.tx;
      const baseOptions = { force: true, ...targetOptions || {}, tx };
      if ((0, import_lang_tools6.tof)(targetProp) === "string") {
        target.set(targetProp, value, baseOptions);
      } else if ((0, import_lang_tools6.tof)(target.replace) === "function" && value && (0, import_lang_tools6.tof)(value) === "object") {
        target.replace(value, baseOptions);
      } else {
        target.set("value", value, baseOptions);
      }
    };
  })();
  function evaluate(payload = {}) {
    if (stopped) return;
    if (payload && payload.tx && payload.tx === currentTx) {
      return;
    }
    const tx = txFactory();
    currentTx = tx;
    const values = readValues(source, props);
    const result = derive({ values, payload, source, tx });
    if (result !== void 0 && writer) {
      writer(result, { tx, payload });
    }
    currentTx = null;
  }
  const unsubscribes = props.map((prop) => {
    if (typeof source.onChange === "function") {
      return source.onChange(prop, (payload) => evaluate(payload));
    }
    return () => {
    };
  });
  if (immediate) {
    evaluate({ initial: true });
  }
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const unsubscribe of unsubscribes) {
        try {
          if ((0, import_lang_tools6.tof)(unsubscribe) === "function") unsubscribe();
        } catch (err) {
          console.error("[derivedBinding] failed to unsubscribe", err);
        }
      }
    }
  };
}

// src/ui/public/index/controls/timelineControl.js
function clearElement(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}
function groupByDay(items) {
  const groups = /* @__PURE__ */ new Map();
  for (const entry of items) {
    const ts = entry.timestamp || entry.ts || Date.now();
    const date = new Date(ts);
    const key = Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}
function renderTimelineEntry(entry) {
  const item = document.createElement("article");
  item.className = "timeline-card";
  if (entry.kind) {
    item.dataset.kind = entry.kind;
  }
  const header = document.createElement("header");
  header.className = "timeline-card__head";
  const badge = document.createElement("span");
  badge.className = entry.badgeClass || "badge badge-neutral";
  badge.textContent = entry.title || "event";
  header.appendChild(badge);
  if (entry.meta) {
    const meta = document.createElement("span");
    meta.className = "timeline-card__meta muted";
    meta.textContent = entry.meta;
    header.appendChild(meta);
  }
  const stamp = document.createElement("time");
  stamp.dateTime = new Date(entry.timestamp || Date.now()).toISOString();
  stamp.title = formatTimestamp(entry.timestamp);
  stamp.className = "timeline-card__time muted";
  stamp.textContent = formatRelativeTime(entry.timestamp);
  header.appendChild(stamp);
  item.appendChild(header);
  if (entry.detail) {
    const detail = document.createElement("p");
    detail.className = "timeline-card__detail";
    detail.textContent = entry.detail;
    item.appendChild(detail);
  }
  if (entry.diagram instanceof SVGElement) {
    const svgWrapper = document.createElement("div");
    svgWrapper.className = "timeline-card__diagram";
    svgWrapper.appendChild(entry.diagram);
    item.appendChild(svgWrapper);
  }
  if (Array.isArray(entry.actions) && entry.actions.length) {
    const actions = document.createElement("div");
    actions.className = "timeline-card__actions";
    for (const action of entry.actions) {
      const btn = document.createElement("a");
      btn.textContent = action.label;
      btn.href = action.href || "#";
      if (action.target) btn.target = action.target;
      if (action.rel) btn.rel = action.rel;
      btn.className = action.className || "timeline-action";
      actions.appendChild(btn);
    }
    item.appendChild(actions);
  }
  return item;
}
function ensureArray2(value) {
  return Array.isArray(value) ? value : [];
}
function createTimelineControl({ store, element, stateKey, emptyMessage = "No items yet." }) {
  if (!element) {
    throw new Error(`timeline control missing element for ${stateKey}`);
  }
  let unsubscribe = null;
  function renderGroups(groups) {
    clearElement(element);
    if (!Array.isArray(groups) || groups.length === 0) {
      const span = document.createElement("div");
      span.className = "timeline-empty muted";
      span.textContent = emptyMessage;
      element.appendChild(span);
      return;
    }
    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "timeline-day";
      const dayHeader = document.createElement("h4");
      dayHeader.textContent = group.label;
      dayHeader.className = "timeline-day__label";
      section.appendChild(dayHeader);
      const list = document.createElement("div");
      list.className = "timeline-day__entries";
      for (const entry of group.entries) {
        list.appendChild(renderTimelineEntry(entry));
      }
      section.appendChild(list);
      element.appendChild(section);
    }
  }
  const control = createControl({
    id: `timeline:${stateKey}`,
    initialData: { entries: [] },
    initialView: { groups: [], hasEntries: false },
    activate({ control: ctrl }) {
      const current = store.getState();
      ctrl.dataModel.set("entries", ensureArray2(current[stateKey] || []), { force: true });
      unsubscribe = store.subscribe(({ state }) => {
        ctrl.dataModel.set("entries", ensureArray2(state[stateKey] || []));
      });
    },
    update({ control: ctrl, context }) {
      const state = context && context.state ? context.state : {};
      ctrl.dataModel.set("entries", ensureArray2(state[stateKey] || []));
    },
    deactivate() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    }
  });
  createDerivedBinding({
    source: control.dataModel,
    inputs: "entries",
    target: control.viewModel,
    derive({ values }) {
      const entries = ensureArray2(values.entries);
      const grouped = groupByDay(entries);
      return {
        groups: grouped,
        hasEntries: grouped.length > 0
      };
    }
  });
  control.viewModel.onChange("groups", ({ value }) => {
    renderGroups(Array.isArray(value) ? value : []);
  });
  control.viewModel.onChange("hasEntries", ({ value }) => {
    const hasEntries = Boolean(value);
    element.classList.toggle("muted", !hasEntries);
    element.dataset.hasEntries = hasEntries ? "1" : "0";
  });
  return control;
}

// src/ui/public/index/controls/insightsControl.js
var import_lang_tools7 = __toESM(require_lang());

// src/ui/public/index/svg/queueHeatmap.js
var TYPE_ORDER = ["article", "hub", "other"];
function sumRow(counts) {
  return TYPE_ORDER.reduce((sum, type) => sum + (Number(counts?.[type]) || 0), 0);
}
function createRect(svg, { x, y, width, height, fill, title }) {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", fill);
  if (title) {
    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
    titleEl.textContent = title;
    rect.appendChild(titleEl);
  }
  svg.appendChild(rect);
  return rect;
}
function palette(type) {
  switch (type) {
    case "article":
      return "#2563eb";
    case "hub":
      return "#22a07b";
    default:
      return "#6b7280";
  }
}
function buildQueueHeatmapDiagram(heatmap) {
  if (!heatmap || typeof heatmap !== "object" || !heatmap.cells) {
    return null;
  }
  const rowEntries = Object.entries(heatmap.cells).map(([origin, counts]) => ({ origin, total: sumRow(counts), counts })).filter((row) => row.total > 0).sort((a, b) => b.total - a.total).slice(0, 6);
  if (rowEntries.length === 0) {
    return null;
  }
  const width = 260;
  const rowHeight = 18;
  const padding = 4;
  const height = rowEntries.length * (rowHeight + padding) + padding;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.classList.add("heatmap-svg");
  let y = padding;
  for (const row of rowEntries) {
    let x = padding;
    for (const type of TYPE_ORDER) {
      const value = Number(row.counts?.[type]) || 0;
      if (!value) continue;
      const w = Math.max(6, value / row.total * (width - padding * 2));
      createRect(svg, {
        x,
        y,
        width: w,
        height: rowHeight,
        fill: palette(type),
        title: `${row.origin} \xB7 ${type} ${value}`
      });
      x += w;
    }
    y += rowHeight + padding;
  }
  return {
    svg,
    summary: `${rowEntries[0].origin}: ${rowEntries[0].total}`
  };
}

// src/ui/public/index/controls/insightsControl.js
function setText(el, value) {
  if (!el) return;
  el.textContent = value ?? "";
}
function renderList(el, items, formatter) {
  if (!el) return;
  el.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "No highlights yet.";
    el.appendChild(span);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = formatter ? formatter(item) : String(item);
    el.appendChild(li);
  }
}
function updateQueueHeatmap(el, heatmapData) {
  if (!el) return;
  el.innerHTML = "";
  const diagram = buildQueueHeatmapDiagram(heatmapData);
  if (diagram) {
    el.appendChild(diagram.svg);
  } else {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "Queue telemetry not yet available.";
    el.appendChild(span);
  }
}
function extractRelevantState(state) {
  if (!state) {
    return { insights: null, diagrams: null, crawlType: "" };
  }
  return {
    insights: state.insights || null,
    diagrams: state.diagrams || null,
    crawlType: state.crawlType || ""
  };
}
function createInsightsControl({ store, elements }) {
  const {
    panel,
    hint,
    coverage,
    coverageDetail,
    hubs,
    hubsDetail,
    problems,
    problemsDetail,
    goals,
    goalsDetail,
    queueMix,
    queueMixDetail,
    highlightsList,
    heatmapContainer
  } = elements;
  let unsubscribe = null;
  const control = createControl({
    id: "insights-panel",
    initialData: extractRelevantState(store.getState()),
    initialView: {}
  });
  const applyView = (insights, diagrams, crawlType) => {
    const hasInsights = !!insights;
    const hasData = Boolean(insights && insights.updatedAt);
    const panelVisible = crawlType === "intelligent" || hasData;
    if (panel) {
      setElementVisibility(panel, panelVisible);
      panel.dataset.hasData = hasData ? "1" : "0";
    }
    if (hint) {
      hint.textContent = insights?.hint || "Insights appear once planner telemetry streams in.";
    }
    if (coverage) {
      const pct = insights?.coverage;
      coverage.textContent = (0, import_lang_tools7.tof)(pct) === "number" ? `${pct.toFixed(1)}%` : "\u2014";
    }
    setText(coverageDetail, insights?.coverageDetail || "");
    if (hubs) {
      const val = insights?.seededHubs;
      hubs.textContent = val != null ? formatNumber(val) : "\u2014";
    }
    setText(hubsDetail, insights?.seededDetail || "");
    if (problems) {
      problems.textContent = insights?.problemsTotal != null ? formatNumber(insights.problemsTotal) : "0";
    }
    setText(problemsDetail, insights?.problemsDetail || "");
    if (goals) {
      goals.textContent = insights?.goals ?? "\u2014";
    }
    setText(goalsDetail, insights?.goalsDetail || "");
    if (queueMix) {
      queueMix.textContent = insights?.queueMix ?? "\u2014";
    }
    setText(queueMixDetail, insights?.queueMixDetail || "");
    if (highlightsList) {
      const highlights = Array.isArray(insights?.highlights) ? insights.highlights.slice(0, 6) : [];
      renderList(highlightsList, highlights);
    }
    updateQueueHeatmap(heatmapContainer, diagrams?.queueHeatmapData || null);
    if (panel) {
      panel.dataset.mode = crawlType || "";
    }
  };
  createDerivedBinding({
    source: control.dataModel,
    inputs: ["insights", "diagrams", "crawlType"],
    derive({ values }) {
      return {
        insights: values.insights || null,
        diagrams: values.diagrams || null,
        crawlType: values.crawlType || ""
      };
    },
    apply(result) {
      applyView(result.insights, result.diagrams, result.crawlType);
    }
  });
  control.on("activate", ({ control: ctrl }) => {
    const initial = extractRelevantState(store.getState());
    ctrl.dataModel.replace(initial, { force: true });
    unsubscribe = store.subscribe(({ state }) => {
      ctrl.dataModel.replace(extractRelevantState(state));
    });
  });
  control.on("update", ({ control: ctrl, context }) => {
    const state = context && context.state ? context.state : null;
    if (state) {
      ctrl.dataModel.replace(extractRelevantState(state));
    }
  });
  control.on("deactivate", () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });
  return control;
}

// src/ui/public/index/svg/pipelineStatus.js
var STAGES = [
  { key: "analysis", label: "Analysis" },
  { key: "planner", label: "Planner" },
  { key: "execution", label: "Execution" }
];
var STATUS_COLORS = {
  idle: "#9ca3af",
  running: "#2563eb",
  ready: "#22a07b",
  applied: "#22a07b",
  pending: "#f59e0b",
  blocked: "#ef4444",
  failed: "#ef4444",
  error: "#ef4444"
};
function createText(svg, text, x, y) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
  el.textContent = text;
  el.setAttribute("x", String(x));
  el.setAttribute("y", String(y));
  el.setAttribute("text-anchor", "middle");
  el.setAttribute("dominant-baseline", "middle");
  el.setAttribute("class", "pipeline-svg__label");
  svg.appendChild(el);
  return el;
}
function createCircle(svg, { cx, cy, r, fill, stroke, title }) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(r));
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", stroke);
  circle.setAttribute("stroke-width", "2");
  if (title) {
    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
    titleEl.textContent = title;
    circle.appendChild(titleEl);
  }
  svg.appendChild(circle);
  return circle;
}
function createConnector(svg, x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", "#d1d5db");
  line.setAttribute("stroke-width", "2");
  svg.appendChild(line);
  return line;
}
function buildPipelineDiagram(pipelineState) {
  if (!pipelineState || typeof pipelineState !== "object") {
    return null;
  }
  const width = 320;
  const height = 80;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.classList.add("pipeline-svg");
  const radius = 20;
  const gap = (width - radius * 2 * STAGES.length) / (STAGES.length + 1);
  const cy = height / 2;
  const positions = STAGES.map((stage, index) => {
    const cx = gap + radius + index * (radius * 2 + gap);
    return { ...stage, cx };
  });
  for (let i = 0; i < positions.length - 1; i += 1) {
    createConnector(svg, positions[i].cx + radius, cy, positions[i + 1].cx - radius, cy);
  }
  for (const stage of positions) {
    const state = pipelineState[stage.key] || {};
    const status = state.status || "idle";
    const fill = STATUS_COLORS[status] || STATUS_COLORS.idle;
    createCircle(svg, {
      cx: stage.cx,
      cy,
      r: radius,
      fill,
      stroke: "#1f2937",
      title: `${stage.label}: ${state.statusLabel || status}`
    });
    createText(svg, stage.label, stage.cx, cy);
  }
  return svg;
}

// src/ui/public/index/controls/pipelineControl.js
function createPipelineControl({ store, dom, formatters }) {
  const view = createPipelineView(dom, formatters);
  const { diagramContainer } = dom;
  let unsubscribe = null;
  function renderDiagram(pipeline) {
    if (!diagramContainer) return;
    diagramContainer.innerHTML = "";
    const svg = buildPipelineDiagram(pipeline);
    if (svg) {
      diagramContainer.appendChild(svg);
    }
  }
  function applyPipelineState(pipeline) {
    if (!pipeline || typeof pipeline !== "object") return;
    view.resetPipelineState();
    view.updatePipeline(pipeline);
    renderDiagram(pipeline);
  }
  const control = createControl({
    id: "pipeline-control",
    initialData: { pipeline: store.getState().pipeline || {} }
  });
  control.dataModel.onChange("pipeline", ({ value }) => {
    applyPipelineState(value);
  });
  const initial = control.dataModel.get("pipeline");
  if (initial) {
    applyPipelineState(initial);
  }
  control.on("activate", ({ control: ctrl }) => {
    applyPipelineState(ctrl.dataModel.get("pipeline"));
    unsubscribe = store.subscribe(({ state }) => {
      if (state.pipeline) {
        ctrl.dataModel.set("pipeline", state.pipeline);
      }
    });
  });
  control.on("update", ({ control: ctrl, context }) => {
    const state = context && context.state ? context.state : null;
    if (state && state.pipeline) {
      ctrl.dataModel.set("pipeline", state.pipeline);
    }
  });
  control.on("deactivate", () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });
  return Object.assign(control, {
    resetPipelineState: view.resetPipelineState,
    getAnalysisState: view.getAnalysisState,
    persistAnalysisHistory: view.persistAnalysisHistory,
    renderAnalysisHistory: view.renderAnalysisHistory,
    buildAnalysisHighlights: view.buildAnalysisHighlights,
    renderAnalysisHighlights: view.renderAnalysisHighlights,
    updatePipeline: view.updatePipeline
  });
}

// src/ui/public/index/controls/patternInsightsControl.js
function ensureArray3(value) {
  return Array.isArray(value) ? value : [];
}
function clearElement2(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}
function renderBadge(text, className = "badge badge-neutral") {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}
function renderTopList(listEl, items, emptyLabel) {
  if (!listEl) return;
  clearElement2(listEl);
  if (!Array.isArray(items) || items.length === 0) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = emptyLabel;
    listEl.appendChild(span);
    return;
  }
  for (const entry of items) {
    const item = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = entry.label;
    item.appendChild(code);
    const count = document.createElement("span");
    count.className = "muted";
    count.textContent = ` \xB7 ${formatNumber(entry.count)}`;
    item.appendChild(count);
    listEl.appendChild(item);
  }
}
function renderSourceList(listEl, counts) {
  if (!listEl) return;
  clearElement2(listEl);
  const entries = Object.entries(counts || {}).filter(([, count]) => Number.isFinite(count) && count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "No homepage fetches recorded yet.";
    listEl.appendChild(span);
    return;
  }
  for (const [label, count] of entries) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.appendChild(strong);
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = ` \xB7 ${formatNumber(count)}`;
    item.appendChild(meta);
    listEl.appendChild(item);
  }
}
function renderLog(listEl, entries) {
  if (!listEl) return;
  clearElement2(listEl);
  const items = ensureArray3(entries).slice(0, 20);
  if (listEl.classList) {
    listEl.classList.toggle("muted", items.length === 0);
  }
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "timeline-empty muted";
    empty.textContent = "No pattern events yet.";
    listEl.appendChild(empty);
    return;
  }
  for (const entry of items) {
    const card = document.createElement("article");
    card.className = "pattern-log-entry";
    if (entry.source) {
      card.dataset.source = entry.source;
    }
    if (entry.stage) {
      card.dataset.stage = entry.stage;
    }
    const head = document.createElement("header");
    head.className = "pattern-log-entry__head";
    const badgeLabel = entry.stage || entry.label || entry.source || "pattern";
    const badge = renderBadge(badgeLabel, "badge badge-neutral");
    head.appendChild(badge);
    const meta = document.createElement("span");
    meta.className = "pattern-log-entry__meta muted";
    const metaParts = [];
    if (entry.status) metaParts.push(entry.status);
    if (Number.isFinite(entry.sectionCount)) metaParts.push(`sections ${entry.sectionCount}`);
    if (Number.isFinite(entry.articleHintsCount)) metaParts.push(`hints ${entry.articleHintsCount}`);
    if (entry.homepageSource) metaParts.push(`source ${entry.homepageSource}`);
    if (entry.notModified) metaParts.push("not-modified");
    if (entry.hadError) metaParts.push("error");
    if (metaParts.length) {
      meta.textContent = metaParts.join(" \xB7 ");
      head.appendChild(meta);
    }
    const time = document.createElement("time");
    const ts = entry.timestamp || Date.now();
    time.className = "pattern-log-entry__time muted";
    time.dateTime = new Date(ts).toISOString();
    time.title = formatTimestamp(ts);
    time.textContent = formatRelativeTime(ts);
    head.appendChild(time);
    card.appendChild(head);
    const body = document.createElement("div");
    body.className = "pattern-log-entry__body";
    if (entry.summary) {
      const summary = document.createElement("p");
      summary.className = "pattern-log-entry__summary";
      summary.textContent = entry.summary;
      body.appendChild(summary);
    } else if (entry.message) {
      const summary = document.createElement("p");
      summary.className = "pattern-log-entry__summary";
      summary.textContent = entry.message;
      body.appendChild(summary);
    }
    if (Array.isArray(entry.sections) && entry.sections.length) {
      const sectionsRow = document.createElement("div");
      sectionsRow.className = "pattern-log-entry__row";
      const label = document.createElement("span");
      label.className = "pattern-log-entry__label muted";
      label.textContent = "Sections:";
      sectionsRow.appendChild(label);
      const list = document.createElement("span");
      list.className = "pattern-log-entry__chips";
      for (const section of entry.sections.slice(0, 6)) {
        const chip = document.createElement("span");
        chip.className = "pattern-chip";
        chip.textContent = section;
        list.appendChild(chip);
      }
      sectionsRow.appendChild(list);
      body.appendChild(sectionsRow);
    }
    if (Array.isArray(entry.articleHints) && entry.articleHints.length) {
      const hintsRow = document.createElement("div");
      hintsRow.className = "pattern-log-entry__row";
      const label = document.createElement("span");
      label.className = "pattern-log-entry__label muted";
      label.textContent = "Hints:";
      hintsRow.appendChild(label);
      const list = document.createElement("span");
      list.className = "pattern-log-entry__chips";
      for (const hint of entry.articleHints.slice(0, 6)) {
        const chip = document.createElement("span");
        chip.className = "pattern-chip pattern-chip--hint";
        chip.textContent = hint;
        list.appendChild(chip);
      }
      hintsRow.appendChild(list);
      body.appendChild(hintsRow);
    }
    if (entry.details && Object.keys(entry.details).length) {
      const detailRow = document.createElement("div");
      detailRow.className = "pattern-log-entry__row pattern-log-entry__row--details";
      const label = document.createElement("span");
      label.className = "pattern-log-entry__label muted";
      label.textContent = "Details:";
      detailRow.appendChild(label);
      const pre = document.createElement("pre");
      pre.className = "pattern-log-entry__details";
      const text = JSON.stringify(entry.details, null, 2);
      pre.textContent = text.length > 280 ? `${text.slice(0, 277)}\u2026` : text;
      detailRow.appendChild(pre);
      body.appendChild(detailRow);
    }
    card.appendChild(body);
    listEl.appendChild(card);
  }
}
function extractPatternState(state) {
  return {
    summary: state?.patternInsights?.summary || null,
    log: Array.isArray(state?.patternInsights?.log) ? state.patternInsights.log : [],
    crawlType: state?.crawlType || ""
  };
}
function createPatternInsightsControl({ store, elements }) {
  const {
    panel,
    hint,
    totalCount,
    uniqueSections,
    uniqueHints,
    lastSummary,
    lastStage,
    lastUpdated,
    topSectionsList,
    topHintsList,
    sourceList,
    logContainer
  } = elements;
  let unsubscribe = null;
  const control = createControl({
    id: "pattern-insights-panel",
    initialData: extractPatternState(store.getState()),
    initialView: {}
  });
  function applyView(summary, log, crawlType) {
    const hasData = !!summary && summary.totalEvents > 0;
    const panelVisible = crawlType === "intelligent" || hasData;
    if (panel) {
      setElementVisibility(panel, panelVisible);
      panel.dataset.hasData = hasData ? "1" : "0";
      panel.dataset.mode = crawlType || "";
    }
    if (hint) {
      hint.textContent = hasData ? `Last update ${formatRelativeTime(summary.lastEventAt)} (${formatTimestamp(summary.lastEventAt)})` : "Pattern discovery events appear once the intelligent planner runs.";
    }
    if (totalCount) {
      totalCount.textContent = formatNumber(summary?.totalEvents || 0);
    }
    if (uniqueSections) {
      uniqueSections.textContent = formatNumber(summary?.uniqueSections || 0);
    }
    if (uniqueHints) {
      uniqueHints.textContent = formatNumber(summary?.uniqueHints || 0);
    }
    if (lastSummary) {
      lastSummary.textContent = summary?.lastSummary || "No pattern activity yet.";
    }
    if (lastStage) {
      const parts = [];
      if (summary?.lastStage) parts.push(summary.lastStage);
      if (summary?.lastStatus) parts.push(summary.lastStatus);
      if (summary?.lastHomepageSource) parts.push(`source ${summary.lastHomepageSource}`);
      lastStage.textContent = parts.length ? parts.join(" \xB7 ") : "\u2014";
    }
    if (lastUpdated) {
      if (summary?.lastEventAt) {
        lastUpdated.textContent = formatRelativeTime(summary.lastEventAt);
        lastUpdated.title = formatTimestamp(summary.lastEventAt);
      } else {
        lastUpdated.textContent = "\u2014";
        lastUpdated.title = "";
      }
    }
    renderTopList(topSectionsList, summary?.topSections || [], "No sections inferred yet.");
    renderTopList(topHintsList, summary?.topHints || [], "No article hints detected yet.");
    renderSourceList(sourceList, summary?.homepageSourceCounts || {});
    renderLog(logContainer, log);
  }
  createDerivedBinding({
    source: control.dataModel,
    inputs: ["summary", "log", "crawlType"],
    derive({ values }) {
      return {
        summary: values.summary || null,
        log: ensureArray3(values.log),
        crawlType: values.crawlType || ""
      };
    },
    apply(result) {
      applyView(result.summary, result.log, result.crawlType);
    }
  });
  control.on("activate", ({ control: ctrl }) => {
    const initial = extractPatternState(store.getState());
    ctrl.dataModel.replace(initial, { force: true });
    unsubscribe = store.subscribe(({ state }) => {
      ctrl.dataModel.replace(extractPatternState(state));
    });
  });
  control.on("update", ({ control: ctrl, context }) => {
    const state = context && context.state ? context.state : null;
    if (state) {
      ctrl.dataModel.replace(extractPatternState(state));
    }
  });
  control.on("deactivate", () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });
  return control;
}

// src/ui/public/index/app.js
function ensureControls(controls) {
  for (const control of controls) {
    if (control && typeof control.activate === "function") {
      control.activate();
    }
  }
}
function createMilestoneEntry(payload) {
  if (!payload) return null;
  const timestamp = payload.ts || payload.timestamp || Date.now();
  const detail = payload.details && typeof payload.details === "object" ? JSON.stringify(payload.details).slice(0, 400) : payload.details || "";
  return {
    id: payload.id || `milestone-${timestamp}`,
    title: payload.kind || "milestone",
    meta: [payload.scope, payload.message].filter(Boolean).join(" \u2014 "),
    detail,
    timestamp,
    badgeClass: "badge badge-ok"
  };
}
function createPlannerEntry(payload) {
  if (!payload) return null;
  const timestamp = payload.ts || payload.timestamp || Date.now();
  const status = payload.status || "started";
  const duration = Number.isFinite(payload.durationMs) ? `${payload.durationMs}ms` : null;
  const meta = [status, duration].filter(Boolean).join(" \xB7 ");
  const detail = payload.details && typeof payload.details === "object" ? JSON.stringify(payload.details).slice(0, 400) : payload.details || "";
  const badge = status === "failed" ? "badge badge-bad" : status === "completed" ? "badge badge-ok" : "badge badge-neutral";
  return {
    id: payload.id || `planner-${timestamp}`,
    title: payload.stage || "stage",
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
function createApp({ elements, formatters }) {
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
  const patternInsightsControl = elements.patterns ? createPatternInsightsControl({
    store,
    elements: elements.patterns
  }) : null;
  const milestonesControl = createTimelineControl({
    store,
    element: elements.milestones,
    stateKey: "milestones",
    emptyMessage: "No milestones yet."
  });
  const plannerControl = createTimelineControl({
    store,
    element: elements.planner,
    stateKey: "plannerTimeline",
    emptyMessage: "Planner telemetry appears when intelligent crawls run."
  });
  ensureControls([pipelineControl, insightsControl, patternInsightsControl, milestonesControl, plannerControl]);
  const actions = {
    resetInsights(hint) {
      store.dispatch("insights/reset", { hint });
      store.dispatch("pipeline/reset");
    },
    resetPatternInsights() {
      store.dispatch("patterns/reset");
    },
    applyInsights(details, extras) {
      store.dispatch("insights/update", createInsightsPayload(details, extras));
      if (extras && extras.pipelinePatch) {
        store.dispatch("pipeline/patch", extras.pipelinePatch);
      }
    },
    pushMilestone(payload) {
      const entry = createMilestoneEntry(payload);
      if (entry) {
        store.dispatch("timeline/milestone:add", entry);
      }
    },
    pushPlannerStage(payload) {
      const entry = createPlannerEntry(payload);
      if (entry) {
        store.dispatch("timeline/planner:add", entry);
      }
    },
    patchPipeline(patch) {
      store.dispatch("pipeline/patch", patch);
    },
    recordPatternEvent(event) {
      store.dispatch("patterns/addEvent", event);
    },
    setCrawlType(type) {
      store.dispatch("crawl/setType", type);
    },
    captureAnalysisHistory(history) {
      if (!Array.isArray(history)) return;
      const latest = history[0];
      if (!latest) return;
      store.dispatch("timeline/milestone:add", {
        id: `analysis-${latest.ts}`,
        title: "analysis",
        meta: latest.summary,
        detail: `Updated ${formatTimestamp(latest.ts)}`,
        timestamp: latest.ts,
        badgeClass: "badge badge-neutral"
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
export {
  createApp
};
