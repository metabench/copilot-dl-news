#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
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

function shouldSkipDir(direntName) {
  return direntName === '.git' || direntName === 'node_modules';
}

async function walkAndMeasure(rootDir, options) {
  const result = {
    root: rootDir,
    exists: true,
    fileCount: 0,
    dirCount: 0,
    totalBytes: 0,
    largestFiles: [],
    errors: []
  };

  const rootExists = await pathExists(rootDir);
  if (!rootExists) {
    result.exists = false;
    return result;
  }

  const maxLargest = Math.max(0, options.top);
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let dirents;
    try {
      dirents = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (error) {
      result.errors.push({ path: current, message: `Failed to read directory: ${error.message}` });
      continue;
    }

    result.dirCount += 1;

    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        if (shouldSkipDir(dirent.name)) continue;
        stack.push(fullPath);
        continue;
      }

      let stat;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch (error) {
        result.errors.push({ path: fullPath, message: `Failed to stat entry: ${error.message}` });
        continue;
      }

      if (!stat.isFile()) continue;

      result.fileCount += 1;
      result.totalBytes += stat.size;

      if (maxLargest > 0) {
        const rel = path.relative(rootDir, fullPath);
        result.largestFiles.push({ rel, abs: fullPath, bytes: stat.size, mtimeMs: stat.mtimeMs });
        result.largestFiles.sort((a, b) => b.bytes - a.bytes);
        if (result.largestFiles.length > maxLargest) {
          result.largestFiles.length = maxLargest;
        }
      }

      if (options.maxFiles > 0 && result.fileCount >= options.maxFiles) {
        return result;
      }
    }
  }

  return result;
}

async function runCli() {
  const parser = new CliArgumentParser('dir-sizes', 'Summarize directory sizes to guide consolidation decisions.', '1.0.0');
  parser
    .add('--dir <path...>', 'Directory(s) to measure (repeatable)', [], 'string')
    .add('--top <n>', 'Show top N largest files per directory', 10, 'number')
    .add('--max-files <n>', 'Stop after scanning N files per directory (0 = unlimited)', 0, 'number')
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--quiet', 'Suppress formatted output', false, 'boolean');

  const args = parser.parse(process.argv);
  const dirs = Array.isArray(args.dir) ? args.dir : [args.dir].filter(Boolean);

  const resolvedDirs = (dirs.length ? dirs : ['tmp', 'tmp/debug', 'testlogs', 'screenshots', 'build/analysis-charts', 'data'])
    .map((d) => (path.isAbsolute(d) ? d : path.resolve(process.cwd(), d)));

  const options = {
    top: Number.isInteger(args.top) ? args.top : 10,
    maxFiles: Number.isInteger(args.maxFiles) ? args.maxFiles : 0
  };

  const measurements = [];
  for (const dir of resolvedDirs) {
    measurements.push(await walkAndMeasure(dir, options));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    directories: measurements
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (args.quiet) return;

  const fmt = new CliFormatter();
  fmt.header('Directory size summary');
  fmt.stat('Generated', summary.generatedAt);

  for (const m of measurements) {
    fmt.section(path.relative(process.cwd(), m.root) || m.root);
    if (!m.exists) {
      fmt.warn('Directory not found');
      continue;
    }
    fmt.stat('Files', m.fileCount, 'number');
    fmt.stat('Total size', formatBytes(m.totalBytes));
    if (m.largestFiles.length > 0) {
      fmt.table(
        m.largestFiles.map((f) => ({ size: formatBytes(f.bytes), rel: f.rel }))
      );
    }
    if (m.errors.length > 0) {
      fmt.warning(`Errors: ${m.errors.length}`);
    }
  }
}

runCli().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(String((error && error.stack) || error));
  process.exit(1);
});

