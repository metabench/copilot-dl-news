#!/usr/bin/env node
'use strict';

/**
 * artifact-archive — archive large local artifacts (logs, screenshots, charts) into ZIP buckets.
 *
 * Why: Keep the working tree lean while preserving access to older evidence.
 *
 * Defaults:
 * - dry-run unless --fix
 * - bucket by month (YYYY-MM)
 * - stores zips + manifest under <root>/archive/
 *
 * Examples:
 *   node tools/dev/artifact-archive.js --target testlogs --archive --older-than 28
 *   node tools/dev/artifact-archive.js --target testlogs --archive --older-than 28 --fix
 *   node tools/dev/artifact-archive.js --target testlogs --list
 *   node tools/dev/artifact-archive.js --target testlogs --search "EADDRINUSE" --limit 10
 *   node tools/dev/artifact-archive.js --target testlogs --extract 2025-10
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/utils/CliFormatter');

const DEFAULT_OLDER_THAN_DAYS = 28;
const DEFAULT_BUCKET = 'month';
const DEFAULT_LIMIT = 25;

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, Number(bytes) || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = unit === 0 ? 0 : unit <= 2 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unit]}`;
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function toIsoDate(ms) {
  const d = new Date(ms);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function bucketKeyForMtime(mtimeMs, bucketMode) {
  const d = new Date(mtimeMs);
  if (isNaN(d.getTime())) return 'unknown';
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (bucketMode === 'day') return `${yyyy}-${mm}-${dd}`;
  return `${yyyy}-${mm}`;
}

function runPowerShellCompressArchive({ sourceGlob, zipPath, update }) {
  const destination = zipPath.replace(/'/g, "''");
  const source = sourceGlob.replace(/'/g, "''");

  const cmd = update
    ? `Compress-Archive -Path '${source}' -Update -DestinationPath '${destination}'`
    : `Compress-Archive -Path '${source}' -DestinationPath '${destination}'`;

  execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'pipe' });
}

function runPowerShellExpandArchive({ zipPath, destinationDir }) {
  const zip = zipPath.replace(/'/g, "''");
  const dest = destinationDir.replace(/'/g, "''");
  const cmd = `Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force`;
  execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'pipe' });
}

function defaultTargetConfig(target) {
  const root = path.resolve(process.cwd());
  const presets = {
    testlogs: {
      root: path.join(root, 'testlogs'),
      textOnly: true
    },
    screenshots: {
      root: path.join(root, 'screenshots'),
      textOnly: false
    },
    'analysis-charts': {
      root: path.join(root, 'analysis-charts'),
      textOnly: false
    },
    'tmp-debug': {
      root: path.join(root, 'tmp-debug'),
      textOnly: true
    }
  };

  return presets[target] || null;
}

function isTextFileByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.log' || ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.ndjson' || ext === '.csv';
}

async function readManifest(manifestPath) {
  if (!(await pathExists(manifestPath))) {
    return { version: 1, updatedAt: null, archives: [] };
  }

  try {
    const text = await fs.promises.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid manifest');
    if (!Array.isArray(parsed.archives)) parsed.archives = [];
    if (!parsed.version) parsed.version = 1;
    return parsed;
  } catch (_) {
    return { version: 1, updatedAt: null, archives: [] };
  }
}

async function writeManifest(manifestPath, manifest) {
  const payload = {
    ...manifest,
    updatedAt: new Date().toISOString()
  };
  await ensureDir(path.dirname(manifestPath));
  await fs.promises.writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function collectFileCandidates(rootDir, archiveDir, cutoffMs, maxFiles) {
  const candidates = [];
  if (!(await pathExists(rootDir))) return candidates;

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let dirents;
    try {
      dirents = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);

      if (dirent.isDirectory()) {
        // Skip the archive directory tree.
        if (path.resolve(fullPath).startsWith(path.resolve(archiveDir))) continue;
        stack.push(fullPath);
        continue;
      }

      if (!dirent.isFile()) continue;
      if (dirent.name === '.gitkeep') continue;

      let stat;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch (_) {
        continue;
      }

      if (!stat.isFile()) continue;
      if (stat.mtimeMs >= cutoffMs) continue;

      const rel = path.relative(rootDir, fullPath);
      candidates.push({ abs: fullPath, rel, bytes: stat.size, mtimeMs: stat.mtimeMs });
      if (maxFiles > 0 && candidates.length >= maxFiles) return candidates;
    }
  }

  return candidates;
}

function groupByBucket(items, bucketMode) {
  const buckets = new Map();
  for (const item of items) {
    const key = bucketKeyForMtime(item.mtimeMs, bucketMode);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return buckets;
}

function summarizeBucket(key, items) {
  let bytes = 0;
  let oldest = Infinity;
  let newest = 0;
  for (const item of items) {
    bytes += item.bytes;
    oldest = Math.min(oldest, item.mtimeMs);
    newest = Math.max(newest, item.mtimeMs);
  }
  return {
    bucket: key,
    count: items.length,
    bytes,
    bytesHuman: formatBytes(bytes),
    oldest: toIsoDate(oldest),
    newest: toIsoDate(newest)
  };
}

async function archiveBuckets({
  rootDir,
  archiveDir,
  manifestPath,
  bucketMode,
  olderThanDays,
  fix,
  maxFiles,
  fmt,
  quiet,
  json
}) {
  const now = Date.now();
  const cutoffMs = now - olderThanDays * 24 * 60 * 60 * 1000;

  await ensureDir(archiveDir);

  const candidates = await collectFileCandidates(rootDir, archiveDir, cutoffMs, maxFiles);
  const buckets = groupByBucket(candidates, bucketMode);

  const bucketSummaries = Array.from(buckets.entries())
    .map(([key, items]) => ({ key, items, summary: summarizeBucket(key, items) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const plan = {
    rootDir,
    archiveDir,
    bucketMode,
    olderThanDays,
    fix,
    candidateCount: candidates.length,
    candidateBytes: candidates.reduce((acc, item) => acc + item.bytes, 0),
    candidateBytesHuman: formatBytes(candidates.reduce((acc, item) => acc + item.bytes, 0)),
    buckets: bucketSummaries.map((b) => b.summary)
  };

  if (json) {
    console.log(JSON.stringify({ type: 'plan', plan }, null, 2));
  } else if (!quiet) {
    fmt.header('Artifact archive');
    fmt.stat('Root', rootDir);
    fmt.stat('Archive dir', archiveDir);
    fmt.stat('Mode', fix ? 'archive (fix)' : 'preview (dry-run)');
    fmt.stat('Older than (days)', olderThanDays, 'number');
    fmt.stat('Candidates', candidates.length, 'number');
    fmt.stat('Candidate bytes', plan.candidateBytesHuman);

    if (plan.buckets.length > 0) {
      fmt.section('Buckets');
      fmt.table(plan.buckets.map((b) => ({ bucket: b.bucket, count: b.count, bytes: b.bytesHuman })));
    }
  }

  if (!fix) return plan;

  const manifest = await readManifest(manifestPath);

  const stagingRoot = path.join(archiveDir, '_staging');
  await ensureDir(stagingRoot);

  for (const { key, items, summary } of bucketSummaries) {
    const zipName = `${path.basename(rootDir)}-${key}.zip`;
    const zipPath = path.join(archiveDir, zipName);
    const stagingDir = path.join(stagingRoot, key);

    await ensureDir(stagingDir);

    for (const item of items) {
      const dest = path.join(stagingDir, item.rel);
      await ensureDir(path.dirname(dest));
      await fs.promises.rename(item.abs, dest);
    }

    const update = await pathExists(zipPath);
    // Compress contents of stagingDir without including the stagingDir folder name.
    runPowerShellCompressArchive({
      sourceGlob: path.join(stagingDir, '*'),
      zipPath,
      update
    });

    await fs.promises.rm(stagingDir, { recursive: true, force: true });

    // Update manifest (cumulative; safe because we physically moved files out of root).
    const existing = manifest.archives.find((a) => a.bucket === key && a.zipName === zipName);
    if (existing) {
      existing.count += summary.count;
      existing.bytes += summary.bytes;
      existing.bytesHuman = formatBytes(existing.bytes);
      existing.oldest = existing.oldest ? (existing.oldest < summary.oldest ? existing.oldest : summary.oldest) : summary.oldest;
      existing.newest = existing.newest ? (existing.newest > summary.newest ? existing.newest : summary.newest) : summary.newest;
      existing.updatedAt = new Date().toISOString();
    } else {
      manifest.archives.push({
        bucket: key,
        zipName,
        zipPath,
        count: summary.count,
        bytes: summary.bytes,
        bytesHuman: summary.bytesHuman,
        oldest: summary.oldest,
        newest: summary.newest,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    if (!quiet) {
      fmt.success(`Archived ${summary.count} files (${summary.bytesHuman}) to ${zipName}`);
    }
  }

  await fs.promises.rm(stagingRoot, { recursive: true, force: true });
  await writeManifest(manifestPath, manifest);
  return plan;
}

async function listArchives({ manifestPath, fmt, quiet, json }) {
  const manifest = await readManifest(manifestPath);
  const rows = (manifest.archives || [])
    .slice()
    .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))
    .map((a) => ({ bucket: a.bucket, zip: a.zipName, files: a.count, bytes: a.bytesHuman }));

  if (json) {
    console.log(JSON.stringify({ type: 'list', manifest }, null, 2));
    return;
  }

  if (quiet) return;
  fmt.header('Artifact archives');
  fmt.stat('Manifest', manifestPath);
  fmt.stat('Updated', manifest.updatedAt || '(unknown)');
  if (rows.length === 0) {
    fmt.info('No archives recorded yet.');
    return;
  }
  fmt.table(rows);
}

async function extractArchive({ manifestPath, archiveDir, bucket, dest, fix, fmt, quiet, json }) {
  const manifest = await readManifest(manifestPath);
  const record = (manifest.archives || []).find((a) => a.bucket === bucket);
  if (!record) {
    const msg = `Bucket not found in manifest: ${bucket}`;
    if (json) console.log(JSON.stringify({ type: 'error', message: msg }, null, 2));
    else fmt.error(msg);
    process.exitCode = 1;
    return;
  }

  const zipPath = path.isAbsolute(record.zipPath) ? record.zipPath : path.join(archiveDir, record.zipName);
  const destinationDir = dest || path.join(archiveDir, 'extracted', bucket);

  if (json) {
    console.log(JSON.stringify({ type: 'extract', dryRun: !fix, zipPath, destinationDir }, null, 2));
  } else if (!quiet) {
    fmt.header('Extract archive');
    fmt.stat('Bucket', bucket);
    fmt.stat('Zip', zipPath);
    fmt.stat('Destination', destinationDir);
    fmt.stat('Mode', fix ? 'extract (fix)' : 'preview (dry-run)');
  }

  if (!fix) return;

  await ensureDir(destinationDir);
  runPowerShellExpandArchive({ zipPath, destinationDir });
  if (!quiet) fmt.success(`Extracted to ${destinationDir}`);
}

async function searchArchives({ manifestPath, archiveDir, query, limit, fmt, quiet, json }) {
  const q = String(query || '').toLowerCase();
  if (!q) {
    const msg = 'Search query is required.';
    if (json) console.log(JSON.stringify({ type: 'error', message: msg }, null, 2));
    else fmt.error(msg);
    process.exitCode = 1;
    return;
  }

  const manifest = await readManifest(manifestPath);
  const archives = (manifest.archives || []).slice().sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));

  const matches = [];
  const tempRoot = path.join(archiveDir, '_temp-search');
  await ensureDir(tempRoot);

  for (const archive of archives) {
    if (matches.length >= limit) break;

    const zipPath = path.isAbsolute(archive.zipPath) ? archive.zipPath : path.join(archiveDir, archive.zipName);
    if (!(await pathExists(zipPath))) continue;

    const tempDir = path.join(tempRoot, `${archive.bucket}-${Date.now()}`);
    await ensureDir(tempDir);

    try {
      runPowerShellExpandArchive({ zipPath, destinationDir: tempDir });

      const stack = [tempDir];
      while (stack.length > 0 && matches.length < limit) {
        const current = stack.pop();
        let dirents;
        try {
          dirents = await fs.promises.readdir(current, { withFileTypes: true });
        } catch (_) {
          continue;
        }
        for (const dirent of dirents) {
          if (matches.length >= limit) break;
          const full = path.join(current, dirent.name);
          if (dirent.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!dirent.isFile()) continue;
          if (!isTextFileByExt(full)) continue;

          let text;
          try {
            text = await fs.promises.readFile(full, 'utf8');
          } catch (_) {
            continue;
          }
          const idx = text.toLowerCase().indexOf(q);
          if (idx === -1) continue;

          const rel = path.relative(tempDir, full);
          matches.push({ bucket: archive.bucket, file: rel });
        }
      }
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  await fs.promises.rm(tempRoot, { recursive: true, force: true });

  if (json) {
    console.log(JSON.stringify({ type: 'search', query, limit, matches }, null, 2));
    return;
  }

  if (quiet) return;
  fmt.header('Archive search');
  fmt.stat('Query', query);
  fmt.stat('Matches', matches.length, 'number');
  if (matches.length > 0) {
    fmt.table(matches);
  }
}

async function runCli() {
  const parser = new CliArgumentParser('artifact-archive', 'Archive large local artifacts into ZIP buckets (dry-run by default).', '1.0.0');
  parser
    .add('--target <name>', 'Preset target: testlogs|screenshots|analysis-charts|tmp-debug', '')
    .add('--root <path>', 'Root directory to archive (overrides --target)', '')
    .add('--archive-dir <path>', 'Archive directory (default: <root>/archive)', '')
    .add('--bucket <mode>', 'Bucket mode: month|day', DEFAULT_BUCKET)
    .add('--older-than <days>', 'Archive items older than N days', DEFAULT_OLDER_THAN_DAYS, 'number')
    .add('--max-files <n>', 'Max files to consider (0 = unlimited)', 0, 'number')
    .add('--archive', 'Create/update archives for eligible files', false, 'boolean')
    .add('--list', 'List known archives (manifest-driven)', false, 'boolean')
    .add('--extract <bucket>', 'Extract a bucket zip into a destination directory', '')
    .add('--dest <path>', 'Destination directory for --extract (default: <archiveDir>/extracted/<bucket>)', '')
    .add('--search <query>', 'Search text content in archives (extract + scan)', '')
    .add('--limit <n>', 'Max search matches', DEFAULT_LIMIT, 'number')
    .add('--fix', 'Apply changes (default: dry-run/preview)', false, 'boolean')
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--quiet', 'Suppress formatted output', false, 'boolean');

  const args = parser.parse(process.argv);
  const fmt = new CliFormatter();

  const target = String(args.target || '').trim();
  const preset = target ? defaultTargetConfig(target) : null;

  const rootDir = args.root
    ? (path.isAbsolute(args.root) ? args.root : path.resolve(process.cwd(), args.root))
    : preset
      ? preset.root
      : '';

  if (!rootDir) {
    const msg = 'Provide --target <name> or --root <path>.';
    if (args.json) console.log(JSON.stringify({ type: 'error', message: msg }, null, 2));
    else fmt.error(msg);
    process.exit(1);
  }

  const archiveDir = args.archiveDir
    ? (path.isAbsolute(args.archiveDir) ? args.archiveDir : path.resolve(process.cwd(), args.archiveDir))
    : path.join(rootDir, 'archive');

  const manifestPath = path.join(archiveDir, 'archive-manifest.json');

  const olderThanDays = Number.isFinite(args.olderThan) ? args.olderThan : DEFAULT_OLDER_THAN_DAYS;
  const bucketMode = args.bucket === 'day' ? 'day' : 'month';
  const fix = args.fix === true;
  const maxFiles = Number.isFinite(args.maxFiles) ? args.maxFiles : 0;

  if (args.list) {
    await listArchives({ manifestPath, fmt, quiet: args.quiet, json: args.json });
    return;
  }

  if (args.extract) {
    await extractArchive({
      manifestPath,
      archiveDir,
      bucket: String(args.extract),
      dest: args.dest ? String(args.dest) : '',
      fix,
      fmt,
      quiet: args.quiet,
      json: args.json
    });
    return;
  }

  if (args.search) {
    await searchArchives({
      manifestPath,
      archiveDir,
      query: String(args.search),
      limit: Number.isFinite(args.limit) ? args.limit : DEFAULT_LIMIT,
      fmt,
      quiet: args.quiet,
      json: args.json
    });
    return;
  }

  if (args.archive) {
    await archiveBuckets({
      rootDir,
      archiveDir,
      manifestPath,
      bucketMode,
      olderThanDays,
      fix,
      maxFiles,
      fmt,
      quiet: args.quiet,
      json: args.json
    });
    return;
  }

  const msg = 'No operation specified. Use --archive, --list, --extract <bucket>, or --search <query>.';
  if (args.json) console.log(JSON.stringify({ type: 'error', message: msg }, null, 2));
  else fmt.error(msg);
  process.exit(1);
}

runCli().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(String((error && error.stack) || error));
  process.exit(1);
});
