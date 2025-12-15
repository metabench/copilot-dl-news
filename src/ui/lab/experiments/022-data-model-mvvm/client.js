"use strict";

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { Data_Object } = require("lang-tools");
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

function getModelNumber(model, key, fallback = 0) {
	if (!model || typeof model.get !== "function") return fallback;
	const stored = model.get(key);
	if (stored && stored.__data_value) {
		const n = Number(stored.value);
		return Number.isFinite(n) ? n : fallback;
	}
	const n = Number(stored);
	return Number.isFinite(n) ? n : fallback;
}

class DataModelMvvmDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "data_model_mvvm_demo"
		});

		// Ensure MVVM model stacks are initialized (data.model + view.data.model).
		ensure_control_models(this, spec);

		this.add_class("data-model-mvvm");

		if (!spec.el) {
			this.compose();

			// Server-side model initialization.
			this.data.model.set("count", 0, true);

			// Ship encoded model string via persisted fields (SSR bridge).
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON()
			});
		}
	}

	compose() {
		const { context } = this;

		const status = new Control({ context, tagName: "span", __type_name: "span" });
		status.add_class("data-model-mvvm__status");
		status.add_text("displayCount=0");

		const btn = new Control({ context, tagName: "button", __type_name: "button" });
		btn.add_class("data-model-mvvm__btn");
		btn.add_text("Increment");

		this.add(status);
		this.add(btn);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			status: status._id(),
			btn: btn._id()
		});
	}

	activate(el) {
		super.activate(el);
		if (this.__activatedOnce) return;
		this.__activatedOnce = true;

		// On client-side activation, ensure MVVM model stacks exist.
		ensure_control_models(this, {});

		const root = el || this.dom.el;
		if (!root) return;
		root.setAttribute("data-activated", "1");

		// Client-side rehydrate: decode encoded model string into the existing Data_Object.
		const encoded = this._persisted_fields && this._persisted_fields.encodedDataModel;
		const decoded = decodeDataObject(encoded);
		if (decoded && typeof decoded === "object") {
			Object.entries(decoded).forEach(([k, v]) => {
				this.data.model.set(k, coerceScalar(v), true);
			});
		}

		const statusEl = this.status && this.status.dom ? this.status.dom.el : null;
		const btnEl = this.btn && this.btn.dom ? this.btn.dom.el : null;

		// ----- MVVM wiring -----
		// view.data.model mirrors data.model via a binding (ModelBinder style).
		// For simplicity, we use event listeners to propagate changes between models.

		const dataModel = this.data.model;
		const viewModel = this.view && this.view.data && this.view.data.model;

		// Bind data.model.count → view.data.model.displayCount
		if (viewModel) {
			const syncToView = () => {
				const count = getModelNumber(dataModel, "count", 0);
				viewModel.set("displayCount", count);
			};
			syncToView();
			dataModel.on("change", e => {
				if (e && e.name === "count") syncToView();
			});

			// View model → DOM rendering.
			const renderView = () => {
				const displayCount = getModelNumber(viewModel, "displayCount", 0);
				root.setAttribute("data-display-count", String(displayCount));
				if (statusEl) statusEl.textContent = `displayCount=${displayCount}`;
			};
			renderView();
			viewModel.on("change", e => {
				if (e && e.name === "displayCount") renderView();
			});
		} else {
			// Fallback if view.data.model isn't present.
			const renderDirect = () => {
				const count = getModelNumber(dataModel, "count", 0);
				root.setAttribute("data-display-count", String(count));
				if (statusEl) statusEl.textContent = `displayCount=${count}`;
			};
			renderDirect();
			dataModel.on("change", e => {
				if (e && e.name === "count") renderDirect();
			});
		}

		// Controller: button mutates data.model (not view model).
		if (btnEl) {
			btnEl.addEventListener("click", () => {
				const next = getModelNumber(dataModel, "count", 0) + 1;
				dataModel.set("count", next);
			});
		}
	}
}

DataModelMvvmDemo.css = `
.data-model-mvvm {
  display: inline-flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #121212;
  color: #e7e7e7;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.data-model-mvvm__status {
  font-variant-numeric: tabular-nums;
}

.data-model-mvvm__btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.data-model-mvvm__btn:hover {
  background: #262626;
}
`;

controls.data_model_mvvm_demo = DataModelMvvmDemo;

class DataModelMvvmPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "data_model_mvvm_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("Data_Model server→client bridge (MVVM)");

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(DataModelMvvmDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(new DataModelMvvmDemo({ context }));
		this.body.add(host);
	}
}

controls.data_model_mvvm_page = DataModelMvvmPage;

module.exports = jsgui;
