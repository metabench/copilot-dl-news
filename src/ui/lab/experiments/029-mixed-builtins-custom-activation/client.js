"use strict";

const { installConsoleNoiseFilter } = require("../../../client/consoleNoiseFilter");
installConsoleNoiseFilter();

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

let Color_Grid = null;
let colorGridRequireError = null;
try {
	// Built-in (jsgui3-html) control. The exact path is stable within this repo.
	Color_Grid = require("jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid");
} catch (e) {
	colorGridRequireError = e;
}

function toSingleQuoteJson(value) {
	return JSON.stringify(value).replace(/"/g, "'");
}

function safeMapGet(mapLike, key) {
	if (!mapLike || !key) return null;
	if (typeof mapLike.get === "function") return mapLike.get(key) || null;
	return mapLike[key] || null;
}

class MixedActivationLeaf extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "mixed_activation_leaf"
		});

		this.add_class("mixed-activation__leaf");

		if (!spec.el) {
			this.compose();
			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({ clicks: 0 });
		}
	}

	compose() {
		const { context } = this;

		const status = new Control({ context, tagName: "span", __type_name: "span" });
		status.add_class("mixed-activation__status");
		status.add_text("clicks=0");

		const btn = new Control({ context, tagName: "button", __type_name: "button" });
		btn.add_class("mixed-activation__btn");
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

		const setClicks = next => {
			if (!this._persisted_fields) this._persisted_fields = {};
			this._persisted_fields.clicks = next;
			root.setAttribute("data-clicks", String(next));

			const statusEl = this.status && this.status.dom ? this.status.dom.el : null;
			if (statusEl) statusEl.textContent = `clicks=${next}`;
		};

		setClicks(getClicks());

		const btnEl = this.btn && this.btn.dom ? this.btn.dom.el : null;
		if (btnEl) btnEl.addEventListener("click", () => setClicks(getClicks() + 1));
	}
}

controls.mixed_activation_leaf = MixedActivationLeaf;

