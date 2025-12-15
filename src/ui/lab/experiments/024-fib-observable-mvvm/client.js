"use strict";

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

class FibMvvmDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "fib_mvvm_demo"
		});

		ensure_control_models(this, spec);

		this.add_class("fib-mvvm");

		if (!spec.el) {
			this.compose();

			this.data.model.set("index", 0, true);
			this.data.model.set("value", "0", true);
			this.data.model.set("status", "connecting", true);

			const sseUrl = process.env.JSGUI_LAB_FIB_SSE_URL || "";
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON(),
				sseUrl
			});
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "div", __type_name: "div" });
		title.add_class("fib-mvvm__title");
		title.add_text("Server Fib (SSE) → data.model → view.model");

		const row = new Control({ context, tagName: "div", __type_name: "div" });
		row.add_class("fib-mvvm__row");

		const indexLabel = new Control({ context, tagName: "span", __type_name: "span" });
		indexLabel.add_text("index=");
		const indexValue = new Control({ context, tagName: "span", __type_name: "span" });
		indexValue.add_class("fib-mvvm__index");
		indexValue.add_text("0");

		const valueLabel = new Control({ context, tagName: "span", __type_name: "span" });
		valueLabel.add_text("value=");
		const valueValue = new Control({ context, tagName: "span", __type_name: "span" });
		valueValue.add_class("fib-mvvm__value");
		valueValue.add_text("0");

		row.add(indexLabel);
		row.add(indexValue);
		row.add(valueLabel);
		row.add(valueValue);

		const status = new Control({ context, tagName: "div", __type_name: "div" });
		status.add_class("fib-mvvm__status");
		status.add_text("status=connecting");

		this.add(title);
		this.add(row);
		this.add(status);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			indexValue: indexValue._id(),
			valueValue: valueValue._id(),
			status: status._id()
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
		const viewModel = this.view && this.view.data && this.view.data.model;

		// Rehydrate encoded model fields (SSR → client).
		const encoded = this._persisted_fields && this._persisted_fields.encodedDataModel;
		const decoded = decodeDataObject(encoded);
		if (decoded && typeof decoded === "object") {
			Object.entries(decoded).forEach(([k, v]) => {
				dataModel.set(k, coerceScalar(v), true);
			});
		}

		const indexEl = this.indexValue && this.indexValue.dom ? this.indexValue.dom.el : root.querySelector(".fib-mvvm__index");
		const valueEl = this.valueValue && this.valueValue.dom ? this.valueValue.dom.el : root.querySelector(".fib-mvvm__value");
		const statusEl = this.status && this.status.dom ? this.status.dom.el : root.querySelector(".fib-mvvm__status");

		const syncToView = () => {
			if (!viewModel) return;
			const index = getModelValue(dataModel, "index") ?? 0;
			const value = getModelValue(dataModel, "value") ?? "0";
			const status = getModelValue(dataModel, "status") ?? "connecting";
			viewModel.set("index", index);
			viewModel.set("value", String(value));
			viewModel.set("status", String(status));
		};

		const render = () => {
			const m = viewModel || dataModel;
			const index = getModelValue(m, "index") ?? 0;
			const value = getModelValue(m, "value") ?? "0";
			const status = getModelValue(m, "status") ?? "connecting";

			root.setAttribute("data-fib-index", String(index));
			root.setAttribute("data-fib-value", String(value));
			if (indexEl) indexEl.textContent = String(index);
			if (valueEl) valueEl.textContent = String(value);
			if (statusEl) statusEl.textContent = `status=${status}`;
		};

		if (viewModel) {
			syncToView();
			dataModel.on("change", e => {
				if (!e || !e.name) return;
				if (e.name === "index" || e.name === "value" || e.name === "status") syncToView();
			});
			viewModel.on("change", e => {
				if (!e || !e.name) return;
				if (e.name === "index" || e.name === "value" || e.name === "status") render();
			});
		} else {
			dataModel.on("change", e => {
				if (!e || !e.name) return;
				if (e.name === "index" || e.name === "value" || e.name === "status") render();
			});
		}

		render();

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
					const parsed = JSON.parse(evt.data);
					if (typeof parsed.index === "number") dataModel.set("index", parsed.index);
					if (typeof parsed.value === "string") dataModel.set("value", parsed.value);
				} catch {
					dataModel.set("status", "parse-error");
				}
			};
			this.__fibEventSource = es;
		} else {
			dataModel.set("status", "no-eventsource");
		}
	}
}

FibMvvmDemo.css = `
.fib-mvvm {
  display: inline-flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #121212;
  color: #e7e7e7;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.fib-mvvm__title {
  font-weight: 600;
  opacity: 0.95;
}

.fib-mvvm__row {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}

.fib-mvvm__index, .fib-mvvm__value {
  padding: 2px 6px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #1b1b1b;
}

.fib-mvvm__status {
  opacity: 0.8;
  font-size: 12px;
}
`;

controls.fib_mvvm_demo = FibMvvmDemo;

class FibMvvmPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "fib_mvvm_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("Fibonacci Server Observable → MVVM (SSE)");

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(FibMvvmDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(new FibMvvmDemo({ context }));
		this.body.add(host);
	}
}

controls.fib_mvvm_page = FibMvvmPage;

module.exports = jsgui;
