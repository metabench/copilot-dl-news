#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * SQL Boundary Check
 * Prevent SQL usage in UI/Electron layers
 * Exit: 0 = clean, 1 = violations found
 */

const REPO_ROOT = path.join(__dirname, "..", "..");
const CONFIG_FILE = path.join(REPO_ROOT, "config", "sql-boundary-allowlist.json");

const SQL_PATTERNS = [
  /db\.prepare\s*\(/,
  /db\.exec\s*\(/,
  /better-sqlite3/,
  /new\s+Database\s*\(/
];

const TARGET_DIRS = ["src/ui", "crawl-widget"];

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
 * Scan a file for SQL patterns
 */
function scanFile(filePath, relativePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    SQL_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        violations.push({
          file: normalizeRepoRelativePath(relativePath),
          line: idx + 1,
          pattern: pattern.source,
          context: line.trim().slice(0, 80)
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
