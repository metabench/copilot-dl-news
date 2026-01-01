#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/utils/CliFormatter');

function runGit(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const result = execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return String(result).trim();
}

function resolveGitRef(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = safeTry(() => runGit(['rev-parse', '--verify', candidate]));
    if (resolved.ok) {
      return { ref: candidate, sha: resolved.value };
    }
  }
  return null;
}

function parseLeftRightCount(output) {
  const raw = String(output || '').trim();
  const match = raw.match(/^(\d+)\s+(\d+)$/);
  if (!match) return null;
  return {
    left: Number(match[1]),
    right: Number(match[2])
  };
}

function parseGitHubRepoFromOrigin(originUrlRaw) {
  if (!originUrlRaw) return null;
  const originUrl = String(originUrlRaw).trim();

  // https://github.com/<owner>/<repo>.git
  const httpsMatch = originUrl.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?$/i);
  if (httpsMatch) {
    const slug = httpsMatch[1].replace(/\/$/, '');
    const parts = slug.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  }

  // git@github.com:<owner>/<repo>.git
  const sshMatch = originUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const slug = sshMatch[1].replace(/\/$/, '');
    const parts = slug.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  }

  return null;
}

function normalizeBranchName(branchRef) {
  if (!branchRef) return null;
  let value = String(branchRef).trim();
  value = value.replace(/^refs\/(heads|remotes)\//, '');
  value = value.replace(/^origin\//, '');
  return value;
}

function buildCompareUrl({ owner, repo, base, head }) {
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  const safeBase = encodeURIComponent(base);
  const safeHead = encodeURIComponent(head);
  return `https://github.com/${safeOwner}/${safeRepo}/compare/${safeBase}...${safeHead}?expand=1`;
}

function safeTry(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function runCli() {
  const fmt = new CliFormatter();
  const parser = new CliArgumentParser(
    'git-pr-link',
    'Print a GitHub Pull Request compare link with safe defaults (base from origin/HEAD, head from current branch).',
    '1.0.0'
  );

  parser
    .add('--base <branch>', 'Base branch (default: derived from origin/HEAD)', null, 'string')
    .add('--head <branch>', 'Head branch (default: current branch)', null, 'string')
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--quiet', 'Suppress formatted output', false, 'boolean');

  const args = parser.parse(process.argv);

  const status = {
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    git: {
      branch: null,
      base: null,
      head: null,
      originUrl: null,
      upstream: null,
      isDirty: null,
      divergence: null
    },
    github: {
      owner: null,
      repo: null,
      compareUrl: null
    },
    warnings: [],
    nextCommands: []
  };

  const gitStatus = safeTry(() => runGit(['status', '--porcelain']));
  if (!gitStatus.ok) {
    const message = gitStatus.error && gitStatus.error.message ? gitStatus.error.message : String(gitStatus.error);
    if (args.json) {
      status.warnings.push('Not a git repository (or git not available).');
      status.nextCommands.push('git status');
      console.log(JSON.stringify({ ok: false, ...status, error: message }, null, 2));
      process.exitCode = 1;
      return;
    }

    fmt.error('git-pr-link: git not available or not a git repo');
    console.log(message);
    process.exitCode = 1;
    return;
  }

  status.git.isDirty = gitStatus.value.length > 0;

  const originUrl = safeTry(() => runGit(['remote', 'get-url', 'origin']));
  status.git.originUrl = originUrl.ok ? originUrl.value : null;

  const currentBranch = safeTry(() => runGit(['rev-parse', '--abbrev-ref', 'HEAD']));
  status.git.branch = currentBranch.ok ? currentBranch.value : null;

  const originHead = safeTry(() => runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']));
  const derivedBase = originHead.ok ? normalizeBranchName(originHead.value) : null;

  const base = normalizeBranchName(args.base || derivedBase || 'main');
  const head = normalizeBranchName(args.head || status.git.branch);

  status.git.base = base;
  status.git.head = head;

  const baseResolved = resolveGitRef([
    `refs/remotes/origin/${base}`,
    `origin/${base}`,
    base,
    `refs/heads/${base}`
  ]);
  const headResolved = resolveGitRef([
    `refs/heads/${head}`,
    head,
    `refs/remotes/origin/${head}`,
    `origin/${head}`
  ]);

  if (baseResolved && headResolved) {
    const counts = safeTry(() => runGit(['rev-list', '--left-right', '--count', `${baseResolved.ref}...${headResolved.ref}`]));
    if (counts.ok) {
      const parsed = parseLeftRightCount(counts.value);
      if (parsed) {
        status.git.divergence = {
          baseRef: baseResolved.ref,
          headRef: headResolved.ref,
          behind: parsed.left,
          ahead: parsed.right
        };

        if (parsed.left > 0) {
          status.warnings.push(`Head branch is behind base by ${parsed.left} commit(s).`);
          status.nextCommands.push('git fetch origin');
          status.nextCommands.push(`git rebase origin/${base}`);
        }
      }
    }
  } else {
    status.warnings.push('Could not compute ahead/behind divergence (missing base/head refs locally).');
    status.nextCommands.push('git fetch origin');
  }

  const upstream = safeTry(() => runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']));
  status.git.upstream = upstream.ok ? upstream.value : null;

  if (status.git.isDirty) {
    status.warnings.push('Working tree has uncommitted changes.');
    status.nextCommands.push('git status -sb');
  }

  if (!status.git.originUrl) {
    status.warnings.push('No origin remote configured.');
    status.nextCommands.push('git remote -v');
  }

  if (!head || head === 'HEAD') {
    status.warnings.push('Could not determine current branch (detached HEAD?).');
    status.nextCommands.push('git status -sb');
  }

  if (!status.git.upstream) {
    status.warnings.push('No upstream configured for current branch.');
    status.nextCommands.push('git push -u origin HEAD');
  }

  const parsed = parseGitHubRepoFromOrigin(status.git.originUrl);
  if (parsed) {
    status.github.owner = parsed.owner;
    status.github.repo = parsed.repo;
    if (base && head) {
      status.github.compareUrl = buildCompareUrl({ owner: parsed.owner, repo: parsed.repo, base, head });
    }
  } else {
    status.warnings.push('Origin remote is not recognized as a GitHub URL (https://github.com/... or git@github.com:...).');
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: Boolean(status.github.compareUrl), ...status }, null, 2));
    return;
  }

  if (!args.quiet) {
    fmt.header('Git PR Link');
    fmt.stat('Branch', status.git.branch || '(unknown)');
    fmt.stat('Base', status.git.base || '(unknown)');
    fmt.stat('Head', status.git.head || '(unknown)');
    fmt.stat('Origin', status.git.originUrl || '(missing)');

    if (status.git.divergence) {
      const { ahead, behind, baseRef, headRef } = status.git.divergence;
      fmt.section('Divergence');
      fmt.stat('Compare', `${baseRef}...${headRef}`);
      fmt.stat('Ahead', ahead, 'number');
      fmt.stat('Behind', behind, 'number');
    }

    if (status.github.compareUrl) {
      fmt.section('Compare URL');
      console.log(status.github.compareUrl);
    }

    if (status.warnings.length) {
      fmt.list('Warnings', status.warnings);
    }

    if (status.nextCommands.length) {
      fmt.list('Next Commands', status.nextCommands);
    }
  }
}

module.exports = {
  parseGitHubRepoFromOrigin,
  normalizeBranchName,
  buildCompareUrl
};

if (require.main === module) {
  runCli().catch((error) => {
    // Keep output stable for automation.
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
