"use strict";

const { createZServerAppControl } = require("../../ui/controls/zServerAppControl");

function createStubJsgui() {
  class Control {
    constructor(spec = {}) {
      this.context = spec.context || {};
      this.dom = { el: spec.el ?? null, attributes: {} };
      this.content = [];
    }

    add_class() {}

    add(child) {
      this.content.push(child);
    }
  }

  class Div extends Control {}
  class H1 extends Control {}

  return {
    Control,
    div: Div,
    h1: H1
  };
}

class TitleBarControlStub {
  constructor() {}
}

class SidebarControlStub {
  constructor(spec = {}) {
    this._calls = spec._calls;
  }

  setServers(servers) {
    this._calls.push(["sidebar.setServers", servers.length]);
  }

  updateServerStatus(filePath, running) {
    this._calls.push(["sidebar.updateServerStatus", filePath, running]);
  }

  setServerRunningUrl(filePath, url) {
    this._calls.push(["sidebar.setServerRunningUrl", filePath, url]);
  }

  activate() {}
}

class ContentAreaControlStub {
  constructor(spec = {}) {
    this._calls = spec._calls;
  }

  setScanning(isScanning) {
    this._calls.push(["content.setScanning", isScanning]);
  }

  setScanCounting() {
    this._calls.push(["content.setScanCounting"]);
  }

  setScanCountingProgress(current, file) {
    this._calls.push(["content.setScanCountingProgress", current, file]);
  }

  setScanTotal(total) {
    this._calls.push(["content.setScanTotal", total]);
  }

  setScanProgress(current, total, file) {
    this._calls.push(["content.setScanProgress", current, total, file]);
  }

  addLog(type, data) {
    this._calls.push(["content.addLog", type, data]);
  }

  setSelectedServer() {}
  setLogs() {}
  setServerRunning() {}
  setRunningUrl() {}

  activate() {}
}

describe("ZServerAppControl scan-progress mapping", () => {
  test("handles 'complete' by forcing determinate 100% when total is known", async () => {
    const calls = [];
    const jsgui = createStubJsgui();
    const ZServerAppControl = createZServerAppControl(jsgui, {
      TitleBarControl: TitleBarControlStub,
      SidebarControl: class extends SidebarControlStub {
        constructor(spec = {}) {
          super({ ...spec, _calls: calls });
        }
      },
      ContentAreaControl: class extends ContentAreaControlStub {
        constructor(spec = {}) {
          super({ ...spec, _calls: calls });
        }
      }
    });

    let scanProgressHandler = null;

    const api = {
      onScanProgress: (cb) => {
        scanProgressHandler = cb;
      },
      scanServers: async () => {
        scanProgressHandler({ type: "count-start" });
        scanProgressHandler({ type: "count-progress", current: 3, file: "src/a.js" });
        scanProgressHandler({ type: "count", total: 10 });
        scanProgressHandler({ type: "progress", current: 6, total: 10, file: "src/b.js" });
        scanProgressHandler({ type: "complete" });
        return [];
      },
      onServerLog: () => {},
      onServerStatusChange: () => {}
    };

    const ctrl = new ZServerAppControl({ context: {}, api });
    await ctrl.init();

    // Key expectations:
    // - Scanning starts
    // - Progress events map to ContentArea methods
    // - 'complete' forces a final 10/10 update (truthful determinate completion)
    const completeIndex = calls.findIndex((c) => c[0] === "content.setScanProgress" && c[1] === 10 && c[2] === 10);
    expect(completeIndex).toBeGreaterThanOrEqual(0);

    // Scanning indicator should end hidden (finally block)
    expect(calls[calls.length - 1]).toEqual(["content.setScanning", false]);
  });
});
