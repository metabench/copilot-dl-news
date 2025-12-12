"use strict";

const {
  splitJsonlChunk,
  tryFormatTelemetryLine,
  isTelemetryV1
} = require("../../z-server/ui/lib/telemetryJsonl");

describe("z-server telemetry JSONL helpers", () => {
  test("buffers partial JSON until newline", () => {
    const line = JSON.stringify({
      v: 1,
      ts: "2025-12-11T00:00:00.000Z",
      level: "info",
      event: "server.listening",
      server: { name: "X", entry: "x", port: 1234, pid: 1, runId: "abc" },
      msg: "hello"
    });

    const first = splitJsonlChunk("", line.slice(0, 10));
    expect(first.lines).toEqual([]);
    expect(first.buffer.length).toBeGreaterThan(0);

    const second = splitJsonlChunk(first.buffer, `${line.slice(10)}\n`);
    expect(second.buffer).toBe("");
    expect(second.lines).toEqual([line]);

    const formatted = tryFormatTelemetryLine(second.lines[0]);
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("SERVER.LISTENING".toLowerCase());
  });

  test("ignores non-telemetry JSON", () => {
    const random = JSON.stringify({ ok: true, hello: "world" });
    expect(isTelemetryV1(JSON.parse(random))).toBe(false);
    expect(tryFormatTelemetryLine(random)).toBe(null);
  });

  test("supports CRLF newlines", () => {
    const evt = JSON.stringify({
      v: 1,
      ts: "2025-12-11T00:00:00.000Z",
      level: "warn",
      event: "server.error",
      server: { name: "X", entry: "x", port: 1234, pid: 1, runId: "abc" }
    });

    const result = splitJsonlChunk("", `${evt}\r\n`);
    expect(result.lines).toEqual([evt]);
    expect(result.buffer).toBe("");
  });
});
