"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { ensure_control_models } = require("jsgui3-html/html-core/control_model_factory");

const { createCrawlDisplayAdapter } = require("../../../client/crawlDisplayAdapter");
const { createProgressBarControl, PROGRESS_BAR_STYLES } = require("../../../controls/ProgressBar");

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

function coerceScalar(value) {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (trimmed === "") return value;
	const asNumber = Number(trimmed);
	return Number.isFinite(asNumber) ? asNumber : value;
}

function getModelValue(model, key) {
	if (!model || typeof model.get !== "function") return undefined;
	const stored = model.get(key);
	if (stored && stored.__data_value) return stored.value;
	return stored;
}

const ProgressBarControl = createProgressBarControl(jsgui);
controls.progress_bar = ProgressBarControl;

class CrawlProgressDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "crawl_progress_demo"
		});

		ensure_control_models(this, spec);
		this.add_class("crawl-progress-demo");

		if (!spec.el) {
			this.compose();

			this.data.model.set("visited", 0, true);
			this.data.model.set("queued", 0, true);
			this.data.model.set("percentComplete", null, true);
			this.data.model.set("status", "connecting", true);

			const sseUrl = process.env.JSGUI_LAB_CRAWL_SSE_URL || "";
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON(),
				sseUrl
			});

			this.dom.attributes["data-progress-mode"] = "indeterminate";
			this.dom.attributes["data-progress-percent"] = "";
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "div", __type_name: "div" });
		title.add_class("crawl-progress-demo__title");
		title.add_text("Telemetry SSE → CrawlDisplayAdapter → ProgressBar");

		const summary = new Control({ context, tagName: "div", __type_name: "div" });
		summary.add_class("crawl-progress-demo__summary");
		summary.add_text("visited=0 queued=0");

		this._progressBar = new ProgressBarControl({
			context,
			value: 0,
			label: "Working…",
			variant: "standard",
			color: "emerald",
			animated: true,
			indeterminate: true
		});

		const status = new Control({ context, tagName: "div", __type_name: "div" });
		status.add_class("crawl-progress-demo__status");
		status.add_text("status=connecting");

		this.add(title);
		this.add(summary);
		this.add(this._progressBar);
		this.add(status);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			summary: summary._id(),
			status: status._id(),
			progressBar: this._progressBar._id()
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

		const dataModel = this.data.model;

		// Rehydrate encoded model fields (SSR → client).
		const encoded = this._persisted_fields && this._persisted_fields.encodedDataModel;
		const decoded = decodeDataObject(encoded);
		if (decoded && typeof decoded === "object") {
			Object.entries(decoded).forEach(([k, v]) => {
				dataModel.set(k, coerceScalar(v), true);
			});
		}

		const summaryEl = this.summary && this.summary.dom ? this.summary.dom.el : root.querySelector(".crawl-progress-demo__summary");
		const statusEl = this.status && this.status.dom ? this.status.dom.el : root.querySelector(".crawl-progress-demo__status");

		const render = () => {
			const visited = getModelValue(dataModel, "visited") ?? 0;
			const queued = getModelValue(dataModel, "queued") ?? 0;
			const percentComplete = getModelValue(dataModel, "percentComplete");
			const status = getModelValue(dataModel, "status") ?? "connecting";

			if (summaryEl) summaryEl.textContent = `visited=${visited} queued=${queued}`;
			if (statusEl) statusEl.textContent = `status=${status}`;

			if (percentComplete == null || !Number.isFinite(Number(percentComplete))) {
				root.setAttribute("data-progress-mode", "indeterminate");
				root.setAttribute("data-progress-percent", "");
			} else {
				root.setAttribute("data-progress-mode", "determinate");
				root.setAttribute("data-progress-percent", String(percentComplete));
			}
		};

		dataModel.on("change", e => {
			if (!e || !e.name) return;
			if (e.name === "visited" || e.name === "queued" || e.name === "percentComplete" || e.name === "status") render();
		});

		render();

		const adapter = createCrawlDisplayAdapter({
			onProgress: progress => {
				const progressBar = this.progressBar || this._progressBar;
				if (!progressBar) return;

				dataModel.set("visited", progress.visited ?? 0);
				dataModel.set("queued", progress.queued ?? 0);
				dataModel.set("percentComplete", progress.percentComplete);

				const pct = progress.percentComplete;
				if (pct == null || !Number.isFinite(Number(pct))) {
					progressBar.setIndeterminate(true);
					progressBar.setLabel("Working…");
				} else {
					progressBar.setIndeterminate(false);
					progressBar.setValue(Number(pct) / 100);
					progressBar.setLabel(`${Math.round(Number(pct))}%`);
				}
			}
		});

		const sseUrl = (this._persisted_fields && this._persisted_fields.sseUrl) || "";
		if (!sseUrl) {
			dataModel.set("status", "no-sse-url");
			return;
		}

		dataModel.set("status", "connecting");

		if (typeof EventSource === "function") {
			const es = new EventSource(sseUrl);
			es.onopen = () => dataModel.set("status", "connected");
			es.onerror = () => dataModel.set("status", "error");
			es.onmessage = evt => {
				try {
					const payload = JSON.parse(evt.data);
					if (payload && payload.type === "crawl:telemetry" && payload.data) {
						adapter.handleEvent(payload.data);
					}
				} catch {
					dataModel.set("status", "parse-error");
				}
			};
			this.__eventSource = es;
		} else {
			dataModel.set("status", "no-eventsource");
		}
	}
}

CrawlProgressDemo.css = `
.crawl-progress-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  background: #0e0f12;
  color: #eef2f6;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  width: min(520px, calc(100vw - 40px));
}

.crawl-progress-demo__title {
  font-weight: 650;
  letter-spacing: 0.2px;
  opacity: 0.95;
}

.crawl-progress-demo__summary {
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.crawl-progress-demo__status {
  opacity: 0.75;
  font-size: 12px;
}
`;

controls.crawl_progress_demo = CrawlProgressDemo;

class CrawlProgressPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "crawl_progress_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("ProgressBar + Telemetry SSE (Lab 027)");

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(`${PROGRESS_BAR_STYLES}\n${CrawlProgressDemo.css}`);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(new CrawlProgressDemo({ context }));
		this.body.add(host);
	}
}

controls.crawl_progress_page = CrawlProgressPage;

module.exports = jsgui;
