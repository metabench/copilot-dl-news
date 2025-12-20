#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');

const fmt = new CliFormatter();

function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'vscode-freeze-diagnose',
    'Sample Windows process metrics to help diagnose intermittent VS Code UI freezes.'
  );

  parser
    .add('--duration-sec <n>', 'How long to sample for (seconds)', 180, 'number')
    .add('--interval-ms <n>', 'Sampling interval (milliseconds)', 750, 'number')
    .add('--out <file>', 'NDJSON output path', path.join('tmp', 'vscode-freeze-diagnosis.ndjson'))
    .add(
      '--focus <name...>',
      'Process names to always include (case-insensitive; e.g. "Code - Insiders" "OneDrive" "MsMpEng")',
      ['Code - Insiders', 'OneDrive', 'MsMpEng', 'SearchIndexer', 'git', 'node', 'dwm']
    )
    .add(
      '--split <name...>',
      'Process names to enrich with role info (parent PID + renderer/extensionHost/etc) using command line (case-insensitive)',
      ['Code - Insiders']
    )
    .add(
      '--include-commandline',
      'Include full process command lines in NDJSON output (off by default; role parsing still occurs when split is enabled)',
      false,
      'boolean'
    )
    .add('--top <n>', 'Also include the top N processes by CPU each sample', 15, 'number')
    .add('--quiet', 'Suppress formatted output (still writes the NDJSON log)', false, 'boolean')
    .add('--json', 'Emit JSON summary (in addition to NDJSON samples)', false, 'boolean');

  return parser.parse(argv);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function toPosixRel(relPath) {
  return relPath.replace(/\\/g, '/');
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeProcName(name) {
  return String(name || '').toLowerCase();
}

function shouldEnrich(row, splitNamesLower) {
  if (!row) return false;
  const n = normalizeProcName(row.name);
  return splitNamesLower.some((needle) => n === needle || n.includes(needle));
}

function parseChromiumRole(commandLine) {
  const text = String(commandLine || '');
  if (!text) return null;

  const typeMatch = text.match(/--type=([^\s"]+)/i);
  if (typeMatch && typeMatch[1]) {
    const t = String(typeMatch[1]).toLowerCase();
    if (t === 'renderer') return 'renderer';
    if (t === 'gpu-process') return 'gpu';
    if (t === 'utility') {
      const sub = text.match(/--utility-sub-type=([^\s"]+)/i);
      return sub && sub[1] ? `utility:${String(sub[1])}` : 'utility';
    }
    if (t === 'crashpad-handler') return 'crashpad';
    if (t === 'broker') return 'broker';
    if (t === 'zygote') return 'zygote';
    return `type:${t}`;
  }

  if (/--extensionProcess\b/i.test(text) || /--type=extensionHost\b/i.test(text) || /--extensionHost\b/i.test(text)) {
    return 'extensionHost';
  }

  // Electron main process typically has no --type flag.
  return 'main';
}

function runPowerShellJson(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        // Ensure UTF-8 and then execute the snippet.
        `$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`
      ],
      { windowsHide: true }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (buf) => {
      stdout += String(buf);
    });
    child.stderr.on('data', (buf) => {
      stderr += String(buf);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PowerShell exited ${code}: ${stderr || stdout}`));
        return;
      }

      const text = String(stdout || '').trim();
      if (!text) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(new Error(`Failed to parse PowerShell JSON (${e.message}). Output: ${text.slice(0, 2000)}`));
      }
    });
  });
}

async function sampleProcesses() {
  // Note: CPU is cumulative seconds; IOReadBytes/IOWriteBytes are cumulative bytes.
  // Some fields can be null depending on permissions/process state.
  const script = [
    '$procs = Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,PM,Handles,Threads,IOReadBytes,IOWriteBytes;',
    '$procs | ConvertTo-Json -Compress'
  ].join(' ');

  const data = await runPowerShellJson(script);
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

async function sampleProcessDetails(pids) {
  const unique = [...new Set((Array.isArray(pids) ? pids : []).filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) return [];

  // Keep the query bounded so each sample stays cheap.
  const limited = unique.slice(0, 60);
  const filter = limited.map((pid) => `ProcessId=${pid}`).join(' OR ');

  // Note: some processes may deny access to CommandLine; those fields may be null.
  const script = [
    `$filter = \"${filter}\";`,
    '$rows = Get-CimInstance Win32_Process -Filter $filter | Select-Object ProcessId,ParentProcessId,Name,CommandLine;',
    '$rows | ConvertTo-Json -Compress'
  ].join(' ');

  const data = await runPowerShellJson(script);
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function buildDetailsByPid(detailsList, { includeCommandLine, splitNamesLower }) {
  const map = new Map();
  for (const d of detailsList || []) {
    const pid = Number(d.ProcessId);
    if (!Number.isInteger(pid) || pid <= 0) continue;

    const commandLine = d.CommandLine != null ? String(d.CommandLine) : null;
    const exeName = d.Name != null ? String(d.Name) : null;
    const parentPid = Number.isInteger(Number(d.ParentProcessId)) ? Number(d.ParentProcessId) : null;
    const role = shouldEnrich({ name: exeName || '' }, splitNamesLower) || shouldEnrich({ name: 'Code - Insiders' }, splitNamesLower)
      ? parseChromiumRole(commandLine)
      : null;

    const record = { pid, parentPid, exeName, role };
    if (includeCommandLine) record.commandLine = commandLine;
    map.set(pid, record);
  }
  return map;
}

function decorateRows(rows, detailsByPid) {
  return (rows || []).map((r) => {
    const d = detailsByPid && detailsByPid.get ? detailsByPid.get(r.pid) : null;
    if (!d) return r;
    const next = { ...r };
    if (d.parentPid != null) next.parentPid = d.parentPid;
    if (d.exeName) next.exeName = d.exeName;
    if (d.role) next.role = d.role;
    if (d.commandLine != null) next.commandLine = d.commandLine;
    return next;
  });
}

function computeDeltas({ prevByPid, currList, intervalMs, cores }) {
  const intervalSec = intervalMs / 1000;
  const currByPid = new Map();

  const enriched = currList
    .map((p) => {
      const pid = p.Id;
      const prev = prevByPid.get(pid);

      const cpuNow = safeNumber(p.CPU);
      const cpuPrev = prev ? safeNumber(prev.CPU) : null;

      const cpuDelta = cpuNow != null && cpuPrev != null ? Math.max(0, cpuNow - cpuPrev) : null;

      // Percent of total system CPU (all cores). If cpuDelta == intervalSec, that's 100% of one core.
      const cpuPctTotal =
        cpuDelta != null && intervalSec > 0 && cores > 0
          ? (cpuDelta / intervalSec) * (100 / cores)
          : null;

      // Percent of a single core (can exceed 100% if multi-threaded across cores).
      const cpuPctOneCore = cpuDelta != null && intervalSec > 0 ? (cpuDelta / intervalSec) * 100 : null;

      const ioReadNow = safeNumber(p.IOReadBytes);
      const ioReadPrev = prev ? safeNumber(prev.IOReadBytes) : null;
      const ioWriteNow = safeNumber(p.IOWriteBytes);
      const ioWritePrev = prev ? safeNumber(prev.IOWriteBytes) : null;

      const ioReadDelta =
        ioReadNow != null && ioReadPrev != null ? Math.max(0, ioReadNow - ioReadPrev) : null;
      const ioWriteDelta =
        ioWriteNow != null && ioWritePrev != null ? Math.max(0, ioWriteNow - ioWritePrev) : null;

      const ioReadPerSec = ioReadDelta != null && intervalSec > 0 ? ioReadDelta / intervalSec : null;
      const ioWritePerSec = ioWriteDelta != null && intervalSec > 0 ? ioWriteDelta / intervalSec : null;

      const row = {
        pid,
        name: p.ProcessName,
        cpuSec: cpuNow,
        cpuDeltaSec: cpuDelta,
        cpuPctTotal,
        cpuPctOneCore,
        workingSetBytes: safeNumber(p.WorkingSet64),
        privateBytes: safeNumber(p.PM),
        handles: safeNumber(p.Handles),
        threads: safeNumber(p.Threads),
        ioReadBytes: ioReadNow,
        ioWriteBytes: ioWriteNow,
        ioReadDeltaBytes: ioReadDelta,
        ioWriteDeltaBytes: ioWriteDelta,
        ioReadPerSec,
        ioWritePerSec
      };

      currByPid.set(pid, p);
      return row;
    })
    .filter((row) => row && row.pid != null);

  return { currByPid, enriched };
}

function matchFocus(row, focusNamesLower) {
  const n = normalizeProcName(row.name);
  return focusNamesLower.some((needle) => n === needle || n.includes(needle));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let v = bytes;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx++;
  }
  const digits = idx <= 1 ? 0 : idx === 2 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[idx]}`;
}

function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

function pickTopCpu(rows, topN) {
  return [...rows]
    .filter((r) => Number.isFinite(r.cpuPctTotal))
    .sort((a, b) => (b.cpuPctTotal || 0) - (a.cpuPctTotal || 0))
    .slice(0, Math.max(0, topN));
}

function summarize(samples) {
  const byName = new Map();

  function getAgg(name, role) {
    const base = String(name || '').toLowerCase() || '(unknown)';
    const r = role ? String(role || '').toLowerCase() : '';
    const key = r ? `${base}::${r}` : base;
    const existing = byName.get(key);
    if (existing) return existing;
    const created = {
      name: name || '(unknown)',
      role: role || null,
      maxCpuPctTotal: 0,
      maxCpuPctOneCore: 0,
      maxWorkingSetBytes: 0,
      maxIoReadPerSec: 0,
      maxIoWritePerSec: 0,
      peaks: {
        cpuPctTotal: null,
        ioReadPerSec: null,
        ioWritePerSec: null,
        workingSetBytes: null
      }
    };
    byName.set(key, created);
    return created;
  }

  function maybeSetPeak(agg, metricKey, sample, row, value) {
    if (!Number.isFinite(value)) return;
    const cur = agg.peaks[metricKey];
    if (!cur || value > cur.value) {
      agg.peaks[metricKey] = {
        value,
        t: sample.t,
        idx: sample.idx,
        pid: row.pid,
        name: row.name,
        cpuPctTotal: row.cpuPctTotal,
        cpuPctOneCore: row.cpuPctOneCore,
        workingSetBytes: row.workingSetBytes,
        ioReadPerSec: row.ioReadPerSec,
        ioWritePerSec: row.ioWritePerSec
      };
    }
  }

  const globalTopCpuSamples = [];

  for (const s of samples) {
    const top = (s.topCpu || [])[0];
    if (top && Number.isFinite(top.cpuPctTotal)) {
      globalTopCpuSamples.push({
        t: s.t,
        idx: s.idx,
        name: top.name,
        pid: top.pid,
        cpuPctTotal: top.cpuPctTotal,
        cpuPctOneCore: top.cpuPctOneCore,
        workingSetBytes: top.workingSetBytes,
        ioReadPerSec: top.ioReadPerSec,
        ioWritePerSec: top.ioWritePerSec
      });
    }

    for (const r of s.focus || []) {
      const agg = getAgg(r.name, r.role);
      agg.maxCpuPctTotal = Math.max(agg.maxCpuPctTotal, r.cpuPctTotal || 0);
      agg.maxCpuPctOneCore = Math.max(agg.maxCpuPctOneCore, r.cpuPctOneCore || 0);
      agg.maxWorkingSetBytes = Math.max(agg.maxWorkingSetBytes, r.workingSetBytes || 0);
      agg.maxIoReadPerSec = Math.max(agg.maxIoReadPerSec, r.ioReadPerSec || 0);
      agg.maxIoWritePerSec = Math.max(agg.maxIoWritePerSec, r.ioWritePerSec || 0);

      maybeSetPeak(agg, 'cpuPctTotal', s, r, r.cpuPctTotal);
      maybeSetPeak(agg, 'ioReadPerSec', s, r, r.ioReadPerSec);
      maybeSetPeak(agg, 'ioWritePerSec', s, r, r.ioWritePerSec);
      maybeSetPeak(agg, 'workingSetBytes', s, r, r.workingSetBytes);
    }
  }

  const topFocusByCpu = [...byName.values()]
    .sort((a, b) => b.maxCpuPctTotal - a.maxCpuPctTotal)
    .slice(0, 30)
    .map((r) => ({
      name: r.role ? `${r.name} (${r.role})` : r.name,
      maxCpuPctTotal: round1(r.maxCpuPctTotal),
      maxCpuPctOneCore: round1(r.maxCpuPctOneCore),
      maxWorkingSet: formatBytes(r.maxWorkingSetBytes),
      maxIoReadPerSec: formatBytes(r.maxIoReadPerSec),
      maxIoWritePerSec: formatBytes(r.maxIoWritePerSec)
    }));

  const focusPeaks = [...byName.values()]
    .map((r) => ({
      name: r.name,
      peaks: {
        cpuPctTotal: r.peaks.cpuPctTotal
          ? {
            t: r.peaks.cpuPctTotal.t,
            idx: r.peaks.cpuPctTotal.idx,
            pid: r.peaks.cpuPctTotal.pid,
            value: round1(r.peaks.cpuPctTotal.value)
          }
          : null,
        ioReadPerSec: r.peaks.ioReadPerSec
          ? {
            t: r.peaks.ioReadPerSec.t,
            idx: r.peaks.ioReadPerSec.idx,
            pid: r.peaks.ioReadPerSec.pid,
            value: formatBytes(r.peaks.ioReadPerSec.value)
          }
          : null,
        ioWritePerSec: r.peaks.ioWritePerSec
          ? {
            t: r.peaks.ioWritePerSec.t,
            idx: r.peaks.ioWritePerSec.idx,
            pid: r.peaks.ioWritePerSec.pid,
            value: formatBytes(r.peaks.ioWritePerSec.value)
          }
          : null,
        workingSetBytes: r.peaks.workingSetBytes
          ? {
            t: r.peaks.workingSetBytes.t,
            idx: r.peaks.workingSetBytes.idx,
            pid: r.peaks.workingSetBytes.pid,
            value: formatBytes(r.peaks.workingSetBytes.value)
          }
          : null
      }
    }))
    .sort((a, b) => {
      const av = a.peaks.cpuPctTotal ? Number(a.peaks.cpuPctTotal.value) : 0;
      const bv = b.peaks.cpuPctTotal ? Number(b.peaks.cpuPctTotal.value) : 0;
      return bv - av;
    });

  const globalTopCpu = globalTopCpuSamples
    .sort((a, b) => (b.cpuPctTotal || 0) - (a.cpuPctTotal || 0))
    .slice(0, 25)
    .map((r) => ({
      t: r.t,
      idx: r.idx,
      name: r.name,
      pid: r.pid,
      cpuPctTotal: round1(r.cpuPctTotal),
      cpuPctOneCore: round1(r.cpuPctOneCore),
      workingSet: formatBytes(r.workingSetBytes),
      ioReadPerSec: formatBytes(r.ioReadPerSec),
      ioWritePerSec: formatBytes(r.ioWritePerSec)
    }));

  return { topFocusByCpu, focusPeaks, globalTopCpu };
}

async function main() {
  const raw = parseArgs(process.argv);
  const durationSec = Math.max(5, Number(raw.durationSec || 180));
  const intervalMs = Math.max(250, Number(raw.intervalMs || 750));
  const topN = Math.max(0, Number(raw.top || 15));

  const outPathAbs = path.isAbsolute(raw.out) ? raw.out : path.resolve(process.cwd(), raw.out);
  ensureParentDir(outPathAbs);

  const focusNames = Array.isArray(raw.focus) ? raw.focus : [raw.focus].filter(Boolean);
  const focusNamesLower = focusNames.map((s) => String(s || '').toLowerCase()).filter(Boolean);

  const splitNames = Array.isArray(raw.split) ? raw.split : [raw.split].filter(Boolean);
  const splitNamesLower = splitNames.map((s) => String(s || '').toLowerCase()).filter(Boolean);
  const includeCommandLine = Boolean(raw.includeCommandline);

  const cores = os.cpus().length || 1;
  const startMs = Date.now();
  const endMs = startMs + durationSec * 1000;

  const outStream = fs.createWriteStream(outPathAbs, { encoding: 'utf8' });

  if (!raw.quiet) {
    fmt.header('VS Code Freeze Diagnose');
    fmt.stat('Duration', `${durationSec}s`);
    fmt.stat('Interval', `${intervalMs}ms`);
    fmt.stat('Cores', String(cores));
    fmt.stat('Output', toPosixRel(path.relative(process.cwd(), outPathAbs)));
    fmt.list('Focus', focusNames);
    fmt.list('Split roles', splitNames);
    fmt.stat('Include command lines', includeCommandLine ? 'YES' : 'NO');
    fmt.info('Tip: start this tool, then use VS Code normally until a freeze happens.');
  }

  let prevByPid = new Map();
  let sampleIndex = 0;
  const samples = [];

  while (Date.now() < endMs) {
    const tickStart = Date.now();

    let procs;
    try {
      procs = await sampleProcesses();
    } catch (e) {
      if (!raw.quiet) fmt.warning(`Sampling error: ${String(e.message || e)}`);
      procs = [];
    }

    const { currByPid, enriched } = computeDeltas({ prevByPid, currList: procs, intervalMs, cores });
    prevByPid = currByPid;

    const focus = enriched.filter((r) => matchFocus(r, focusNamesLower));
    const topCpu = pickTopCpu(enriched, topN);

    const pidsToEnrich = [...new Set(
      [...focus, ...topCpu]
        .filter((r) => shouldEnrich(r, splitNamesLower))
        .map((r) => r.pid)
        .filter((pid) => Number.isInteger(pid) && pid > 0)
    )];

    let detailsByPid = new Map();
    if (pidsToEnrich.length > 0) {
      try {
        const details = await sampleProcessDetails(pidsToEnrich);
        detailsByPid = buildDetailsByPid(details, { includeCommandLine, splitNamesLower });
      } catch (e) {
        if (!raw.quiet) fmt.warning(`Detail sampling error: ${String(e.message || e)}`);
      }
    }

    const focusDecorated = decorateRows(focus, detailsByPid);
    const topCpuDecorated = decorateRows(topCpu, detailsByPid);

    const record = {
      type: 'sample',
      t: nowIso(),
      idx: sampleIndex,
      intervalMs,
      focus: focusDecorated,
      topCpu: topCpuDecorated
    };

    outStream.write(`${JSON.stringify(record)}\n`);
    samples.push(record);

    if (!raw.quiet && sampleIndex % Math.max(1, Math.floor(3000 / intervalMs)) === 0) {
      const top = topCpu[0];
      if (top) {
        fmt.info(
          `Sample ${sampleIndex}: top CPU ${top.name} (pid ${top.pid}) ~${round1(top.cpuPctTotal)}% total, ${round1(top.cpuPctOneCore)}% core`
        );
      } else {
        fmt.info(`Sample ${sampleIndex}: collected.`);
      }
    }

    sampleIndex += 1;

    const elapsed = Date.now() - tickStart;
    const delay = Math.max(0, intervalMs - elapsed);
    if (delay > 0) await sleep(delay);
  }

  outStream.end();

  const summary = {
    type: 'summary',
    t: nowIso(),
    durationSec,
    intervalMs,
    cores,
    focusNames,
    sampleCount: sampleIndex,
    derived: summarize(samples)
  };

  const summaryPathAbs = outPathAbs.replace(/\.ndjson$/i, '') + '.summary.json';
  fs.writeFileSync(summaryPathAbs, JSON.stringify(summary, null, 2), 'utf8');

  if (!raw.quiet) {
    fmt.section('Summary');
    fmt.stat('Samples', String(summary.sampleCount));
    fmt.stat('Summary JSON', toPosixRel(path.relative(process.cwd(), summaryPathAbs)));
    fmt.section('Top focus processes by max CPU');
    fmt.table(summary.derived.topFocusByCpu);
    fmt.section('Top CPU samples (global)');
    fmt.table(summary.derived.globalTopCpu.slice(0, 12));
    fmt.info('Next: reproduce a freeze, then open the summary JSON to see which processes spiked around that time.');
  }

  if (raw.json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }
}

main().catch((err) => {
  fmt.error(String((err && err.stack) || err));
  process.exit(1);
});
