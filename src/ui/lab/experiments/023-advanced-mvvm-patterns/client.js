"use strict";

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { Data_Object } = require("lang-tools");
const { ensure_control_models } = require("jsgui3-html/html-core/control_model_factory");
const Data_Model_View_Model_Control = require("jsgui3-html/html-core/Data_Model_View_Model_Control");

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
	// lang-tools Data_Object may store strings as JSON-quoted strings (e.g. "Ada"),
	// so unquote first.
	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			value = JSON.parse(trimmed);
		} catch {
			// ignore
		}
	}
	const normalized = typeof value === "string" ? value.trim() : value;
	if (trimmed === "") return value;
	const asNumber = Number(normalized);
	return Number.isFinite(asNumber) ? asNumber : value;
}

function normalizeValue(value) {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return value;
		}
	}
	return value;
}

function readDataValue(model, key, fallback) {
	if (!model || typeof model.get !== "function") return fallback;
	const got = model.get(key);
	if (got && got.__data_value) return normalizeValue(got.value);
	return typeof got === "undefined" ? fallback : got;
}

function safeSet(model, key, value, silent) {
	if (!model) return;
	if (typeof model.set === "function") {
		model.set(key, value, silent);
		return;
	}
	model[key] = value;
}

function safeBindTwoWay({ sourceModel, sourceProp, targetModel, targetProp, transform, reverse }) {
	const lock = new Set();
	const toTarget = val => (transform ? transform(val) : val);
	const toSource = val => (reverse ? reverse(val) : val);

	const syncSourceToTarget = (val, silent) => {
		const key = `${sourceProp}->${targetProp}`;
		if (lock.has(key)) return;
		lock.add(key);
		try {
			safeSet(targetModel, targetProp, toTarget(val), silent);
		} finally {
			lock.delete(key);
		}
	};

	const syncTargetToSource = (val, silent) => {
		const key = `${targetProp}->${sourceProp}`;
		if (lock.has(key)) return;
		lock.add(key);
		try {
			safeSet(sourceModel, sourceProp, toSource(val), silent);
		} finally {
			lock.delete(key);
		}
	};

	// Initial sync
	syncSourceToTarget(readDataValue(sourceModel, sourceProp, undefined), true);

	const sourceHandler = e => {
		if (e && e.name === sourceProp) syncSourceToTarget(e.value);
	};
	const targetHandler = e => {
		if (e && e.name === targetProp) syncTargetToSource(e.value);
	};

	if (sourceModel && sourceModel.on) sourceModel.on("change", sourceHandler);
	if (targetModel && targetModel.on) targetModel.on("change", targetHandler);

	return {
		unbind() {
			if (sourceModel && sourceModel.off) sourceModel.off("change", sourceHandler);
			if (targetModel && targetModel.off) targetModel.off("change", targetHandler);
		}
	};
}

function formatFullName(first, last, uppercase) {
	const base = `${first || ""} ${last || ""}`.trim().replace(/\s+/g, " ");
	return uppercase ? base.toUpperCase() : base;
}

