#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

async function pathExists(targetPath) {
  try {
    await fs.promises.lstat(targetPath);
    return true;
  } catch (_) {
    return false;
  }
}

async function isSymlink(targetPath) {
  try {
    const stat = await fs.promises.lstat(targetPath);
    return stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

async function isLinkLike(targetPath) {
  if (!await pathExists(targetPath)) return false;
  if (await isSymlink(targetPath)) return true;
  try {
    await fs.promises.readlink(targetPath);
    return true;
  } catch (_) {
    return false;
  }
}

async function safeReadJson(filePath) {
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function safeWriteJson(filePath, data) {
  await ensureDirectory(path.dirname(filePath));
  await fs.promises.writeFile(filePath, `${JSON.stringify(data, null, 2)}${os.EOL}`, "utf8");
}

function slugifyDocSlug(value) {
  const input = String(value || "");
  const normalized = input
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "agent";
}

function buildAgentTemplate({ title, purpose, enhancement }) {
  const enhancementKey = enhancement || "jsgui3-singularity";

  const blocks = {
    "jsgui3-singularity": [
      "# " + title,
      "",
      "> **Mission**: Ship reliable, debuggable jsgui3 UI changes with a Singularity mindset: invariants first, checks/tests always, no handovers.",
      "",
      "## Core behaviors",
      "- Treat renderer/browser state as untrusted; validate at boundaries.",
      "- Prefer jsgui3 controls for interactive/stateful pieces; keep control counts lean.",
      "- Always provide a minimal repro (check script or Jest) before large changes.",
      "- Use `--check` servers (never start long-running servers without `--check`).",
      "",
      "## jsgui3 focus",
      "- SSR checks: add/extend `src/ui/server/checks/*.check.js` for HTML output contracts.",
      "- Hydration readiness: gate E2E actions on stable client signals before asserting network/DOM.",
      "- Controls: use emoji icons for actions (🔍/⚙️/➕/🗑️/✏️/🔄) and avoid >~200 items without lazy loading.",
      "",
      "## Singularity focus",
      "- Turn “works on my machine” into invariants + evidence (logs, checks, deterministic fixtures).",
      "- Prefer small reversible diffs; protect behavior with regression guards.",
      "",
      "## Purpose",
      purpose ? `- ${purpose}` : "- (fill in purpose)",
      "",
      "## Non-negotiables",
      "- No handovers: carry bugs from repro → fix → guard → note.",
      "- Deterministic tests: no real network/time unless explicitly required.",
      ""
    ].join(os.EOL)
  };

  if (!blocks[enhancementKey]) {
    throw new Error(`Unknown enhancement: ${enhancementKey}`);
  }

  return blocks[enhancementKey];
}

function buildEnhancementBlock({ enhancement }) {
  const enhancementKey = enhancement || "jsgui3-singularity";
  const marker = `COPILOT ENHANCEMENTS: ${enhancementKey}`;
  const begin = `<!-- BEGIN ${marker} -->`;
  const end = `<!-- END ${marker} -->`;
  const body = [
    "## Enhancements (jsgui3 + Singularity)",
    "- Prefer jsgui3 check scripts for UI output contracts.",
    "- Gate E2Es on client readiness (registered controls/store) before interacting.",
    "- Treat upgrades as experiments: add repeat-run harnesses to detect flakes.",
    "- Document edge cases and invariants in the session notes.",
    ""
  ].join(os.EOL);
  return { begin, end, content: `${begin}${os.EOL}${body}${os.EOL}${end}${os.EOL}` };
}

function normalizeSlug(slug) {
  if (!slug || typeof slug !== "string") {
    return "";
  }
  return slug.trim().toLowerCase();
}

function parseSessionArg(sessionArg) {
  if (!sessionArg) return { kind: "none" };
  const trimmed = String(sessionArg).trim();
  if (/^\d{4}-\d{2}-\d{2}-/.test(trimmed)) {
    return { kind: "id", value: trimmed };
  }
  return { kind: "slug", value: normalizeSlug(trimmed) };
}

async function listSessionIds(sessionsRoot) {
  try {
    const entries = await fs.promises.readdir(sessionsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\d{4}-\d{2}-\d{2}-/.test(name));
  } catch (_) {
    return [];
  }
}

function sortSessionIdsNewestFirst(ids) {
  return [...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

async function resolveSessionId({ repoRoot, session }) {
  const sessionsRoot = path.join(repoRoot, "docs", "sessions");
  const parsed = parseSessionArg(session);

  if (parsed.kind === "id") {
    return { sessionsRoot, sessionId: parsed.value };
  }

  const candidates = sortSessionIdsNewestFirst(await listSessionIds(sessionsRoot));
  if (parsed.kind === "slug") {
    const suffix = `-${parsed.value}`;
    const match = candidates.find((id) => id.toLowerCase().endsWith(suffix));
    if (!match) {
      throw new Error(`No session found matching slug '${parsed.value}' under ${sessionsRoot}`);
    }
    return { sessionsRoot, sessionId: match };
  }

  throw new Error("--session is required");
}

async function ensureDirectory(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function copyDirectory(sourceDir, destDir) {
  await ensureDirectory(destDir);
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(src, dst);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await fs.promises.readlink(src);
      await fs.promises.symlink(linkTarget, dst);
    } else {
      await fs.promises.copyFile(src, dst);
    }
  }
}

async function copyFile(sourceFile, destFile) {
  await ensureDirectory(path.dirname(destFile));
  await fs.promises.copyFile(sourceFile, destFile);
}

async function planToolingInstall({ sourceRepoRoot, targetRepoRoot, includeTests }) {
  const items = [
    {
      kind: "file",
      from: path.join(sourceRepoRoot, "tools", "dev", "session-link.js"),
      to: path.join(targetRepoRoot, "tools", "dev", "session-link.js")
    },
    {
      kind: "file",
      from: path.join(sourceRepoRoot, "docs", "workflows", "shared-sessions-across-repos.md"),
      to: path.join(targetRepoRoot, "docs", "workflows", "shared-sessions-across-repos.md")
    }
  ];

  if (includeTests) {
    items.push({
      kind: "file",
      from: path.join(sourceRepoRoot, "tests", "tools", "__tests__", "session-link.test.js"),
      to: path.join(targetRepoRoot, "tests", "tools", "__tests__", "session-link.test.js")
    });
  }

  return { sourceRepoRoot, targetRepoRoot, items };
}

async function installTooling({ sourceRepoRoot, targetRepoRoot, fix, force, includeTests }) {
  const plan = await planToolingInstall({ sourceRepoRoot, targetRepoRoot, includeTests });

  const missing = [];
  for (const item of plan.items) {
    if (!await pathExists(item.from)) {
      missing.push(item.from);
    }
  }
  if (missing.length) {
    throw new Error(`Cannot install tooling; missing source files:\n- ${missing.join("\n- ")}`);
  }

  const conflicts = [];
  for (const item of plan.items) {
    if (await pathExists(item.to)) {
      conflicts.push(item.to);
    }
  }
  if (conflicts.length && !force) {
    throw new Error(`Tooling already exists in target (use --force to overwrite):\n- ${conflicts.join("\n- ")}`);
  }

  if (!fix) {
    return { ok: true, changed: false, plan };
  }

  for (const item of plan.items) {
    if (await pathExists(item.to) && force) {
      await fs.promises.rm(item.to, { recursive: true, force: true });
    }
    if (item.kind === "file") {
      await copyFile(item.from, item.to);
    } else {
      await copyDirectory(item.from, item.to);
    }
  }

  return { ok: true, changed: true, plan };
}

async function planAgentUpsert({ targetRepoRoot, title, docSlug, purpose, tags, enhancement }) {
  const agentsDir = path.join(targetRepoRoot, ".github", "agents");
  const indexPath = path.join(agentsDir, "index.json");
  const safeSlug = docSlug ? slugifyDocSlug(docSlug) : slugifyDocSlug(title);
  const agentFileName = `${title}.agent.md`;
  const agentPath = path.join(agentsDir, agentFileName);
  const relAgentPath = toPosix(path.relative(targetRepoRoot, agentPath));

  const entry = {
    doc_slug: safeSlug,
    title,
    purpose: purpose || "(fill in purpose)",
    tags: Array.isArray(tags) ? tags : [],
    last_review: todayIsoDate(),
    path: relAgentPath
  };

  const enhancementBlock = buildEnhancementBlock({ enhancement });

  return { agentsDir, indexPath, agentPath, entry, enhancementBlock };
}

async function upsertAgent({
  targetRepoRoot,
  title,
  docSlug,
  purpose,
  tags,
  enhancement,
  action,
  fix,
  force
}) {
  const plan = await planAgentUpsert({ targetRepoRoot, title, docSlug, purpose, tags, enhancement });
  const agentExists = await pathExists(plan.agentPath);
  const indexExists = await pathExists(plan.indexPath);

  if (!indexExists && !fix) {
    return { ok: true, changed: false, plan, note: "Target has no .github/agents/index.json; would create it." };
  }

  if (!fix) {
    return { ok: true, changed: false, plan };
  }

  await ensureDirectory(plan.agentsDir);

  let changed = false;

  if (action === "create") {
    if (agentExists && !force) {
      throw new Error(`Agent file already exists (use --force to overwrite): ${plan.agentPath}`);
    }
    const content = buildAgentTemplate({ title, purpose, enhancement });
    await fs.promises.writeFile(plan.agentPath, `${content}${os.EOL}`, "utf8");
    changed = true;
  } else if (action === "enhance") {
    if (!agentExists) {
      throw new Error(`Cannot enhance missing agent file: ${plan.agentPath}`);
    }
    const raw = await fs.promises.readFile(plan.agentPath, "utf8");
    const { begin, end, content } = plan.enhancementBlock;
    let next;
    if (raw.includes(begin) && raw.includes(end)) {
      const startIdx = raw.indexOf(begin);
      const endIdx = raw.indexOf(end);
      next = raw.slice(0, startIdx) + content + raw.slice(endIdx + end.length);
    } else {
      next = raw.trimEnd() + os.EOL + os.EOL + content;
    }
    if (next !== raw) {
      await fs.promises.writeFile(plan.agentPath, next, "utf8");
      changed = true;
    }
  } else {
    throw new Error(`Unknown agent action: ${action}`);
  }

  let index = [];
  if (await pathExists(plan.indexPath)) {
    index = await safeReadJson(plan.indexPath);
    if (!Array.isArray(index)) {
      throw new Error(`Expected agents index to be an array: ${plan.indexPath}`);
    }
  }

  const existingIdx = index.findIndex((e) => e && e.doc_slug === plan.entry.doc_slug);
  if (existingIdx >= 0) {
    index[existingIdx] = { ...index[existingIdx], ...plan.entry };
  } else {
    index.push(plan.entry);
  }

  await safeWriteJson(plan.indexPath, index);
  changed = true;

  return { ok: true, changed, plan };
}

async function createSessionLink({ sourceDir, destDir, mode }) {
  if (mode === "copy") {
    await copyDirectory(sourceDir, destDir);
    return { kind: "copy" };
  }

  const isWindows = process.platform === "win32";
  const linkType = isWindows ? "junction" : "dir";
  await fs.promises.symlink(sourceDir, destDir, linkType);
  return { kind: linkType };
}

async function planSessionLink({ sourceRepoRoot, targetRepoRoot, session }) {
  const { sessionsRoot, sessionId } = await resolveSessionId({ repoRoot: sourceRepoRoot, session });
  const sourceDir = path.join(sessionsRoot, sessionId);
  const targetSessionsRoot = path.join(targetRepoRoot, "docs", "sessions");
  const destDir = path.join(targetSessionsRoot, sessionId);

  return {
    sourceRepoRoot,
    targetRepoRoot,
    sessionId,
    sourceDir,
    destDir,
    targetSessionsRoot
  };
}

async function linkSession({ sourceRepoRoot, targetRepoRoot, session, mode, fix, force }) {
  const plan = await planSessionLink({ sourceRepoRoot, targetRepoRoot, session });

  if (!await pathExists(plan.sourceDir)) {
    throw new Error(`Source session does not exist: ${plan.sourceDir}`);
  }

  await ensureDirectory(plan.targetSessionsRoot);

  const destExists = await pathExists(plan.destDir);
  if (destExists) {
    const destIsLink = await isLinkLike(plan.destDir);
    if (!force || (!destIsLink && mode !== "copy")) {
      throw new Error(`Destination already exists: ${plan.destDir}`);
    }
    if (fix) {
      // Only remove existing symlinks/junctions (or previous copies if mode=copy).
      await fs.promises.rm(plan.destDir, { recursive: true, force: true });
    }
  }

  if (!fix) {
    return { ok: true, changed: false, plan };
  }

  const result = await createSessionLink({ sourceDir: plan.sourceDir, destDir: plan.destDir, mode });
  return { ok: true, changed: true, plan, result };
}

function parseArgs(argv) {
  const args = {
    to: null,
    from: null,
    session: null,
    mode: "link",
    fix: false,
    force: false,
    json: false,
    installTooling: false,
    includeTests: false,
    agentAction: null,
    agentTitle: null,
    agentDocSlug: null,
    agentPurpose: null,
    agentTags: [],
    agentEnhancement: "jsgui3-singularity"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--to" && argv[i + 1]) {
      args.to = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--from" && argv[i + 1]) {
      args.from = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--session" && argv[i + 1]) {
      args.session = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--mode" && argv[i + 1]) {
      args.mode = String(argv[i + 1] || "").toLowerCase();
      i += 1;
      continue;
    }
    if (token === "--fix") {
      args.fix = true;
      continue;
    }
    if (token === "--force") {
      args.force = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--install-tooling") {
      args.installTooling = true;
      continue;
    }
    if (token === "--include-tests") {
      args.includeTests = true;
      continue;
    }
    if (token === "--agent-create") {
      args.agentAction = "create";
      continue;
    }
    if (token === "--agent-enhance") {
      args.agentAction = "enhance";
      continue;
    }
    if (token === "--agent-title" && argv[i + 1]) {
      args.agentTitle = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--agent-doc-slug" && argv[i + 1]) {
      args.agentDocSlug = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--agent-purpose" && argv[i + 1]) {
      args.agentPurpose = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--agent-tags" && argv[i + 1]) {
      args.agentTags = String(argv[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (token === "--agent-enhancement" && argv[i + 1]) {
      args.agentEnhancement = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp() {
  const lines = [
    "session-link.js — shared sessions + cross-repo tooling/agents",
    "",
    "Session operations:",
    "  node tools/dev/session-link.js --session <slug|YYYY-MM-DD-slug> --to <repoRoot> [--from <repoRoot>] [--mode link|copy] [--fix] [--force] [--json]",
    "",
    "Install tooling into another repo:",
    "  node tools/dev/session-link.js --install-tooling --to <repoRoot> [--from <repoRoot>] [--include-tests] [--fix] [--force] [--json]",
    "",
    "Create or enhance an agent in another repo:",
    "  node tools/dev/session-link.js --agent-create --agent-title <emoji name> --agent-purpose <text> --agent-tags " +
      "ui,jsgui3,singularity --to <repoRoot> [--agent-doc-slug <slug>] [--agent-enhancement jsgui3-singularity] [--fix] [--force] [--json]",
    "  node tools/dev/session-link.js --agent-enhance --agent-title <emoji name> --to <repoRoot> [--fix] [--force] [--json]",
    "",
    "Safety:",
    "  - Default is dry-run (no changes).",
    "  - Use --fix to apply, --force to overwrite when allowed.",
    ""
  ];
  console.log(lines.join(os.EOL));
}

async function runCLI(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  if (!opts.to) {
    throw new Error("--to is required");
  }

  const sourceRepoRoot = path.resolve(opts.from || process.cwd());
  const targetRepoRoot = path.resolve(opts.to);
  const mode = String(opts.mode || "link").toLowerCase() === "copy" ? "copy" : "link";

  const results = [];

  if (opts.installTooling) {
    const payload = await installTooling({
      sourceRepoRoot,
      targetRepoRoot,
      fix: !!opts.fix,
      force: !!opts.force,
      includeTests: !!opts.includeTests
    });
    results.push({ operation: "install-tooling", payload });
  }

  if (opts.agentAction) {
    if (!opts.agentTitle) {
      throw new Error("--agent-title is required when using --agent-create/--agent-enhance");
    }
    const payload = await upsertAgent({
      targetRepoRoot,
      title: opts.agentTitle,
      docSlug: opts.agentDocSlug,
      purpose: opts.agentPurpose,
      tags: opts.agentTags,
      enhancement: opts.agentEnhancement,
      action: opts.agentAction,
      fix: !!opts.fix,
      force: !!opts.force
    });
    results.push({ operation: `agent-${opts.agentAction}`, payload });
  }

  if (!opts.installTooling && !opts.agentAction) {
    if (!opts.session) {
      throw new Error("--session is required unless using --install-tooling or --agent-* flags");
    }
    const payload = await linkSession({
      sourceRepoRoot,
      targetRepoRoot,
      session: opts.session,
      mode,
      fix: !!opts.fix,
      force: !!opts.force
    });
    results.push({ operation: "link-session", payload });
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}${os.EOL}`);
    return;
  }

  for (const r of results) {
    if (r.operation === "link-session") {
      const p = r.payload;
      const relSource = toPosix(path.relative(sourceRepoRoot, p.plan.sourceDir));
      const relDest = toPosix(path.relative(targetRepoRoot, p.plan.destDir));
      if (!opts.fix) {
        console.log("Dry-run: no changes applied");
        console.log("Would link session:");
        console.log(`  from: ${relSource}`);
        console.log(`  to:   ${relDest}`);
        console.log("Re-run with --fix to apply.");
      } else {
        console.log(`Linked session '${p.plan.sessionId}' (${mode})`);
        console.log(`  from: ${relSource}`);
        console.log(`  to:   ${relDest}`);
      }
      continue;
    }

    if (r.operation === "install-tooling") {
      const p = r.payload;
      const itemLines = p.plan.items
        .map((item) => `  - ${toPosix(path.relative(targetRepoRoot, item.to))}`)
        .join(os.EOL);
      if (!opts.fix) {
        console.log("Dry-run: no changes applied");
        console.log("Would install tooling into target:");
        console.log(itemLines);
        console.log("Re-run with --fix to apply.");
      } else {
        console.log("Installed tooling into target:");
        console.log(itemLines);
      }
      continue;
    }

    if (r.operation.startsWith("agent-")) {
      const p = r.payload;
      const relAgent = toPosix(path.relative(targetRepoRoot, p.plan.agentPath));
      const relIndex = toPosix(path.relative(targetRepoRoot, p.plan.indexPath));
      if (!opts.fix) {
        console.log("Dry-run: no changes applied");
        console.log(`Would ${r.operation.replace("agent-", "")} agent:`);
        console.log(`  agent: ${relAgent}`);
        console.log(`  index: ${relIndex}`);
        console.log("Re-run with --fix to apply.");
      } else {
        console.log(`Updated agent (${r.operation.replace("agent-", "")}):`);
        console.log(`  agent: ${relAgent}`);
        console.log(`  index: ${relIndex}`);
      }
    }
  }
}

module.exports = {
  parseSessionArg,
  resolveSessionId,
  planSessionLink,
  linkSession,
  planToolingInstall,
  installTooling,
  planAgentUpsert,
  upsertAgent,
  slugifyDocSlug
};

if (require.main === module) {
  runCLI(process.argv).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
