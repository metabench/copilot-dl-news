'use strict';

const {
  classifyBusyStatus,
  compareRemoteBuild,
  createRemoteInstallScript,
  dependencyVersions,
  forceSuggestion,
  parseArgv,
  remoteBuildInfoFromStatus,
  shQuote,
  splitSshTarget,
  summarizePlan,
} = require('../../tools/crawl/deploy-remote-server');

describe('remote crawler deploy cli helpers', () => {
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

  test('suggests adding apply and force without duplicating force', () => {
    expect(forceSuggestion(['--ssh-host', 'oracle-worker'])).toBe(
      'node tools/crawl/deploy-remote-server.js --ssh-host oracle-worker --apply --force'
    );
    expect(forceSuggestion(['--apply', '--force'])).toBe(
      'node tools/crawl/deploy-remote-server.js --apply --force'
    );
  });

  test('quotes remote shell values safely', () => {
    expect(shQuote("a'b")).toBe("'a'\\''b'");
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
  });

  test('summarizes generated package shape for dry-run/json callers', () => {
    const opts = parseArgv(['--skip-busy-check', '--ssh-host', 'ubuntu@host']);
    const plan = summarizePlan(opts, { busy: false, reasons: [] });

    expect(plan.mode).toBe('dry-run');
    expect(plan.sshTarget).toBe('ubuntu@host');
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
