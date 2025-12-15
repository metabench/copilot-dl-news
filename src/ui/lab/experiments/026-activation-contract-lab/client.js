"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

function toSingleQuoteJson(value) {
	return JSON.stringify(value).replace(/"/g, "'");
}

class ActivationContractLeaf extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "activation_contract_leaf"
		});

		this.add_class("activation-contract__leaf");

		if (!spec.el) {
			this.compose();
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({ clicks: 0 });
		}
	}

	compose() {
		const { context } = this;

		const status = new Control({ context, tagName: "span", __type_name: "span" });
		status.add_class("activation-contract__status");
		status.add_text("clicks=0");

		const btn = new Control({ context, tagName: "button", __type_name: "button" });
		btn.add_class("activation-contract__btn");
		btn.add_text("Click");

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
		root.setAttribute("data-leaf-activated", "1");

		const getClicks = () => {
			const v = this._persisted_fields && this._persisted_fields.clicks;
			const n = Number.parseInt(v, 10);
			return Number.isFinite(n) ? n : 0;
		};

		const setClicks = (next) => {
			if (!this._persisted_fields) this._persisted_fields = {};
			this._persisted_fields.clicks = next;
			root.setAttribute("data-clicks", String(next));

			const statusEl = this.status && this.status.dom ? this.status.dom.el : null;
			if (statusEl) statusEl.textContent = `clicks=${next}`;
		};

		setClicks(getClicks());

		const btnEl = this.btn && this.btn.dom ? this.btn.dom.el : null;
		if (btnEl) {
			btnEl.addEventListener("click", () => setClicks(getClicks() + 1));
		}
	}
}

controls.activation_contract_leaf = ActivationContractLeaf;

class ActivationContractPanel extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "div",
			__type_name: spec.__type_name || "activation_contract_panel"
		});

		this.add_class("activation-contract__panel");

		if (!spec.el) {
			this.compose();
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h2", __type_name: "h2" });
		title.add_text("Activation Contract Lab");

		const note = new Control({ context, tagName: "p", __type_name: "p" });
		note.add_text("All custom controls must run their activate() (no generic fallback).");

		const host = new Control({ context, tagName: "div", __type_name: "div" });
		host.add_class("activation-contract__host");

		for (let i = 0; i < 3; i++) {
			host.add(new ActivationContractLeaf({ context }));
		}

		this.add(title);
		this.add(note);
		this.add(host);
	}

	activate(el) {
		super.activate(el);
		if (this.__activatedOnce) return;
		this.__activatedOnce = true;

		const root = el || this.dom.el;
		if (!root) return;

		const report = {
			missingTypes: [],
			missingConstructors: [],
			nonActivatedLeaves: 0
		};

		const requiredCustomTypes = new Set([
			"activation_contract_page",
			"activation_contract_panel",
			"activation_contract_leaf"
		]);

		const typeEls = Array.from(root.querySelectorAll("[data-jsgui-id]"));
		for (const node of typeEls) {
			const type = node.getAttribute("data-jsgui-type");
			if (!type) {
				report.missingTypes.push(node.tagName.toLowerCase());
				continue;
			}

			// Only enforce constructors for the experiment's custom controls.
			// Plain tag controls (style/main/div/span/button/etc) may be reconstructed as generic Control.
			if (requiredCustomTypes.has(type) && !controls[type]) {
				report.missingConstructors.push(type);
			}
		}

		const leaves = Array.from(root.querySelectorAll(".activation-contract__leaf"));
		for (const leaf of leaves) {
			if (leaf.getAttribute("data-leaf-activated") !== "1") report.nonActivatedLeaves++;
		}

		report.missingTypes = Array.from(new Set(report.missingTypes));
		report.missingConstructors = Array.from(new Set(report.missingConstructors));

		const ok =
			report.missingTypes.length === 0 &&
			report.missingConstructors.length === 0 &&
			report.nonActivatedLeaves === 0;

		root.setAttribute("data-activation-contract", ok ? "ok" : "fail");
		root.setAttribute("data-activated", "1");

		window.__activation_contract_report = report;
	}
}

controls.activation_contract_panel = ActivationContractPanel;

class ActivationContractPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "activation_contract_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(`
.activation-contract__panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #121212;
  color: #e7e7e7;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.activation-contract__host {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.activation-contract__leaf {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  background: #181818;
}

.activation-contract__status {
  font-variant-numeric: tabular-nums;
}

.activation-contract__btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.activation-contract__btn:hover {
  background: #262626;
}
`);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(new ActivationContractPanel({ context }));
		this.body.add(host);
	}
}

controls.activation_contract_page = ActivationContractPage;

module.exports = jsgui;
