"use strict";

const jsgui = require("jsgui3-html");
const { installBindingPlugin } = require("../jsgui/bindingPlugin");
const { registerControlType } = require("./controlRegistry");

installBindingPlugin(jsgui);

const StringControl = jsgui.String_Control;

const CONTROL_TYPE = "pager_button";

class PagerButtonControl extends jsgui.Control {
  constructor(spec = {}) {
    const normalized = { ...spec, tagName: "a", __type_name: CONTROL_TYPE };
    super(normalized);
    this.dom.attributes.role = "button";
    this.dom.attributes.title = spec.title || spec.text || "";
    this.add_class("pager-button");
    this._hrefValue = spec.href || null;
    this._isDisabled = !!spec.disabled || !spec.href;
    if (this._hrefValue) {
      this.dom.attributes.href = this._hrefValue;
    }
    this.dom.attributes.tabindex = "0";
    if (spec.text) {
      this.add(new StringControl({ context: this.context, text: spec.text }));
    }
    this.ensureBindingViewModel({
      kind: spec.kind || "default",
      disabled: this._isDisabled
    });
    this.bindDataToView({
      disabled: { to: "disabled" },
      kind: { to: "kind" }
    });
    this.bindViewToAttributes({
      disabled: [
        { attr: "aria-disabled", boolean: true, trueValue: "true" },
        { toggleClass: "pager-button--disabled" },
        {
          onChange: (value, control) => {
            control._isDisabled = !!value;
            if (control._isDisabled) {
              delete control.dom.attributes.href;
              control.dom.attributes.tabindex = "-1";
            } else {
              control.dom.attributes.tabindex = "0";
              if (control._hrefValue) {
                control.dom.attributes.href = control._hrefValue;
              } else {
                delete control.dom.attributes.href;
              }
            }
          }
        }
      ],
      kind: [
        { attr: "data-kind" },
        { classPrefix: "pager-button--kind-" }
      ]
    });
    this.setKind(spec.kind || "default");
    this.setDisabled(this._isDisabled);
  }

  setDisabled(state) {
    const viewModel = this.ensureBindingViewModel();
    viewModel.set("disabled", !!state);
  }

  setHref(href) {
    this._hrefValue = href || null;
    if (!this._isDisabled && this._hrefValue) {
      this.dom.attributes.href = this._hrefValue;
    } else if (!this._hrefValue) {
      delete this.dom.attributes.href;
    }
  }

  setKind(kind) {
    const viewModel = this.ensureBindingViewModel();
    viewModel.set("kind", kind || "default");
  }
}

registerControlType(CONTROL_TYPE, PagerButtonControl);

module.exports = {
  PagerButtonControl
};
