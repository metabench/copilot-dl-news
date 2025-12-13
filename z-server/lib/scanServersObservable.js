"use strict";

const path = require("path");
const { spawn } = require("child_process");
const treeKill = require("tree-kill");

const { observable } = require("fnl");
const { JsonlStreamParser } = require("./jsonlStreamParser");
const { normalizeScanProgressMessage } = require("./scanProgressProtocol");

function defaultToolPath(basePath) {
  return path.join(basePath, "tools", "dev", "js-server-scan.js");
}

/**
 * Creates an fnl-style observable that runs js-server-scan in a child process
 * and emits normalized scan progress messages.
 *
 * Events (via `next` / `obs.on('next')`):
 * - `{ type: 'count-start' }`
 * - `{ type: 'count-progress', current, file }`
 * - `{ type: 'count', total }`
 * - `{ type: 'progress', current, total, file }`
 * - `{ type: 'result', servers }` (NOT a progress event; large payload)
 *
 * Completion:
 * - Raises `complete` after the child process exits and a `result` was received.
 * - Raises `error` if the child exits without a `result`.
 */
function createScanServersObservable({
  basePath,
  cwd,
  toolPath,
  htmlOnly = true,
  extraArgs = [],
  spawnImpl = spawn,
  killImpl = treeKill
} = {}) {
  const resolvedBasePath = basePath ? path.resolve(basePath) : path.resolve(__dirname, "..", "..");
  const resolvedCwd = cwd ? path.resolve(cwd) : resolvedBasePath;
  const resolvedToolPath = toolPath ? path.resolve(toolPath) : defaultToolPath(resolvedBasePath);

  const args = [resolvedToolPath, "--progress", "--dir", resolvedBasePath, ...extraArgs];
  if (htmlOnly) args.push("--html-only");

  return observable((next, complete, error) => {
    const child = spawnImpl("node", args, { cwd: resolvedCwd });

    let servers = null;
    let stderrText = "";

    const progressParser = new JsonlStreamParser({
      onJson: (msg) => {
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "result") {
          servers = Array.isArray(msg.servers) ? msg.servers : [];
          // Do not emit to UI by default; still expose for in-process consumers.
          next({ type: "result", servers });
          return;
        }

        const normalized = normalizeScanProgressMessage(msg);
        if (!normalized) return;
        next(normalized);
      },
      onNonJsonLine: () => {
        // Ignore tool chatter.
      }
    });

    if (child.stdout) {
      child.stdout.on("data", (data) => progressParser.push(data));
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderrText += data.toString("utf8");
      });
    }

    child.on("error", (err) => {
      progressParser.flush();
      error(err);
    });

    child.on("close", (code) => {
      progressParser.flush();

      if (servers === null) {
        const msg = stderrText ? stderrText.trim() : "No scan result received";
        error(new Error(`js-server-scan failed with code ${code}: ${msg}`));
        return;
      }

      complete();
    });

    // Return a stop() function (fnl convention: array of [stop, pause, resume])
    const stop = () => {
      if (child && child.pid) {
        try {
          killImpl(child.pid, "SIGKILL", () => {});
        } catch {
          // Best-effort only.
        }
      }
    };

    return [stop];
  });
}

module.exports = {
  createScanServersObservable
};
