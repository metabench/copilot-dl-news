#!/usr/bin/env node
'use strict';

/**
 * check-repo-scope.js — verify config/repo-scope.json against disk reality.
 *
 * WHY (2026-07-27): agent scope was specified only in prose, and prose drifts. The
 * module-ecosystem doc called news-crawler-itself "an EMPTY placeholder" months after
 * it held 36 files, and a survey that enumerated `*`/.git silently skipped it BECAUSE
 * it has no .git — the exact case that most needed flagging. This makes scope an
 * RB-011 probe: a claim with its own runnable re-verification.
 *
 * Checks per entry: directory exists · .git present where required · origin remote
 * matches the repo name · dirty-entry count · last commit date. `knownIssue` entries
 * WARN loudly but do not fail (tracked problems should surface every orient without
 * blocking work); everything else that violates the manifest exits 1.
 *
 *   node tools/dev/check-repo-scope.js [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'config', 'repo-scope.json');

function git(dir, args) {
  try {
    return execSync(`git ${args}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return null; }
}

function checkEntry(rootAbs, e) {
  const dir = path.join(rootAbs, e.name);
  const r = { name: e.name, status: e.status, confirmed: e.confirmed !== false, problems: [], warns: [] };
  r.exists = fs.existsSync(dir);
  if (!r.exists) {
    if (e.status === 'in') r.problems.push('directory MISSING for an in-scope repo');
    return r;
  }
  r.hasGit = fs.existsSync(path.join(dir, '.git'));
  if (r.hasGit) {
    r.dirty = (git(dir, 'status --porcelain') || '').split('\n').filter(Boolean).length;
    r.lastCommit = git(dir, 'log -1 --format=%cs') || 'n/a';
    const remote = git(dir, 'remote get-url origin') || '';
    r.remote = remote;
    // The remote should be the repo of the same name; a mismatch usually means a
    // copy/rename accident, which is worth surfacing before anyone pushes.
    if (remote && !remote.toLowerCase().includes(e.name.toLowerCase())) {
      r.warns.push(`origin does not mention "${e.name}": ${remote}`);
    }
  } else if (e.requireGit) {
    const msg = 'requireGit but NO .git — unversioned: no history, no remote, no backup';
    if (e.knownIssue) r.warns.push(`${msg} (known: ${e.knownIssue})`);
    else r.problems.push(msg);
  }
  return r;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rootAbs = path.resolve(ROOT, manifest.root || '..');
  const results = manifest.entries.map((e) => checkEntry(rootAbs, e));

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ asOf: manifest.asOf, results }, null, 2));
  } else {
    console.log(`repo scope vs disk (manifest asOf ${manifest.asOf}, root ${rootAbs})\n`);
    console.log('repo                                 status            git    dirty  last-commit  flags');
    for (const r of results) {
      const flags = [
        r.confirmed ? '' : 'INFERRED-awaiting-owner',
        ...r.warns.map((w) => `WARN: ${w}`),
        ...r.problems.map((p) => `FAIL: ${p}`)
      ].filter(Boolean).join(' · ') || '-';
      console.log(
        `${r.name.padEnd(36)} ${String(r.status).padEnd(17)} ${(r.exists ? (r.hasGit ? 'yes' : 'NO') : '-').padEnd(6)} ` +
        `${String(r.dirty ?? '-').padEnd(6)} ${String(r.lastCommit ?? '-').padEnd(12)} ${flags}`
      );
    }
  }

  const fails = results.filter((r) => r.problems.length);
  const warns = results.filter((r) => r.warns.length);
  console.log(`\n${fails.length} failure(s), ${warns.length} warning(s), ${results.length} entries checked.`);
  if (fails.length) {
    console.log('Scope manifest violated — fix the tree or update config/repo-scope.json with the owner.');
    process.exit(1);
  }
}

module.exports = { checkEntry };
if (require.main === module) main();
