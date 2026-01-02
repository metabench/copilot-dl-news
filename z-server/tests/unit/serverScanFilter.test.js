"use strict";

const path = require("path");

const {
  DEFAULT_SCAN_VISIBILITY,
  filterScannedServers
} = require("../../lib/serverScanFilter");

describe("serverScanFilter", () => {
  test("defaults only include ui servers", () => {
    const basePath = path.resolve("C:/repo");

    const servers = [
      { file: path.join(basePath, "src/ui/server/docsViewer/server.js"), score: 10 },
      { file: path.join(basePath, "src/ui/lab/experiments/024-foo/server.js"), score: 10 },
      { file: path.join(basePath, "tests/ui/e2e/app.puppeteer.e2e.test.js"), score: 10 },
      { file: path.join(basePath, "tools/dev/js-server-scan.js"), score: 99 },
      { file: path.join(basePath, "src/api/server.js"), score: 10 }
    ];

    const filtered = filterScannedServers(servers, { basePath, visibility: DEFAULT_SCAN_VISIBILITY });
    expect(filtered.map(s => s.scanCategory)).toEqual(["ui"]);
    expect(filtered[0].file.replace(/\\/g, "/")).toContain("src/ui/server/docsViewer/server.js");
  });

  test("can opt into lab servers", () => {
    const basePath = path.resolve("C:/repo");

    const servers = [
      { file: path.join(basePath, "src/ui/server/diagramAtlasServer.js"), score: 10 },
      { file: path.join(basePath, "src/ui/lab/experiments/024-foo/server.js"), score: 10 }
    ];

    const filtered = filterScannedServers(servers, {
      basePath,
      visibility: { ...DEFAULT_SCAN_VISIBILITY, labs: true }
    });

    expect(filtered.map(s => s.scanCategory).sort()).toEqual(["labs", "ui"]);
  });
});
