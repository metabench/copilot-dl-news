"use strict";

const { createScanningIndicatorControl } = require("../../ui/controls/scanningIndicatorControl");

function createStubJsgui() {
  class Control {
    constructor(spec = {}) {
      this.context = spec.context || {};
      this.dom = { el: spec.el ?? null, attributes: {} };
      this.content = [];
    }

    add_class() {}
    remove_class() {}

    add(child) {
      this.content.push(child);
    }
  }

  class Div extends Control {}

  return {
    Control,
    div: Div
  };
}

class StringControlStub {
  constructor() {}
}

describe("ScanningIndicatorControl", () => {
  test("setTotal() switches from counting to determinate progress", () => {
    const jsgui = createStubJsgui();
    const ScanningIndicatorControl = createScanningIndicatorControl(jsgui, {
      StringControl: StringControlStub
    });

    const ctrl = new ScanningIndicatorControl({ context: {} });

    // Attach DOM stubs for update methods to write into.
    const progressFillEl = { style: { width: "" } };
    const progressTextEl = { textContent: "" };
    const subtitleEl = { textContent: "" };

    ctrl._progressFillEl.dom.el = progressFillEl;
    ctrl._progressTextEl.dom.el = progressTextEl;
    ctrl._subtitleEl.dom.el = subtitleEl;

    ctrl.startCounting();
    ctrl.setCountingProgress(3, "src/example.js");

    expect(progressTextEl.textContent).toContain("Counting files");

    // When total arrives, we should leave counting mode immediately.
    ctrl.setTotal(10);

    expect(ctrl._isCounting).toBe(false);
    expect(progressFillEl.style.width).toBe("0%");
    expect(progressTextEl.textContent).toBe("0 / 10 files");

    ctrl.setProgress(5, 10, "src/another.js");
    expect(progressFillEl.style.width).toBe("50%");
    expect(progressTextEl.textContent).toBe("5 / 10 files");
  });
});
