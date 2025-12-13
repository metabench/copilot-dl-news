"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..", "..", "..", "..");

function run(command) {
  const result = spawnSync(command, {
    cwd: workspaceRoot,
    shell: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50
  });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function main() {
  const targets = [
    "jsgui3-client",
    "jsgui3-html",
    "jsgui3-html-ssr",
    "jsgui3-html-core",
    "jsgui3-html-enh",
    "jsgui3-html-page-context"
  ];

  const cmd = `npm ls ${targets.join(" ")} --depth=6`;
  const r = run(cmd);
  const out = {
    timestamp: new Date().toISOString(),
    command: cmd,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr
  };

  const outPath = path.join(__dirname, "npm-tree.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${outPath} (exit ${r.status})`);
  if (r.stderr.trim()) {
    console.error(r.stderr.trim());
  }
  if (r.stdout.trim()) {
    console.log(r.stdout.trim());
  }

  process.exitCode = r.status;
}

main();
