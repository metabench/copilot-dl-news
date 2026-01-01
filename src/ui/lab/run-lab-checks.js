"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const args = {
    ids: null,
    all: false,
    list: false,
    continueOnError: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token === "--all") {
      args.all = true;
      continue;
    }

    if (token === "--list") {
      args.list = true;
      continue;
    }

    if (token === "--continue") {
      args.continueOnError = true;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--ids") {
      const raw = argv[i + 1];
      if (!raw || raw.startsWith("-")) {
        throw new Error("--ids requires a comma-separated value, e.g. --ids 025,026,027");
      }
      args.ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function usage() {
  return [
    "Run multiple src/ui/lab experiment check.js scripts.",
    "",
    "Usage:",
    "  node src/ui/lab/run-lab-checks.js --ids 025,026,027,028,046",
    "  node src/ui/lab/run-lab-checks.js --all",
    "  node src/ui/lab/run-lab-checks.js --list",
    "",
    "Options:",
    "  --ids <csv>     Only run these experiment IDs (e.g. 026,028)",
    "  --all           Run every experiment that has a check.js",
    "  --list          List discovered experiments and whether they have a check.js",
    "  --continue      Continue running checks after failures (default: fail fast)",
    "  --dry-run       Print commands without executing",
    "  -h, --help      Show help",
    "",
  ].join("\n");
}

function discoverExperiments(experimentsDir) {
  const entries = fs.readdirSync(experimentsDir, { withFileTypes: true });
  const experiments = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirName = entry.name;
    const match = /^([0-9]{3})-(.+)$/.exec(dirName);
    if (!match) continue;

    const id = match[1];
    const slug = match[2];
    const dirPath = path.join(experimentsDir, dirName);
    const checkPath = path.join(dirPath, "check.js");

    experiments.push({
      id,
      slug,
      dirName,
      dirPath,
      checkPath,
      hasCheck: fs.existsSync(checkPath),
    });
  }

  experiments.sort((a, b) => a.id.localeCompare(b.id));
  return experiments;
}

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal: signal ?? null });
    });

    child.on("error", () => {
      resolve({ code: 1, signal: null });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const experimentsDir = path.join(__dirname, "experiments");
  const experiments = discoverExperiments(experimentsDir);

  if (args.list) {
    for (const exp of experiments) {
      const status = exp.hasCheck ? "check.js" : "(no check.js)";
      process.stdout.write(`${exp.id} ${exp.slug}  ${status}\n`);
    }
    return;
  }

  let selected = experiments.filter((e) => e.hasCheck);

  if (!args.all) {
    const ids = args.ids ?? ["025", "026", "027", "028", "046"];
    const idSet = new Set(ids.map((s) => s.padStart(3, "0")));
    selected = selected.filter((e) => idSet.has(e.id));

    for (const id of idSet) {
      if (!experiments.some((e) => e.id === id)) {
        throw new Error(`Unknown experiment id: ${id}`);
      }
      if (!selected.some((e) => e.id === id)) {
        throw new Error(`Experiment ${id} has no check.js`);
      }
    }
  }

  if (selected.length === 0) {
    throw new Error("No lab checks selected.");
  }

  let failures = 0;

  for (const exp of selected) {
    const command = `node ${path.relative(process.cwd(), exp.checkPath)}`;
    process.stdout.write(`\n=== [lab:${exp.id}] ${exp.slug} ===\n`);

    if (args.dryRun) {
      process.stdout.write(`${command}\n`);
      continue;
    }

    const result = await runNodeScript(exp.checkPath);
    if (result.code !== 0) {
      failures++;
      process.stderr.write(`\n[lab:${exp.id}] FAILED (exit=${result.code})\n`);
      if (!args.continueOnError) {
        process.exitCode = result.code;
        return;
      }
    } else {
      process.stdout.write(`\n[lab:${exp.id}] OK\n`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});
