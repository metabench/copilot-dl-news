#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { getFleetHostSync } = require('./lib/fleet-host-resolver');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SSH_HOST = process.env.REMOTE_CRAWLER_SSH_HOST || `ubuntu@${getFleetHostSync()}`;
const DEFAULT_SERVICE = 'crawl-server-v4';
const DEFAULT_REMOTE_DIR = '~/apps/remote-crawler-v2';
const DEFAULT_REMOTE_TARBALL = '/tmp/remote-crawler-v2-deploy.tar.gz';
const DEFAULT_CONFIG = 'deploy/remote-crawler-v2/crawl-domains.news-10x1000.json';
const DEFAULT_DB_MODULE_DIR = path.resolve(ROOT, '..', 'news-crawler-db');
const DEFAULT_BUILD_DIR = path.join(ROOT, 'tmp', 'remote-crawler-v2-deploy');
const DEFAULT_REMOTE_DB = 'data/news.db';

const DEPLOY_DEPENDENCIES = Object.freeze([
  'express',
  'better-sqlite3',
  'drizzle-orm',
  'dotenv',
  'pg',
  'postgres',
  'lang-tools',
]);

const COLORS = Object.freeze({
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
});

class BusyRemoteServerError extends Error {
  constructor(message, busy) {
    super(message);
    this.name = 'BusyRemoteServerError';
    this.busy = busy;
    this.exitCode = 2;
  }
}

