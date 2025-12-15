"use strict";

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

const { Data_Object } = require("lang-tools");

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

class DataModelMvcDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "data_model_mvc_demo"
		});

		this.add_class("data-model-mvc");

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
		status.add_class("data-model-mvc__status");
		status.add_text("count=0");

		const btn = new Control({ context, tagName: "button", __type_name: "button" });
		btn.add_class("data-model-mvc__btn");
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

		const render = () => {
			const count = getModelNumber(this.data.model, "count", 0);
			root.setAttribute("data-count", String(count));
			if (statusEl) statusEl.textContent = `count=${count}`;
		};

		render();

		// View listens to model changes (MVC).
		this.data.model.on("change", e => {
			if (e && e.name === "count") render();
		});

		// Controller updates model.
		if (btnEl) {
			btnEl.addEventListener("click", () => {
				const next = getModelNumber(this.data.model, "count", 0) + 1;
				this.data.model.set("count", next);
			});
		}
	}
}

DataModelMvcDemo.css = `
.data-model-mvc {
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

.data-model-mvc__status {
  font-variant-numeric: tabular-nums;
}

.data-model-mvc__btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.data-model-mvc__btn:hover {
  background: #262626;
}
`;

controls.data_model_mvc_demo = DataModelMvcDemo;

class DataModelMvcPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "data_model_mvc_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h1", __type_name: "h1" });
		title.add_text("Data_Model server→client bridge (MVC)");

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(DataModelMvcDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(title);
		host.add(new DataModelMvcDemo({ context }));
		this.body.add(host);
	}
}

controls.data_model_mvc_page = DataModelMvcPage;

module.exports = jsgui;