class MixedActivationPanel extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "div",
			__type_name: spec.__type_name || "mixed_activation_panel"
		});

		this.add_class("mixed-activation__panel");

		if (!spec.el) {
			this.compose();
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "h2", __type_name: "h2" });
		title.add_text("Mixed Built-in + Custom Activation Lab");

		const note = new Control({ context, tagName: "p", __type_name: "p" });
		note.add_text(
			"Includes a jsgui3-html built-in control (Color_Grid) plus custom controls, and emits structured activation diagnostics."
		);

		const builtins = new Control({ context, tagName: "section", __type_name: "section" });
		builtins.add_class("mixed-activation__builtins");

		const builtinsTitle = new Control({ context, tagName: "h3", __type_name: "h3" });
		builtinsTitle.add_text("Built-in controls");
		builtins.add(builtinsTitle);

		const gridHost = new Control({ context, tagName: "div", __type_name: "div" });
		gridHost.add_class("mixed-activation__color-grid-host");

		if (Color_Grid) {
			const grid = new Color_Grid({
				context,
				grid_size: [3, 1],
				palette: ["#ff4d4d", "#4dff4d", "#4d4dff"],
				size: [180, 50],
				cell_selection: "single"
			});
			gridHost.add(grid);
		} else {
			const missing = new Control({ context, tagName: "div", __type_name: "div" });
			missing.add_class("mixed-activation__builtin-missing");
			missing.add_text("Color_Grid require() failed; see activation report.");
			gridHost.add(missing);
		}

		builtins.add(gridHost);

		const custom = new Control({ context, tagName: "section", __type_name: "section" });
		custom.add_class("mixed-activation__custom");

		const customTitle = new Control({ context, tagName: "h3", __type_name: "h3" });
		customTitle.add_text("Custom controls");

		const leafHost = new Control({ context, tagName: "div", __type_name: "div" });
		leafHost.add_class("mixed-activation__leaf-host");

		for (let i = 0; i < 3; i++) leafHost.add(new MixedActivationLeaf({ context }));

		custom.add(customTitle);
		custom.add(leafHost);

		this.add(title);
		this.add(note);
		this.add(builtins);
		this.add(custom);

		this.dom.attributes["data-jsgui-ctrl-fields"] = toSingleQuoteJson({
			builtins: builtins._id(),
			custom: custom._id()
		});
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
			missingContextConstructors: [],
			missingInstances: [],
			nonActivatedLeaves: 0,
			builtins: {
				colorGridAvailable: !!Color_Grid,
				colorGridRequireError: colorGridRequireError ? String(colorGridRequireError) : null,
				colorGridHasAnyJsguiNode: false
			}
		};

		const requiredCustomTypes = new Set([
			"mixed_activation_page",
			"mixed_activation_panel",
			"mixed_activation_leaf"
		]);

		const typeEls = Array.from(root.querySelectorAll("[data-jsgui-id]"));
		for (const node of typeEls) {
			const id = node.getAttribute("data-jsgui-id");
			const type = node.getAttribute("data-jsgui-type");

			if (!type) {
				report.missingTypes.push(node.tagName.toLowerCase());
				continue;
			}

			if (requiredCustomTypes.has(type)) {
				if (!controls[type]) report.missingConstructors.push(type);

				const ctxCtor = this.context && this.context.map_Controls ? this.context.map_Controls[type] : null;
				if (!ctxCtor) report.missingContextConstructors.push(type);

				const inst = safeMapGet(this.context && this.context.map_controls, id);
				if (!inst) report.missingInstances.push({ type, id });
			}
		}

		const leaves = Array.from(root.querySelectorAll(".mixed-activation__leaf"));
		for (const leaf of leaves) {
			if (leaf.getAttribute("data-leaf-activated") !== "1") report.nonActivatedLeaves++;
		}

		const colorGridHost = root.querySelector(".mixed-activation__color-grid-host");
		if (colorGridHost && colorGridHost.querySelector("[data-jsgui-id]")) {
			report.builtins.colorGridHasAnyJsguiNode = true;
		}

		report.missingTypes = Array.from(new Set(report.missingTypes));
		report.missingConstructors = Array.from(new Set(report.missingConstructors));
		report.missingContextConstructors = Array.from(new Set(report.missingContextConstructors));

		const ok =
			report.missingTypes.length === 0 &&
			report.missingConstructors.length === 0 &&
			report.missingContextConstructors.length === 0 &&
			report.missingInstances.length === 0 &&
			report.nonActivatedLeaves === 0 &&
			report.builtins.colorGridAvailable === true;

		root.setAttribute("data-activation-contract", ok ? "ok" : "fail");
		root.setAttribute("data-activated", "1");

		window.__mixed_activation_report = report;

		if (window.__COPILOT_ACTIVATION_DEBUG__ === true) {
			console.log("[copilot] mixed activation report", report);
			if (window.__COPILOT_ACTIVATION_DEBUG_VERBOSE__ === true && report.missingInstances.length) {
				console.warn("[copilot] missingInstances", report.missingInstances);
			}
		}
	}
}

controls.mixed_activation_panel = MixedActivationPanel;

class MixedActivationPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "mixed_activation_page" });
		if (!spec.el) this.compose();
	}

	compose() {
		const { context } = this;

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(`
.mixed-activation__panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  background: #121212;
  color: #e7e7e7;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.mixed-activation__builtins, .mixed-activation__custom {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #333;
  border-radius: 10px;
  background: #181818;
}

.mixed-activation__leaf-host {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.mixed-activation__leaf {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  background: #1a1a1a;
}

.mixed-activation__status {
  font-variant-numeric: tabular-nums;
}

.mixed-activation__btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.mixed-activation__btn:hover {
  background: #262626;
}

.mixed-activation__builtin-missing {
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed #5a3a3a;
  background: #221616;
}
`);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(new MixedActivationPanel({ context }));
		this.body.add(host);
	}
}

controls.mixed_activation_page = MixedActivationPage;

module.exports = jsgui;
