"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const outDir = __dirname;

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".cache",
  ".playwright-mcp",
  ".kilocode",
  ".kilo",
]);

const HEAVY_DIRS = new Set([
  "node_modules",
  "data",
  "screenshots",
  "tmp",
  "tmp/debug",
  "testlogs",
  "migration-temp",
  "migration-export",
  "gazetteer-backup",
  "coverage",
  "dist",
  "build",
]);

function parseArgs(argv) {
  const args = {
    maxFiles: 40,
    topNForBars: 300,
    includeHeavy: false,
    ignoreHeavy: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--include-heavy") {
      args.includeHeavy = true;
      args.ignoreHeavy = false;
    }
    if (a === "--ignore-heavy") {
      args.ignoreHeavy = true;
      args.includeHeavy = false;
    }
    if (a === "--max-files") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.maxFiles = Math.max(5, Math.min(200, Number.parseInt(next, 10) || args.maxFiles));
        i++;
      }
    }
    if (a === "--topn-bars") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.topNForBars = Math.max(50, Math.min(5000, Number.parseInt(next, 10) || args.topNForBars));
        i++;
      }
    }
  }

  return args;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i <= 1 ? 0 : i === 2 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function topLevelDir(relPath) {
  const parts = relPath.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[0] : "(root)";
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

class TopK {
  constructor(k) {
    this.k = k;
    this.items = []; // sorted asc by size
  }

  push(item) {
    if (!item || !Number.isFinite(item.size)) return;
    if (this.items.length < this.k) {
      this.items.push(item);
      this.items.sort((a, b) => a.size - b.size);
      return;
    }
    if (item.size <= this.items[0].size) return;
    this.items[0] = item;
    this.items.sort((a, b) => a.size - b.size);
  }

  toSortedDesc() {
    return [...this.items].sort((a, b) => b.size - a.size);
  }
}

async function walk(dir, opts, onFile) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const full = path.join(dir, ent.name);

    // Skip symlinks to avoid surprises
    if (ent.isSymbolicLink()) continue;

    if (ent.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(ent.name)) continue;
      if (opts.ignoreHeavy && HEAVY_DIRS.has(ent.name)) continue;
      await walk(full, opts, onFile);
      continue;
    }

    if (!ent.isFile()) continue;

    let st;
    try {
      st = await fs.promises.stat(full);
    } catch {
      continue;
    }

    await onFile(full, st.size);
  }
}

function buildBarsSvg({ title, rows, width = 980, labelW = 210, valueW = 110 }) {
  const padding = 24;
  const rowH = 22;
  const headerH = 56;
  const barGap = 10;
  const barW = width - padding * 2 - labelW - valueW - barGap;

  const max = Math.max(1, ...rows.map(r => r.bytes));
  const height = headerH + rows.length * rowH + padding;

  const bg = "#0b1020";
  const fg = "#e8edf7";
  const subtle = "#9aa6c2";
  const bar = "#4e79a7";
  const grid = "#1c2540";

  let svg = "";
  svg += `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>\n`;
  svg += `<text x="${padding}" y="${padding + 18}" fill="${fg}" font-family="Segoe UI, Arial" font-size="18" font-weight="600">${escapeXml(title)}</text>\n`;
  svg += `<text x="${padding}" y="${padding + 38}" fill="${subtle}" font-family="Segoe UI, Arial" font-size="12">Bars show total size contributed by the largest files (grouped by top-level folder).</text>\n`;

  // vertical grid
  const gridCount = 5;
  for (let i = 0; i <= gridCount; i++) {
    const x = padding + labelW + barGap + Math.round((barW * i) / gridCount);
    const y1 = headerH - 8;
    const y2 = height - padding;
    svg += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${grid}" stroke-width="1"/>\n`;
  }

  const startY = headerH;
  rows.forEach((r, idx) => {
    const y = startY + idx * rowH;
    const labelX = padding;
    const barX = padding + labelW + barGap;
    const barLen = Math.max(1, Math.round((r.bytes / max) * barW));

    svg += `<text x="${labelX}" y="${y + 15}" fill="${fg}" font-family="Segoe UI, Arial" font-size="12">${escapeXml(r.label)}</text>\n`;
    svg += `<rect x="${barX}" y="${y + 5}" width="${barLen}" height="12" rx="3" fill="${bar}"/>\n`;
    svg += `<text x="${barX + barW + 8}" y="${y + 15}" fill="${subtle}" font-family="Segoe UI, Arial" font-size="12">${escapeXml(r.human)}</text>\n`;
  });

  svg += `</svg>\n`;
  return svg;
}

