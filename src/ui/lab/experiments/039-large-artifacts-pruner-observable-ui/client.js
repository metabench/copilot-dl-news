"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { registerUiKitControls } = require("../../../controls/uiKit");
registerUiKitControls(jsgui);

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

function formatBytes(bytes) {
	const n = Number(bytes);
	if (!Number.isFinite(n) || n <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let idx = 0;
	let v = n;
	while (v >= 1024 && idx < units.length - 1) {
		v /= 1024;
		idx += 1;
	}
	const digits = idx <= 1 ? 0 : idx === 2 ? 1 : 2;
	return `${v.toFixed(digits)} ${units[idx]}`;
}

class LargeArtifactsPrunerDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "large_artifacts_pruner_demo"
		});

		ensure_control_models(this, spec);
		this.add_class("large-artifacts-pruner");

		if (!spec.el) {
			this.compose();

			this.data.model.set("status", "idle", true);
			this.data.model.set("applyAllowed", process.env.LAB_039_ALLOW_APPLY === "1", true);
			this.data.model.set("apply", false, true);
			this.data.model.set("maxExportMb", 512, true);

			this.data.model.set("deletionCount", 0, true);
			this.data.model.set("deletionBytes", 0, true);
			this.data.model.set("deletedCount", 0, true);
			this.data.model.set("deletedBytes", 0, true);
			this.data.model.set("skippedTracked", 0, true);

			this.data.model.set("plannedDeletions", [], true);

			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON(),
				sseBaseUrl: "/events"
			});
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "div", __type_name: "div" });
		title.add_class("large-artifacts-pruner__title");
		title.add_text("Large Artifacts Pruner (Lab 039) — fnl observable → SSE → UI model");

		const controlsRow = new Control({ context, tagName: "div", __type_name: "div" });
		controlsRow.add_class("large-artifacts-pruner__controls");

		const runDry = new controls.ui_button({
			context,
			text: "Run dry-run",
			action: "run-dry"
		});

		const runApply = new controls.ui_button({
			context,
			text: "Run apply (requires LAB_039_ALLOW_APPLY=1)",
			action: "run-apply",
			variant: "primary"
		});

		const maxExport = new controls.ui_number_input({
			context,
			min: 0,
			step: 1,
			value: 512,
			title: "Export budget (MB)"
		});
		maxExport.add_class("large-artifacts-pruner__maxexport");

		const maxExportLabel = new Control({ context, tagName: "label", __type_name: "label" });
		maxExportLabel.add_class("large-artifacts-pruner__label");
		maxExportLabel.add_text("Export budget MB:");

		controlsRow.add(runDry);
		controlsRow.add(runApply);
		controlsRow.add(maxExportLabel);
		controlsRow.add(maxExport);

		const status = new Control({ context, tagName: "div", __type_name: "div" });
		status.add_class("large-artifacts-pruner__status");
		status.add_text("status=idle");
		this.status = status;

		const summary = new Control({ context, tagName: "div", __type_name: "div" });
		summary.add_class("large-artifacts-pruner__summary");
		summary.add_text("deletions=0 (0 B)");
		this.summary = summary;

		const listTitle = new Control({ context, tagName: "div", __type_name: "div" });
		listTitle.add_class("large-artifacts-pruner__listtitle");
		listTitle.add_text("Planned deletions (first 50 from dry-run event)");

		const list = new Control({ context, tagName: "pre", __type_name: "pre" });
		list.add_class("large-artifacts-pruner__list");
		list.add_text("(none yet)");
		this.list = list;

		this.runDry = runDry;
		this.runApply = runApply;
		this.maxExport = maxExport;

		this.add(title);
		this.add(controlsRow);
		this.add(status);
		this.add(summary);
		this.add(listTitle);
		this.add(list);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			status: status._id(),
			summary: summary._id(),
			list: list._id(),
			runDry: runDry._id(),
			runApply: runApply._id(),
			maxExport: maxExport._id()
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
		const statusEl = this.status && this.status.dom ? this.status.dom.el : root.querySelector(".large-artifacts-pruner__status");
		const summaryEl = this.summary && this.summary.dom ? this.summary.dom.el : root.querySelector(".large-artifacts-pruner__summary");
		const listEl = this.list && this.list.dom ? this.list.dom.el : root.querySelector(".large-artifacts-pruner__list");
		const maxExportEl = this.maxExport && this.maxExport.dom ? this.maxExport.dom.el : root.querySelector(".large-artifacts-pruner__maxexport");

		const render = () => {
			const status = getModelValue(dataModel, "status") || "idle";
			const deletionCount = getModelValue(dataModel, "deletionCount") || 0;
			const deletionBytes = getModelValue(dataModel, "deletionBytes") || 0;
			const deletedCount = getModelValue(dataModel, "deletedCount") || 0;
			const deletedBytes = getModelValue(dataModel, "deletedBytes") || 0;
			const skippedTracked = getModelValue(dataModel, "skippedTracked") || 0;
			const planned = getModelValue(dataModel, "plannedDeletions") || [];

			if (statusEl) statusEl.textContent = `status=${status}`;
			if (summaryEl) {
				summaryEl.textContent = `planned deletions=${deletionCount} (${formatBytes(deletionBytes)}) | deleted=${deletedCount} (${formatBytes(deletedBytes)}) | skippedTracked=${skippedTracked}`;
			}
			if (listEl) {
				if (!Array.isArray(planned) || planned.length === 0) {
					listEl.textContent = "(none yet)";
				} else {
					listEl.textContent = planned
						.slice(0, 50)
						.map(d => `${d.sizeHuman || formatBytes(d.size)}\t${d.rel} (${d.category})`)
						.join("\n");
				}
			}
		};

		dataModel.on("change", () => render());
		render();

		const sseBaseUrl = (fields && fields.sseBaseUrl) || "/events";

		const connect = ({ apply }) => {
			try {
				if (this.__eventSource) this.__eventSource.close();
			} catch {
				// ignore
			}

			const maxExportMb = maxExportEl ? Number(maxExportEl.value) : Number(getModelValue(dataModel, "maxExportMb"));
			if (Number.isFinite(maxExportMb)) dataModel.set("maxExportMb", maxExportMb);

			const qs = `apply=${apply ? "1" : "0"}&maxExportMb=${encodeURIComponent(String(maxExportMb || 0))}`;
			const url = `${sseBaseUrl}?${qs}`;

			dataModel.set("status", "connecting");
			dataModel.set("apply", Boolean(apply));
			dataModel.set("plannedDeletions", []);
			dataModel.set("deletedCount", 0);
			dataModel.set("deletedBytes", 0);
			dataModel.set("skippedTracked", 0);

			if (typeof EventSource !== "function") {
				dataModel.set("status", "no-eventsource");
				return;
			}

			const es = new EventSource(url);
			es.onopen = () => dataModel.set("status", "connected");
			es.onerror = () => dataModel.set("status", "error");
			es.onmessage = evt => {
				try {
					const payload = JSON.parse(evt.data);
					if (!payload || payload.type !== "prune:event" || !payload.data) return;

					const ev = payload.data;
					if (ev.type === "plan" && ev.planSummary && ev.planSummary.stats) {
						dataModel.set("deletionCount", ev.planSummary.stats.deletionCount || 0);
						dataModel.set("deletionBytes", ev.planSummary.stats.deletionBytes || 0);
					}

					if (ev.type === "dry-run" && Array.isArray(ev.plannedDeletions)) {
						dataModel.set("plannedDeletions", ev.plannedDeletions);
					}

					if (ev.type === "delete") {
						dataModel.set("deletedCount", (getModelValue(dataModel, "deletedCount") || 0) + 1);
						dataModel.set("deletedBytes", (getModelValue(dataModel, "deletedBytes") || 0) + (ev.size || 0));
					}

					if (ev.type === "skip" && ev.reason === "git-tracked") {
						dataModel.set("skippedTracked", (getModelValue(dataModel, "skippedTracked") || 0) + 1);
					}

					if (ev.type === "done") {
						dataModel.set("status", "done");
						try {
							es.close();
						} catch {
							// ignore
						}
					}
				} catch {
					dataModel.set("status", "parse-error");
				}
			};

			this.__eventSource = es;
		};

		root.addEventListener("click", (e) => {
			const t = e && e.target;
			if (!t || !t.getAttribute) return;
			const action = t.getAttribute("data-action");
			if (action === "run-dry") {
				connect({ apply: false });
			}
			if (action === "run-apply") {
				const allowed = getModelValue(dataModel, "applyAllowed");
				if (!allowed) {
					dataModel.set("status", "apply-disabled");
					return;
				}
				connect({ apply: true });
			}
		});

		// Auto-run a dry-run on load.
		connect({ apply: false });
	}
}

