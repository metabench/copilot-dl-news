"use strict";

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

function toSingleQuoteJson(value) {
  return JSON.stringify(value).replace(/"/g, "'");
}

class CtrlFieldsDemo extends Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "section",
      __type_name: spec.__type_name || "ctrl_fields_demo"
    });

    this.add_class("ctrl-fields-demo");

    if (!spec.el) {
      this.compose();

      // Persisted fields: hydrated by ControlEnh when spec.el exists.
      // Use single-quoted JSON; the hydrator normalizes quotes.
      this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({ count: 0 });
    }
  }

  compose() {
    const context = this.context;

    const tag = (tagName, spec = {}) => {
      const Ctor = jsgui[tagName] || Control;
      return new Ctor({ context, tagName, __type_name: tagName, ...spec });
    };

    const status = tag("span");
    status.add_class("ctrl-fields-demo__status");
    status.add_text("count=0");

    const btn = tag("button");
    btn.add_class("ctrl-fields-demo__btn");
    btn.add_text("Increment");

    this.add(status);
    this.add(btn);

    // ctrl_fields: hydrated by pre_activate_content_controls via data-jsgui-ctrl-fields.
    // Keys become properties on the reconstructed instance: this.status, this.btn
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

    const getCount = () => {
      const value = this._persisted_fields && this._persisted_fields.count;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const setCount = (next) => {
      if (!this._persisted_fields) this._persisted_fields = {};
      this._persisted_fields.count = next;
      root.setAttribute("data-count", String(next));

      const statusEl = this.status && this.status.dom ? this.status.dom.el : null;
      if (statusEl) {
        statusEl.textContent = `count=${next}`;
      }
    };

    setCount(getCount());

    const btnEl = this.btn && this.btn.dom ? this.btn.dom.el : null;
    if (btnEl) {
      btnEl.addEventListener("click", () => {
        setCount(getCount() + 1);
      });
    }
  }
}

CtrlFieldsDemo.css = `
.ctrl-fields-demo {
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

.ctrl-fields-demo__status {
  font-variant-numeric: tabular-nums;
}

.ctrl-fields-demo__btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: inherit;
  cursor: pointer;
}

.ctrl-fields-demo__btn:hover {
  background: #262626;
}
`;

// Ensure the activation pipeline can reconstruct by __type_name.
controls.ctrl_fields_demo = CtrlFieldsDemo;

class ActivationLabPage extends Active_HTML_Document {
  constructor(spec = {}) {
    super({ ...spec, __type_name: spec.__type_name || "activation_lab_page" });
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const context = this.context;

    const tag = (tagName, spec = {}) => {
      const Ctor = jsgui[tagName] || Control;
      return new Ctor({ context, tagName, __type_name: tagName, ...spec });
    };

    const title = tag("h1");
    title.add_text("jsgui3-server activation + ctrl_fields");

    const style = tag("style");
    style.add_text(CtrlFieldsDemo.css);
    this.head.add(style);

    const favicon = tag("link");
    favicon.dom.attributes.rel = "icon";
    favicon.dom.attributes.href = "data:,";
    this.head.add(favicon);

    const host = tag("main");
    host.add(title);
    host.add(new CtrlFieldsDemo({ context }));
    this.body.add(host);
  }
}

controls.activation_lab_page = ActivationLabPage;

module.exports = jsgui;