function parseArgv(argv = []) {
  const opts = {
    apply: false,
    buildOnly: false,
    force: false,
    forceBuild: false,
    ifNeeded: false,
    json: false,
    noColor: false,
    noEmoji: false,
    quietIfCurrent: false,
    skipBusyCheck: false,
    skipDbBuild: false,
    skipHealthCheck: false,
    help: false,
    sshHost: DEFAULT_SSH_HOST,
    sshUser: process.env.REMOTE_CRAWLER_SSH_USER || null,
    sshPort: parsePositiveInteger(process.env.REMOTE_CRAWLER_SSH_PORT, 22),
    sshKey: process.env.REMOTE_CRAWLER_SSH_KEY || null,
    statusHost: getFleetHostSync(),
    statusPort: 3200,
    statusUrl: null,
    remoteDir: DEFAULT_REMOTE_DIR,
    remoteTarball: DEFAULT_REMOTE_TARBALL,
    service: DEFAULT_SERVICE,
    config: DEFAULT_CONFIG,
    remoteDb: DEFAULT_REMOTE_DB,
    idleTimeout: 0,
    buildDir: DEFAULT_BUILD_DIR,
    dbModuleDir: DEFAULT_DB_MODULE_DIR,
    healthTimeoutMs: 60000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const flag = eq === -1 ? raw : raw.slice(0, eq);
    const inline = eq === -1 ? undefined : raw.slice(eq + 1);
    const nextValue = () => {
      if (inline !== undefined) return inline;
      if (index + 1 >= argv.length) throw new Error(`Missing value for ${flag}`);
      index += 1;
      return argv[index];
    };

    if (flag === '--apply') opts.apply = true;
    else if (flag === '--build-only') opts.buildOnly = true;
    else if (flag === '--force') opts.force = true;
    else if (flag === '--force-build') opts.forceBuild = true;
    else if (flag === '--if-needed') opts.ifNeeded = true;
    else if (flag === '--json') opts.json = true;
    else if (flag === '--no-color') opts.noColor = true;
    else if (flag === '--no-emoji') opts.noEmoji = true;
    else if (flag === '--quiet-if-current') opts.quietIfCurrent = true;
    else if (flag === '--skip-busy-check') opts.skipBusyCheck = true;
    else if (flag === '--skip-db-build') opts.skipDbBuild = true;
    else if (flag === '--skip-health-check') opts.skipHealthCheck = true;
    else if (flag === '--ssh-host' || flag === '--host') opts.sshHost = nextValue();
    else if (flag === '--ssh-user' || flag === '--user') opts.sshUser = nextValue();
    else if (flag === '--ssh-port') opts.sshPort = parsePositiveInteger(nextValue(), 22);
    else if (flag === '--ssh-key' || flag === '--key') opts.sshKey = nextValue();
    else if (flag === '--status-host') opts.statusHost = nextValue();
    else if (flag === '--status-port') opts.statusPort = parsePositiveInteger(nextValue(), 3200);
    else if (flag === '--status-url') opts.statusUrl = nextValue();
    else if (flag === '--remote-dir') opts.remoteDir = nextValue();
    else if (flag === '--remote-tarball') opts.remoteTarball = nextValue();
    else if (flag === '--service') opts.service = nextValue();
    else if (flag === '--config') opts.config = nextValue();
    else if (flag === '--remote-db') opts.remoteDb = nextValue();
    else if (flag === '--idle-timeout') opts.idleTimeout = parseNonNegativeInteger(nextValue(), 0);
    else if (flag === '--build-dir') opts.buildDir = path.resolve(nextValue());
    else if (flag === '--db-module-dir') opts.dbModuleDir = path.resolve(nextValue());
    else if (flag === '--health-timeout-ms') opts.healthTimeoutMs = parsePositiveInteger(nextValue(), 60000);
    else if (flag === '--help' || flag === '-h') opts.help = true;
    else throw new Error(`Unknown option: ${raw}`);
  }

  const target = splitSshTarget(opts.sshHost);
  opts.sshHost = target.host;
  if (!opts.sshUser && target.user) opts.sshUser = target.user;
  opts.statusUrl = opts.statusUrl || `http://${opts.statusHost}:${opts.statusPort}/api/status`;
  return opts;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function splitSshTarget(value) {
  const text = String(value || '').trim();
  const at = text.includes('@') ? text.lastIndexOf('@') : -1;
  if (at > 0) return { user: text.slice(0, at), host: text.slice(at + 1) };
  return { user: null, host: text };
}

function sshTarget(opts) {
  return opts.sshUser ? `${opts.sshUser}@${opts.sshHost}` : opts.sshHost;
}

function sshArgs(opts) {
  const args = ['-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new', '-p', String(opts.sshPort)];
  if (opts.sshKey) args.push('-i', opts.sshKey);
  return args;
}

function scpArgs(opts) {
  const args = ['-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new', '-P', String(opts.sshPort)];
  if (opts.sshKey) args.push('-i', opts.sshKey);
  return args;
}

function icon(name, opts) {
  if (opts.noEmoji) return '';
  const icons = {
    ok: '✅ ',
    warn: '⚠️  ',
    stop: '🛑 ',
    build: '📦 ',
    deploy: '🚀 ',
    remote: '🛰️  ',
    check: '🔎 ',
    busy: '⏳ ',
    info: 'ℹ️  ',
  };
  return icons[name] || '';
}

function color(text, name, opts) {
  if (opts.noColor || process.env.NO_COLOR) return text;
  return `${COLORS[name] || ''}${text}${COLORS.reset}`;
}

function printHelp() {
  console.log(`Remote Crawler Server Deploy

Build and deploy the remote crawler v2 server package, preserving remote data.

Usage:
  node tools/crawl/deploy-remote-server.js [--apply] [--force]
  npm run crawl -- remote-deploy [--apply] [--force]

Safety:
  Default mode is dry-run. Pass --apply to build, upload, stop, overwrite, and restart.
  If /api/status shows active crawl work, deployment is refused unless --force is supplied.

Options:
  --apply                     Execute the deployment (default: dry-run)
  --build-only                Build the tarball locally without uploading
  --if-needed                 Build only if local inputs changed; deploy only if remote build is older/missing
  --force                     Allow stopping/overwriting a busy remote server
  --force-build               Rebuild local package even if the local build manifest is current
  --quiet-if-current          Print nothing when --if-needed finds remote current
  --ssh-host, --host <host>   SSH target host or user@host (default: ${DEFAULT_SSH_HOST})
  --ssh-user, --user <user>   SSH user, if not included in --ssh-host
  --ssh-port <n>              SSH port (default: 22)
  --ssh-key <path>            SSH private key
  --status-url <url>          Busy-check URL (default: http://<fleet-host>:3200/api/status)
  --status-host <host>        Host for default status URL
  --status-port <n>           Port for default status URL (default: 3200)
  --remote-dir <path>         Remote app dir (default: ${DEFAULT_REMOTE_DIR})
  --service <name>            PM2 service name (default: ${DEFAULT_SERVICE})
  --config <path>             Server config path inside remote dir (default: ${DEFAULT_CONFIG})
  --remote-db <path>          Server DB path inside remote dir (default: ${DEFAULT_REMOTE_DB})
  --db-module-dir <path>      Local news-crawler-db repo (default: ../news-crawler-db)
  --skip-db-build             Do not run npm run build in news-crawler-db
  --skip-busy-check           Do not query /api/status before deploy
  --skip-health-check         Do not poll /api/status after restart
  --json                     Emit JSON plan/result
  --no-color --no-emoji       Plain output
`);
}

function classifyBusyStatus(status) {
  if (!status || typeof status !== 'object') {
    return { busy: false, reasons: ['status unavailable'], runningDomains: [], pending: 0 };
  }

  const domains = Array.isArray(status.domains) ? status.domains : [];
  const runningDomains = domains
    .filter((domain) => domain && (domain.isRunning || String(domain.state || '').toLowerCase() === 'running'))
    .map((domain) => domain.domain || domain.host || 'unknown');
  const orchestratorRunning = Boolean(status.orchestrator && status.orchestrator.running);
  const currentlyRunning = Number(status.orchestrator && status.orchestrator.currentlyRunning || 0);
  const pending = Number(status.totals && status.totals.pending || 0);
  const throughput = status.throughput || {};
  const activeThroughput = Number(throughput.fetchesPerSec || 0) > 0 || Number(throughput.writesPerSec || 0) > 0;
  const reasons = [];

  if (orchestratorRunning) reasons.push('orchestrator is running');
  if (currentlyRunning > 0) reasons.push(`${currentlyRunning} domain worker(s) currently running`);
  if (runningDomains.length > 0) reasons.push(`running domains: ${runningDomains.join(', ')}`);
  if (pending > 0) reasons.push(`${pending} pending URL(s)`);
  if (activeThroughput) reasons.push(`active throughput: fetch=${throughput.fetchesPerSec || 0}/s write=${throughput.writesPerSec || 0}/s`);

  return {
    busy: reasons.length > 0,
    reasons,
    runningDomains,
    pending,
    currentlyRunning,
    orchestratorRunning,
    activeThroughput,
  };
}

function forceSuggestion(argv = process.argv.slice(2)) {
  const withoutDryRun = argv.filter((arg) => arg !== '--force');
  if (!withoutDryRun.includes('--apply')) withoutDryRun.push('--apply');
  withoutDryRun.push('--force');
  return `node tools/crawl/deploy-remote-server.js ${withoutDryRun.join(' ')}`.trim();
}

function summarizePlan(opts, statusSummary) {
  return {
    mode: opts.ifNeeded ? 'if-needed' : opts.apply ? 'apply' : opts.buildOnly ? 'build-only' : 'dry-run',
    force: opts.force,
    forceBuild: opts.forceBuild,
    sshTarget: sshTarget(opts),
    statusUrl: opts.statusUrl,
    remoteDir: opts.remoteDir,
    service: opts.service,
    config: opts.config,
    remoteDb: opts.remoteDb,
    buildDir: opts.buildDir,
    dbModuleDir: opts.dbModuleDir,
    busy: statusSummary || null,
    packageShape: [
      'deploy/remote-crawler-v2/**',
      'src/db/openNewsCrawlerDb.js',
      'vendor/news-crawler-db/dist/db/**',
      'package.json with production runtime dependencies',
    ],
  };
}

function toIsoFromMs(ms) {
  return new Date(ms).toISOString();
}

function formatBuildId(date = new Date()) {
  return date.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
}

function shouldSkipSourcePath(entryPath, stat) {
  const base = path.basename(entryPath);
  if (base === '.git' || base === 'node_modules' || base === 'tmp') return true;
  if (stat.isDirectory() && (base === '__tests__' || base === 'tests' || base === 'test')) return true;
  if (stat.isDirectory() && base === 'data') return true;
  if (stat.isDirectory() && base === 'dist') return true;
  if (stat.isFile() && /\.(test|spec)\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (base === 'build-info.json') return true;
  return false;
}

function walkSourceFiles(entryPath, out = []) {
  let stat;
  try {
    stat = fs.statSync(entryPath);
  } catch (_) {
    return out;
  }
  if (shouldSkipSourcePath(entryPath, stat)) return out;
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entryPath)) {
      walkSourceFiles(path.join(entryPath, name), out);
    }
    return out;
  }
  if (stat.isFile()) out.push({ path: entryPath, mtimeMs: stat.mtimeMs });
  return out;
}

