#!/usr/bin/env node
"use strict";

/**
 * Remote Deploy CLI (single-server friendly)
 *
 * Goal: a small, reusable deployment system for pushing Node apps to a remote server over SSH.
 * - Works for the distributed worker now.
 * - Intended to work for other apps soon (docs viewer, UI servers, etc.).
 *
 * Safety model:
 * - Defaults to dry-run.
 * - Requires explicit --apply to execute remote commands.
 *
 * Requirements:
 * - Local machine must have `ssh` and `scp` available.
 * - Remote server should be reachable via SSH.
 *
 * Examples:
 *   # Dry-run (prints commands)
 *   node tools/dev/remote-deploy.js --app worker --host 144.21.42.149 --user ubuntu \
 *     --local labs/distributed-crawl/worker-server.js --remote-dir /opt/worker --port 22
 *
 *   # Apply deploy + restart (systemd)
 *   node tools/dev/remote-deploy.js --apply --app worker --host 144.21.42.149 --user ubuntu \
 *     --local labs/distributed-crawl/worker-server.js --remote-dir /opt/worker \
 *     --service worker --install-systemd --restart --check-url http://144.21.42.149:8081/health
 */

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const os = require('os');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    app: null,
    host: null,
    user: null,
    port: 22,
    key: null,
    local: null,
    remoteDir: null,
    service: null,
    installSystemd: false,
    restart: false,
    apply: false,
    checkUrl: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--app") opts.app = args[++i];
    else if (a === "--host") opts.host = args[++i];
    else if (a === "--user") opts.user = args[++i];
    else if (a === "--port") opts.port = Number(args[++i]) || 22;
    else if (a === "--key") opts.key = args[++i];
    else if (a === "--local") opts.local = args[++i];
    else if (a === "--remote-dir") opts.remoteDir = args[++i];
    else if (a === "--service") opts.service = args[++i];
    else if (a === "--install-systemd") opts.installSystemd = true;
    else if (a === "--restart") opts.restart = true;
    else if (a === "--apply") opts.apply = true;
    else if (a === "--check-url") opts.checkUrl = args[++i];
    else if (a === "--json" || a === "-j") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
  }

  return opts;
}

