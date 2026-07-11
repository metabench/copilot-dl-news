'use strict';

/**
 * list-node-procs.check.js — list node/electron processes with command lines
 * and start times, to identify a zombie holding news.db handles. Read-only.
 */

const { execSync } = require('child_process');

const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|electron' } | Select-Object ProcessId,ParentProcessId,Name,CreationDate,CommandLine | ConvertTo-Json -Depth 2`;

try {
  const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000
  });
  const rows = JSON.parse(out);
  const list = Array.isArray(rows) ? rows : [rows];
  console.log(`[procs] self pid=${process.pid} parent(bridge)=${process.ppid}`);
  for (const p of list) {
    const cmd = (p.CommandLine || '').slice(0, 220);
    console.log(`[procs] pid=${p.ProcessId} ppid=${p.ParentProcessId} ${p.Name} created=${p.CreationDate} cmd=${cmd}`);
  }
} catch (err) {
  console.log(`[procs] failed: ${err.message}`);
  process.exit(1);
}
