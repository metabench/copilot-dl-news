import "./chunk-WKJXK6IH.js";
import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/crawlControls.js
var import_lang_tools = __toESM(require_lang());
async function performCrawl(elements, formElements, actions) {
  console.log("[performCrawl] ===== FUNCTION CALLED =====");
  console.log("[performCrawl] elements:", elements);
  console.log("[performCrawl] formElements:", formElements);
  console.log("[performCrawl] actions:", actions);
  const prevLabel = elements.startBtn.textContent;
  console.log("[performCrawl] Previous button label:", prevLabel);
  try {
    const selectedType = formElements.crawlType?.value || "";
    console.log("[performCrawl] Selected crawl type:", selectedType);
    console.log("[performCrawl] About to call actions.resetInsights()");
    actions.resetInsights();
    console.log("[performCrawl] resetInsights() completed");
    if (selectedType) {
      console.log("[performCrawl] Calling actions.setCrawlType with:", selectedType);
      actions.setCrawlType(selectedType);
      console.log("[performCrawl] setCrawlType() completed");
    } else {
      actions.setCrawlType("");
    }
    console.log("[performCrawl] Starting to build request body");
    const body = {};
    console.log("[performCrawl] About to parse numeric fields");
    const numericFields = [
      { key: "depth", element: formElements.depth, required: true },
      { key: "maxPages", element: formElements.maxPages },
      { key: "concurrency", element: formElements.concurrency, required: true },
      { key: "requestTimeoutMs", element: formElements.requestTimeoutMs },
      { key: "pacerJitterMinMs", element: formElements.pacerJitterMinMs },
      { key: "pacerJitterMaxMs", element: formElements.pacerJitterMaxMs }
    ];
    console.log("[performCrawl] numericFields array created, length:", numericFields.length);
    (0, import_lang_tools.each)(numericFields, (field) => {
      if (!field.element) {
        return;
      }
      if (field.element.value) {
        body[field.key] = parseInt(field.element.value, 10);
      } else if (field.required) {
        body[field.key] = parseInt(field.element.value, 10);
      }
    });
    console.log("[performCrawl] Numeric fields parsed, body so far:", body);
    const stringFields = [
      { key: "refetchIfOlderThan", element: formElements.refetchIfOlderThan },
      { key: "refetchArticleIfOlderThan", element: formElements.refetchArticleIfOlderThan },
      { key: "refetchHubIfOlderThan", element: formElements.refetchHubIfOlderThan }
    ];
    (0, import_lang_tools.each)(stringFields, (field) => {
      if ((0, import_lang_tools.is_defined)(field.element) && field.element.value) {
        body[field.key] = field.element.value;
      }
    });
    if (selectedType) {
      body.crawlType = selectedType;
    }
    if ((0, import_lang_tools.is_defined)(formElements.slowMode)) {
      body.slow = formElements.slowMode.checked;
    }
    const sitemapOnly = (0, import_lang_tools.is_defined)(formElements.sitemapOnly) && formElements.sitemapOnly.checked;
    const useSitemap = (0, import_lang_tools.is_defined)(formElements.useSitemap) && formElements.useSitemap.checked;
    body.useSitemap = sitemapOnly ? true : useSitemap;
    body.sitemapOnly = sitemapOnly;
    const isGazetteerType = selectedType === "gazetteer" || selectedType === "geography" || selectedType === "wikidata";
    if (!isGazetteerType && (0, import_lang_tools.is_defined)(formElements.startUrl)) {
      body.startUrl = formElements.startUrl.value;
    }
    console.log("[performCrawl] About to POST /api/crawl with body:", body);
    const r = await fetch("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    console.log("[performCrawl] Fetch completed. Status:", r.status, "OK:", r.ok);
    let payload = null;
    try {
      payload = await r.json();
      console.log("[performCrawl] Response payload:", payload);
    } catch (parseErr) {
      console.error("[performCrawl] Failed to parse JSON:", parseErr);
    }
    if (!r.ok) {
      const detail = payload?.error || `HTTP ${r.status}`;
      if (r.status === 409) {
        elements.logs.textContent += `
Start: already running (409)
`;
        try {
          elements.progress.textContent = "running (already in progress)\u2026";
          elements.startBtn.textContent = "Running";
          elements.startBtn.disabled = true;
          const until = Date.now() + 4e3;
          (async function poll() {
            try {
              const rs = await fetch("/api/status");
              if (rs.ok) {
                const js = await rs.json();
                if (js.running) {
                  elements.progress.textContent = "running\u2026";
                }
              }
            } catch {
            }
            if (Date.now() < until) setTimeout(poll, 300);
          })();
        } catch (_) {
        }
      } else {
        elements.logs.textContent += `
Start failed: ${detail}
`;
        elements.startBtn.disabled = false;
        elements.startBtn.textContent = prevLabel;
      }
    } else {
      elements.logs.textContent += `
Started: ${JSON.stringify(payload)}
`;
      elements.startBtn.textContent = "Running";
      elements.startBtn.disabled = true;
      if (window.__crawlProgress && typeof window.__crawlProgress.handleCrawlStart === "function") {
        window.__crawlProgress.handleCrawlStart({
          jobId: payload?.jobId || payload?.id || "unknown",
          maxPages: body.maxPages || 0,
          crawlType: body.crawlType || "",
          startUrl: body.startUrl || ""
        });
      }
      try {
        elements.progress.textContent = "starting\u2026 (visited: 0, downloaded: 0, found: 0, saved: 0)";
        actions.updateStartupStatus(null, "Starting crawler\u2026");
        window.__startPollUntil = Date.now() + 4e3;
        (async function pollOnce() {
          try {
            const now = Date.now();
            if (now > (window.__startPollUntil || 0)) return;
            const rs = await fetch("/api/status");
            if (rs.ok) {
              const js = await rs.json();
              if (js && js.running) {
                if ((window.__lastProgress?.visited || 0) === 0) {
                  elements.progress.textContent = "running\u2026 (visited: 0, downloaded: 0, found: 0, saved: 0)";
                }
              }
            }
          } catch (_) {
          }
          setTimeout(pollOnce, 250);
        })();
      } catch (_) {
      }
    }
  } catch (e) {
    elements.logs.textContent += `
Start error: ${e?.message || e}
`;
    elements.startBtn.disabled = false;
    elements.startBtn.textContent = prevLabel;
  }
}
function createCrawlControls({ elements, formElements, actions, formatters }) {
  console.log("[createCrawlControls] ===== FUNCTION ENTRY =====");
  console.log("[createCrawlControls] Received elements:", elements);
  console.log("[createCrawlControls] Received formElements:", formElements);
  console.log("[createCrawlControls] Received actions:", actions);
  const {
    startBtn,
    stopBtn,
    pauseBtn,
    resumeBtn,
    analysisBtn,
    logs,
    progress,
    // Form elements
    crawlType,
    depth,
    maxPages,
    concurrency,
    requestTimeoutMs,
    pacerJitterMinMs,
    pacerJitterMaxMs,
    refetchIfOlderThan,
    refetchArticleIfOlderThan,
    refetchHubIfOlderThan,
    slowMode,
    sitemapOnly,
    useSitemap,
    startUrl,
    // Analysis elements
    analysisLink,
    analysisStatus
  } = elements;
  console.log("[createCrawlControls] Destructured startBtn:", startBtn);
  console.log("[createCrawlControls] startBtn ID:", startBtn?.id);
  console.log("[createCrawlControls] startBtn exists:", !!startBtn);
  if (elements.analysisBtn) {
    elements.analysisBtn.onclick = async () => {
      const prevLabel = elements.analysisBtn.textContent;
      elements.analysisBtn.disabled = true;
      elements.analysisBtn.textContent = "Starting\u2026";
      if (elements.analysisLink) {
        elements.analysisLink.textContent = "Starting analysis\u2026";
      }
      if (elements.analysisStatus) {
        actions.renderAnalysisStatus("Analysis run is starting\u2026");
      }
      const runStartTs = Date.now();
      actions.patchPipeline({
        analysis: {
          status: "running",
          statusLabel: "Running",
          summary: "Manual analysis run starting\u2026",
          lastRun: runStartTs
        }
      });
      try {
        const r = await fetch("/api/analysis/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        let payload = null;
        try {
          payload = await r.json();
        } catch (_) {
        }
        if (!r.ok) {
          const detail = payload && payload.error ? payload.error : `HTTP ${r.status}`;
          if (elements.analysisLink) {
            elements.analysisLink.textContent = `Failed: ${detail}`;
          }
          if (elements.analysisStatus) {
            actions.renderAnalysisStatus(`Analysis start failed: ${detail}`, {
              metrics: [{ label: "Error", value: String(detail) }]
            });
          }
          elements.logs.textContent += `
Analysis start failed: ${detail}
`;
          actions.patchPipeline({
            analysis: {
              status: "failed",
              statusLabel: "Failed",
              summary: `Start failed: ${detail}`
            }
          });
        } else {
          const runId = payload && payload.runId ? String(payload.runId) : "";
          const detailUrl = payload && payload.detailUrl ? String(payload.detailUrl) : runId ? `/analysis/${runId}/ssr` : "";
          actions.renderAnalysisLink(detailUrl, runId);
          try {
            if (detailUrl) localStorage.setItem("analysisLastDetailUrl", detailUrl);
            if (runId) localStorage.setItem("analysisLastRunId", runId);
            localStorage.setItem("analysisLastRunAt", String(Date.now()));
          } catch (_) {
          }
          if (elements.analysisStatus) {
            const stamp = /* @__PURE__ */ new Date();
            const ts = stamp.getTime();
            const metrics = [];
            if (runId) metrics.push({ label: "Run", value: runId });
            metrics.push({
              label: "Started",
              value: formatters.formatRelativeTime(ts),
              title: stamp.toLocaleString()
            });
            actions.renderAnalysisStatus("Analysis run launched.", { metrics });
          }
          elements.logs.textContent += `
Analysis started: ${runId || detailUrl}
`;
          const summary = runId ? `Run ${runId} launched` : "Analysis run launched";
          actions.patchPipeline({
            analysis: {
              status: "running",
              statusLabel: "Running",
              summary
            }
          });
        }
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (elements.analysisLink) {
          elements.analysisLink.textContent = `Failed: ${message}`;
        }
        if (elements.analysisStatus) {
          actions.renderAnalysisStatus(`Last attempt failed: ${message}`, {
            metrics: [{ label: "Error", value: String(message) }],
            muted: false
          });
        }
        elements.logs.textContent += `
Analysis start error: ${message}
`;
        actions.patchPipeline({
          analysis: {
            status: "error",
            statusLabel: "Error",
            summary: `Request failed: ${message}`
          }
        });
      } finally {
        elements.analysisBtn.disabled = false;
        elements.analysisBtn.textContent = prevLabel;
      }
    };
  }
  console.log("[crawlControls] Setting up start button handler");
  console.log("[crawlControls] elements.startBtn:", elements.startBtn);
  console.log("[crawlControls] is_defined(elements.startBtn):", (0, import_lang_tools.is_defined)(elements.startBtn));
  if ((0, import_lang_tools.is_defined)(elements.startBtn)) {
    console.log("[crawlControls] Start button is defined, attaching onclick handler");
    const handler = () => {
      console.log("[crawlControls] ===== START BUTTON CLICKED! =====");
      console.log("[crawlControls] Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
      console.log("[crawlControls] Button element:", elements.startBtn);
      console.log("[crawlControls] Button text before:", elements.startBtn.textContent);
      console.log("[crawlControls] Button disabled before:", elements.startBtn.disabled);
      elements.startBtn.disabled = true;
      elements.startBtn.textContent = "Starting\u2026";
      console.log("[crawlControls] Button text after:", elements.startBtn.textContent);
      console.log("[crawlControls] Button disabled after:", elements.startBtn.disabled);
      console.log("[crawlControls] About to call performCrawl");
      setTimeout(() => {
        console.log("[crawlControls] Timeout fired, calling performCrawl now");
        performCrawl(elements, formElements, actions);
      }, 0);
    };
    elements.startBtn.onclick = handler;
    console.log("[crawlControls] onclick handler attached successfully");
    console.log("[crawlControls] Verifying attachment:", typeof elements.startBtn.onclick);
  } else {
    console.error("[crawlControls] Start button is NOT defined! Cannot attach handler.");
  }
  if ((0, import_lang_tools.is_defined)(elements.stopBtn)) {
    elements.stopBtn.onclick = async () => {
      try {
        const r = await fetch("/api/stop", { method: "POST" });
        let j = null;
        try {
          j = await r.json();
        } catch (_) {
        }
        if (!r.ok) {
          elements.logs.textContent += `
Stop failed: HTTP ${r.status}
`;
        } else {
          elements.logs.textContent += `
Stop requested: ${JSON.stringify(j)}
`;
        }
      } catch (e) {
        elements.logs.textContent += `
Stop error: ${e?.message || e}
`;
      }
    };
  }
  if ((0, import_lang_tools.is_defined)(elements.pauseBtn)) {
    elements.pauseBtn.onclick = async () => {
      try {
        const r = await fetch("/api/pause", { method: "POST" });
        let j = null;
        try {
          j = await r.json();
        } catch (_) {
        }
        if (!r.ok) {
          elements.logs.textContent += `
Pause failed: HTTP ${r.status}
`;
        } else {
          elements.logs.textContent += `
Pause requested: ${JSON.stringify(j)}
`;
          if (j && (j.paused === true || j.ok === true)) {
            elements.pauseBtn.disabled = true;
            elements.resumeBtn.disabled = false;
          }
        }
      } catch (e) {
        elements.logs.textContent += `
Pause error: ${e?.message || e}
`;
      }
    };
  }
  if ((0, import_lang_tools.is_defined)(elements.resumeBtn)) {
    elements.resumeBtn.onclick = async () => {
      try {
        const r = await fetch("/api/resume", { method: "POST" });
        let j = null;
        try {
          j = await r.json();
        } catch (_) {
        }
        if (!r.ok) {
          elements.logs.textContent += `
Resume failed: HTTP ${r.status}
`;
        } else {
          elements.logs.textContent += `
Resume requested: ${JSON.stringify(j)}
`;
          if (j && (j.paused === false || j.ok === true)) {
            elements.pauseBtn.disabled = false;
            elements.resumeBtn.disabled = true;
          }
        }
      } catch (e) {
        elements.logs.textContent += `
Resume error: ${e?.message || e}
`;
      }
    };
  }
  if ((0, import_lang_tools.is_defined)(elements.showLogsCheckbox)) {
    elements.showLogsCheckbox.onchange = (e) => {
      const enabled = e.target.checked;
      localStorage.setItem("showLogs", enabled ? "1" : "0");
      if (!enabled) {
        elements.logs.textContent = 'Logs are disabled. Enable "Show logs" to stream stdout/stderr here.';
      } else {
        elements.logs.textContent = "";
      }
      actions.openEventStream(enabled);
    };
  }
  console.log("[createCrawlControls] ===== FUNCTION EXIT =====");
  console.log("[createCrawlControls] All handlers should be attached now");
  return {
    initialized: true,
    timestamp: Date.now()
  };
}
export {
  createCrawlControls
};
