"use strict";

const { normalizeScanProgressMessage } = require("../../lib/scanProgressProtocol");

describe("scanProgressProtocol", () => {
  test("normalizes and clamps progress fields", () => {
    expect(normalizeScanProgressMessage({ type: "count-start" })).toEqual({ type: "count-start" });

    expect(normalizeScanProgressMessage({ type: "count-progress", current: "3", file: 123 })).toEqual({
      type: "count-progress",
      current: 3,
      file: "123"
    });

    expect(normalizeScanProgressMessage({ type: "count", total: -5 })).toEqual({
      type: "count",
      total: 0
    });

    expect(normalizeScanProgressMessage({ type: "progress", current: 99, total: 10, file: null })).toEqual({
      type: "progress",
      current: 10,
      total: 10,
      file: null
    });

    expect(normalizeScanProgressMessage({ type: "complete" })).toEqual({ type: "complete" });
  });

  test("rejects unknown or malformed messages", () => {
    expect(normalizeScanProgressMessage(null)).toBeNull();
    expect(normalizeScanProgressMessage({})).toBeNull();
    expect(normalizeScanProgressMessage({ type: "result" })).toBeNull();
    expect(normalizeScanProgressMessage({ type: 123 })).toBeNull();
  });
});
