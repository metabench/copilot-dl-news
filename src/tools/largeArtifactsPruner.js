"use strict";

const fs = require("fs");
const path = require("path");
const { observable } = require("fnl");

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let v = bytes;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx++;
  }
  const digits = idx <= 1 ? 0 : idx === 2 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[idx]}`;
}

function ensureInsideRepo(repoRoot, fullPath) {
  const absRoot = path.resolve(repoRoot);
  const absPath = path.resolve(fullPath);
  const rel = path.relative(absRoot, absPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing to operate outside repo root: ${absPath}`);
  }
  return absPath;
}

function normalizeRepoRoot(repoRoot) {
  if (repoRoot) return path.resolve(repoRoot);
  return path.resolve(__dirname, "..", "..");
}

function normalizePathList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(v => normalizePathList(v));
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function dbSidecarPaths(dbPath) {
  const base = String(dbPath);
  return [
    base,
    `${base}-wal`,
    `${base}-shm`,
    `${base}-journal`
  ];
}

async function statIfExists(fullPath) {
  try {
    const st = await fs.promises.stat(fullPath);
    return st;
  } catch {
    return null;
  }
}

async function listFilesRecursive(rootDir, { cancelled }) {
  const results = [];

  async function walk(dir) {
    if (cancelled()) return;

    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (cancelled()) return;
      const full = path.join(dir, ent.name);

      if (ent.isSymbolicLink && ent.isSymbolicLink()) continue;

      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }

      if (!ent.isFile()) continue;

      const st = await statIfExists(full);
      if (!st) continue;
      results.push({ path: full, size: st.size, mtimeMs: st.mtimeMs });
    }
  }

  await walk(rootDir);
  return results;
}

function pickExportKeepSet(files, maxBytes) {
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keep = [];
  const drop = [];
  let total = 0;

  for (const f of sorted) {
    if (!Number.isFinite(f.size) || f.size <= 0) {
      drop.push(f);
      continue;
    }

    if (total + f.size <= maxBytes) {
      keep.push(f);
      total += f.size;
    } else {
      drop.push(f);
    }
  }

  return {
    keep,
    drop,
    keepBytes: total,
    dropBytes: drop.reduce((sum, f) => sum + (f.size || 0), 0)
  };
}

function defaultConfig() {
  return {
    repoRoot: normalizeRepoRoot(),

    apply: false,
    maxExportBytes: 512 * 1024 * 1024,

    keepDbPaths: ["data/news.db", "data/gazetteer.db"],
    keepDbSidecars: true,

    exportDirs: ["migration-export"],

    deleteDirs: [
      "migration-temp",
      path.join("data", "backups"),
      path.join("data", "perf-snapshots")
    ],

    ignoreIfTracked: true
  };
}

function normalizeOptions(options = {}) {
  const cfg = defaultConfig();

  const repoRoot = normalizeRepoRoot(options.repoRoot || cfg.repoRoot);

  const keepDbPaths = normalizePathList(options.keepDbPaths).length
    ? normalizePathList(options.keepDbPaths)
    : cfg.keepDbPaths;

  const exportDirs = normalizePathList(options.exportDirs).length
    ? normalizePathList(options.exportDirs)
    : cfg.exportDirs;

  const deleteDirs = normalizePathList(options.deleteDirs).length
    ? normalizePathList(options.deleteDirs)
    : cfg.deleteDirs;

  const maxExportBytes = Number.isFinite(options.maxExportBytes)
    ? options.maxExportBytes
    : Number.isFinite(options.maxExportMb)
      ? Math.floor(options.maxExportMb * 1024 * 1024)
      : cfg.maxExportBytes;

  return {
    repoRoot,
    apply: Boolean(options.apply),
    maxExportBytes: Math.max(0, maxExportBytes),
    keepDbPaths,
    keepDbSidecars: options.keepDbSidecars !== false,
    exportDirs,
    deleteDirs,
    ignoreIfTracked: options.ignoreIfTracked !== false
  };
}

