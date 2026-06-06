'use strict';

const {
  buildDeployPreflightArgs,
  normalizeDeployMode,
  renderDeployPreflightCommand,
  shouldPreflightRemoteArgs,
} = require('../../tools/crawl/lib/remote-deploy-preflight');

describe('remote deploy preflight helper', () => {
  test('preflights only start-like remote commands', () => {
    expect(shouldPreflightRemoteArgs(['collect', '--domains', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['bounded', '--domains', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['launch', '--domains', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['start', '--domain', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['run', '--domain', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['status'])).toBe(false);
    expect(shouldPreflightRemoteArgs(['health'])).toBe(false);
    expect(shouldPreflightRemoteArgs(['sync'])).toBe(false);
  });

  test('normalizes deploy modes conservatively', () => {
    expect(normalizeDeployMode('auto')).toBe('auto');
    expect(normalizeDeployMode('never')).toBe('never');
    expect(normalizeDeployMode('always')).toBe('always');
    expect(normalizeDeployMode('nonsense')).toBe('auto');
  });

  test('builds automatic if-needed deploy args', () => {
    expect(buildDeployPreflightArgs({
      mode: 'auto',
      sshHost: 'ubuntu@example.com',
      statusUrl: 'http://example.com:3200/api/status',
      force: true,
      skipDbBuild: true,
    })).toEqual([
      '--if-needed',
      '--apply',
      '--quiet-if-current',
      '--force',
      '--ssh-host', 'ubuntu@example.com',
      '--status-url', 'http://example.com:3200/api/status',
      '--skip-db-build',
    ]);
  });

  test('builds always deploy args with recovery overrides', () => {
    expect(buildDeployPreflightArgs({
      mode: 'always',
      sshHost: 'ubuntu@example.com',
      remoteDir: '/srv/crawler',
      service: 'crawl-server-v4-test',
      skipBusyCheck: true,
      skipHealthCheck: true,
    })).toEqual([
      '--apply',
      '--force-build',
      '--ssh-host', 'ubuntu@example.com',
      '--remote-dir', '/srv/crawler',
      '--service', 'crawl-server-v4-test',
      '--skip-busy-check',
      '--skip-health-check',
    ]);
  });

  test('passes explicit status and target details for recovery dry-runs', () => {
    expect(buildDeployPreflightArgs({
      mode: 'auto',
      statusHost: 'worker.example.com',
      statusPort: 4300,
      remoteDir: '/srv/crawler-test',
      service: 'crawl-server-v4-test',
      skipBusyCheck: true,
      skipHealthCheck: true,
    })).toEqual([
      '--if-needed',
      '--apply',
      '--quiet-if-current',
      '--status-host', 'worker.example.com',
      '--status-port', '4300',
      '--remote-dir', '/srv/crawler-test',
      '--service', 'crawl-server-v4-test',
      '--skip-busy-check',
      '--skip-health-check',
    ]);
  });

  test('renders deploy preflight command for dry-run operator proof', () => {
    expect(renderDeployPreflightCommand({
      mode: 'auto',
      statusHost: 'worker.example.com',
      statusPort: 4300,
      remoteDir: '/srv/crawler-test',
      service: 'crawl-server-v4-test',
    })).toContain('node tools/crawl/deploy-remote-server.js --if-needed --apply --quiet-if-current --status-host worker.example.com --status-port 4300 --remote-dir /srv/crawler-test --service crawl-server-v4-test');
  });

  test('never mode skips deploy preflight', () => {
    expect(buildDeployPreflightArgs({ mode: 'never' })).toBeNull();
  });
});
