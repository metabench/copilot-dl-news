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

function getModelValue(model, key) {
	if (!model || typeof model.get !== "function") return undefined;
	const stored = model.get(key);
	if (stored && stored.__data_value) return stored.value;
	return stored;
}

class RemoteObservableDemo extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "remote_observable_demo"
		});

		ensure_control_models(this, spec);
		this.add_class("remote-obs-demo");

		if (!spec.el) {
			this.compose();

			this.data.model.set("counter", 0, true);
			this.data.model.set("status", "connecting", true);
			this.data.model.set("transport", spec.transport || "jsgui3", true);

			const basePath = spec.basePath || "/api/remote-obs";
			const sseUrl = `${basePath}/events`;
			const cmdUrl = `${basePath}/command`;

			this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({
				encodedDataModel: this.data.model.toJSON(),
				sseUrl,
				cmdUrl
			});
		}
	}

	compose() {
		const { context } = this;

		const title = new Control({ context, tagName: "div", __type_name: "div" });
		title.add_class("remote-obs-demo__title");
		title.add_text("Remote Observable: server fnl.observable → SSE → client observable");

		const summary = new Control({ context, tagName: "div", __type_name: "div" });
		summary.add_class("remote-obs-demo__summary");
		summary.add_text("counter=0 status=connecting");

		const buttons = new Control({ context, tagName: "div", __type_name: "div" });
		buttons.add_class("remote-obs-demo__buttons");

		const pauseBtn = new Control({ context, tagName: "button", __type_name: "button" });
		pauseBtn.add_class("remote-obs-demo__btn");
		pauseBtn.dom.attributes["data-action"] = "pause";
		pauseBtn.add_text("Pause");

		const resumeBtn = new Control({ context, tagName: "button", __type_name: "button" });
		resumeBtn.add_class("remote-obs-demo__btn");
		resumeBtn.dom.attributes["data-action"] = "resume";
		resumeBtn.add_text("Resume");

		const cancelBtn = new Control({ context, tagName: "button", __type_name: "button" });
		cancelBtn.add_class("remote-obs-demo__btn");
		cancelBtn.dom.attributes["data-action"] = "cancel";
		cancelBtn.add_text("Cancel");

		buttons.add(pauseBtn);
		buttons.add(resumeBtn);
		buttons.add(cancelBtn);

		const log = new Control({ context, tagName: "pre", __type_name: "pre" });
		log.add_class("remote-obs-demo__log");
		log.add_text("(log)\n");

		this.add(title);
		this.add(summary);
		this.add(buttons);
		this.add(log);

		// Intentionally avoid ctrl_fields for this lab: keep activation simple and DOM-query based.
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
			} catch (_) {}
		}

		const summaryEl = root.querySelector(".remote-obs-demo__summary");
		const logEl = root.querySelector(".remote-obs-demo__log");

		const pauseEl = root.querySelector('button[data-action="pause"]');
		const resumeEl = root.querySelector('button[data-action="resume"]');
		const cancelEl = root.querySelector('button[data-action="cancel"]');

		function appendLog(line) {
			if (!logEl) return;
			logEl.textContent += `${line}\n`;
		}

		function render() {
			const counter = getModelValue(this.data.model, "counter") ?? 0;
			const status = getModelValue(this.data.model, "status") ?? "unknown";
			const transport = getModelValue(this.data.model, "transport") ?? "unknown";
			root.setAttribute("data-counter", String(counter));
			root.setAttribute("data-status", String(status));
			if (summaryEl) summaryEl.textContent = `counter=${counter} status=${status} (${transport})`;
		}

		this.data.model.on("change", (e) => {
			if (!e || !e.name) return;
			if (e.name === "counter" || e.name === "status" || e.name === "transport") render.call(this);
		});

		render.call(this);

		const sseUrl = (fields && fields.sseUrl) || "";
		const cmdUrl = (fields && fields.cmdUrl) || "";
		if (!sseUrl || !cmdUrl) {
			this.data.model.set("status", "missing-urls");
			return;
		}

		// Load lab framework scripts (served by the server).
		const hasClient = typeof window.createRemoteObservableClient === "function";
		if (!hasClient) {
			this.data.model.set("status", "missing-client-framework");
			appendLog("missing client framework");
			return;
		}

		const client = window.createRemoteObservableClient({ url: sseUrl });
		client.obs.on("info", (msg) => {
			appendLog(`info ${msg && msg.type ? msg.type : ""}`.trim());
		});
		client.obs.on("next", (value) => {
			if (value && typeof value.counter === "number") this.data.model.set("counter", value.counter);
			if (value && typeof value.status === "string") this.data.model.set("status", value.status);
		});
		client.obs.on("error", () => {
			this.data.model.set("status", "error");
		});
		client.obs.on("complete", () => {
			this.data.model.set("status", "complete");
		});

		client.connect();

		const callCommand = async (name, payload) => {
			try {
				await client.command(cmdUrl, name, payload);
				appendLog(`cmd ${name}`);
			} catch (e) {
				appendLog(`cmd ${name} failed: ${String((e && e.message) || e)}`);
			}
		};

		if (pauseEl) pauseEl.addEventListener("click", () => callCommand("pause"));
		if (resumeEl) resumeEl.addEventListener("click", () => callCommand("resume"));
		if (cancelEl) cancelEl.addEventListener("click", () => callCommand("cancel"));
	}
}

RemoteObservableDemo.css = `
.remote-obs-demo {
  display: inline-flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  background: #121212;
  color: #e7e7e7;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  min-width: 420px;
}
.remote-obs-demo__title { font-weight: 600; }
.remote-obs-demo__summary { font-variant-numeric: tabular-nums; opacity: 0.9; }
.remote-obs-demo__buttons { display: flex; gap: 8px; }
.remote-obs-demo__btn {
  background: #1b1b1b;
  border: 1px solid #333;
  border-radius: 8px;
  color: #e7e7e7;
  padding: 6px 10px;
  cursor: pointer;
}
.remote-obs-demo__btn:hover { border-color: #555; }
.remote-obs-demo__log {
  background: #0c0c0c;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 10px;
  max-height: 140px;
  overflow: auto;
  font-size: 12px;
}
`;

controls.remote_observable_demo = RemoteObservableDemo;

class RemoteObservablePage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "remote_observable_page" });
		if (!spec.el) this.compose(spec);
	}

	compose(spec) {
		const { context } = this;
		const transport = spec && spec.transport ? spec.transport : "jsgui3";

		const style = new Control({ context, tagName: "style", __type_name: "style" });
		style.add_text(RemoteObservableDemo.css);
		this.head.add(style);

		const favicon = new Control({ context, tagName: "link", __type_name: "link" });
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		// Load framework scripts (no bundler).
		const shared = new Control({ context, tagName: "script", __type_name: "script" });
		shared.dom.attributes.src = "/public/shared.js";
		this.head.add(shared);

		const client = new Control({ context, tagName: "script", __type_name: "script" });
		client.dom.attributes.src = "/public/clientRemoteObservable.js";
		this.head.add(client);

		const host = new Control({ context, tagName: "main", __type_name: "main" });
		host.add(new RemoteObservableDemo({ context, transport, basePath: "/api/remote-obs" }));
		this.body.add(host);
	}
}

controls.remote_observable_page = RemoteObservablePage;

module.exports = jsgui;
