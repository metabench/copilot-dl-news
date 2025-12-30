"use strict";

const { inferTopic, getSeverity } = require("./telemetryRenderers");
const { renderProgressTreeHtml } = require("./progressBars");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(ts) {
  if (!ts) return "";
  const s = String(ts);
  // typical: 2025-12-21T12:34:56.789Z
  if (s.length >= 19 && s.includes("T")) return s.slice(11, 19);
  return s;
}

function safeStringify(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return String(data);
  }
}

function safeUrlLabel(url) {
  if (!url) return "";
  try {
    const u = new URL(String(url));
    const host = u.hostname || "";
    const path = (u.pathname || "/").replace(/\/$/, "");
    const shortPath = path.length > 42 ? path.slice(0, 41) + "…" : path;
    return host + shortPath;
  } catch (_) {
    const s = String(url);
    return s.length > 60 ? s.slice(0, 59) + "…" : s;
  }
}

function pickFetchStatus(data) {
  if (!data || typeof data !== "object") return null;
  const status =
    Number.isFinite(data.status) ? data.status :
    Number.isFinite(data.httpStatus) ? data.httpStatus :
    Number.isFinite(data.statusCode) ? data.statusCode :
    null;
  return status;
}

function pickFetchDurationMs(data) {
  if (!data || typeof data !== "object") return null;
  const ms =
    Number.isFinite(data.durationMs) ? data.durationMs :
    Number.isFinite(data.elapsedMs) ? data.elapsedMs :
    Number.isFinite(data.latencyMs) ? data.latencyMs :
    null;
  return ms;
}

function createTelemetryPanel(spec) {
  if (!spec || typeof spec !== "object") throw new Error("panel spec required");
  if (!spec.id || typeof spec.id !== "string") throw new Error("panel.id required");
  if (!spec.title || typeof spec.title !== "string") throw new Error("panel.title required");

  return {
    id: spec.id,
    title: spec.title,
    order: typeof spec.order === "number" ? spec.order : 100,
    match: typeof spec.match === "function" ? spec.match : () => false,
    reduce: typeof spec.reduce === "function" ? spec.reduce : (state) => state,
    render:
      typeof spec.render === "function"
        ? spec.render
        : () => ({
            summaryHtml: "<span class=\"cw-panel__empty\">(no data yet)</span>",
            severity: "info"
          })
  };
}

function createByTypePanel({ id, title, types, order, reduce, render }) {
  const typeSet = new Set(Array.isArray(types) ? types : []);
  return createTelemetryPanel({
    id,
    title,
    order,
    match: (evt) => Boolean(evt && typeof evt.type === "string" && typeSet.has(evt.type)),
    reduce,
    render
  });
}

function createByTopicPanel({ id, title, topics, order, reduce, render }) {
  const topicSet = new Set(Array.isArray(topics) ? topics : []);
  return createTelemetryPanel({
    id,
    title,
    order,
    match: (evt) => {
      const topic = inferTopic(evt);
      return Boolean(topic && topicSet.has(topic));
    },
    reduce,
    render
  });
}

