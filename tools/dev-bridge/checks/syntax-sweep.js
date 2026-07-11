'use strict';

/**
 * syntax-sweep.js — node --check every modified/untracked .js file reported
 * by git status in a repo (guards against committing crash-truncated files).
 * Usage: node syntax-sweep.js <repoDirName>
 */

const path = require('path');
const fs = require('fs');
const { execFileSync, execSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const repoName = process.argv[2];
const repo = path.join(WORKSPACE, repoName || '');
if (!repoName || !fs.existsSync(path.join(repo, '.git'))) {
  console.log('usage: syntax-sweep.js <repoDirName>');
  process.exit(1);
}

const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const files = [];
for (const line of status.split('\n')) {
  if (!line.trim()) continue;
  const p = line.slice(3).trim().replace(/^"|"$/g, '');
  const full = path.join(repo, p);
  if (p.endsWith('.js')) {
    files.push(p);
  } else if (!p.includes('.') && fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    // untracked directory: sweep its .js files (skip runtime dirs)
    const stack = [full];
    while (stack.length) {
      const dir = stack.pop();
      const base = path.basename(dir);
      if (['node_modules', 'inbox', 'outbox', 'logs', 'state'].includes(base)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(fp);
        else if (entry.name.endsWith('.js')) files.push(path.relative(repo, fp));
      }
    }
  }
}

let bad = 0;
for (const f of files) {
  const full = path.join(repo, f);
  if (!fs.existsSync(full)) continue;
  try {
    execSync(`node --check "${full}"`, { stdio: 'pipe' });
  } catch (err) {
    bad++;
    console.log(`FAIL ${f}: ${String(err.stderr).split('\n').slice(-3).join(' ').trim().slice(0, 160)}`);
  }
}
console.log(`[sweep] ${files.length} js files checked, ${bad} with syntax errors`);
process.exit(bad === 0 ? 0 : 1);