async function buildPrunePlan(options) {
  const cfg = normalizeOptions(options);
  const repoRoot = cfg.repoRoot;

  const keepAbsolute = new Set();
  const keepDisplay = [];

  for (const relDb of cfg.keepDbPaths) {
    const absDb = ensureInsideRepo(repoRoot, path.join(repoRoot, relDb));
    const variants = cfg.keepDbSidecars ? dbSidecarPaths(absDb) : [absDb];

    for (const abs of variants) {
      keepAbsolute.add(abs);
    }

    keepDisplay.push({
      path: relDb.replace(/\\/g, "/"),
      sidecars: cfg.keepDbSidecars
    });
  }

  const exportCandidates = [];
  const deleteCandidates = [];

  for (const exportDirRel of cfg.exportDirs) {
    const absDir = path.join(repoRoot, exportDirRel);
    const st = await statIfExists(absDir);
    if (!st || !st.isDirectory()) continue;

    const files = await listFilesRecursive(absDir, { cancelled: () => false });
    for (const f of files) {
      if (keepAbsolute.has(f.path)) continue;
      exportCandidates.push({
        ...f,
        rel: path.relative(repoRoot, f.path).replace(/\\/g, "/"),
        category: "export"
      });
    }
  }

  for (const deleteDirRel of cfg.deleteDirs) {
    const absDir = path.join(repoRoot, deleteDirRel);
    const st = await statIfExists(absDir);
    if (!st || !st.isDirectory()) continue;

    const files = await listFilesRecursive(absDir, { cancelled: () => false });
    for (const f of files) {
      if (keepAbsolute.has(f.path)) continue;
      deleteCandidates.push({
        ...f,
        rel: path.relative(repoRoot, f.path).replace(/\\/g, "/"),
        category: "delete"
      });
    }
  }

  const exportBudget = pickExportKeepSet(exportCandidates, cfg.maxExportBytes);

  const keep = exportBudget.keep.map(f => ({ ...f, decision: "keep" }));
  const dropExports = exportBudget.drop.map(f => ({ ...f, decision: "delete" }));

  const dropDeletes = deleteCandidates.map(f => ({ ...f, decision: "delete" }));

  const deletions = [...dropExports, ...dropDeletes]
    .sort((a, b) => b.size - a.size);

  const deletionBytes = deletions.reduce((sum, f) => sum + (f.size || 0), 0);

  return {
    repoRoot,
    apply: cfg.apply,
    maxExportBytes: cfg.maxExportBytes,
    keepDb: keepDisplay,

    export: {
      dirs: cfg.exportDirs,
      budgetBytes: cfg.maxExportBytes,
      keepCount: keep.length,
      keepBytes: exportBudget.keepBytes,
      deleteCount: dropExports.length,
      deleteBytes: exportBudget.dropBytes
    },

    deleteDirs: cfg.deleteDirs,

    keep,
    deletions,

    stats: {
      exportCandidates: exportCandidates.length,
      deleteCandidates: deleteCandidates.length,
      deletionCount: deletions.length,
      deletionBytes,
      deletionBytesHuman: formatBytes(deletionBytes)
    }
  };
}

async function isGitTracked({ repoRoot, relPath }) {
  // Avoid shell quoting footguns by keeping args as separate tokens.
  const { spawn } = require("child_process");

  return await new Promise((resolve) => {
    const child = spawn("git", ["ls-files", "--", relPath], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });

    let out = "";
    child.stdout.on("data", (buf) => {
      out += String(buf);
    });

    child.on("close", () => {
      resolve(out.trim().length > 0);
    });

    child.on("error", () => resolve(false));
  });
}

function createLargeArtifactsPruneObservable(options = {}) {
  const cfg = normalizeOptions(options);

  return observable((next, complete, error) => {
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };

    (async () => {
      try {
        next({
          type: "start",
          repoRoot: cfg.repoRoot.replace(/\\/g, "/"),
          apply: cfg.apply,
          maxExportBytes: cfg.maxExportBytes,
          maxExportHuman: formatBytes(cfg.maxExportBytes)
        });

        const plan = await buildPrunePlan(cfg);

        next({
          type: "plan",
          planSummary: {
            repoRoot: plan.repoRoot.replace(/\\/g, "/"),
            apply: plan.apply,
            keepDb: plan.keepDb,
            export: plan.export,
            deleteDirs: plan.deleteDirs,
            stats: plan.stats
          }
        });

        if (cancelled) {
          next({ type: "cancelled" });
          complete();
          return;
        }

        if (!cfg.apply) {
          next({
            type: "dry-run",
            plannedDeletions: plan.deletions.slice(0, 50).map(d => ({
              rel: d.rel,
              size: d.size,
              sizeHuman: formatBytes(d.size),
              category: d.category
            }))
          });
          next({ type: "done", result: { ...plan.stats, applied: false } });
          complete();
          return;
        }

        let deletedCount = 0;
        let deletedBytes = 0;
        let skippedTracked = 0;

        for (const del of plan.deletions) {
          if (cancelled) break;

          const relPath = del.rel;

          if (cfg.ignoreIfTracked) {
            const tracked = await isGitTracked({ repoRoot: cfg.repoRoot, relPath });
            if (tracked) {
              skippedTracked += 1;
              next({ type: "skip", reason: "git-tracked", rel: relPath });
              continue;
            }
          }

          const absPath = ensureInsideRepo(cfg.repoRoot, path.join(cfg.repoRoot, relPath));

          try {
            await fs.promises.unlink(absPath);
            deletedCount += 1;
            deletedBytes += del.size || 0;
            next({ type: "delete", rel: relPath, size: del.size, sizeHuman: formatBytes(del.size) });
          } catch (e) {
            next({ type: "delete:error", rel: relPath, message: String((e && e.message) || e) });
          }
        }

        next({
          type: "done",
          result: {
            ...plan.stats,
            applied: true,
            deletedCount,
            deletedBytes,
            deletedBytesHuman: formatBytes(deletedBytes),
            skippedTracked
          }
        });
        complete();
      } catch (e) {
        error(e);
      }
    })();

    return cancel;
  });
}

module.exports = {
  createLargeArtifactsPruneObservable,
  buildPrunePlan,
  normalizeOptions,
  formatBytes
};
