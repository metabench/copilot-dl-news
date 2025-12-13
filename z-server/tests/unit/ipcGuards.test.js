"use strict";

const path = require("path");

const {
  normalizeAbsolutePath,
  isPathInsideBase,
  validateServerFilePath,
  validateExternalUrl,
  isPidLikelyRunningServer
} = require("../../lib/ipcGuards");

describe("ipcGuards", () => {
  describe("normalizeAbsolutePath", () => {
    it("returns null for non-string", () => {
      expect(normalizeAbsolutePath(null)).toBe(null);
      expect(normalizeAbsolutePath(123)).toBe(null);
    });

    it("returns resolved absolute path", () => {
      const result = normalizeAbsolutePath("./foo/bar");
      expect(path.isAbsolute(result)).toBe(true);
      expect(result.toLowerCase()).toContain(path.join("foo", "bar").toLowerCase());
    });
  });

  describe("isPathInsideBase", () => {
    it("accepts base itself", () => {
      expect(isPathInsideBase("C:/repo", "C:/repo")).toBe(true);
    });

    it("accepts child path", () => {
      expect(isPathInsideBase("C:/repo/src/app.js", "C:/repo")).toBe(true);
    });

    it("rejects sibling traversal", () => {
      expect(isPathInsideBase("C:/repo2/src/app.js", "C:/repo")).toBe(false);
    });
  });

  describe("validateServerFilePath", () => {
    it("rejects when allowlist missing", () => {
      const base = path.resolve("C:/repo");
      const result = validateServerFilePath("C:/repo/src/ui/server/foo.js", {
        basePath: base,
        allowedServerFiles: new Set()
      });
      expect(result.ok).toBe(false);
    });

    it("rejects outside base", () => {
      const base = path.resolve("C:/repo");
      const allowed = new Set([path.resolve("C:/repo/src/a.js")]);
      const result = validateServerFilePath("C:/other/src/a.js", {
        basePath: base,
        allowedServerFiles: allowed
      });
      expect(result.ok).toBe(false);
    });

    it("accepts inside base and allowlisted", () => {
      const base = path.resolve("C:/repo");
      const target = path.resolve("C:/repo/src/a.js");
      const allowed = new Set([target]);
      const result = validateServerFilePath(target, {
        basePath: base,
        allowedServerFiles: allowed
      });
      expect(result).toEqual({ ok: true, filePath: target });
    });
  });

  describe("validateExternalUrl", () => {
    it("rejects non-http schemes", () => {
      const result = validateExternalUrl("file:///C:/Windows/System32/calc.exe");
      expect(result.ok).toBe(false);
    });

    it("rejects non-local host by default", () => {
      const result = validateExternalUrl("https://example.com/");
      expect(result.ok).toBe(false);
    });

    it("accepts localhost http", () => {
      const result = validateExternalUrl("http://localhost:3000/");
      expect(result.ok).toBe(true);
    });
  });

  describe("isPidLikelyRunningServer", () => {
    it("returns false if not confirmable", async () => {
      const ok = await isPidLikelyRunningServer(123, "C:/repo/src/server.js", {
        getProcessInfo: async () => ({ name: "node.exe", pid: 123 }),
        getProcessCommandLine: async () => null
      });
      expect(ok).toBe(false);
    });

    it("returns true when node cmdline includes basename", async () => {
      const ok = await isPidLikelyRunningServer(123, "C:/repo/src/server.js", {
        getProcessInfo: async () => ({ name: "node.exe", pid: 123 }),
        getProcessCommandLine: async () => "node C:/repo/src/server.js"
      });
      expect(ok).toBe(true);
    });

    it("returns false for non-node process", async () => {
      const ok = await isPidLikelyRunningServer(123, "C:/repo/src/server.js", {
        getProcessInfo: async () => ({ name: "python.exe", pid: 123 }),
        getProcessCommandLine: async () => "python C:/repo/src/server.js"
      });
      expect(ok).toBe(false);
    });
  });
});
