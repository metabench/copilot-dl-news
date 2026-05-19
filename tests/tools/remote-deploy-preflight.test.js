'use strict';

const {
  buildDeployPreflightArgs,
  normalizeDeployMode,
  shouldPreflightRemoteArgs,
} = require('../../tools/crawl/lib/remote-deploy-preflight');

describe('remote deploy preflight helper', () => {
  test('preflights only start-like remote commands', () => {
    expect(shouldPreflightRemoteArgs(['collect', '--domains', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['bounded', '--domains', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['launch', '--domains', 'bbc.com'])).toBe(true);
    expect(shouldPreflightRemoteArgs(['status'])).toBe(false);
    expect(shouldPreflightRemoteArgs(['health'])).toBe(false);
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

  test('never mode skips deploy preflight', () => {
    expect(buildDeployPreflightArgs({ mode: 'never' })).toBeNull();
  });
});
