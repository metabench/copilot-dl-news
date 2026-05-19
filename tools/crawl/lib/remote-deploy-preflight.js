'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const DEPLOY_SCRIPT = path.join(__dirname, '..', 'deploy-remote-server.js');
const REMOTE_START_COMMANDS = new Set(['launch', 'bounded', 'run', 'collect', 'start']);

function shouldPreflightRemoteArgs(args = []) {
  const command = Array.isArray(args) ? args.find((arg) => typeof arg === 'string' && !arg.startsWith('--')) : null;
  return REMOTE_START_COMMANDS.has(command || '');
}

function normalizeDeployMode(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  if (['auto', 'never', 'always'].includes(normalized)) return normalized;
  return 'auto';
}

function buildDeployPreflightArgs(options = {}) {
  const mode = normalizeDeployMode(options.mode);
  if (mode === 'never') return null;

  const args = mode === 'always'
    ? ['--apply', '--force-build']
    : ['--if-needed', '--apply', '--quiet-if-current'];

  if (options.force) args.push('--force');
  if (options.json) args.push('--json');
  if (options.sshHost) args.push('--ssh-host', options.sshHost);
  if (options.sshUser) args.push('--ssh-user', options.sshUser);
  if (options.sshPort) args.push('--ssh-port', String(options.sshPort));
  if (options.sshKey) args.push('--ssh-key', options.sshKey);
  if (options.statusHost) args.push('--status-host', options.statusHost);
  if (options.statusPort) args.push('--status-port', String(options.statusPort));
  if (options.statusUrl) args.push('--status-url', options.statusUrl);
  if (options.remoteDir) args.push('--remote-dir', options.remoteDir);
  if (options.service) args.push('--service', options.service);
  if (options.skipBusyCheck) args.push('--skip-busy-check');
  if (options.skipHealthCheck) args.push('--skip-health-check');
  if (options.skipDbBuild) args.push('--skip-db-build');

  return args;
}

function runRemoteDeployPreflight(options = {}) {
  const args = buildDeployPreflightArgs(options);
  if (!args) return { skipped: true, status: 0 };

  if (!options.json && options.out) {
    options.out.write('[run] checking remote crawler server build freshness\n');
  }

  const result = spawnSync(process.execPath, [DEPLOY_SCRIPT, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const out = options.json ? (options.err || process.stderr) : (options.out || process.stderr);
  const err = options.err || process.stderr;
  if (stdout) out.write(stdout);
  if (stderr) err.write(stderr);

  if (result.error) {
    return { skipped: false, status: 1, error: result.error, args };
  }

  return {
    skipped: false,
    status: Number.isInteger(result.status) ? result.status : 1,
    args,
    stdout,
    stderr,
  };
}

module.exports = {
  DEPLOY_SCRIPT,
  REMOTE_START_COMMANDS,
  buildDeployPreflightArgs,
  normalizeDeployMode,
  runRemoteDeployPreflight,
  shouldPreflightRemoteArgs,
};
