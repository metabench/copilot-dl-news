"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { getClientBundleStatus } = require("../../../src/ui/server/utils/ensureClientBundle");

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function setMtimeMs(filePath, mtimeMs) {
  const d = new Date(mtimeMs);
  fs.utimesSync(filePath, d, d);
}

describe("getClientBundleStatus", () => {
  test("needsBuild=true when bundle missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ui-client-status-"));

    const entryPath = path.join(root, "src", "ui", "client", "index.js");
    const buildScript = path.join(root, "scripts", "build-ui-client.js");

    writeFile(entryPath, "console.log('entry');\n");
    writeFile(buildScript, "console.log('build');\n");

    const status = getClientBundleStatus({ projectRoot: root });

    expect(status.exists).toBe(false);
    expect(status.needsBuild).toBe(true);
  });

  test("needsBuild=true when entry newer than bundle", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ui-client-status-"));

    const entryPath = path.join(root, "src", "ui", "client", "index.js");
    const buildScript = path.join(root, "scripts", "build-ui-client.js");
    const bundlePath = path.join(root, "public", "assets", "ui-client.js");

    writeFile(entryPath, "console.log('entry');\n");
    writeFile(buildScript, "console.log('build');\n");
    writeFile(bundlePath, "console.log('bundle');\n");

    const t0 = Date.now() - 60_000;
    setMtimeMs(bundlePath, t0);
    setMtimeMs(buildScript, t0);
    setMtimeMs(entryPath, t0 + 5_000);

    const status = getClientBundleStatus({ projectRoot: root });

    expect(status.exists).toBe(true);
    expect(status.needsBuild).toBe(true);
  });

  test("needsBuild=false when bundle newer than entry + build script", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ui-client-status-"));

    const entryPath = path.join(root, "src", "ui", "client", "index.js");
    const buildScript = path.join(root, "scripts", "build-ui-client.js");
    const bundlePath = path.join(root, "public", "assets", "ui-client.js");

    writeFile(entryPath, "console.log('entry');\n");
    writeFile(buildScript, "console.log('build');\n");
    writeFile(bundlePath, "console.log('bundle');\n");

    const t0 = Date.now() - 60_000;
    setMtimeMs(entryPath, t0);
    setMtimeMs(buildScript, t0);
    setMtimeMs(bundlePath, t0 + 10_000);

    const status = getClientBundleStatus({ projectRoot: root });

    expect(status.exists).toBe(true);
    expect(status.needsBuild).toBe(false);
  });
});
