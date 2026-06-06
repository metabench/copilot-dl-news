'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  BusyRemoteServerError,
  buildDeployPreflightProof,
  buildDeployTroubleshootingHints,
  classifyBusyStatus,
  compareRemoteBuild,
  createRemoteInstallScript,
  dependencyVersions,
  forceSuggestion,
  getLocalBuildState,
  parseArgv,
  remotePathAssignment,
  remoteBuildInfoFromStatus,
  shQuote,
  splitSshTarget,
  summarizePlan,
} = require('../../tools/crawl/deploy-remote-server');

describe('remote crawler deploy cli helpers', () => {
  const scriptPath = path.resolve(__dirname, '../../tools/crawl/deploy-remote-server.js');

  test('detects active remote crawl work as busy', () => {
    const status = {
      orchestrator: { running: true, currentlyRunning: 1 },
      totals: { pending: 12 },
      throughput: { fetchesPerSec: 2.5, writesPerSec: 1 },
      domains: [
        { domain: 'bbc.com', state: 'running', isRunning: true },
        { domain: 'reuters.com', state: 'idle', isRunning: false },
      ],
    };

    const busy = classifyBusyStatus(status);

    expect(busy.busy).toBe(true);
    expect(busy.runningDomains).toEqual(['bbc.com']);
    expect(busy.reasons).toEqual(expect.arrayContaining([
      'orchestrator is running',
      '1 domain worker(s) currently running',
      'running domains: bbc.com',
      '12 pending URL(s)',
      'active throughput: fetch=2.5/s write=1/s',
    ]));
  });

  test('treats idle zero-pending status as safe to deploy', () => {
    const busy = classifyBusyStatus({
      orchestrator: { running: false, currentlyRunning: 0 },
      totals: { pending: 0 },
      throughput: { fetchesPerSec: 0, writesPerSec: 0 },
      domains: [{ domain: 'bbc.com', state: 'idle', isRunning: false }],
    });

    expect(busy).toMatchObject({
      busy: false,
      runningDomains: [],
      pending: 0,
      currentlyRunning: 0,
      orchestratorRunning: false,
      activeThroughput: false,
    });
  });

  test('parses ssh target, status url, force, and apply flags', () => {
    const opts = parseArgv([
      '--apply',
      '--force',
      '--ssh-host', 'ubuntu@example.com',
      '--ssh-port=2222',
      '--status-url', 'http://example.com:3200/api/status',
      '--remote-dir', '/srv/crawler',
      '--service', 'crawl-server-v4',
    ]);

    expect(opts.apply).toBe(true);
    expect(opts.force).toBe(true);
    expect(opts.sshUser).toBe('ubuntu');
    expect(opts.sshHost).toBe('example.com');
    expect(opts.sshPort).toBe(2222);
    expect(opts.statusUrl).toBe('http://example.com:3200/api/status');
    expect(opts.remoteDir).toBe('/srv/crawler');
  });

  test('parses if-needed and force-build flags', () => {
    const opts = parseArgv(['--if-needed', '--force-build', '--quiet-if-current']);
    expect(opts.ifNeeded).toBe(true);
    expect(opts.forceBuild).toBe(true);
    expect(opts.quietIfCurrent).toBe(true);
  });

  test('parses preflight-only without enabling build or apply', () => {
    const opts = parseArgv(['--preflight-only', '--json']);
    expect(opts.preflightOnly).toBe(true);
    expect(opts.apply).toBe(false);
    expect(opts.buildOnly).toBe(false);
  });

  test('parses deploy recovery override flags', () => {
    const opts = parseArgv([
      '--skip-busy-check',
      '--skip-health-check',
      '--health-timeout-ms',
      '2500',
    ]);

    expect(opts.skipBusyCheck).toBe(true);
    expect(opts.skipHealthCheck).toBe(true);
    expect(opts.healthTimeoutMs).toBe(2500);
  });

  test('summarizes custom remote target details for wrong-dir/service checks', () => {
    const opts = parseArgv([
      '--ssh-host', 'ubuntu@example.com',
      '--remote-dir', '/srv/crawler-test',
      '--service', 'crawl-server-v4-test',
      '--config', 'deploy/remote-crawler-v2/custom.json',
      '--remote-db', 'data/custom-news.db',
    ]);
    const plan = summarizePlan(opts, null);

    expect(plan.remoteDir).toBe('/srv/crawler-test');
    expect(plan.service).toBe('crawl-server-v4-test');
    expect(plan.config).toBe('deploy/remote-crawler-v2/custom.json');
    expect(plan.remoteDb).toBe('data/custom-news.db');
  });

  test('suggests adding apply and force without duplicating force', () => {
    expect(forceSuggestion(['--ssh-host', 'oracle-worker'])).toBe(
      'node tools/crawl/deploy-remote-server.js --ssh-host oracle-worker --apply --force'
    );
    expect(forceSuggestion(['--apply', '--force'])).toBe(
      'node tools/crawl/deploy-remote-server.js --apply --force'
    );
  });

  test('captures busy-server refusal metadata for recovery decisions', () => {
    const busy = classifyBusyStatus({
      orchestrator: { running: true, currentlyRunning: 1 },
      totals: { pending: 4 },
      domains: [{ domain: 'bbc.com', state: 'running' }],
    });
    const error = new BusyRemoteServerError('Remote crawler is busy', busy);

    expect(error.exitCode).toBe(2);
    expect(error.busy.reasons).toEqual(expect.arrayContaining([
      'orchestrator is running',
      'running domains: bbc.com',
      '4 pending URL(s)',
    ]));
  });

  test('quotes remote shell values safely', () => {
    expect(shQuote("a'b")).toBe("'a'\\''b'");
  });

  test('expands default home-relative remote dir safely in remote shell', () => {
    expect(remotePathAssignment('~/apps/remote-crawler-v2')).toBe('"$HOME/apps/remote-crawler-v2"');
    expect(remotePathAssignment('/srv/crawler')).toBe("'/srv/crawler'");
    expect(remotePathAssignment('~/apps/remote $dir')).toBe('"$HOME/apps/remote \\$dir"');

    const script = createRemoteInstallScript(parseArgv([]));
    expect(script).toContain('REMOTE_DIR="$HOME/apps/remote-crawler-v2"');
    expect(script).not.toContain("REMOTE_DIR='~/apps/remote-crawler-v2'");
  });

  test('remote install script preserves data and restarts pm2 from deployed entrypoint', () => {
    const script = createRemoteInstallScript({
      remoteDir: '/srv/crawler',
      remoteTarball: '/tmp/pkg.tgz',
      service: 'crawl-server-v4',
      config: 'deploy/remote-crawler-v2/crawl-domains.news-10x1000.json',
      remoteDb: 'data/news.db',
      statusPort: 3200,
      idleTimeout: 0,
    });

    expect(script).toContain('mkdir -p "$REMOTE_DIR/data"');
    expect(script).toContain('rm -rf deploy src vendor lib multi-domain-server.js crawl-domains.*.json package.json package-lock.json node_modules/news-crawler-db');
    expect(script).toContain('pm2 delete "$SERVICE"');
    expect(script).toContain('pm2 start "$APP_ENTRY" --name "$SERVICE"');
    expect(script).toContain('--db "$REMOTE_DB"');
    expect(script).toContain('build tooling missing; native dependencies such as better-sqlite3 may need build-essential make g++ python3');
  });

  test('summarizes generated package shape for dry-run/json callers', () => {
    const busy = {
      busy: true,
      reasons: ['orchestrator is running'],
      runningDomains: ['bbc.com'],
    };
    const opts = parseArgv(['--skip-busy-check', '--ssh-host', 'ubuntu@host']);
    const plan = summarizePlan(opts, busy);

    expect(plan.mode).toBe('dry-run');
    expect(plan.sshTarget).toBe('ubuntu@host');
    expect(plan.busy).toBe(busy);
    expect(plan.packageShape).toEqual(expect.arrayContaining([
      'deploy/remote-crawler-v2/**',
      'vendor/news-crawler-db/dist/db/**',
    ]));
  });

  test('compares local and remote build timestamps', () => {
    const localManifest = {
      buildId: '20260513010101',
      builtAt: '2026-05-13T01:01:01.000Z',
      builtAtMs: Date.parse('2026-05-13T01:01:01.000Z'),
    };

    expect(compareRemoteBuild({
      localManifest,
      remoteStatus: { build: { buildId: 'old', builtAt: '2026-05-13T00:00:00.000Z' } },
    })).toMatchObject({ deployNeeded: true });

    expect(compareRemoteBuild({
      localManifest,
      remoteStatus: { build: { buildId: 'new', builtAt: '2026-05-13T02:00:00.000Z' } },
    })).toMatchObject({ deployNeeded: false });

    expect(compareRemoteBuild({
      localManifest,
      remoteStatus: { service: 'crawl-server-v4' },
    })).toMatchObject({
      deployNeeded: true,
      reason: 'remote build metadata missing',
      remoteBuild: null,
    });
  });

  test('detects stale local deploy package metadata', () => {
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-deploy-state-'));
    try {
      fs.writeFileSync(path.join(buildDir, 'remote-crawler-v2-deploy.tar.gz'), 'x');
      fs.writeFileSync(path.join(buildDir, 'build-manifest.json'), JSON.stringify({
        schemaVersion: 1,
        buildId: 'stale',
        builtAt: '1970-01-01T00:00:00.000Z',
        builtAtMs: 1,
        source: { fileCount: 0 },
      }));

      const state = getLocalBuildState(parseArgv([
        '--build-dir', buildDir,
        '--db-module-dir', path.resolve(process.cwd(), '..', 'news-crawler-db'),
      ]));

      expect(state.current).toBe(false);
      expect(state.staleReasons.some(reason => reason.startsWith('source newer than local build:'))).toBe(true);
      expect(state.staleReasons).toContain('source file count changed');
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  test('builds deploy preflight proof without building or deploying', () => {
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-deploy-proof-'));
    try {
      const builtAt = '2026-05-27T00:00:00.000Z';
      fs.writeFileSync(path.join(buildDir, 'remote-crawler-v2-deploy.tar.gz'), 'x');
      fs.writeFileSync(path.join(buildDir, 'build-manifest.json'), JSON.stringify({
        schemaVersion: 1,
        buildId: 'proof',
        builtAt,
        builtAtMs: Date.parse(builtAt),
        source: { fileCount: 0 },
      }));
      const opts = parseArgv([
        '--preflight-only',
        '--build-dir', buildDir,
        '--db-module-dir', path.resolve(process.cwd(), '..', 'news-crawler-db'),
      ]);
      const proof = buildDeployPreflightProof(opts, {
        build: { buildId: 'remote-current', builtAt: '2026-05-27T01:00:00.000Z' },
      }, { busy: false, reasons: [], runningDomains: [], pending: 0 });

      expect(proof.mode).toBe('preflight-only');
      expect(Date.parse(proof.generatedAt)).not.toBeNaN();
      expect(proof.actionPolicy).toEqual({
        proofOnly: true,
        buildsLocalPackage: false,
        deploysRemote: false,
        stopsRemote: false,
      });
      expect(proof.readyForLiveSeedProof).toBe(false);
      expect(proof.decision).toBe('needs-local-build');
      expect(proof.operatorMessage).toContain('Local deploy package is missing or stale');
      expect(proof.localBuild.staleReasons).toEqual(expect.arrayContaining([
        'source file count changed',
      ]));
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  test('preflight proof blocks live seed when pending queue remains but no domains run', () => {
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-deploy-busy-proof-'));
    try {
      const builtAt = '2026-05-27T00:00:00.000Z';
      fs.writeFileSync(path.join(buildDir, 'remote-crawler-v2-deploy.tar.gz'), 'x');
      fs.writeFileSync(path.join(buildDir, 'build-manifest.json'), JSON.stringify({
        schemaVersion: 1,
        buildId: 'proof',
        builtAt,
        builtAtMs: Date.parse(builtAt),
        source: { fileCount: 0 },
      }));
      const opts = parseArgv([
        '--preflight-only',
        '--build-dir', buildDir,
        '--db-module-dir', path.resolve(process.cwd(), '..', 'news-crawler-db'),
      ]);
      const proof = buildDeployPreflightProof(opts, {
        build: { buildId: 'remote-current', builtAt: '2026-05-27T01:00:00.000Z' },
        orchestrator: { running: false, currentlyRunning: 0 },
        totals: { pending: 1273 },
        domains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false }],
      }, {
        busy: true,
        reasons: ['1273 pending URL(s)'],
        runningDomains: [],
        pending: 1273,
        currentlyRunning: 0,
        orchestratorRunning: false,
        activeThroughput: false,
      });

      expect(proof.decision).toBe('blocked-busy');
      expect(proof.readyForLiveSeedProof).toBe(false);
      expect(proof.operatorMessage).toContain('retained pending work');
      expect(proof.busy).toMatchObject({
        busy: true,
        pending: 1273,
        runningDomains: [],
      });
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  test('preflight-only CLI emits build proof without running package build', () => {
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-deploy-cli-proof-'));
    try {
      const result = spawnSync(process.execPath, [
        scriptPath,
        '--preflight-only',
        '--json',
        '--skip-busy-check',
        '--build-dir',
        buildDir,
        '--db-module-dir',
        path.resolve(process.cwd(), '..', 'news-crawler-db'),
      ], {
        encoding: 'utf8',
        timeout: 30000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const proof = JSON.parse(result.stdout);
      expect(proof.mode).toBe('preflight-only');
      expect(proof.actionPolicy.buildsLocalPackage).toBe(false);
      expect(proof.actionPolicy.deploysRemote).toBe(false);
      expect(proof.decision).toBe('needs-local-build');
      expect(result.stdout).not.toContain('news-crawler-db@');
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  test('builds deploy troubleshooting hints for failed health and stale targets', () => {
    const opts = parseArgv([
      '--force',
      '--remote-dir', '/srv/crawler-test',
      '--service', 'crawl-server-v4-test',
    ]);
    const hints = buildDeployTroubleshootingHints({
      opts,
      phase: 'post-deploy-health',
      error: new Error('Remote status did not become readable at http://example.com:3200/api/status'),
      busy: { busy: true, reasons: ['running domains: bbc.com'] },
      comparison: { deployNeeded: true, reason: 'remote build metadata missing' },
      localState: { staleReasons: ['missing deploy tarball'] },
    });

    expect(hints).toEqual(expect.arrayContaining([
      'Check /api/health and /api/status before any seed or deploy retry.',
      'Remote status indicates active work; defer deployment or use --force only after explicit interruption approval.',
      'Deployment is needed because remote build metadata missing; prefer --if-needed --apply before manual recovery.',
      'Local package is stale: missing deploy tarball.',
      'Custom remote dir /srv/crawler-test is in use; verify the deployed app, data directory, and PM2 cwd.',
      'Custom PM2 service crawl-server-v4-test is in use; verify stop/start/status commands target the same service.',
      '--force may interrupt active remote work; capture status and rollback/stop commands before applying it.',
    ]));
  });

  test('troubleshooting hints call out native dependency build tooling failures', () => {
    const hints = buildDeployTroubleshootingHints({
      error: new Error('prebuild-install warn install No prebuilt binaries found; make: not found while installing better-sqlite3'),
    });

    expect(hints).toEqual(expect.arrayContaining([
      'Remote native dependency install may need build-essential, make, g++, and python3 before npm install can compile better-sqlite3.',
    ]));
  });

  test('extracts remote build info from status payload', () => {
    const build = remoteBuildInfoFromStatus({
      build: {
        buildId: '20260513010101',
        builtAt: '2026-05-13T01:01:01.000Z',
      },
    });

    expect(build).toMatchObject({
      buildId: '20260513010101',
      builtAtMs: Date.parse('2026-05-13T01:01:01.000Z'),
    });
  });

  test('resolves package dependency versions from root and db packages', () => {
    const deps = dependencyVersions(process.cwd(), require('path').resolve(process.cwd(), '..', 'news-crawler-db'));

    expect(deps).toMatchObject({
      express: expect.any(String),
      'better-sqlite3': expect.any(String),
      'drizzle-orm': expect.any(String),
      'news-crawler-db': 'file:vendor/news-crawler-db',
    });
  });

  test('splits user-qualified ssh targets', () => {
    expect(splitSshTarget('ubuntu@141.144.193.218')).toEqual({
      user: 'ubuntu',
      host: '141.144.193.218',
    });
    expect(splitSshTarget('oracle-worker')).toEqual({
      user: null,
      host: 'oracle-worker',
    });
  });
});
