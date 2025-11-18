"use strict";

const {
  EVENT_NAME,
  emitUrlFilterDebug
} = require("../../../src/ui/controls/urlFilterDiagnostics");

describe("urlFilterDiagnostics", () => {
  afterEach(() => {
    delete global.window;
    delete global.CustomEvent;
  });

  test("stores entries and dispatches CustomEvent", () => {
    const dispatched = [];
    global.window = {
      dispatchEvent: jest.fn((evt) => dispatched.push(evt))
    };
    global.CustomEvent = jest.fn().mockImplementation((name, init) => ({ name, detail: init.detail }));

    const detail = { status: "success", diagnostics: { requestId: "r-123" } };
    const entry = emitUrlFilterDebug(detail);

    expect(entry.status).toBe("success");
    expect(window.__COPILOT_UI_DEBUG__.urlFilterToggle).toHaveLength(1);
    expect(window.__COPILOT_UI_DEBUG__.urlFilterToggle[0].diagnostics.requestId).toBe("r-123");
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ name: EVENT_NAME }));
    expect(dispatched[0].detail).toEqual(window.__COPILOT_UI_DEBUG__.urlFilterToggle[0]);
  });

  test("handles missing window gracefully", () => {
    const entry = emitUrlFilterDebug({ status: "noop" });
    expect(entry.status).toBe("noop");
    expect(global.window).toBeUndefined();
  });
});
