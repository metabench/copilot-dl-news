"use strict";

const jsgui = require("../jsgui");
const { prop } = require("obext");

const { Control, String_Control } = jsgui;

class CounterControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });

    this.add_class("counter-demo");
    this.dom.attributes["data-jsgui-control"] = "counter_demo";

    const initialCount = Number.isFinite(spec.initialCount) ? spec.initialCount : 0;
    prop(this, "count", initialCount);

    this._domListener = null;

    if (!spec.el) this.compose();
  }

  compose() {
    const ctx = this.context;

    const label = new Control({ context: ctx, tagName: "div" });
    label.add_class("counter-demo__label");
    label.add(new String_Control({ context: ctx, text: "Counter (jsgui3 SSR + activation)" }));

    const row = new Control({ context: ctx, tagName: "div" });
    row.add_class("counter-demo__row");

    const value = new Control({ context: ctx, tagName: "span" });
    value.add_class("counter-demo__value");
    value.add(new String_Control({ context: ctx, text: String(this.count) }));

    const incBtn = new Control({ context: ctx, tagName: "button" });
    incBtn.add_class("counter-demo__btn");
    incBtn.dom.attributes.type = "button";
    incBtn.add(new String_Control({ context: ctx, text: "Increment" }));

    const resetBtn = new Control({ context: ctx, tagName: "button" });
    resetBtn.add_class("counter-demo__reset");
    resetBtn.dom.attributes.type = "button";
    resetBtn.add(new String_Control({ context: ctx, text: "Reset" }));

    row.add(value);
    row.add(incBtn);
    row.add(resetBtn);

    this.add(label);
    this.add(row);

    this._valueControl = value;
    this._incBtnControl = incBtn;
    this._resetBtnControl = resetBtn;
  }

  activate() {
    if (this.__active) return;
    this.__active = true;

    const rootEl = this.dom?.el;
    if (!rootEl) return;

    const valueEl = rootEl.querySelector?.(".counter-demo__value");
    const incBtnEl = rootEl.querySelector?.(".counter-demo__btn");
    const resetBtnEl = rootEl.querySelector?.(".counter-demo__reset");

    const onInc = () => {
      this.count = Number(this.count || 0) + 1;
    };

    const onReset = () => {
      this.count = 0;
    };

    incBtnEl?.addEventListener?.("click", onInc);
    resetBtnEl?.addEventListener?.("click", onReset);

    this._domListener = () => {
      incBtnEl?.removeEventListener?.("click", onInc);
      resetBtnEl?.removeEventListener?.("click", onReset);
    };

    this.on("change", (e) => {
      if (e?.name !== "count") return;
      const nextValue = String(this.count);
      if (valueEl) valueEl.textContent = nextValue;
      rootEl.setAttribute?.("data-count", nextValue);
    });

    // Initial render state.
    const initialText = String(this.count);
    if (valueEl) valueEl.textContent = initialText;
    rootEl.setAttribute?.("data-count", initialText);

    if (typeof window !== "undefined") {
      const registry = (window.__COPILOT_REGISTERED_CONTROLS__ = window.__COPILOT_REGISTERED_CONTROLS__ || []);
      if (!registry.includes("counter_demo")) registry.push("counter_demo");
      window.__COPILOT_CONTROL_HARNESS_READY__ = true;
    }
  }

  deactivate() {
    if (typeof this._domListener === "function") {
      this._domListener();
    }
    this._domListener = null;
    this.__active = false;
  }
}

module.exports = { CounterControl };
