import {
  formatNumber,
  formatRelativeTime
} from "./chunk-HLEII6OW.js";
import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/analysisHandlers.js
var import_lang_tools = __toESM(require_lang());
function createAnalysisHandlers(deps) {
  const {
    appActions,
    pipelineControl,
    setCrawlType,
    renderAnalysisLink,
    renderAnalysisStatus,
    refreshCoverageMetric,
    getCurrentCrawlType,
    analysisStatus
  } = deps;
  const {
    getAnalysisState,
    renderAnalysisHistory,
    persistAnalysisHistory,
    buildAnalysisHighlights,
    renderAnalysisHighlights
  } = pipelineControl;
  function handleMilestone(m) {
    if (!m) return;
    appActions.pushMilestone(m);
    if (m.kind === "patterns-learned") {
      const tsRaw = m.ts ? Date.parse(m.ts) : Date.now();
      const timestamp = Number.isFinite(tsRaw) ? tsRaw : Date.now();
      const details = m.details && typeof m.details === "object" ? m.details : {};
      const sections = Array.isArray(details.sections) ? details.sections : [];
      const articleHints = Array.isArray(details.articleHints) ? details.articleHints : [];
      const summaryParts = [];
      summaryParts.push(`sections ${sections.length}`);
      if (articleHints.length) summaryParts.push(`hints ${articleHints.length}`);
      const summary = summaryParts.length ? summaryParts.join(" \xB7 ") : m.message || "Patterns inferred";
      appActions.recordPatternEvent({
        source: "milestone",
        stage: "patterns-learned",
        status: "completed",
        label: m.message || "patterns learned",
        summary,
        sections,
        articleHints,
        timestamp,
        details,
        message: m.message,
        contextHost: m.scope || ""
      });
    }
    if (m.kind === "intelligent-completion") {
      const targetType = getCurrentCrawlType() === "discover-structure" ? "discover-structure" : "intelligent";
      setCrawlType(targetType);
      const milestoneTs = m.ts ? Date.parse(m.ts) : Date.now();
      const safeTs = Number.isFinite(milestoneTs) ? milestoneTs : Date.now();
      updateIntelligentInsights(m.details || {}, {
        source: "milestone",
        timestamp: safeTs,
        pipelinePatch: {
          analysis: { status: "applied", statusLabel: "Applied", lastRun: safeTs }
        }
      });
    }
  }
  function handleAnalysisProgress(payload) {
    if (!payload || typeof payload !== "object") return;
    const state = getAnalysisState();
    state.history = Array.isArray(state.history) ? state.history : [];
    const incomingRunId = payload.runId ? String(payload.runId) : null;
    const runId = incomingRunId || state.runId || null;
    const newRunDetected = incomingRunId && incomingRunId !== state.runId;
    if (newRunDetected) state.history = [];
    state.runId = runId;
    const tsRaw = payload.ts != null ? payload.ts : payload.endedAt || payload.startedAt || Date.now();
    const tsParsed = (0, import_lang_tools.tof)(tsRaw) === "number" ? tsRaw : Date.parse(tsRaw);
    const ts = Number.isFinite(tsParsed) ? tsParsed : Date.now();
    const stageLabel = payload.stage ? payload.stage.replace(/[_-]+/g, " ") : "analysis";
    const progressInfo = payload.progress && (0, import_lang_tools.tof)(payload.progress) === "object" ? payload.progress : null;
    let summary = payload.summary;
    if (!summary && progressInfo) {
      const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0);
      if (Number.isFinite(processed) && processed > 0) {
        summary = `${stageLabel} \xB7 processed ${formatNumber(processed)}`;
      }
    }
    if (!summary) {
      summary = payload.status ? `${stageLabel} \xB7 ${payload.status}` : `${stageLabel} update`;
    }
    const highlightState = {
      ...payload.details && typeof payload.details === "object" ? payload.details : {},
      analysisHighlights: Array.isArray(payload.analysisHighlights) ? payload.analysisHighlights : void 0
    };
    const highlightList = buildAnalysisHighlights(highlightState);
    renderAnalysisHighlights(highlightList);
    const signals = Array.isArray(payload.signals) && payload.signals.length ? payload.signals.filter(Boolean).map(String) : highlightList;
    const statusKey = payload.status || (payload.final ? "completed" : "running");
    const statusLabel = statusKey ? statusKey.replace(/[_-]+/g, " ") : "running";
    const detailUrl = runId ? `/analysis/${encodeURIComponent(runId)}/ssr` : state.detailUrl || null;
    const pipelinePatch = {
      analysis: {
        status: statusKey,
        statusLabel: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
        summary,
        signals: signals.slice(0, 5),
        lastRun: payload.final ? ts : state.lastRun || ts,
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
    try {
      window.__analysisState = state;
    } catch (_) {
    }
    if (analysisStatus) {
      const metrics = [];
      if (progressInfo) {
        const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? NaN);
        const saved = Number(progressInfo.saved ?? progressInfo.articlesSaved ?? NaN);
        const found = Number(progressInfo.found ?? progressInfo.articlesFound ?? NaN);
        if (Number.isFinite(processed)) metrics.push({ label: "Processed", value: formatNumber(processed) });
        if (Number.isFinite(saved)) metrics.push({ label: "Saved", value: formatNumber(saved) });
        if (Number.isFinite(found) && (!Number.isFinite(saved) || found !== saved)) {
          metrics.push({ label: "Found", value: formatNumber(found) });
        }
      }
      if (statusLabel) metrics.push({ label: "Status", value: statusLabel });
      if (payload.stage) metrics.push({ label: "Stage", value: stageLabel.charAt(0).toUpperCase() + stageLabel.slice(1) });
      metrics.push({ label: "Updated", value: formatRelativeTime(ts), title: new Date(ts).toLocaleString() });
      if (payload.exit && payload.exit.error) {
        metrics.push({ label: "Error", value: String(payload.exit.error) });
      }
      renderAnalysisStatus(summary, { metrics });
    }
    if (detailUrl) {
      renderAnalysisLink(detailUrl, runId);
      try {
        localStorage.setItem("analysisLastDetailUrl", detailUrl);
        if (runId) localStorage.setItem("analysisLastRunId", runId);
        localStorage.setItem("analysisLastRunAt", String(ts));
      } catch (_) {
      }
    }
    if (payload.details || payload.analysisHighlights) {
      const extras = {
        source: payload.final ? "analysis-final" : "analysis-progress",
        timestamp: ts
      };
      if (Array.isArray(payload.analysisHighlights)) {
        extras.analysisHighlights = payload.analysisHighlights;
      }
      updateIntelligentInsights(payload.details || {}, extras);
    }
  }
  function handlePlannerStage(ev) {
    if (!ev) return;
    const activeType = getCurrentCrawlType() === "discover-structure" ? "discover-structure" : "intelligent";
    setCrawlType(activeType);
    appActions.pushPlannerStage(ev);
    const status = ev.status || "started";
    const statusLabel = status.replace(/[_-]+/g, " ");
    const durationLabel = Number.isFinite(ev.durationMs) ? `${ev.durationMs}ms` : null;
    const summary = [statusLabel, durationLabel].filter(Boolean).join(" \xB7 ");
    const tsRaw = ev.ts ? Date.parse(ev.ts) : Date.now();
    const timestamp = Number.isFinite(tsRaw) ? tsRaw : Date.now();
    const stageResult = ev.details && typeof ev.details === "object" && ev.details.result && typeof ev.details.result === "object" ? ev.details.result : null;
    appActions.patchPipeline({
      planner: {
        status,
        statusLabel: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
        stage: ev.stage || "stage",
        summary: summary || void 0
      }
    });
    if (ev.stage === "targeted-analysis" && status === "started") {
      appActions.patchPipeline({
        analysis: {
          status: "running",
          statusLabel: "Running",
          summary: "Running targeted seed analysis\u2026",
          updatedAt: timestamp
        }
      });
    }
    if (ev.stage === "infer-patterns") {
      const stageDetails = ev.details && typeof ev.details === "object" ? ev.details : {};
      const context = stageDetails.context && typeof stageDetails.context === "object" ? stageDetails.context : {};
      const result = stageDetails.result && typeof stageDetails.result === "object" ? stageDetails.result : stageDetails;
      const sections = Array.isArray(result.sectionsPreview) ? result.sectionsPreview : [];
      const hints = Array.isArray(result.articleHintsPreview) ? result.articleHintsPreview : [];
      const eventTimestamp = ev.ts ? Date.parse(ev.ts) : Date.now();
      const sectionCount = Number.isFinite(result.sectionCount) ? result.sectionCount : sections.length;
      const hintsCount = Number.isFinite(result.articleHintsCount) ? result.articleHintsCount : hints.length;
      const summaryParts = [];
      if (Number.isFinite(sectionCount)) summaryParts.push(`sections ${sectionCount}`);
      if (Number.isFinite(hintsCount) && hintsCount > 0) summaryParts.push(`hints ${hintsCount}`);
      if (result.homepageSource) summaryParts.push(`source ${result.homepageSource}`);
      appActions.recordPatternEvent({
        source: "stage",
        stage: ev.stage,
        status: ev.status,
        timestamp: Number.isFinite(eventTimestamp) ? eventTimestamp : Date.now(),
        durationMs: Number.isFinite(ev.durationMs) ? ev.durationMs : void 0,
        sections,
        sectionCount,
        articleHints: hints,
        articleHintsCount: hintsCount,
        homepageSource: result.homepageSource,
        notModified: !!result.notModified,
        hadError: !!result.hadError,
        summary: summaryParts.length ? summaryParts.join(" \xB7 ") : `Stage ${ev.status || "update"}`,
        details: result,
        contextHost: context.host || ev.scope || ""
      });
    } else if (ev.stage === "navigation-discovery") {
      if (status === "started") {
        appActions.patchPipeline({
          planner: {
            status: "running",
            statusLabel: "Running",
            stage: "Navigation discovery",
            summary: "Mapping site navigation\u2026",
            updatedAt: timestamp
          }
        });
      } else if (status === "completed" && stageResult) {
        const pipelinePatch = stageResult.pipelinePatch && typeof stageResult.pipelinePatch === "object" ? stageResult.pipelinePatch : {
          planner: {
            status: stageResult.navigationSummary && stageResult.navigationSummary.totalLinks ? "ready" : "pending",
            statusLabel: stageResult.navigationSummary && stageResult.navigationSummary.totalLinks ? "Mapped" : "Pending",
            stage: "Navigation discovery",
            summary: Array.isArray(stageResult.analysisHighlights) && stageResult.analysisHighlights.length ? stageResult.analysisHighlights[0] : "Navigation map updated",
            updatedAt: timestamp
          }
        };
        appActions.patchPipeline(pipelinePatch);
        const insightDetails = stageResult.details && typeof stageResult.details === "object" ? stageResult.details : { navigation: stageResult.navigationSummary || {} };
        const extrasPayload = {
          source: "planner-stage",
          timestamp,
          analysisHighlights: Array.isArray(stageResult.analysisHighlights) ? stageResult.analysisHighlights : void 0
        };
        if (pipelinePatch) {
          extrasPayload.pipelinePatch = pipelinePatch;
        }
        updateIntelligentInsights(insightDetails, extrasPayload);
      } else if (status === "failed") {
        appActions.patchPipeline({
          planner: {
            status: "failed",
            statusLabel: "Failed",
            stage: "Navigation discovery",
            summary: stageResult && stageResult.error ? `Navigation failed: ${stageResult.error}` : "Navigation discovery failed"
          }
        });
      }
    } else if (ev.stage === "targeted-analysis") {
      if (status === "completed" && stageResult) {
        const pipelinePatch = stageResult.pipelinePatch && typeof stageResult.pipelinePatch === "object" ? stageResult.pipelinePatch : {
          analysis: {
            status: stageResult.analysedCount ? "ready" : "pending",
            statusLabel: stageResult.analysedCount ? "Targeted" : "Pending",
            summary: Array.isArray(stageResult.analysisHighlights) && stageResult.analysisHighlights.length ? stageResult.analysisHighlights[0] : "Targeted analysis updated",
            signals: Array.isArray(stageResult.topKeywords) ? stageResult.topKeywords.slice(0, 4) : [],
            updatedAt: timestamp,
            lastRun: timestamp
          }
        };
        if (pipelinePatch.analysis) {
          pipelinePatch.analysis.updatedAt = pipelinePatch.analysis.updatedAt || timestamp;
          pipelinePatch.analysis.lastRun = pipelinePatch.analysis.lastRun || timestamp;
        }
        appActions.patchPipeline(pipelinePatch);
      } else if (status === "failed") {
        const errorMessage = stageResult && stageResult.error ? String(stageResult.error) : "Targeted analysis failed";
        appActions.patchPipeline({
          analysis: {
            status: "failed",
            statusLabel: "Failed",
            summary: errorMessage,
            updatedAt: timestamp
          }
        });
      }
    }
    if (ev.details || Array.isArray(ev.goalStates) || Array.isArray(ev.analysisHighlights)) {
      const insightDetails = { ...ev.details && typeof ev.details === "object" ? ev.details : {} };
      if (!insightDetails.goalStates && Array.isArray(ev.goalStates)) {
        insightDetails.goalStates = ev.goalStates;
      }
      if (stageResult && !insightDetails.targetedAnalysis) {
        insightDetails.targetedAnalysis = {
          sampleCount: Number(stageResult.analysedCount) || 0,
          sectionsCovered: Array.isArray(stageResult.sectionsCovered) ? stageResult.sectionsCovered.slice(0, 6) : [],
          avgWordCount: Number(stageResult.avgWordCount) || 0,
          topKeywords: Array.isArray(stageResult.topKeywords) ? stageResult.topKeywords.slice(0, 6) : [],
          samples: Array.isArray(stageResult.samples) ? stageResult.samples.slice(0, 5) : []
        };
      }
      const extrasPayload = {
        source: "planner-stage",
        timestamp,
        analysisHighlights: Array.isArray(ev.analysisHighlights) ? ev.analysisHighlights : void 0
      };
      if (stageResult && stageResult.pipelinePatch) {
        extrasPayload.pipelinePatch = stageResult.pipelinePatch;
      }
      updateIntelligentInsights(insightDetails, extrasPayload);
    }
  }
  function updateIntelligentInsights(details, extras = {}) {
    appActions.applyInsights(details || {}, extras);
    if (extras && extras.pipelinePatch) {
      appActions.patchPipeline(extras.pipelinePatch);
    }
    const coverageSource = details && details.coverage || extras.coverage;
    if (coverageSource && (0, import_lang_tools.tof)(coverageSource) === "object") {
      let pct = null;
      if ((0, import_lang_tools.tof)(coverageSource.coveragePct) === "number") {
        pct = coverageSource.coveragePct;
      } else if ((0, import_lang_tools.tof)(coverageSource.visitedCoveragePct) === "number") {
        pct = coverageSource.visitedCoveragePct;
      }
      if (pct != null && pct <= 1) pct *= 100;
      if (pct != null) {
        appActions.patchPipeline({ execution: { coverage: pct } });
      }
    }
    refreshCoverageMetric();
  }
  return {
    handleMilestone,
    handleAnalysisProgress,
    handlePlannerStage,
    updateIntelligentInsights
  };
}
export {
  createAnalysisHandlers
};