class AdvancedMvvmDemo extends Data_Model_View_Model_Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "advanced_mvvm_demo"
		});

		this.add_class("adv-mvvm");

		if (!spec.el) {
			this.compose();

			// Server-side canonical data model.
			this.data.model.set("firstName", "Ada", true);
			this.data.model.set("lastName", "Lovelace", true);
			this.data.model.set("uppercase", false, true);
			this.data.model.set("count", 2, true);

			// Persist encoded data model state for SSR→client bridge.
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON()
			});
		}
	}

	compose() {
		const { context } = this;

		const row = (labelText, ctrl) => {
			const wrap = new Control({ context, tagName: "div", __type_name: "div" });
			wrap.add_class("adv-mvvm__row");
			const label = new Control({ context, tagName: "label", __type_name: "label" });
			label.add_text(labelText);
			wrap.add(label);
			wrap.add(ctrl);
			return wrap;
		};

		const tf_first = new Control({ context, tagName: "input", __type_name: "input" });
		tf_first.add_class("adv-mvvm__first");
		tf_first.dom.attributes.type = "text";

		const tf_last = new Control({ context, tagName: "input", __type_name: "input" });
		tf_last.add_class("adv-mvvm__last");
		tf_last.dom.attributes.type = "text";

		const cb_upper = new Control({ context, tagName: "input", __type_name: "input" });
		cb_upper.add_class("adv-mvvm__upper");
		cb_upper.dom.attributes.type = "checkbox";

		const tf_countText = new Control({ context, tagName: "input", __type_name: "input" });
		tf_countText.add_class("adv-mvvm__countText");
		tf_countText.dom.attributes.type = "text";

		const btn_inc = new Control({ context, tagName: "button", __type_name: "button" });
		btn_inc.add_class("adv-mvvm__inc");
		btn_inc.add_text("Increment");

		const btn_apply = new Control({ context, tagName: "button", __type_name: "button" });
		btn_apply.add_class("adv-mvvm__apply");
		btn_apply.add_text("Apply");

		const btn_cancel = new Control({ context, tagName: "button", __type_name: "button" });
		btn_cancel.add_class("adv-mvvm__cancel");
		btn_cancel.add_text("Cancel");

		const lbl_dataName = new Control({ context, tagName: "div", __type_name: "div" });
		lbl_dataName.add_class("adv-mvvm__dataName");
		lbl_dataName.add_text("dataName=");

		const lbl_draftName = new Control({ context, tagName: "div", __type_name: "div" });
		lbl_draftName.add_class("adv-mvvm__draftName");
		lbl_draftName.add_text("draftName=");

		const lbl_count = new Control({ context, tagName: "div", __type_name: "div" });
		lbl_count.add_class("adv-mvvm__count");
		lbl_count.add_text("count=");

		this.add(row("First", tf_first));
		this.add(row("Last", tf_last));
		this.add(row("Uppercase", cb_upper));
		this.add(row("Count (text)", tf_countText));
		this.add(new Control({ context, tagName: "div", __type_name: "div", text: "" }));
		this.add(btn_inc);
		this.add(btn_apply);
		this.add(btn_cancel);
		this.add(lbl_dataName);
		this.add(lbl_draftName);
		this.add(lbl_count);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			tf_first,
			tf_last,
			cb_upper,
			tf_countText,
			btn_inc,
			btn_apply,
			btn_cancel,
			lbl_dataName,
			lbl_draftName,
			lbl_count
		});
	}

	activate(el) {
		super.activate(el);
		if (this.__activatedOnce) return;
		this.__activatedOnce = true;

		// Defensive: ensure model stacks exist on client reconstruction.
		ensure_control_models(this, {});

		const root = el || this.dom.el;
		if (!root) return;
		root.setAttribute("data-activated", "1");

		const dataModel = this.data && this.data.model;
		const viewModel = this.view && this.view.data && this.view.data.model;

		// Hydrate canonical data model from persisted fields.
		const encoded = this._persisted_fields && this._persisted_fields.encodedDataModel;
		const decoded = decodeDataObject(encoded);
		if (decoded && typeof decoded === "object") {
			Object.entries(decoded).forEach(([k, v]) => {
				dataModel.set(k, coerceScalar(v), true);
			});
		}

		// Initialize draft view-model from canonical model (staged edits).
		safeSet(viewModel, "draftFirstName", readDataValue(dataModel, "firstName", ""), true);
		safeSet(viewModel, "draftLastName", readDataValue(dataModel, "lastName", ""), true);
		safeSet(viewModel, "draftUppercase", !!readDataValue(dataModel, "uppercase", false), true);
		safeSet(viewModel, "countText", String(readDataValue(dataModel, "count", 0)), true);

		// Two-way binding for count: data.count <-> view.countText
		// Uses set() to preserve change events.
		safeBindTwoWay({
			sourceModel: dataModel,
			sourceProp: "count",
			targetModel: viewModel,
			targetProp: "countText",
			transform: n => String(typeof n === "number" ? n : Number(n) || 0),
			reverse: s => {
				const n = Number(String(s).trim());
				return Number.isFinite(n) ? n : 0;
			}
		});

		// Computed: dataName (canonical) and draftName (view model).
		this.computed(dataModel, ["firstName", "lastName", "uppercase"], (f, l, u) => formatFullName(f, l, !!u), {
			propertyName: "dataName"
		});
		this.computed(viewModel, ["draftFirstName", "draftLastName", "draftUppercase"], (f, l, u) => formatFullName(f, l, !!u), {
			propertyName: "draftName"
		});

		// Computed: canApply when drafts differ + non-empty names.
		this.computed(
			viewModel,
			["draftFirstName", "draftLastName", "draftUppercase"],
			(df, dl, du) => {
				const f = String(df || "").trim();
				const l = String(dl || "").trim();
				const u = !!du;
				if (!f || !l) return false;
				const sameName = f === String(readDataValue(dataModel, "firstName", "")).trim() &&
					l === String(readDataValue(dataModel, "lastName", "")).trim();
				const sameUpper = u === !!readDataValue(dataModel, "uppercase", false);
				return !(sameName && sameUpper);
			},
			{ propertyName: "canApply" }
		);

		// DOM elements: query from root for robustness.
		const firstEl = root.querySelector(".adv-mvvm__first");
		const lastEl = root.querySelector(".adv-mvvm__last");
		const upperEl = root.querySelector(".adv-mvvm__upper");
		const countTextEl = root.querySelector(".adv-mvvm__countText");
		const incEl = root.querySelector(".adv-mvvm__inc");
		const applyEl = root.querySelector(".adv-mvvm__apply");
		const cancelEl = root.querySelector(".adv-mvvm__cancel");
		const dataNameEl = root.querySelector(".adv-mvvm__dataName");
		const draftNameEl = root.querySelector(".adv-mvvm__draftName");
		const countEl = root.querySelector(".adv-mvvm__count");

		const renderInputsFromView = () => {
			if (firstEl) firstEl.value = String(readDataValue(viewModel, "draftFirstName", ""));
			if (lastEl) lastEl.value = String(readDataValue(viewModel, "draftLastName", ""));
			if (upperEl) upperEl.checked = !!readDataValue(viewModel, "draftUppercase", false);
			if (countTextEl) countTextEl.value = String(readDataValue(viewModel, "countText", "0"));
		};

		const renderLabels = () => {
			const dn = String(readDataValue(dataModel, "dataName", ""));
			const dr = String(readDataValue(viewModel, "draftName", ""));
			const c = Number(readDataValue(dataModel, "count", 0)) || 0;
			root.setAttribute("data-count", String(c));
			if (dataNameEl) dataNameEl.textContent = `dataName=${dn}`;
			if (draftNameEl) draftNameEl.textContent = `draftName=${dr}`;
			if (countEl) countEl.textContent = `count=${c}`;
		};

		const renderButtons = () => {
			const canApply = !!readDataValue(viewModel, "canApply", false);
			root.setAttribute("data-can-apply", canApply ? "1" : "0");
			if (applyEl) applyEl.disabled = !canApply;
		};

		renderInputsFromView();
		renderLabels();
		renderButtons();

		// Watchers → DOM.
		this.watch(viewModel, "draftName", () => renderLabels());
		this.watch(dataModel, "dataName", () => renderLabels());
		this.watch(dataModel, "count", () => {
			renderLabels();
			// Keep countText input in sync when increment button changes data.
			renderInputsFromView();
		});
		this.watch(viewModel, "countText", () => {
			renderInputsFromView();
		});
		this.watch(viewModel, "canApply", () => renderButtons());

		// Input → view model (draft).
		if (firstEl) {
			firstEl.addEventListener("input", () => safeSet(viewModel, "draftFirstName", firstEl.value));
		}
		if (lastEl) {
			lastEl.addEventListener("input", () => safeSet(viewModel, "draftLastName", lastEl.value));
		}
		if (upperEl) {
			upperEl.addEventListener("change", () => safeSet(viewModel, "draftUppercase", !!upperEl.checked));
		}
		if (countTextEl) {
			countTextEl.addEventListener("input", () => safeSet(viewModel, "countText", countTextEl.value));
		}

		// Actions.
		if (incEl) {
			incEl.addEventListener("click", () => {
				const next = (Number(readDataValue(dataModel, "count", 0)) || 0) + 1;
				dataModel.set("count", next);
			});
		}
		if (applyEl) {
			applyEl.addEventListener("click", () => {
				dataModel.set("firstName", String(readDataValue(viewModel, "draftFirstName", "")));
				dataModel.set("lastName", String(readDataValue(viewModel, "draftLastName", "")));
				dataModel.set("uppercase", !!readDataValue(viewModel, "draftUppercase", false));
			});
		}
		if (cancelEl) {
			cancelEl.addEventListener("click", () => {
				safeSet(viewModel, "draftFirstName", readDataValue(dataModel, "firstName", ""));
				safeSet(viewModel, "draftLastName", readDataValue(dataModel, "lastName", ""));
				safeSet(viewModel, "draftUppercase", !!readDataValue(dataModel, "uppercase", false));
			});
		}
	}
}

AdvancedMvvmDemo.css = `
.adv-mvvm {
  display: block;
  padding: 14px;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  background: #121212;
  color: #e7e7e7;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  width: 520px;
}

.adv-mvvm__row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
  align-items: center;
  margin: 8px 0;
}

.adv-mvvm input[type="text"] {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1b1b1b;
  color: inherit;
}

.adv-mvvm button {
  margin-right: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.adv-mvvm button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.adv-mvvm__dataName,
.adv-mvvm__draftName,
.adv-mvvm__count {
  margin-top: 10px;
  font-variant-numeric: tabular-nums;
}
`;

controls.advanced_mvvm_demo = AdvancedMvvmDemo;

class AdvancedMvvmPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "advanced_mvvm_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(AdvancedMvvmDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("Advanced MVVM Patterns");

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(new AdvancedMvvmDemo({ context }));
		this.body.add(host);
	}
}

controls.advanced_mvvm_page = AdvancedMvvmPage;

module.exports = jsgui;