function collectSourceSnapshot(opts) {
  const roots = [
    path.join(ROOT, 'deploy', 'remote-crawler-v2'),
    path.join(ROOT, 'src', 'db', 'openNewsCrawlerDb.js'),
    path.join(opts.dbModuleDir, 'src'),
    path.join(opts.dbModuleDir, 'package.json'),
    path.join(opts.dbModuleDir, 'tsconfig.json'),
  ];
  const files = [];
  for (const root of roots) walkSourceFiles(root, files);
  let latest = { path: null, mtimeMs: 0 };
  for (const file of files) {
    if (file.mtimeMs > latest.mtimeMs) latest = file;
  }
  return {
    fileCount: files.length,
    latestMtimeMs: latest.mtimeMs,
    latestMtime: latest.mtimeMs ? toIsoFromMs(latest.mtimeMs) : null,
    latestPath: latest.path ? path.relative(ROOT, latest.path).replace(/\\/g, '/') : null,
  };
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function getLocalBuildState(opts) {
  const source = collectSourceSnapshot(opts);
  const manifestPath = path.join(opts.buildDir, 'build-manifest.json');
  const tarball = path.join(opts.buildDir, 'remote-crawler-v2-deploy.tar.gz');
  const manifest = readJsonFile(manifestPath);
  const tarballExists = fs.existsSync(tarball);
  const builtAtMs = Number(manifest?.builtAtMs || 0);
  const current = Boolean(
    manifest &&
    tarballExists &&
    manifest.schemaVersion === 1 &&
    builtAtMs >= source.latestMtimeMs &&
    Number(manifest.source?.fileCount || 0) === source.fileCount
  );

  return {
    current,
    manifest,
    manifestPath,
    tarball,
    tarballExists,
    source,
    staleReasons: [
      !manifest ? 'missing build manifest' : null,
      !tarballExists ? 'missing deploy tarball' : null,
      manifest && manifest.schemaVersion !== 1 ? 'build manifest schema changed' : null,
      manifest && builtAtMs < source.latestMtimeMs ? `source newer than local build: ${source.latestPath}` : null,
      manifest && Number(manifest.source?.fileCount || 0) !== source.fileCount ? 'source file count changed' : null,
    ].filter(Boolean),
  };
}

function remoteBuildInfoFromStatus(status) {
  const build = status && typeof status === 'object' ? status.build : null;
  if (!build || typeof build !== 'object') return null;
  const builtAtMs = Number(build.builtAtMs || Date.parse(build.builtAt || build.createdAt || ''));
  if (!Number.isFinite(builtAtMs) || builtAtMs <= 0) return null;
  return {
    ...build,
    builtAtMs,
  };
}

function compareRemoteBuild({ localManifest, remoteStatus }) {
  const remoteBuild = remoteBuildInfoFromStatus(remoteStatus);
  const localBuiltAtMs = Number(localManifest?.builtAtMs || 0);
  if (!localManifest || !localBuiltAtMs) {
    return { deployNeeded: true, reason: 'local build metadata missing', remoteBuild };
  }
  if (!remoteBuild) {
    return { deployNeeded: true, reason: 'remote build metadata missing', remoteBuild };
  }
  if (remoteBuild.builtAtMs < localBuiltAtMs) {
    return {
      deployNeeded: true,
      reason: `remote build ${remoteBuild.builtAt || remoteBuild.buildId || remoteBuild.builtAtMs} is older than local build ${localManifest.builtAt}`,
      remoteBuild,
    };
  }
  return {
    deployNeeded: false,
    reason: `remote build ${remoteBuild.builtAt || remoteBuild.buildId || remoteBuild.builtAtMs} is current`,
    remoteBuild,
  };
}

async function readJsonUrl(url, timeoutMs = 10000) {
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(parsed, { method: 'GET', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs}ms: ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

function readPackageJson(packageDir) {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

function dependencyVersions(rootDir, dbModuleDir) {
  const rootPackage = readPackageJson(rootDir);
  const dbPackage = readPackageJson(dbModuleDir);
  const sources = [rootPackage.dependencies || {}, dbPackage.dependencies || {}];
  const out = {};

  for (const name of DEPLOY_DEPENDENCIES) {
    const found = sources.find((deps) => deps[name]);
    if (!found) throw new Error(`Unable to resolve deployment dependency version: ${name}`);
    out[name] = found[name];
  }

  out['news-crawler-db'] = 'file:vendor/news-crawler-db';
  return out;
}

function copyFiltered(src, dest, shouldSkip = () => false) {
  const stat = fs.statSync(src);
  if (shouldSkip(src, stat)) return;

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyFiltered(path.join(src, name), path.join(dest, name), shouldSkip);
    }
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = options.capture && result.stderr ? `\n${result.stderr.trim()}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${stderr}`);
  }
  return result;
}

function buildDeployPackage(opts, buildOptions = {}) {
  const stageDir = path.join(opts.buildDir, 'stage');
  const tarball = path.join(opts.buildDir, 'remote-crawler-v2-deploy.tar.gz');
  const dbDist = path.join(opts.dbModuleDir, 'dist', 'db');
  const buildDate = buildOptions.buildDate || new Date();
  const source = buildOptions.source || collectSourceSnapshot(opts);
  const buildInfo = {
    schemaVersion: 1,
    buildId: formatBuildId(buildDate),
    builtAt: buildDate.toISOString(),
    builtAtMs: buildDate.getTime(),
    source,
  };

  if (!opts.skipDbBuild) {
    runCommand('npm', ['run', 'build'], { cwd: opts.dbModuleDir });
  }
  if (!fs.existsSync(dbDist)) {
    throw new Error(`news-crawler-db dist/db not found: ${dbDist}. Run npm run build in ${opts.dbModuleDir}.`);
  }

  fs.rmSync(opts.buildDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  copyFiltered(
    path.join(ROOT, 'deploy', 'remote-crawler-v2'),
    path.join(stageDir, 'deploy', 'remote-crawler-v2'),
    (entryPath, stat) => stat.isDirectory() && path.basename(entryPath) === 'data'
  );
  copyFiltered(path.join(ROOT, 'src', 'db', 'openNewsCrawlerDb.js'), path.join(stageDir, 'src', 'db', 'openNewsCrawlerDb.js'));
  copyFiltered(dbDist, path.join(stageDir, 'vendor', 'news-crawler-db', 'dist', 'db'));

  const dbPackage = readPackageJson(opts.dbModuleDir);
  fs.writeFileSync(
    path.join(stageDir, 'vendor', 'news-crawler-db', 'package.json'),
    JSON.stringify({
      name: dbPackage.name || 'news-crawler-db',
      version: dbPackage.version || '0.0.0-local',
      main: 'dist/db/index.js',
      private: true,
    }, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(stageDir, 'deploy', 'remote-crawler-v2', 'build-info.json'),
    JSON.stringify(buildInfo, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(stageDir, 'package.json'),
    JSON.stringify({
      name: 'remote-crawler-v2-deploy',
      version: buildInfo.buildId,
      private: true,
      description: 'Generated deployment package for remote crawler v2',
      main: 'deploy/remote-crawler-v2/multi-domain-server.js',
      scripts: {
        start: `node deploy/remote-crawler-v2/multi-domain-server.js --config ${opts.config} --port ${opts.statusPort} --db ${opts.remoteDb} --idle-timeout ${opts.idleTimeout}`,
      },
      dependencies: dependencyVersions(ROOT, opts.dbModuleDir),
    }, null, 2),
    'utf8'
  );

  runCommand('node', ['--check', path.join(stageDir, 'deploy', 'remote-crawler-v2', 'multi-domain-server.js')]);
  runCommand('node', ['--check', path.join(stageDir, 'deploy', 'remote-crawler-v2', 'lib', 'run-worker.js')]);
  runCommand('tar', ['-czf', tarball, '-C', stageDir, '.']);
  fs.writeFileSync(
    path.join(opts.buildDir, 'build-manifest.json'),
    JSON.stringify(buildInfo, null, 2),
    'utf8'
  );

  return {
    stageDir,
    tarball,
    bytes: fs.statSync(tarball).size,
    buildInfo,
  };
}

function ensureLocalDeployPackage(opts) {
  const state = getLocalBuildState(opts);
  if (state.current && !opts.forceBuild) {
    return {
      stageDir: path.join(opts.buildDir, 'stage'),
      tarball: state.tarball,
      bytes: fs.statSync(state.tarball).size,
      buildInfo: state.manifest,
      reused: true,
      localState: state,
    };
  }
  const buildResult = buildDeployPackage(opts, { source: state.source });
  return {
    ...buildResult,
    reused: false,
    localState: getLocalBuildState(opts),
    staleReasons: state.staleReasons,
  };
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function createRemoteInstallScript(opts) {
  return `set -euo pipefail
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

REMOTE_DIR=${shQuote(opts.remoteDir)}
REMOTE_TARBALL=${shQuote(opts.remoteTarball)}
SERVICE=${shQuote(opts.service)}
APP_ENTRY="deploy/remote-crawler-v2/multi-domain-server.js"
CONFIG=${shQuote(opts.config)}
REMOTE_DB=${shQuote(opts.remoteDb)}
SERVER_PORT=${shQuote(String(opts.statusPort))}
IDLE_TIMEOUT=${shQuote(String(opts.idleTimeout))}

echo "remote: node $(node -v), npm $(npm -v)"
echo "remote: app dir $REMOTE_DIR"
mkdir -p "$REMOTE_DIR/data"
cd "$REMOTE_DIR"

echo "remote: stopping PM2 service $SERVICE"
pm2 stop "$SERVICE" >/dev/null 2>&1 || true
pm2 delete "$SERVICE" >/dev/null 2>&1 || true

echo "remote: replacing application code while preserving data/"
rm -rf deploy src vendor lib multi-domain-server.js crawl-domains.*.json package.json package-lock.json node_modules/news-crawler-db
tar -xzf "$REMOTE_TARBALL" -C "$REMOTE_DIR"

echo "remote: installing production dependencies"
npm install --omit=dev --no-audit

echo "remote: starting $SERVICE from $APP_ENTRY"
pm2 start "$APP_ENTRY" --name "$SERVICE" -- --config "$CONFIG" --port "$SERVER_PORT" --db "$REMOTE_DB" --idle-timeout "$IDLE_TIMEOUT"
pm2 save >/dev/null 2>&1 || true
pm2 show "$SERVICE" | sed -n '1,80p' || true
`;
}

function deployPackage(opts, buildResult) {
  const target = sshTarget(opts);
  runCommand('scp', [...scpArgs(opts), buildResult.tarball, `${target}:${opts.remoteTarball}`]);
  runCommand('ssh', [...sshArgs(opts), target, createRemoteInstallScript(opts)]);
}

function checkSshAccess(opts) {
  const target = sshTarget(opts);
  const result = spawnSync('ssh', [...sshArgs(opts), '-o', 'BatchMode=yes', target, 'true'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `ssh exited with code ${result.status}`).trim();
    throw new Error(
      `SSH access check failed for ${target}: ${detail}\n` +
      'Configure SSH auth with --ssh-key, REMOTE_CRAWLER_SSH_KEY, ssh-agent, or ~/.ssh before running the auto deploy.'
    );
  }
}

async function waitForHealthyStatus(opts) {
  const deadline = Date.now() + opts.healthTimeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const status = await readJsonUrl(opts.statusUrl, 5000);
      return status;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  throw new Error(`Remote status did not become readable at ${opts.statusUrl}: ${lastError ? lastError.message : 'timeout'}`);
}

function printPlan(opts, statusSummary, buildResult) {
  console.log(color('Remote crawler server deploy', 'bold', opts));
  console.log(`${icon('remote', opts)}SSH target: ${sshTarget(opts)}:${opts.remoteDir}`);
  console.log(`${icon('check', opts)}Status URL: ${opts.statusUrl}`);
  console.log(`${icon('build', opts)}Package: remote crawler v2 + DB adapter build + production package.json`);
  console.log(`${icon('deploy', opts)}PM2 service: ${opts.service}`);
  console.log(`   Config: ${opts.config}`);
  console.log(`   DB: ${opts.remoteDb}`);
  if (statusSummary) {
    const label = statusSummary.busy ? color('busy', 'yellow', opts) : color('idle', 'green', opts);
    console.log(`${statusSummary.busy ? icon('busy', opts) : icon('ok', opts)}Remote status: ${label}`);
    if (statusSummary.reasons.length > 0) {
      for (const reason of statusSummary.reasons) console.log(`   - ${reason}`);
    }
  }
  if (buildResult) {
    const verb = buildResult.reused ? 'Using current local build' : 'Built';
    console.log(`${icon('build', opts)}${verb}: ${path.relative(ROOT, buildResult.tarball)} (${Math.round(buildResult.bytes / 1024)} KiB)`);
    if (buildResult.buildInfo) {
      console.log(`   Build: ${buildResult.buildInfo.buildId} at ${buildResult.buildInfo.builtAt}`);
    }
  }
  if (!opts.apply && !opts.buildOnly) {
    console.log(color('Dry run only. Add --apply to build, upload, stop, overwrite, and restart.', 'dim', opts));
  }
}

async function run(argv = process.argv.slice(2)) {
  const opts = parseArgv(argv);
  if (opts.help) {
    printHelp();
    return 0;
  }

  let remoteStatus = null;
  let busy = null;
  if (!opts.skipBusyCheck) {
    try {
      remoteStatus = await readJsonUrl(opts.statusUrl, 10000);
      busy = classifyBusyStatus(remoteStatus);
    } catch (error) {
      busy = { busy: false, reasons: [`status check unavailable: ${error.message}`], runningDomains: [], pending: 0 };
    }
  }

  const plan = summarizePlan(opts, busy);
  if (opts.json && !opts.apply && !opts.buildOnly && !opts.ifNeeded) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  if (!opts.ifNeeded && busy && busy.busy && !opts.force) {
    if (!opts.json) printPlan(opts, busy, null);
    const suggestion = forceSuggestion(argv);
    console.error(`${icon('stop', opts)}${color('Remote crawler is busy; not stopping or overwriting it.', 'red', opts)}`);
    console.error(`${icon('info', opts)}Rerun with force only if you intend to interrupt active work:`);
    console.error(`   ${suggestion}`);
    throw new BusyRemoteServerError('Remote crawler is busy', busy);
  }

  if (!opts.apply && !opts.buildOnly && !opts.ifNeeded) {
    if (!opts.json) printPlan(opts, busy, null);
    return 0;
  }

  const quietCurrentProbe = opts.ifNeeded && opts.quietIfCurrent && !opts.json;
  if (!opts.json && !quietCurrentProbe) printPlan(opts, busy, null);
  const buildResult = opts.ifNeeded ? ensureLocalDeployPackage(opts) : buildDeployPackage(opts);
  if (!opts.json && !quietCurrentProbe) printPlan(opts, busy, buildResult);

  if (opts.buildOnly) {
    if (opts.json) console.log(JSON.stringify({ ...plan, build: buildResult }, null, 2));
    return 0;
  }

  let comparison = null;
  if (opts.ifNeeded) {
    comparison = compareRemoteBuild({ localManifest: buildResult.buildInfo, remoteStatus });
    if (!comparison.deployNeeded) {
      const result = { ...plan, build: buildResult, remoteBuild: comparison.remoteBuild, decision: 'current', reason: comparison.reason };
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (!opts.quietIfCurrent) {
        console.log(`${icon('ok', opts)}${color('Remote crawler build is current.', 'green', opts)}`);
        console.log(`   ${comparison.reason}`);
      }
      return 0;
    }
    if (!opts.json) {
      if (quietCurrentProbe) printPlan(opts, busy, buildResult);
      console.log(`${icon('deploy', opts)}Deploy needed: ${comparison.reason}`);
    }
  }

  if (!opts.apply) {
    const result = {
      ...plan,
      build: buildResult,
      remoteBuild: comparison?.remoteBuild || null,
      decision: comparison?.deployNeeded ? 'would-deploy' : 'built',
      reason: comparison?.reason || 'local build prepared',
    };
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    }
    return 0;
  }

  if (busy && busy.busy && !opts.force) {
    const suggestion = forceSuggestion(argv);
    console.error(`${icon('stop', opts)}${color('Remote crawler is busy; not stopping or overwriting it.', 'red', opts)}`);
    console.error(`${icon('info', opts)}Rerun with force only if you intend to interrupt active work:`);
    console.error(`   ${suggestion}`);
    throw new BusyRemoteServerError('Remote crawler is busy', busy);
  }

  checkSshAccess(opts);
  deployPackage(opts, buildResult);

  let finalStatus = null;
  if (!opts.skipHealthCheck) {
    finalStatus = await waitForHealthyStatus(opts);
  }

  if (opts.json) {
    console.log(JSON.stringify({ ...plan, build: buildResult, remoteBuild: comparison?.remoteBuild || null, decision: 'deployed', finalStatus }, null, 2));
  } else {
    console.log(`${icon('ok', opts)}${color('Remote crawler deploy complete.', 'green', opts)}`);
    if (finalStatus) {
      console.log(`   Service: ${finalStatus.service || 'unknown'} ${finalStatus.version || ''}`);
      console.log(`   Running domains: ${finalStatus.orchestrator?.currentlyRunning || 0}`);
      console.log(`   Pending URLs: ${finalStatus.totals?.pending || 0}`);
    }
  }

  return 0;
}

if (require.main === module) {
  run().then((code) => {
    if (code) process.exit(code);
  }).catch((error) => {
    console.error(error.message || error);
    process.exit(error.exitCode || 1);
  });
}

module.exports = {
  BusyRemoteServerError,
  DEPLOY_DEPENDENCIES,
  buildDeployPackage,
  collectSourceSnapshot,
  classifyBusyStatus,
  compareRemoteBuild,
  createRemoteInstallScript,
  dependencyVersions,
  ensureLocalDeployPackage,
  forceSuggestion,
  formatBuildId,
  getLocalBuildState,
  parseArgv,
  remoteBuildInfoFromStatus,
  shQuote,
  splitSshTarget,
  summarizePlan,
};