function truncateMiddle(s, maxLen) {
  const str = String(s);
  if (str.length <= maxLen) return str;
  const keep = Math.max(10, maxLen - 3);
  const left = Math.ceil(keep * 0.65);
  const right = keep - left;
  return `${str.slice(0, left)}...${str.slice(str.length - right)}`;
}

function toMarkdownTable(rows) {
  const header = `| Rank | Size | Top folder | Path |\n|---:|---:|---|---|`;
  const lines = rows.map((r, i) => {
    const rel = r.rel.replace(/\\/g, "/");
    return `| ${i + 1} | ${formatBytes(r.size)} | ${r.top} | ${rel} |`;
  });
  return [header, ...lines].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const topK = new TopK(Math.max(args.maxFiles, args.topNForBars));

  const started = Date.now();

  await walk(repoRoot, args, async (fullPath, size) => {
    const rel = path.relative(repoRoot, fullPath);
    const top = topLevelDir(rel);
    topK.push({ fullPath, rel, top, size });
  });

  const elapsedMs = Date.now() - started;

  const sorted = topK.toSortedDesc();
  const topFiles = sorted.slice(0, args.maxFiles);
  const topForBars = sorted.slice(0, args.topNForBars);

  const byTop = new Map();
  for (const f of topForBars) {
    const prev = byTop.get(f.top) || 0;
    byTop.set(f.top, prev + f.size);
  }

  const grouped = [...byTop.entries()]
    .map(([label, bytes]) => ({ label, bytes, human: formatBytes(bytes) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12);

  const mode = args.ignoreHeavy ? "(heavy dirs excluded)" : "(includes heavy dirs)";

  const md = [];
  md.push(`# Largest files report ${mode}`);
  md.push("");
  md.push(`Repo root: ${repoRoot.replace(/\\/g, "/")}`);
  md.push(`Scan time: ${(elapsedMs / 1000).toFixed(1)}s`);
  md.push("");
  md.push(`## Top ${args.maxFiles} largest files`);
  md.push("");
  md.push(toMarkdownTable(topFiles));
  md.push("");
  md.push(`## Biggest contributors by top-level folder (sum of top ${args.topNForBars} files)`);
  md.push("");
  md.push("| Folder | Size |");
  md.push("|---|---:|");
  for (const g of grouped) md.push(`| ${g.label} | ${g.human} |`);
  md.push("");
  md.push("## Notes");
  md.push("");
  md.push("- This report is intended to answer: what specific *files* are biggest, and which folders they cluster in.");
  md.push("- Run with `--include-heavy` to include `node_modules/`, `data/`, `screenshots/`, etc (slow but useful for disk cleanup decisions).");

  const mdPath = path.join(outDir, args.ignoreHeavy ? "largest-files.md" : "largest-files.with-heavy.md");
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  const svgTitle = `Largest files by folder ${mode}`;
  const svg = buildBarsSvg({ title: svgTitle, rows: grouped });
  const svgPath = path.join(outDir, args.ignoreHeavy ? "largest-files.svg" : "largest-files.with-heavy.svg");
  fs.writeFileSync(svgPath, svg, "utf8");

  const topFileRows = topFiles.slice(0, 12).map(f => ({
    label: truncateMiddle(f.rel.replace(/\\/g, "/"), 72),
    bytes: f.size,
    human: formatBytes(f.size),
  }));
  const svgFilesTitle = `Top ${topFileRows.length} largest files ${mode}`;
  const svgFiles = buildBarsSvg({ title: svgFilesTitle, rows: topFileRows, width: 1180, labelW: 700, valueW: 120 });
  const svgFilesPath = path.join(
    outDir,
    args.ignoreHeavy ? "largest-files.top-files.svg" : "largest-files.with-heavy.top-files.svg"
  );
  fs.writeFileSync(svgFilesPath, svgFiles, "utf8");

  // Also emit a tiny JSON payload for tooling
  const jsonPath = path.join(outDir, args.ignoreHeavy ? "largest-files.json" : "largest-files.with-heavy.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        repoRoot,
        mode,
        elapsedMs,
        topFiles: topFiles.map(f => ({ rel: f.rel.replace(/\\/g, "/"), top: f.top, size: f.size })),
        grouped,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Wrote:\n- ${mdPath}\n- ${svgPath}\n- ${svgFilesPath}\n- ${jsonPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
