#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const ROOT = path.resolve(__dirname, "..");
const AGENT_DIR = path.join(ROOT, ".github", "agents");
const BACKUP_DIR = path.join(ROOT, ".github", "agentbackups");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function listAgentFiles() {
  ensureDir(AGENT_DIR);
  return fs
    .readdirSync(AGENT_DIR)
    .filter((f) => f.endsWith(".agent.md"))
    .map((f) => path.join(AGENT_DIR, f));
}

function timestampLabel() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function backup(label) {
  ensureDir(BACKUP_DIR);
  const tag = label && label.trim().length ? label.trim() : timestampLabel();
  const zipPath = path.join(BACKUP_DIR, `agents-${tag}.zip`);
  const zip = new AdmZip();
  const files = listAgentFiles();
  if (!files.length) {
    console.log("No agent files found to back up.");
    process.exitCode = 1; // signal to automation that nothing was backed up
    return;
  }
  for (const file of files) {
    const name = path.basename(file);
    zip.addLocalFile(file, "agents", name);
  }
  zip.writeZip(zipPath);
  console.log(`Backup created: ${zipPath}`);
}

function listArchives() {
  ensureDir(BACKUP_DIR);
  const zips = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.toLowerCase().endsWith(".zip"))
    .sort();
  if (!zips.length) {
    console.log("No archives found in .github/agentbackups");
    return;
  }
  console.log("Archives:");
  for (const z of zips) console.log("- " + z);
}

function loadZip(archiveName) {
  const safeName = archiveName.replace(/\\/g, "/").split("/").pop();
  const zipPath = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Archive not found: ${zipPath}`);
  }
  return new AdmZip(zipPath);
}

function listAgentsInArchive(archiveName) {
  const zip = loadZip(archiveName);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && e.entryName.endsWith(".agent.md"))
    .map((e) => e.entryName.replace(/^agents\//, ""));
  if (!entries.length) {
    console.log("No agent files in archive.");
    return;
  }
  console.log("Agents in archive:");
  for (const name of entries) console.log("- " + name);
}

function extractAgent(archiveName, agentName, destPath) {
  const zip = loadZip(archiveName);
  const target = zip
    .getEntries()
    .find(
      (e) =>
        !e.isDirectory &&
        (e.entryName === agentName || e.entryName === `agents/${agentName}`)
    );
  if (!target) throw new Error(`Agent not found in archive: ${agentName}`);
  const data = target.getData();
  const dest = destPath
    ? path.resolve(destPath)
    : path.join(AGENT_DIR, path.basename(agentName));
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, data);
  console.log(`Restored ${agentName} to ${dest}`);
}

function usage() {
  console.log("Agent backups CLI");
  console.log("Usage:");
  console.log("  node tools/agent-backup.js backup [label]");
  console.log("  node tools/agent-backup.js list-archives");
  console.log("  node tools/agent-backup.js list-agents <archive.zip>");
  console.log("  node tools/agent-backup.js extract <archive.zip> <agentName> [destFile]");
  console.log("  node tools/agent-backup.js restore <archive.zip> <agentName> [destFile] (alias of extract)");
  console.log("Notes:");
  console.log("  - Archives stored in .github/agentbackups");
  console.log("  - Agent sources read from .github/agents");
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  try {
    switch (cmd) {
      case "backup":
        backup(rest[0]);
        break;
      case "list-archives":
        listArchives();
        break;
      case "list-agents":
        if (!rest[0]) throw new Error("Archive name required");
        listAgentsInArchive(rest[0]);
        break;
      case "extract":
      case "restore":
        if (!rest[0] || !rest[1]) throw new Error("Archive and agent name required");
        extractAgent(rest[0], rest[1], rest[2]);
        break;
      default:
        usage();
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  }
}

main();
