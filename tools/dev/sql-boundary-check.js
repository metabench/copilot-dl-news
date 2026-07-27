#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * SQL Boundary Check
 * Prevent SQL usage in UI/Electron layers
 * Exit: 0 = clean, 1 = violations found
 *
 * Comments are excluded from matching; string literals are not, so
 * require('better-sqlite3') in real code always trips the check.
 */

const REPO_ROOT = path.join(__dirname, "..", "..");
const CONFIG_FILE = path.join(REPO_ROOT, "config", "sql-boundary-allowlist.json");

const SQL_PATTERNS = [
  /db\.prepare\s*\(/,
  /db\.exec\s*\(/,
  /better-sqlite3/,
  /new\s+Database\s*\(/
];

// src/ui covers all current UI surfaces, including src/ui/electron/* and
// src/ui/server/unifiedApp (crawl-widget/ was deleted; see
// docs/agi/RECONCILIATION_2026-07-19.md).
const TARGET_DIRS = ["src/ui"];

let config = {
  ignoreRoots: ["src/db", "tests", "tools", "scripts", "checks"],
  allow: []
};

// Load config if available
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (e) {
    console.error(`⚠ Failed to load config from ${CONFIG_FILE}:`, e.message);
  }
}

const violations = [];

function normalizeRepoRelativePath(p) {
  return String(p).split(path.sep).join("/");
}

/**
 * Blank out // and block comments, preserving newlines (line numbers stay
 * accurate) and string/template literal contents (SQL in strings must still
 * match). Limitation: a regex literal containing "//" or "/*" reads as a
 * comment start, hiding the rest of that line/block from matching.
 */
function blankComments(source) {
  let out = "";
  let state = "code";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (ch === "/" && next === "/") { state = "line"; out += "  "; i++; }
      else if (ch === "/" && next === "*") { state = "block"; out += "  "; i++; }
      else {
        if (ch === "'" || ch === '"' || ch === "`") state = ch;
        out += ch;
      }
    } else if (state === "line") {
      if (ch === "\n") { state = "code"; out += ch; }
      else out += " ";
    } else if (state === "block") {
      if (ch === "*" && next === "/") { state = "code"; out += "  "; i++; }
      else out += ch === "\n" ? ch : " ";
    } else {
      // inside a string literal delimited by `state`
      out += ch;
      if (ch === "\\") { out += next === undefined ? "" : next; i++; }
      else if (ch === state) state = "code";
      else if (ch === "\n" && state !== "`") state = "code";
    }
  }
  return out;
}

/**
 * Scan a file for SQL patterns (comments excluded)
 */
function scanFile(filePath, relativePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const originalLines = content.split("\n");
  const codeLines = blankComments(content).split("\n");

  codeLines.forEach((line, idx) => {
    SQL_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        violations.push({
          file: normalizeRepoRelativePath(relativePath),
          line: idx + 1,
          pattern: pattern.source,
          context: originalLines[idx].trim().slice(0, 80)
        });
      }
    });
  });
}

/**
 * Walk directory recursively
 */
function walkDir(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  files.forEach((file) => {
    const fullPath = path.join(dir, file.name);
    const relPath = normalizeRepoRelativePath(path.relative(REPO_ROOT, fullPath));

    // Skip ignored roots
    const isIgnored = config.ignoreRoots.some((root) =>
      relPath.startsWith(root)
    );
    if (isIgnored) return;

    // Skip allowed files
    const isAllowed = config.allow.some((entry) => relPath === entry.path);
    if (isAllowed) return;

    if (file.isDirectory()) {
      walkDir(fullPath);
    } else if (/\.(js|cjs|mjs)$/.test(file.name)) {
      scanFile(fullPath, relPath);
    }
  });
}

// Scan target directories
TARGET_DIRS.forEach((dir) => {
  const fullPath = path.join(REPO_ROOT, dir);
  if (fs.existsSync(fullPath)) {
    walkDir(fullPath);
  }
});

// Report
if (violations.length === 0) {
  console.log("✅ SQL boundary check passed (no SQL in UI/Electron layers)");
  process.exit(0);
}

console.log(
  `❌ SQL boundary violations found (${violations.length}):\n`
);
console.log(
  violations
    .map(
      (v) =>
        `  ${v.file}:${v.line} [${v.pattern}]\n    ${v.context}`
    )
    .join("\n")
);
console.log(
  "\nTo allow an exception, add to config/sql-boundary-allowlist.json (allow array)."
);

process.exit(1);