function expandTilde(p) {
  if (!p) return p;
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function tryReadSshConfig() {
  try {
    const configPath = path.join(os.homedir(), '.ssh', 'config');
    if (!fs.existsSync(configPath)) return null;
    return fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
}

function inferSshConfigForHost(host) {
  const raw = tryReadSshConfig();
  if (!raw) return null;

  const lines = raw.split(/\r?\n/);
  let currentHostPatterns = null;
  let current = {};
  const sections = [];

  function commit() {
    if (currentHostPatterns && currentHostPatterns.length) {
      sections.push({ hostPatterns: currentHostPatterns, ...current });
    }
    currentHostPatterns = null;
    current = {};
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const mHost = trimmed.match(/^Host\s+(.+)$/i);
    if (mHost) {
      commit();
      currentHostPatterns = mHost[1].trim().split(/\s+/);
      continue;
    }

    const mUser = trimmed.match(/^User\s+(.+)$/i);
    if (mUser) {
      current.user = mUser[1].trim();
      continue;
    }

    const mIdentity = trimmed.match(/^IdentityFile\s+(.+)$/i);
    if (mIdentity) {
      current.identityFile = expandTilde(mIdentity[1].trim());
      continue;
    }
  }
  commit();

  function patternMatches(pattern, value) {
    const p = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${p}$`, 'i').test(value);
  }

  // Prefer exact matches first, then wildcards.
  const exact = sections.find((s) => s.hostPatterns.some((p) => p.toLowerCase() === host.toLowerCase()));
  if (exact) return { user: exact.user || null, identityFile: exact.identityFile || null };

  const wildcard = sections.find((s) => s.hostPatterns.some((p) => patternMatches(p, host)));
  if (wildcard) return { user: wildcard.user || null, identityFile: wildcard.identityFile || null };

  return null;
}

function printHelp() {
  console.log(`
Remote Deploy CLI
=================

Options:
  --app <name>              App name (e.g. worker)
  --host <ip|name>          Remote host
  --user <ssh user>         SSH user
  --port <n>                SSH port (default 22)
  --key <path>              Optional SSH key
  --local <path>            Local entrypoint (file or directory)
  --remote-dir <path>       Remote deployment directory (e.g. /opt/worker)
  --service <name>          systemd service name (default: <app>)
  --install-systemd         Install/update systemd unit (requires sudo on remote)
  --restart                 Restart systemd service after deploy
  --check-url <url>         HTTP URL to check after deploy
  --apply                   Execute (default is dry-run)
  --json, -j                JSON output
  --help, -h                Help

Notes:
- Default mode is DRY-RUN. Pass --apply to actually deploy.
- This tool uses ssh/scp; make sure they work from this machine.
`);
}

function requireOpt(name, value) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
}

function runCmd(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (!allowFail && r.status !== 0) {
    throw new Error(`${cmd} failed with exit code ${r.status}`);
  }
  return r;
}

function buildSshArgs(opts) {
  const out = ["-p", String(opts.port)];
  if (opts.key) out.push("-i", opts.key);
  out.push("-o", "StrictHostKeyChecking=accept-new");
  return out;
}

function sshTarget(opts) {
  return `${opts.user}@${opts.host}`;
}

function systemdUnitText({ serviceName, remoteDir, entryFile, port }) {
  const envLines = [];
  if (port) envLines.push(`Environment=PORT=${port}`);

  return `# Auto-generated by tools/dev/remote-deploy.js
[Unit]
Description=${serviceName} (deployed Node service)
After=network.target

[Service]
Type=simple
WorkingDirectory=${remoteDir}
ExecStart=/usr/bin/node ${entryFile} --host=0.0.0.0 --port=${port || 8081}
Restart=always
RestartSec=2
${envLines.join("\n")}

[Install]
WantedBy=multi-user.target
`;
}

function ensureLocalExists(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) throw new Error(`Local path not found: ${p}`);
  return abs;
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    return;
  }

  requireOpt("--app", opts.app);
  requireOpt("--host", opts.host);

  // If user/key aren't supplied, try to infer them from ~/.ssh/config.
  const inferred = inferSshConfigForHost(opts.host);
  if (!opts.user && inferred?.user) opts.user = inferred.user;
  if (!opts.key && inferred?.identityFile) opts.key = inferred.identityFile;

  requireOpt("--user", opts.user);
  requireOpt("--local", opts.local);
  requireOpt("--remote-dir", opts.remoteDir);

  if (!opts.service) opts.service = opts.app;

  const localPath = ensureLocalExists(opts.local);
  const isDir = fs.statSync(localPath).isDirectory();

  const plan = {
    apply: opts.apply,
    app: opts.app,
    host: opts.host,
    user: opts.user,
    port: opts.port,
    key: opts.key || null,
    local: localPath,
    remoteDir: opts.remoteDir,
    service: opts.service,
    installSystemd: opts.installSystemd,
    restart: opts.restart,
    checkUrl: opts.checkUrl,
    steps: [],
  };

  const sshArgs = buildSshArgs(opts);
  const target = sshTarget(opts);

  // 1) Ensure remote dir exists
  plan.steps.push({ kind: "ssh", cmd: "mkdir", args: ["-p", opts.remoteDir] });

  // 2) Copy payload
  if (isDir) {
    // Copy directory contents
    plan.steps.push({ kind: "scp", recursive: true, src: localPath + path.sep + "*", dest: `${target}:${opts.remoteDir}/` });
  } else {
    plan.steps.push({ kind: "scp", recursive: false, src: localPath, dest: `${target}:${opts.remoteDir}/${path.basename(localPath)}` });
  }

  // 3) Optional systemd install/update
  const entryFile = isDir ? "index.js" : path.basename(localPath);
  if (opts.installSystemd) {
    const unitName = `${opts.service}.service`;
    const unitText = systemdUnitText({ serviceName: opts.service, remoteDir: opts.remoteDir, entryFile: `${opts.remoteDir}/${entryFile}`, port: 8081 });
    const tmpUnit = path.join(process.cwd(), "tmp", `${opts.service}.service`);
    fs.mkdirSync(path.dirname(tmpUnit), { recursive: true });
    fs.writeFileSync(tmpUnit, unitText, "utf8");

    plan.steps.push({ kind: "scp", recursive: false, src: tmpUnit, dest: `${target}:/tmp/${unitName}` });
    plan.steps.push({
      kind: "ssh",
      cmd: "sudo-install-systemd",
      args: [
        `sudo mv /tmp/${unitName} /etc/systemd/system/${unitName}`,
        `sudo systemctl daemon-reload`,
        `sudo systemctl enable ${opts.service}`,
      ],
    });
  }

  // 4) Optional restart
  if (opts.restart) {
    plan.steps.push({ kind: "ssh", cmd: "systemctl-restart", args: [`sudo systemctl restart ${opts.service}`] });
  }

  // Print plan (or execute)
  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(`Remote deploy plan (${opts.apply ? "APPLY" : "DRY-RUN"})\n===============================\n`);
    console.log(`Target: ${target}:${opts.remoteDir}`);
    console.log(`Service: ${opts.service}${opts.installSystemd ? " (systemd managed)" : ""}`);
    console.log();
    for (const s of plan.steps) {
      if (s.kind === "ssh") console.log(`- ssh: ${s.cmd}`);
      if (s.kind === "scp") console.log(`- scp: ${s.src} -> ${s.dest}`);
    }
    console.log();
  }

  if (!opts.apply) {
    process.exitCode = 0;
    return;
  }

  // Execute
  // Step 1: mkdir
  runCmd("ssh", [...sshArgs, target, `mkdir -p ${opts.remoteDir}`]);

  // Step 2: scp payload
  if (isDir) {
    // Note: scp wildcard expansion happens locally on POSIX shells; Windows scp won't expand.
    // For now, require file deploys or pre-packaging when deploying directories.
    throw new Error("Directory deploy not supported on Windows scp. Deploy a single entry file for now.");
  }
  runCmd("scp", [...sshArgs, localPath, `${target}:${opts.remoteDir}/${path.basename(localPath)}`]);

  // Step 3: optional systemd
  if (opts.installSystemd) {
    const unitName = `${opts.service}.service`;
    const tmpUnit = path.join(process.cwd(), "tmp", `${opts.service}.service`);
    runCmd("scp", [...sshArgs, tmpUnit, `${target}:/tmp/${unitName}`]);
    runCmd("ssh", [...sshArgs, target, `sudo mv /tmp/${unitName} /etc/systemd/system/${unitName}`]);
    runCmd("ssh", [...sshArgs, target, `sudo systemctl daemon-reload`]);
    runCmd("ssh", [...sshArgs, target, `sudo systemctl enable ${opts.service}`]);
  }

  // Step 4: optional restart
  if (opts.restart) {
    runCmd("ssh", [...sshArgs, target, `sudo systemctl restart ${opts.service}`]);
  }

  if (opts.checkUrl) {
    console.log(`\nPost-deploy check: ${opts.checkUrl}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