function getDefaultTelemetryPanels() {
  const progressPanel = createByTypePanel({
    id: "crawl-progress",
    title: "Crawl Progress",
    order: 10,
    types: ["crawl:progress"],
    reduce: (state, evt) => {
      const next = { ...(state || {}) };
      next.lastEvent = evt;
      next.updatedAt = evt?.timestamp || new Date().toISOString();
      // Prefer evt.data but tolerate plain fields.
      next.progress = evt?.data && typeof evt.data === "object" ? evt.data : { ...evt };
      return next;
    },
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(waiting for crawl:progress)</span>", severity: "debug" };
      }

      const p = state.progress || {};
      const visited = Number.isFinite(p.visited) ? p.visited : null;
      const queued = Number.isFinite(p.queued) ? p.queued : null;
      const errors = Number.isFinite(p.errors) ? p.errors : null;
      const articles = Number.isFinite(p.articles) ? p.articles : null;
      const phase = typeof p.phase === "string" ? p.phase : "";

      const parts = [];
      if (visited !== null) parts.push(`Visited: <b>${visited}</b>`);
      if (queued !== null) parts.push(`Queued: <b>${queued}</b>`);
      if (articles !== null) parts.push(`Articles: <b>${articles}</b>`);
      if (errors !== null) parts.push(`Errors: <b>${errors}</b>`);
      const summary = `${phase ? `<span class=\"cw-panel__pill\">${escapeHtml(phase)}</span> ` : ""}${parts.join(" · ")}`;

      const when = formatTime(state.updatedAt);
      const bodyHtml =
        `<div class=\"cw-panel__meta\">Last: ${escapeHtml(when) || "(unknown)"}</div>` +
        `<pre class=\"cw-panel__pre\">${escapeHtml(safeStringify(p))}</pre>`;

      return {
        summaryHtml: summary || "<span class=\"cw-panel__empty\">(progress payload empty)</span>",
        bodyHtml,
        severity: getSeverity(state.lastEvent)
      };
    }
  });

  const lastErrorPanel = createTelemetryPanel({
    id: "last-error",
    title: "Latest Error",
    order: 20,
    match: (evt) => {
      const sev = getSeverity(evt);
      if (sev === "error" || sev === "critical") return true;
      const t = evt?.type;
      return typeof t === "string" && (t.endsWith(":failed") || t.endsWith(":error"));
    },
    reduce: (state, evt) => ({
      lastEvent: evt,
      updatedAt: evt?.timestamp || new Date().toISOString()
    }),
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no errors)</span>", severity: "info" };
      }
      const evt = state.lastEvent;
      const msg = evt.message || "(no message)";
      const when = formatTime(state.updatedAt);
      return {
        summaryHtml: `<span class=\"cw-panel__pill cw-panel__pill--bad\">${escapeHtml(evt.type)}</span> ${escapeHtml(msg)}`,
        bodyHtml:
          `<div class=\"cw-panel__meta\">Last: ${escapeHtml(when) || "(unknown)"}</div>` +
          `<pre class=\"cw-panel__pre\">${escapeHtml(safeStringify(evt.data || evt))}</pre>`,
        severity: getSeverity(evt)
      };
    }
  });

  const topicOverviewPanel = createTelemetryPanel({
    id: "topic-overview",
    title: "Topics Overview",
    order: 30,
    match: (evt) => Boolean(evt && typeof evt.type === "string" && evt.type.startsWith("crawl:")),
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.counts = next.counts && typeof next.counts === "object" ? { ...next.counts } : {};
      const topic = inferTopic(evt) || "unknown";
      next.counts[topic] = (next.counts[topic] || 0) + 1;
      next.lastAt = evt?.timestamp || new Date().toISOString();
      next.lastTopic = topic;
      return next;
    },
    render: (state) => {
      const counts = state?.counts || {};
      const topics = Object.keys(counts);
      if (topics.length === 0) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no crawl telemetry yet)</span>", severity: "debug" };
      }

      topics.sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
      const top = topics.slice(0, 6);
      const chips = top
        .map((t) => `<span class=\"cw-panel__chip\">${escapeHtml(t)} <span class=\"cw-panel__chip-count\">${counts[t]}</span></span>`)
        .join(" ");

      const when = formatTime(state.lastAt);
      const bodyHtml =
        `<div class=\"cw-panel__meta\">Last: ${escapeHtml(when) || "(unknown)"} (${escapeHtml(state.lastTopic || "")})</div>` +
        `<pre class=\"cw-panel__pre\">${escapeHtml(safeStringify(counts))}</pre>`;

      return {
        summaryHtml: chips,
        bodyHtml,
        severity: "info"
      };
    }
  });

  const fetchActivityPanel = createTelemetryPanel({
    id: "fetch-activity",
    title: "Fetch / Cache",
    order: 35,
    match: (evt) => {
      const topic = inferTopic(evt);
      if (topic === "fetch" || topic === "cache") return true;
      const t = evt?.type;
      return typeof t === "string" && (t.startsWith("crawl:fetch:") || t.startsWith("crawl:cache:"));
    },
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.lastEvent = evt;
      next.updatedAt = evt?.timestamp || new Date().toISOString();
      next.counts = next.counts && typeof next.counts === "object"
        ? { ...next.counts }
        : { success: 0, retry: 0, softFailure: 0, error: 0, cacheHit: 0 };

      const type = typeof evt?.type === "string" ? evt.type : "";
      if (type === "crawl:cache:hit") next.counts.cacheHit += 1;
      if (type === "crawl:fetch:success") next.counts.success += 1;
      if (type === "crawl:fetch:retry") next.counts.retry += 1;
      if (type === "crawl:fetch:soft-failure") next.counts.softFailure += 1;
      if (type === "crawl:fetch:error") next.counts.error += 1;

      const data = evt?.data && typeof evt.data === "object" ? evt.data : {};
      const url = safeUrlLabel(data.url || data.finalUrl || data.requestUrl || "");
      const status = pickFetchStatus(data);
      const ms = pickFetchDurationMs(data);

      next.last = {
        at: next.updatedAt,
        type: type || null,
        url,
        status,
        ms,
        attempt: Number.isFinite(data.attempt) ? data.attempt : null
      };

      next.events = Array.isArray(next.events) ? next.events.slice(-19) : [];
      next.events.push({
        timestamp: evt?.timestamp,
        type: evt?.type,
        message: evt?.message,
        url,
        status,
        ms
      });

      return next;
    },
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: '<span class="cw-panel__empty">(no fetch activity yet)</span>', severity: "debug" };
      }

      const counts = state.counts || {};
      const ok = counts.success || 0;
      const cache = counts.cacheHit || 0;
      const retry = (counts.retry || 0) + (counts.softFailure || 0);
      const err = counts.error || 0;

      const chips =
        `<span class="cw-panel__chip">ok <span class="cw-panel__chip-count">${escapeHtml(ok)}</span></span>` +
        `<span class="cw-panel__chip">cache <span class="cw-panel__chip-count">${escapeHtml(cache)}</span></span>` +
        `<span class="cw-panel__chip">retry <span class="cw-panel__chip-count">${escapeHtml(retry)}</span></span>` +
        `<span class="cw-panel__chip">err <span class="cw-panel__chip-count">${escapeHtml(err)}</span></span>`;

      const when = formatTime(state.updatedAt);
      const last = state.last || {};
      const lastBits = [];
      if (last.type) lastBits.push(last.type.replace(/^crawl:/, ""));
      if (last.status != null) lastBits.push(`status=${last.status}`);
      if (last.ms != null) lastBits.push(`${last.ms}ms`);
      if (last.url) lastBits.push(last.url);

      const tail = (state.events || []).slice(-10);
      const lines = tail
        .map((e) => {
          const t = formatTime(e.timestamp);
          const bits = [];
          if (e.type) bits.push(String(e.type).replace(/^crawl:/, ""));
          if (e.status != null) bits.push(`status=${e.status}`);
          if (e.ms != null) bits.push(`${e.ms}ms`);
          if (e.url) bits.push(e.url);
          const msg = e.message ? ` — ${e.message}` : "";
          return `${t} ${bits.join(" ")}${msg}`.trim();
        })
        .join("\n");

      const body = {
        counts: state.counts,
        last: state.last
      };

      const bodyHtml =
        `<div class="cw-panel__meta">Last: ${escapeHtml(when) || "(unknown)"}</div>` +
        `<pre class="cw-panel__pre">${escapeHtml(lines || lastBits.join(" ") || "(no lines)")}</pre>` +
        `<pre class="cw-panel__pre" style="margin-top:6px">${escapeHtml(safeStringify(body))}</pre>`;

      const sev = err > 0 ? "warn" : getSeverity(state.lastEvent);
      return { summaryHtml: chips, bodyHtml, severity: sev };
    }
  });

  const throttlingPanel = createByTopicPanel({
    id: "throttling",
    title: "Throttling / Rate Limits",
    order: 40,
    topics: ["rate", "rate-limit", "throttle", "robots", "politeness"],
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.events = Array.isArray(next.events) ? next.events.slice(-11) : [];
      next.events.push({
        timestamp: evt?.timestamp,
        type: evt?.type,
        message: evt?.message,
        data: evt?.data
      });
      next.lastEvent = evt;
      return next;
    },
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no throttling events yet)</span>", severity: "debug" };
      }

      const sev = getSeverity(state.lastEvent);
      const tail = (state.events || []).slice(-8);
      const lines = tail
        .map((e) => {
          const t = formatTime(e.timestamp);
          const msg = e.message ? ` — ${e.message}` : "";
          return `${t} ${e.type || ""}${msg}`.trim();
        })
        .join("\n");

      return {
        summaryHtml: `<span class=\"cw-panel__pill\">${escapeHtml(inferTopic(state.lastEvent))}</span> ${escapeHtml(state.lastEvent.message || state.lastEvent.type)}`,
        bodyHtml: `<pre class=\"cw-panel__pre\">${escapeHtml(lines || "(no lines)")}</pre>`,
        severity: sev
      };
    }
  });

  const budgetsPanel = createByTopicPanel({
    id: "budgets",
    title: "Budgets",
    order: 50,
    topics: ["budget"],
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.lastEvent = evt;
      next.updatedAt = evt?.timestamp || new Date().toISOString();

      const data = evt?.data && typeof evt.data === "object" ? evt.data : {};
      next.limits = data.limits && typeof data.limits === "object" ? { ...data.limits } : next.limits;
      next.spent = data.spent && typeof data.spent === "object" ? { ...data.spent } : next.spent;
      next.percentages = data.percentages && typeof data.percentages === "object" ? { ...data.percentages } : next.percentages;
      if (typeof data.exhausted === "boolean") next.exhausted = data.exhausted;
      if (evt?.type === "crawl:budget:exhausted") next.exhausted = true;

      next.events = Array.isArray(next.events) ? next.events.slice(-11) : [];
      next.events.push({
        timestamp: evt?.timestamp,
        type: evt?.type,
        message: evt?.message,
        exhausted: Boolean(next.exhausted),
        percentages: next.percentages
      });

      return next;
    },
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no budget events yet)</span>", severity: "debug" };
      }

      const limits = state.limits && typeof state.limits === "object" ? state.limits : {};
      const spent = state.spent && typeof state.spent === "object" ? state.spent : {};
      const percentages = state.percentages && typeof state.percentages === "object" ? state.percentages : {};

      const keys = Array.from(new Set([...Object.keys(limits), ...Object.keys(spent), ...Object.keys(percentages)]));
      keys.sort((a, b) => (percentages[b] || 0) - (percentages[a] || 0) || a.localeCompare(b));

      const top = keys.slice(0, 4);
      const chips = top
        .map((k) => {
          const pct = percentages[k] != null ? `${percentages[k]}%` : "";
          return `<span class=\"cw-panel__chip\">${escapeHtml(k)} <span class=\"cw-panel__chip-count\">${escapeHtml(pct)}</span></span>`;
        })
        .join(" ");

      const when = formatTime(state.updatedAt);
      const bodyHtml =
        `<div class=\"cw-panel__meta\">Last: ${escapeHtml(when) || "(unknown)"}${state.exhausted ? " · exhausted" : ""}</div>` +
        `<pre class=\"cw-panel__pre\">${escapeHtml(safeStringify({ limits, spent, percentages }))}</pre>`;

      const sev = state.exhausted ? "warn" : getSeverity(state.lastEvent);
      return {
        summaryHtml:
          `${state.exhausted ? '<span class="cw-panel__pill cw-panel__pill--bad">EXHAUSTED</span> ' : ""}` +
          (chips || escapeHtml(state.lastEvent.message || state.lastEvent.type)),
        bodyHtml,
        severity: sev
      };
    }
  });

  const goalsPanel = createByTopicPanel({
    id: "goals",
    title: "Goals",
    order: 60,
    topics: ["goal"],
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.lastEvent = evt;
      next.updatedAt = evt?.timestamp || new Date().toISOString();
      next.goals = next.goals && typeof next.goals === "object" ? { ...next.goals } : {};

      const data = evt?.data && typeof evt.data === "object" ? evt.data : {};
      const goalId = data.goalId || data.id || data.goal_id || null;
      const goalType = data.goalType || data.type || data.goal_type || null;
      const target = data.target != null ? data.target : null;
      const current = data.current != null ? data.current : null;

      if (goalId || goalType) {
        const key = String(goalId || goalType);
        next.goals[key] = {
          id: goalId ? String(goalId) : null,
          type: goalType ? String(goalType) : null,
          target,
          current,
          satisfied: evt?.type === "crawl:goal:satisfied" ? true : undefined,
          updatedAt: next.updatedAt
        };
      }

      next.events = Array.isArray(next.events) ? next.events.slice(-11) : [];
      next.events.push({ timestamp: evt?.timestamp, type: evt?.type, message: evt?.message, data: evt?.data });

      return next;
    },
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no goal events yet)</span>", severity: "debug" };
      }

      const goals = state.goals && typeof state.goals === "object" ? state.goals : {};
      const items = Object.values(goals);
      const satisfied = items.filter((g) => g && g.satisfied === true).length;

      const chips = items
        .slice(0, 4)
        .map((g) => {
          const name = g?.type || g?.id || "goal";
          const ratio = g?.current != null && g?.target != null ? `${g.current}/${g.target}` : "";
          return `<span class=\"cw-panel__chip\">${escapeHtml(name)} <span class=\"cw-panel__chip-count\">${escapeHtml(ratio)}</span></span>`;
        })
        .join(" ");

      const when = formatTime(state.updatedAt);
      const bodyHtml =
        `<div class=\"cw-panel__meta\">Last: ${escapeHtml(when) || "(unknown)"}</div>` +
        `<pre class=\"cw-panel__pre\">${escapeHtml(safeStringify(goals))}</pre>`;

      return {
        summaryHtml: `<span class=\"cw-panel__pill\">${satisfied}/${items.length}</span> ${chips || escapeHtml(state.lastEvent.message || state.lastEvent.type)}`,
        bodyHtml,
        severity: getSeverity(state.lastEvent)
      };
    }
  });

  const workersPanel = createByTopicPanel({
    id: "workers",
    title: "Workers",
    order: 70,
    topics: ["worker"],
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.lastEvent = evt;
      next.updatedAt = evt?.timestamp || new Date().toISOString();

      next.counts = next.counts && typeof next.counts === "object" ? { ...next.counts } : { spawned: 0, stopped: 0, scaled: 0 };
      next.current = typeof next.current === "number" ? next.current : null;

      if (evt?.type === "crawl:worker:spawned") next.counts.spawned += 1;
      if (evt?.type === "crawl:worker:stopped") next.counts.stopped += 1;
      if (evt?.type === "crawl:worker:scaled") {
        next.counts.scaled += 1;
        const data = evt?.data && typeof evt.data === "object" ? evt.data : {};
        if (Number.isFinite(data.to)) next.current = data.to;
        next.lastScaling = {
          from: data.from,
          to: data.to,
          direction: data.direction,
          reason: data.reason,
          at: next.updatedAt
        };
      }

      next.events = Array.isArray(next.events) ? next.events.slice(-11) : [];
      next.events.push({ timestamp: evt?.timestamp, type: evt?.type, message: evt?.message, data: evt?.data });
      return next;
    },
    render: (state) => {
      if (!state?.lastEvent) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no worker events yet)</span>", severity: "debug" };
      }
      const when = formatTime(state.updatedAt);
      const current = state.current != null ? `Workers: ${state.current}` : "Workers: (unknown)";
      const counts = state.counts || {};
      const summary =
        `<span class=\"cw-panel__pill\">${escapeHtml(current)}</span> ` +
        `<span class=\"cw-panel__chip\">spawned <span class=\"cw-panel__chip-count\">${escapeHtml(counts.spawned || 0)}</span></span> ` +
        `<span class=\"cw-panel__chip\">stopped <span class=\"cw-panel__chip-count\">${escapeHtml(counts.stopped || 0)}</span></span>`;

      const lines = (state.events || [])
        .slice(-8)
        .map((e) => {
          const t = formatTime(e.timestamp);
          const msg = e.message ? ` — ${e.message}` : "";
          return `${t} ${e.type || ""}${msg}`.trim();
        })
        .join("\n");

      const body = {
        current: state.current,
        counts: state.counts,
        lastScaling: state.lastScaling
      };

      const bodyHtml =
        `<div class=\"cw-panel__meta\">Last: ${escapeHtml(when) || "(unknown)"}</div>` +
        `<pre class=\"cw-panel__pre\">${escapeHtml(lines || "(no lines)")}</pre>` +
        `<pre class=\"cw-panel__pre\" style=\"margin-top:6px\">${escapeHtml(safeStringify(body))}</pre>`;

      return {
        summaryHtml: summary,
        bodyHtml,
        severity: getSeverity(state.lastEvent)
      };
    }
  });

  const progressTreePanel = createTelemetryPanel({
    id: "progress-tree",
    title: "Nested Progress",
    order: 15,
    match: (evt) => {
      const topic = inferTopic(evt);
      if (topic === "progress-tree") return true;
      const t = evt?.type;
      return typeof t === "string" && t.startsWith("crawl:progress-tree:");
    },
    reduce: (state, evt) => {
      const next = state && typeof state === "object" ? { ...state } : {};
      next.lastEvent = evt;
      next.updatedAt = evt?.timestamp || new Date().toISOString();
      next.tree = evt?.data && typeof evt.data === "object" ? evt.data : null;
      return next;
    },
    render: (state) => {
      if (!state?.lastEvent || !state?.tree) {
        return { summaryHtml: "<span class=\"cw-panel__empty\">(no nested progress yet)</span>", severity: "debug" };
      }

      const tree = state.tree;
      const html = renderProgressTreeHtml(tree, { maxDepth: 4 });
      const sev = getSeverity(state.lastEvent);
      const summary =
        tree?.root?.label
          ? `<span class=\"cw-panel__pill\">${escapeHtml(tree.root.label)}</span>`
          : `<span class=\"cw-panel__pill\">progress-tree</span>`;

      return {
        summaryHtml: summary,
        bodyHtml: html,
        severity: sev
      };
    }
  });

  return [
    progressPanel,
    progressTreePanel,
    lastErrorPanel,
    topicOverviewPanel,
    fetchActivityPanel,
    throttlingPanel,
    budgetsPanel,
    goalsPanel,
    workersPanel
  ];
}

function normalizeTelemetryPanels(telemetryPanels) {
  if (!telemetryPanels) return null;
  if (!Array.isArray(telemetryPanels)) return null;

  const out = [];
  for (const p of telemetryPanels) {
    if (!p || typeof p !== "object") continue;
    if (!p.id || typeof p.id !== "string") continue;
    if (!p.title || typeof p.title !== "string") continue;
    out.push(createTelemetryPanel(p));
  }

  // stable ordering
  out.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
  return out;
}

module.exports = {
  createTelemetryPanel,
  createByTypePanel,
  createByTopicPanel,
  getDefaultTelemetryPanels,
  normalizeTelemetryPanels
};