LargeArtifactsPrunerDemo.css = `
.large-artifacts-pruner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  background: #0e0f12;
  color: #eef2f6;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  width: min(860px, calc(100vw - 40px));
}

.large-artifacts-pruner__title {
  font-weight: 650;
  letter-spacing: 0.2px;
}

.large-artifacts-pruner__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.large-artifacts-pruner__label {
  opacity: 0.8;
  font-size: 12px;
}

.large-artifacts-pruner__maxexport {
  width: 100px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #12141b;
  color: #eef2f6;
}

.btn {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: #171a22;
  color: #eef2f6;
  cursor: pointer;
}

.btn:hover {
  background: #1c2030;
}

.large-artifacts-pruner__status {
  opacity: 0.8;
  font-size: 12px;
}

.large-artifacts-pruner__summary {
  font-variant-numeric: tabular-nums;
  opacity: 0.95;
}

.large-artifacts-pruner__listtitle {
  opacity: 0.8;
  font-size: 12px;
}

.large-artifacts-pruner__list {
  padding: 10px;
  border-radius: 10px;
  background: #0b0c10;
  border: 1px solid rgba(255, 255, 255, 0.10);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  overflow: auto;
  max-height: 360px;
}
`;

controls.large_artifacts_pruner_demo = LargeArtifactsPrunerDemo;

class LargeArtifactsPrunerPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "large_artifacts_pruner_page" });
		this.compiledCss = spec.compiledCss || "";
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("Large Artifacts Pruner — Observable UI (Lab 039)");

		if (this.compiledCss) {
			const style = new Control({ context, tagName: "style", __type_name: "style" });
			style.add_text(this.compiledCss);
			this.head.add(style);
		}

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		this.body.add_class("ui-theme--obsidian");
		host.add(title);
		host.add(new LargeArtifactsPrunerDemo({ context }));
		this.body.add(host);
	}
}

controls.large_artifacts_pruner_page = LargeArtifactsPrunerPage;

module.exports = jsgui;
