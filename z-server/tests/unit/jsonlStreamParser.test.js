"use strict";

const { JsonlStreamParser } = require("../../lib/jsonlStreamParser");

describe("JsonlStreamParser", () => {
  test("parses JSON lines across chunk boundaries and ignores non-JSON", () => {
    const json = [];
    const nonJson = [];

    const parser = new JsonlStreamParser({
      onJson: (msg) => json.push(msg),
      onNonJsonLine: (line) => nonJson.push(line)
    });

    parser.push('{"type":"count-start"}\n');

    // Chunk boundary inside JSON.
    parser.push('{"type":"count","total":');
    parser.push('10}\n');

    // CRLF and noise.
    parser.push('not json\r\n');

    // Partial final line without newline.
    parser.push('{"type":"progress","current":1,"total":10}');
    parser.flush();

    expect(json).toEqual([
      { type: "count-start" },
      { type: "count", total: 10 },
      { type: "progress", current: 1, total: 10 }
    ]);

    expect(nonJson).toContain("not json");
  });

  test("guards against runaway buffer growth", () => {
    const nonJson = [];
    const parser = new JsonlStreamParser({
      onNonJsonLine: (line) => nonJson.push(line),
      maxBufferChars: 20
    });

    parser.push("x".repeat(25));

    expect(nonJson.length).toBe(1);
  });
});
