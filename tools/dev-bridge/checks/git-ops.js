'use strict';

/**
 * git-ops.js — run a whitelisted git command in a repo under the repos
 * workspace, via the dev-bridge. Lets the sandbox agent do version control
 * on this machine (where the working trees and credentials live).
 *
 * Usage: node git-ops.js <repoDirName> <gitArgs...>
 *   e.g. node git-ops.js news-crawler-db status --porcelain
 *        node git-ops.js copilot-dl-news add src/core/crawler/adapters
 *        node git-ops.js copilot-dl-news commit -m "message"
 *        node git-ops.js copilot-dl-news push
 *
 * Whitelisted subcommands only (no arbitrary git): status, remote, branch,
 * log, diff, add, restore, commit, push, pull, rev-parse, ls-files, show.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const ALLOWED = new Set(['status', 'remote', 'branch', 'log', 'diff', 'add', 'restore', 'commit', 'push', 'pull', 'rev-parse', 'ls-files', 'show']);

const [repoName, ...gitArgs] = process.argv.slice(2);
if (!repoName || gitArgs.length === 0) {
  console.log('usage: git-ops.js <repoDirName> <gitArgs...>');
  process.exit(1);
}
const repo = path.join(WORKSPACE, repoName);
if (!repo.startsWith(WORKSPACE) || !fs.existsSync(path.join(repo, '.git'))) {
  console.log(`not a git repo under the workspace: ${repoName}`);
  process.exit(1);
}
if (!ALLOWED.has(gitArgs[0])) {
  console.log(`git subcommand not allowed: ${gitArgs[0]} (allowed: ${[...ALLOWED].join(', ')})`);
  process.exit(1);
}

try {
  const out = execFileSync('git', gitArgs, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 15 * 60 * 1000
  });
  process.stdout.write(out || '(no output)\n');
} catch (err) {
  process.stdout.write(`EXIT ${err.status}\n${err.stdout || ''}\n${err.stderr || ''}`);
  process.exit(err.status || 1);
}
