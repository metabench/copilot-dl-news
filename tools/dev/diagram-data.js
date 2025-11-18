"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const JS_SCAN_PATH = path.join(__dirname, "js-scan.js");
const JS_EDIT_PATH = path.join(__dirname, "js-edit.js");
const DEFAULT_FEATURE_CONFIG = path.join(REPO_ROOT, "config", "diagram-features.json");
const SQL_ROOTS = [
  path.join(REPO_ROOT, "src", "db", "migrations"),
  path.join(REPO_ROOT, "src", "db", "sqlite", "v1", "migrations")
];
const DEFAULT_SECTIONS = new Set(["code", "db", "features"]);
const DEFAULT_DEP_DEPTH = 2;

function resolveFileBytes(normalizedPath) {
  if (!normalizedPath) return 0;
  try {
    const absolutePath = path.join(REPO_ROOT, normalizedPath);
    const stats = fs.statSync(absolutePath);
    if (!stats || !stats.isFile()) {
      return 0;
    }
    return stats.size || 0;
  } catch (_) {
    return 0;
  }
}

function parseArgs(argv) {
  const args = {
    sections: new Set(DEFAULT_SECTIONS),
    featureConfig: DEFAULT_FEATURE_CONFIG,
    depDepth: DEFAULT_DEP_DEPTH,
    json: true,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--sections" && argv[i + 1]) {
      i += 1;
      args.sections = new Set(argv[i].split(",").map((section) => section.trim()).filter(Boolean));
      continue;
    }
    if (token === "--feature-config" && argv[i + 1]) {
      i += 1;
      args.featureConfig = path.resolve(process.cwd(), argv[i]);
      continue;
    }
    if (token === "--dep-depth" && argv[i + 1]) {
      i += 1;
      args.depDepth = Math.max(1, Number(argv[i]) || DEFAULT_DEP_DEPTH);
      continue;
    }
    if (token === "--output" && argv[i + 1]) {
      i += 1;
      args.output = path.resolve(process.cwd(), argv[i]);
      continue;
    }
    if (token === "--no-json") {
      args.json = false;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  const lines = [
    "diagram-data: aggregate diagram-friendly metadata from CLI tooling",
    "",
    "Usage:",
    "  node tools/dev/diagram-data.js [--sections code,db,features]",
    "                                [--feature-config config/diagram-features.json]",
    "                                [--dep-depth 2]",
    "                                [--output diagram-data.json]",
    "                                [--json | --no-json]",
    "",
    "Sections:",
    "  code     Uses js-scan --build-index to summarize files/modules",
    "  db       Parses SQL migrations to approximate DB tables",
    "  features Uses js-scan --deps-of and js-edit --list-functions to map features"
  ];
  console.log(lines.join("\n"));
}

function runCli(toolPath, args = []) {
  const result = spawnSync(process.execPath, [toolPath, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${toolPath} ${args.join(" ")})\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function runJsScan(args = []) {
  const stdout = runCli(JS_SCAN_PATH, [...args, "--json"]);
  if (!stdout) return null;
  return JSON.parse(stdout);
}

function runJsEdit(args = []) {
  const stdout = runCli(JS_EDIT_PATH, [...args, "--json"]);
  if (!stdout) return null;
  return JSON.parse(stdout);
}

function normalizeRelative(filePath) {
  if (!filePath) return null;
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  const relative = path.relative(REPO_ROOT, absolute);
  return relative.split(path.sep).join("/");
}

function collectBuildIndexFor(dir) {
  const scan = runJsScan(["--dir", dir, "--build-index", "--limit", "5000"]);
  if (!scan || !Array.isArray(scan.entries)) return [];
  return scan.entries.map((entry) => ({
    root: dir,
    file: entry.file,
    stats: entry.stats || {},
    dependencies: entry.dependencies || {},
    score: entry.score || 0,
    entryPoint: Boolean(entry.entryPoint)
  }));
}

function collectCodeSection() {
  const entries = [
    ...collectBuildIndexFor("src"),
    ...collectBuildIndexFor("tools")
  ];
  const files = [];
  const directoryBuckets = new Map();
  let totalLines = 0;
  let totalBytes = 0;
  entries.forEach((entry) => {
    const relative = entry.file ? entry.file.split("\\").join("/") : "";
    const normalized = entry.root ? `${entry.root}/${relative}` : relative;
    const lines = Number(entry.stats.lines) || 0;
    const functions = Number(entry.stats.functions) || 0;
    const bytes = resolveFileBytes(normalized);
    totalLines += lines;
    totalBytes += bytes;
    files.push({
      file: normalized,
      root: entry.root,
      lines,
      bytes,
      functions,
      classes: Number(entry.stats.classes) || 0,
      entryPoint: entry.entryPoint,
      dependencies: entry.dependencies,
      score: entry.score
    });
    const dir = path.posix.dirname(normalized);
    const entryForDir = directoryBuckets.get(dir) || { lines: 0, files: 0, bytes: 0 };
    entryForDir.lines += lines;
    entryForDir.files += 1;
    entryForDir.bytes += bytes;
    directoryBuckets.set(dir, entryForDir);
  });
  files.sort((a, b) => {
    const aMetric = Number.isFinite(a.bytes) && a.bytes > 0 ? a.bytes : a.lines;
    const bMetric = Number.isFinite(b.bytes) && b.bytes > 0 ? b.bytes : b.lines;
    return bMetric - aMetric;
  });
  const directories = Array.from(directoryBuckets.entries())
    .map(([dir, info]) => ({
      directory: dir,
      lines: info.lines,
      files: info.files,
      bytes: info.bytes
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 100);
  return {
    summary: {
      totalLines,
      totalBytes,
      fileCount: files.length
    },
    files,
    directories,
    topFiles: files.slice(0, 100)
  };
}

function readSqlFiles() {
  const sqlFiles = [];
  SQL_ROOTS.forEach((root) => {
    if (!fs.existsSync(root)) return;
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      const stats = fs.statSync(current);
      if (stats.isDirectory()) {
        fs.readdirSync(current).forEach((entry) => {
          stack.push(path.join(current, entry));
        });
        continue;
      }
      if (current.endsWith(".sql")) {
        sqlFiles.push(current);
      }
    }
  });
  return sqlFiles;
}

function parseCreateTableStatements(sqlText) {
  if (!sqlText) return [];
  const tables = [];
  const regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_".]+)/gi;
  let match;
  while ((match = regex.exec(sqlText)) !== null) {
    const tableName = match[1].replace(/"/g, "");
    const startIndex = match.index;
    const openParenIndex = sqlText.indexOf("(", regex.lastIndex);
    if (openParenIndex === -1) continue;
    let depth = 1;
    let i = openParenIndex + 1;
    while (i < sqlText.length && depth > 0) {
      const char = sqlText[i];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      i += 1;
    }
    const block = sqlText.slice(openParenIndex + 1, i - 1);
    const columns = [];
    const foreignKeys = [];
    block
      .split(/\n|,/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (line.toUpperCase().startsWith("CONSTRAINT")) {
          const fkMatch = /references\s+([A-Za-z0-9_".]+)/i.exec(line);
          if (fkMatch) {
            foreignKeys.push(fkMatch[1].replace(/"/g, ""));
          }
          return;
        }
        const columnMatch = /^([A-Za-z0-9_".]+)/.exec(line);
        if (columnMatch) {
          const columnName = columnMatch[1].replace(/"/g, "");
          columns.push(columnName);
        }
        const fkMatch = /references\s+([A-Za-z0-9_".]+)/i.exec(line);
        if (fkMatch) {
          foreignKeys.push(fkMatch[1].replace(/"/g, ""));
        }
      });
    tables.push({
      name: tableName,
      columnCount: columns.length,
      columns,
      foreignKeys
    });
  }
  return tables;
}

function collectDbSection() {
  const files = readSqlFiles();
  const tables = [];
  const seen = new Map();
  files.forEach((filePath) => {
    const contents = fs.readFileSync(filePath, "utf8");
    parseCreateTableStatements(contents).forEach((table) => {
      const existing = seen.get(table.name);
      if (existing) {
        existing.columns = Array.from(new Set([...existing.columns, ...table.columns]));
        existing.columnCount = existing.columns.length;
        existing.foreignKeys = Array.from(new Set([...existing.foreignKeys, ...table.foreignKeys]));
        existing.sources.push(normalizeRelative(filePath));
      } else {
        seen.set(table.name, {
          ...table,
          sources: [normalizeRelative(filePath)]
        });
      }
    });
  });
  seen.forEach((value) => {
    tables.push(value);
  });
  tables.sort((a, b) => b.columnCount - a.columnCount);
  return {
    tables,
    totalTables: tables.length
  };
}

function collectFunctionSegments(filePath, limit = 10) {
  const relative = normalizeRelative(filePath);
  if (!relative) return [];
  try {
    const editResult = runJsEdit(["--file", relative, "--list-functions"]);
    if (!editResult || !Array.isArray(editResult.functions)) return [];
    return editResult.functions
      .filter((fn) => fn.replaceable !== false)
      .sort((a, b) => (b.byteLength || 0) - (a.byteLength || 0))
      .slice(0, limit)
      .map((fn) => ({
        name: fn.name,
        hash: fn.hash,
        byteLength: fn.byteLength || 0,
        line: fn.line
      }));
  } catch (error) {
    return [];
  }
}

function loadFeatureConfig(featureConfigPath) {
  if (!fs.existsSync(featureConfigPath)) {
    return [];
  }
  const raw = fs.readFileSync(featureConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

function collectFeatureSection(options, codeSection) {
  const config = loadFeatureConfig(options.featureConfig || DEFAULT_FEATURE_CONFIG);
  if (!config.length) {
    return { features: [], featureCount: 0 };
  }
  const filesByPath = new Map();
  (codeSection.files || []).forEach((file) => {
    filesByPath.set(file.file, file);
  });
  const features = config.map((feature) => {
    const entryPath = normalizeRelative(feature.entry);
    const depth = Number(feature.depth) || options.depDepth || DEFAULT_DEP_DEPTH;
    let depsResult = null;
    try {
      depsResult = runJsScan(["--deps-of", entryPath, "--dep-depth", String(depth)]);
    } catch (error) {
      depsResult = null;
    }
    const files = [];
    const addFile = (filePath, hop = 0, via = "") => {
      const normalized = normalizeRelative(filePath);
      if (!normalized) return;
      if (files.find((item) => item.file === normalized)) return;
      const stats = filesByPath.get(normalized) || {};
      files.push({
        file: normalized,
        lines: stats.lines || 0,
        hop,
        via
      });
    };
    addFile(entryPath, 0, "entry");
    if (depsResult && Array.isArray(depsResult.outgoing)) {
      depsResult.outgoing.forEach((outgoing) => {
        addFile(outgoing.file, outgoing.hop || 1, outgoing.via || "");
      });
    }
    files.sort((a, b) => b.lines - a.lines);
    const totalLines = files.reduce((sum, file) => sum + file.lines, 0);
    const primary = files[0];
    const secondary = files.find((file) => file.file !== (primary && primary.file));
    const segments = [];
    if (primary) {
      segments.push({
        file: primary.file,
        type: "primary",
        functions: collectFunctionSegments(primary.file, feature.segmentSampleLimit || 10)
      });
    }
    if (secondary) {
      segments.push({
        file: secondary.file,
        type: "secondary",
        functions: collectFunctionSegments(secondary.file, Math.min(6, feature.segmentSampleLimit || 10))
      });
    }
    return {
      id: feature.id,
      name: feature.name,
      description: feature.description,
      color: feature.color,
      tags: feature.tags || [],
      entry: entryPath,
      depth,
      totalLines,
      files,
      segments
    };
  });
  return {
    features,
    featureCount: features.length
  };
}

function collectDiagramData(options = {}) {
  const sections = options.sections || DEFAULT_SECTIONS;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "diagram-data-cli"
  };
  let codeSection = null;
  if (!sections || sections.has("code")) {
    codeSection = collectCodeSection();
    payload.code = codeSection;
  }
  if (!sections || sections.has("db")) {
    payload.db = collectDbSection();
  }
  if (!sections || sections.has("features")) {
    if (!codeSection) {
      codeSection = collectCodeSection();
    }
    payload.features = collectFeatureSection(options, codeSection);
  }
  return payload;
}

function main() {
  const args = parseArgs(process.argv);
  const results = collectDiagramData({
    sections: args.sections,
    featureConfig: args.featureConfig,
    depDepth: args.depDepth
  });
  const serialized = JSON.stringify(results, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, serialized);
  }
  if (args.json) {
    console.log(serialized);
  } else {
    console.log(`diagram-data generated ${results.generatedAt}`);
    console.log(`- code files: ${results.code?.summary?.fileCount || 0}`);
    console.log(`- db tables: ${results.db?.totalTables || 0}`);
    console.log(`- features: ${results.features?.featureCount || 0}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectDiagramData
};
