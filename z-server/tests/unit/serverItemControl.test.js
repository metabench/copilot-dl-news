"use strict";

const { createServerItemControl } = require("../../ui/controls/serverItemControl");

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
  class Span extends Control {}

  return {
    Control,
    div: Div,
    span: Span
  };
}

class StringControlStub {
  constructor() {}
}

describe("ServerItemControl", () => {
  test("activate() does not throw when dom.el is null", () => {
    const jsgui = createStubJsgui();
    const ServerItemControl = createServerItemControl(jsgui, { StringControl: StringControlStub });

    const ctrl = new ServerItemControl({
      context: {},
      server: { file: "x.js", relativeFile: "x.js", running: false },
      onSelect: () => {}
    });

    expect(() => ctrl.activate()).not.toThrow();
  });

  test("activate() only binds click handler once", () => {
    const jsgui = createStubJsgui();
    const ServerItemControl = createServerItemControl(jsgui, { StringControl: StringControlStub });

    let addCount = 0;
    const el = {
      classList: {
        add: () => {},
        remove: () => {}
      },
      addEventListener: () => {
        addCount += 1;
      }
    };

    const ctrl = new ServerItemControl({
      context: {},
      el,
      server: { file: "x.js", relativeFile: "x.js", running: false },
      onSelect: () => {}
    });

    ctrl.activate();
    ctrl.activate();

    expect(addCount).toBe(1);
  });
});
