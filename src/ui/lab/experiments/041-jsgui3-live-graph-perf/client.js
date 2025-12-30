"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { ensure_control_models } = require("jsgui3-html/html-core/control_model_factory");

function toSingleQuoteJson(value) {
	return JSON.stringify(value).replace(/"/g, "'");
}

function decodeDataObject(encoded) {
	if (typeof encoded !== "string") return {};
	const m = encoded.match(/^Data_Object\((.*)\)$/);
	if (!m) return {};
	try {
		return JSON.parse(m[1]);
	} catch {
		return {};
	}
}

function getModelValue(model, key) {
	if (!model || typeof model.get !== "function") return undefined;
	const stored = model.get(key);
	if (stored && stored.__data_value) return stored.value;
	return stored;
}

function coerceInt(value, fallback) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.floor(n));
}

function parseQueryParams() {
	try {
		const u = new URL(window.location.href);
		return u.searchParams;
	} catch {
		return new URLSearchParams();
	}
}

function computeGridPosition(index, width, height) {
	// Deterministic grid packing.
	const pad = 18;
	const cell = 10;
	const usableW = Math.max(1, width - pad * 2);
	const cols = Math.max(1, Math.floor(usableW / cell));
	const x = pad + (index % cols) * cell;
	const y = pad + Math.floor(index / cols) * cell;
	return { x, y };
}

class PerfGraphDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "perf_graph_demo"
		});

		ensure_control_models(this, spec);
		this.add_class("perf-graph-demo");

		if (!spec.el) {
			this.compose();

			// Defaults.
			this.data.model.set("status", "connecting", true);
			this.data.model.set("received", 0, true);
			this.data.model.set("applied", 0, true);
			this.data.model.set("dropped", 0, true);
			this.data.model.set("backlog", 0, true);
			this.data.model.set("fps", 0, true);
			this.data.model.set("maxFrameMs", 0, true);
			this.data.model.set("mode", "batch", true);
			this.data.model.set("totalNodes", 1000, true);
			this.data.model.set("durationMs", 1000, true);
			this.data.model.set("tickMs", 20, true);
			this.data.model.set("maxPerFrame", 120, true);
			this.data.model.set("drawEdges", false, true);

			const params = typeof window === "undefined" ? new URLSearchParams() : null;
			const sseUrl = "/events";

			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON(),
				sseUrl
			});
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "div", __type_name: "div" });
		title.add_class("perf-graph-demo__title");
		title.add_text("Perf Lab 041 — jsgui3 SSR + activation + SSE → rAF batching → Canvas graph");

		const stats = new Control({ context, tagName: "div", __type_name: "div" });
		stats.add_class("perf-graph-demo__stats");
		stats.add_text("status=connecting");

		const canvasWrap = new Control({ context, tagName: "div", __type_name: "div" });
		canvasWrap.add_class("perf-graph-demo__canvas-wrap");

		const canvas = new Control({ context, tagName: "canvas", __type_name: "canvas" });
		canvas.add_class("perf-graph-demo__canvas");
		canvas.dom.attributes.width = "960";
		canvas.dom.attributes.height = "560";

		canvasWrap.add(canvas);

		this.add(title);
		this.add(stats);
		this.add(canvasWrap);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			stats: stats._id(),
			canvas: canvas._id()
		});
	}

	activate(el) {
		super.activate(el);
		if (this.__activatedOnce) return;
		this.__activatedOnce = true;

		ensure_control_models(this, {});

		const root = el || this.dom.el;
		if (!root) return;
		root.setAttribute("data-activated", "1");

		const fields = this._persisted_fields || decodeDataObject(root.getAttribute("data-jsgui-fields"));
		if (fields && fields.encodedDataModel) {
			try {
				this.data.model.fromJSON(fields.encodedDataModel);
			} catch {
				// ignore
			}
		}

		const dataModel = this.data.model;
		const statsEl = this.stats && this.stats.dom ? this.stats.dom.el : root.querySelector(".perf-graph-demo__stats");
		const canvasEl = this.canvas && this.canvas.dom ? this.canvas.dom.el : root.querySelector("canvas.perf-graph-demo__canvas");

		const qp = parseQueryParams();
		dataModel.set("mode", qp.get("mode") || getModelValue(dataModel, "mode") || "batch");
		dataModel.set("totalNodes", coerceInt(qp.get("nodes"), getModelValue(dataModel, "totalNodes") || 1000));
		dataModel.set("durationMs", coerceInt(qp.get("ms"), getModelValue(dataModel, "durationMs") || 1000));
		dataModel.set("tickMs", coerceInt(qp.get("tick"), getModelValue(dataModel, "tickMs") || 20));

		const ctx = canvasEl && canvasEl.getContext ? canvasEl.getContext("2d") : null;
		const width = canvasEl ? canvasEl.width : 960;
		const height = canvasEl ? canvasEl.height : 560;

		const maxPerFrame = getModelValue(dataModel, "maxPerFrame") || 120;

		const queue = [];
		const nodes = [];
		let doneSignal = false;

		// Perf measurement
		const frameSamples = [];
		let lastFpsAt = performance.now();
		let frameCount = 0;
		let maxFrameMs = 0;
		let firstNodeAt = null;
		let finishedAt = null;

		function renderStats() {
			const status = getModelValue(dataModel, "status") || "unknown";
			const received = getModelValue(dataModel, "received") || 0;
			const applied = getModelValue(dataModel, "applied") || 0;
			const backlog = getModelValue(dataModel, "backlog") || 0;
			const fps = getModelValue(dataModel, "fps") || 0;
			const maxFrame = getModelValue(dataModel, "maxFrameMs") || 0;
			const mode = getModelValue(dataModel, "mode") || "batch";
			if (statsEl) {
				statsEl.textContent = `status=${status} mode=${mode} received=${received} applied=${applied} backlog=${backlog} fps≈${fps} maxFrameMs=${maxFrame}`;
			}
		}

		function draw() {
			if (!ctx) return;

			ctx.clearRect(0, 0, width, height);

			// Background
			ctx.fillStyle = "#0b1220";
			ctx.fillRect(0, 0, width, height);

			// Nodes
			ctx.fillStyle = "rgba(122, 162, 255, 0.95)";
			for (let i = 0; i < nodes.length; i += 1) {
				const n = nodes[i];
				ctx.beginPath();
				ctx.arc(n.x, n.y, 2.2, 0, Math.PI * 2);
				ctx.fill();
			}

			// Title overlay
			ctx.fillStyle = "rgba(230, 237, 247, 0.85)";
			ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
			ctx.fillText("Live nodes", 12, 18);
		}

		function maybeFinalize() {
			const applied = getModelValue(dataModel, "applied") || 0;
			const received = getModelValue(dataModel, "received") || 0;
			const backlog = getModelValue(dataModel, "backlog") || 0;
			const totalNodes = getModelValue(dataModel, "totalNodes") || 1000;
			// If we have reached the intended volume, allow completion even if the explicit
			// 'done' SSE event was missed (handler set late, etc).
			if (received >= totalNodes) doneSignal = true;
			if (!doneSignal) return;
			if (applied < totalNodes) return;
			if (backlog > 0) return;
			if (finishedAt != null) return;

			finishedAt = performance.now();

			const dropped = getModelValue(dataModel, "dropped") || 0;

			const summary = {
				totalNodes,
				received,
				applied,
				dropped,
				firstNodeMs: firstNodeAt == null ? null : Math.round(firstNodeAt),
				finishedMs: Math.round(finishedAt),
				maxFrameMs: Math.round(maxFrameMs),
				frameSamples: frameSamples.slice(0, 240)
			};

			window.__PERF_DONE = true;
			window.__PERF_SUMMARY = summary;
			console.log("PERF_SUMMARY", JSON.stringify(summary));
		}

		let rafId = 0;
		const tickFrame = () => {
			const t0 = performance.now();

			// Drain queue in bounded batches.
			let appliedThisFrame = 0;
			while (queue.length && appliedThisFrame < maxPerFrame) {
				const item = queue.shift();
				if (!item || typeof item.id !== "number") continue;
				const pos = computeGridPosition(item.id, width, height);
				nodes.push({ id: item.id, x: pos.x, y: pos.y });
				appliedThisFrame += 1;
			}

			if (appliedThisFrame) {
				dataModel.set("applied", (getModelValue(dataModel, "applied") || 0) + appliedThisFrame);
			}
			dataModel.set("backlog", queue.length);

			draw();

			const t1 = performance.now();
			const dt = t1 - t0;
			frameSamples.push(dt);
			if (dt > maxFrameMs) maxFrameMs = dt;
			dataModel.set("maxFrameMs", maxFrameMs);

			frameCount += 1;
			if (t1 - lastFpsAt >= 1000) {
				const fps = Math.round((frameCount * 1000) / (t1 - lastFpsAt));
				dataModel.set("fps", fps);
				frameCount = 0;
				lastFpsAt = t1;
			}

			renderStats();
			maybeFinalize();
			rafId = requestAnimationFrame(tickFrame);
		};

		renderStats();
		if (ctx) draw();
		rafId = requestAnimationFrame(tickFrame);

		const sseUrl = (fields && fields.sseUrl) || "/events";
		if (!sseUrl) {
			dataModel.set("status", "no-sse-url");
			renderStats();
			return;
		}

		dataModel.set("status", "connecting");
		renderStats();

		if (typeof EventSource === "function") {
			const es = new EventSource(sseUrl);
			es.onopen = () => {
				dataModel.set("status", "connected");
				renderStats();
			};
			es.onerror = () => {
				dataModel.set("status", "error");
				renderStats();
			};
			es.onmessage = (evt) => {
				try {
					const payload = JSON.parse(evt.data);
					if (!payload || !payload.type) return;

						if (payload.type === "config" && payload.data) {
							const cfg = payload.data;
							if (cfg.mode) dataModel.set("mode", cfg.mode);
							if (typeof cfg.totalNodes === "number") dataModel.set("totalNodes", cfg.totalNodes);
							if (typeof cfg.durationMs === "number") dataModel.set("durationMs", cfg.durationMs);
							if (typeof cfg.tickMs === "number") dataModel.set("tickMs", cfg.tickMs);
							renderStats();
							return;
						}

					if (payload.type === "node" && payload.data) {
						if (firstNodeAt == null) firstNodeAt = performance.now();
						queue.push(payload.data);
						dataModel.set("received", (getModelValue(dataModel, "received") || 0) + 1);
						dataModel.set("backlog", queue.length);
						return;
					}

					if (payload.type === "nodes" && payload.data && Array.isArray(payload.data.nodes)) {
						if (firstNodeAt == null) firstNodeAt = performance.now();
						const nodesBatch = payload.data.nodes;
						for (let i = 0; i < nodesBatch.length; i += 1) queue.push(nodesBatch[i]);
						dataModel.set("received", (getModelValue(dataModel, "received") || 0) + nodesBatch.length);
						dataModel.set("backlog", queue.length);
						return;
					}

					if (payload.type === "done") {
						doneSignal = true;
						return;
					}

					if (payload.type === "stage" && payload.data && payload.data.status === "finished") {
						doneSignal = true;
						return;
					}
				} catch {
					dataModel.set("status", "parse-error");
					renderStats();
				}
			};
			this.__eventSource = es;
		} else {
			dataModel.set("status", "no-eventsource");
			renderStats();
		}

		this.on("dispose", () => {
			try {
				cancelAnimationFrame(rafId);
			} catch {
				// ignore
			}
			try {
				if (this.__eventSource) this.__eventSource.close();
			} catch {
				// ignore
			}
		});
	}
}

PerfGraphDemo.css = `
.perf-graph-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  background: #0e0f12;
  color: #eef2f6;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  width: min(1040px, calc(100vw - 40px));
}

.perf-graph-demo__title {
  font-weight: 650;
  letter-spacing: 0.2px;
  opacity: 0.95;
}

.perf-graph-demo__stats {
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.perf-graph-demo__canvas-wrap {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.perf-graph-demo__canvas {
  display: block;
  width: 100%;
  height: auto;
  background: #0b1220;
}
`;

controls.perf_graph_demo = PerfGraphDemo;

class PerfGraphPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "perf_graph_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("jsgui3 Live Graph Perf (Lab 041)");

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(PerfGraphDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(
			new PerfGraphDemo({
				context
			})
		);

		this.body.add(host);
	}
}

controls.perf_graph_page = PerfGraphPage;

module.exports = jsgui;
