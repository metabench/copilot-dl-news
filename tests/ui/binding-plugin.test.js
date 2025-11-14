"use strict";

const jsgui = require("jsgui3-html");
const { installBindingPlugin } = require("../../src/ui/jsgui/bindingPlugin");
const { PagerButtonControl } = require("../../src/ui/controls/PagerButton");

const toolkit = installBindingPlugin(jsgui);

describe("binding plugin", () => {
  test("bindViewToAttributes toggles DOM attributes and classes", () => {
    const context = new jsgui.Page_Context();
    const ctrl = new jsgui.Control({ context, tagName: "a" });

    ctrl.bindViewToAttributes({
      disabled: [
        { attr: "aria-disabled", boolean: true, trueValue: "true" },
        { toggleClass: "is-disabled" }
      ]
    });

    const viewModel = ctrl.ensureBindingViewModel();
    expect(ctrl.dom.attributes["aria-disabled"]).toBeUndefined();
    viewModel.set("disabled", true);
    expect(ctrl.dom.attributes["aria-disabled"]).toBe("true");
    expect(ctrl.dom.attributes.class).toContain("is-disabled");
    viewModel.set("disabled", false);
    expect(ctrl.dom.attributes["aria-disabled"]).toBeUndefined();
    expect(ctrl.dom.attributes.class || "").not.toContain("is-disabled");
  });

  test("bindDataToView syncs data model changes into the view model", () => {
    const context = new jsgui.Page_Context();
    const ctrl = new jsgui.Control({ context, tagName: "div" });
    ctrl.bindDataToView({ value: { to: "value" } });
    const dataModel = ctrl.ensureBindingDataModel();
    const viewModel = ctrl.ensureBindingViewModel();

    dataModel.set("value", "example");
    const viewValue = toolkit.normalizeValue(viewModel.get("value"));
    expect(viewValue).toBe("example");
  });

  test("PagerButtonControl integrates with binding plugin for state", () => {
    const context = new jsgui.Page_Context();
    const button = new PagerButtonControl({ context, text: "Next", href: "/next" });

    expect(button.dom.attributes.href).toBe("/next");
    expect(button.dom.attributes["aria-disabled"]).toBeUndefined();
    expect(button.dom.attributes.class).toContain("pager-button--kind-default");

    button.setDisabled(true);
    expect(button.dom.attributes["aria-disabled"]).toBe("true");
    expect(button.dom.attributes.tabindex).toBe("-1");
    expect(button.dom.attributes.href).toBeUndefined();
    expect(button.dom.attributes.class).toContain("pager-button--disabled");

    button.setDisabled(false);
    expect(button.dom.attributes["aria-disabled"]).toBeUndefined();
    expect(button.dom.attributes.tabindex).toBe("0");
    expect(button.dom.attributes.href).toBe("/next");

    button.setKind("next");
    expect(button.dom.attributes.class).toContain("pager-button--kind-next");
    expect(button.dom.attributes.class).not.toContain("pager-button--kind-default");
  });
});
