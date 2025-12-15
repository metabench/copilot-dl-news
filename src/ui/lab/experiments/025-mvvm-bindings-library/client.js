"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { ensure_control_models } = require("jsgui3-html/html-core/control_model_factory");
const {
	createBindingManager,
	bindModelToModel,
	bindText,
	bindAttribute,
	getModelValue,
	setModelValue
} = require("../../utilities/mvvmBindings");

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

class MvvmBindingsDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "mvvm_bindings_demo"
		});

		ensure_control_models(this, spec);
		this.add_class("mvvm-bindings");

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
		status.add_class("mvvm-bindings__status");
		status.add_text("displayCount=0");

		const btn = new Control({ context, tagName: "button", __type_name: "button" });
		btn.add_class("mvvm-bindings__btn");
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

		ensure_control_models(this, {});

		const root = el || this.dom.el;
		if (!root) return;
		root.setAttribute("data-activated", "1");

		// Rehydrate server encoded model string into the existing Data_Object.
		const encoded = this._persisted_fields && this._persisted_fields.encodedDataModel;
		const decoded = decodeDataObject(encoded);
		if (decoded && typeof decoded === "object") {
			Object.entries(decoded).forEach(([k, v]) => {
				this.data.model.set(k, coerceScalar(v), true);
			});
		}

		const statusEl = this.status && this.status.dom ? this.status.dom.el : null;
		const btnEl = this.btn && this.btn.dom ? this.btn.dom.el : null;

		const dataModel = this.data.model;
		const viewModel = this.view && this.view.data && this.view.data.model;

		const bindings = createBindingManager();

		if (viewModel) {
			const link = bindModelToModel({
				sourceModel: dataModel,
				sourceProp: "count",
				targetModel: viewModel,
				targetProp: "displayCount",
				transform: (v) => {
					const n = Number(v);
					return Number.isFinite(n) ? n : 0;
				}
			});
			bindings.add(link.dispose);

			const attr = bindAttribute({
				model: viewModel,
				prop: "displayCount",
				el: root,
				attrName: "data-display-count",
				format: (v) => String(v == null ? 0 : v)
			});
			bindings.add(attr.dispose);

			const text = bindText({
				model: viewModel,
				prop: "displayCount",
				el: statusEl,
				format: (v) => `displayCount=${v == null ? 0 : v}`
			});
			bindings.add(text.dispose);
		} else {
			const attr = bindAttribute({
				model: dataModel,
				prop: "count",
				el: root,
				attrName: "data-display-count",
				format: (v) => String(v == null ? 0 : v)
			});
			bindings.add(attr.dispose);

			const text = bindText({
				model: dataModel,
				prop: "count",
				el: statusEl,
				format: (v) => `displayCount=${v == null ? 0 : v}`
			});
			bindings.add(text.dispose);
		}

		if (btnEl) {
			btnEl.addEventListener("click", () => {
				const next = Number(getModelValue(dataModel, "count", 0)) + 1;
				setModelValue(dataModel, "count", next);
			});
		}

		// Expose a tiny hook for checks.
		root.__mvvm_bindings_demo = {
			dispose: () => bindings.dispose(),
			getCount: () => Number(getModelValue(dataModel, "count", 0))
		};
	}
}

MvvmBindingsDemo.css = `
.mvvm-bindings {
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

.mvvm-bindings__status {
  font-variant-numeric: tabular-nums;
}

.mvvm-bindings__btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.mvvm-bindings__btn:hover {
  background: #262626;
}
`;

controls.mvvm_bindings_demo = MvvmBindingsDemo;

class MvvmBindingsPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "mvvm_bindings_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("MVVM Bindings Helper (library-style)");

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(MvvmBindingsDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(new MvvmBindingsDemo({ context }));
		this.body.add(host);
	}
}

controls.mvvm_bindings_page = MvvmBindingsPage;

module.exports = jsgui;
