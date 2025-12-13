"use strict";

/**
 * Small JSONL stream parser for child-process stdout.
 *
 * Edge cases handled:
 * - Chunk boundaries splitting JSON
 * - CRLF newlines
 * - Trailing buffer on process close
 * - Non-JSON lines intermixed (ignored)
 * - Buffer growth guard (prevents unbounded memory)
 */

class JsonlStreamParser {
  constructor({
    onJson,
    onNonJsonLine,
    maxBufferChars = 1024 * 1024
  } = {}) {
    this._buffer = "";
    this._maxBufferChars = maxBufferChars;
    this._onJson = typeof onJson === "function" ? onJson : () => {};
    this._onNonJsonLine = typeof onNonJsonLine === "function" ? onNonJsonLine : () => {};
  }

  push(chunk) {
    if (chunk == null) return;

    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    this._buffer += text;

    if (this._buffer.length > this._maxBufferChars) {
      // Drop buffer to avoid runaway memory. Treat as non-json noise.
      this._onNonJsonLine(this._buffer.slice(0, 2000));
      this._buffer = "";
      return;
    }

    this._drainLines(false);
  }

  flush() {
    this._drainLines(true);
  }

  _drainLines(flushTail) {
    const lines = this._buffer.split(/\r?\n/);

    // If not flushing, keep the last partial line in buffer.
    this._buffer = flushTail ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        this._onJson(parsed);
      } catch (error) {
        this._onNonJsonLine(trimmed);
      }
    }

    if (!flushTail) return;

    const tail = (this._buffer || "").trim();
    if (!tail) return;
    try {
      const parsed = JSON.parse(tail);
      this._onJson(parsed);
    } catch (_) {
      this._onNonJsonLine(tail);
    } finally {
      this._buffer = "";
    }
  }
}

module.exports = { JsonlStreamParser };
