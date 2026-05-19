'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_PROFILE_DIR,
  RESERVED_COMMANDS,
  buildInvocationFromCommand,
  buildInvocationFromProfile,
  buildInvocationFromTool,
  optionsObjectToArgs,
  parseCliArgs,
  renderInvocation,
  resolveProfilePath,
  resolveToolSpec,
  runCli,
} = require('../../tools/crawl/index');

describe('tools/crawl unified launcher', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function withTempProfileDir(profileName, profile, callback) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-launcher-'));
    const profilePath = path.join(tempDir, `${profileName}.json`);
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

    try {
      return callback({ tempDir, profilePath });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  test('resolves known tool aliases', () => {
    expect(resolveToolSpec('remote').script).toBe('crawl-remote.js');
    expect(resolveToolSpec('multimodal').key).toBe('multi-modal');
    expect(resolveToolSpec('guess').key).toBe('guess-place-hubs');
    expect(resolveToolSpec('deploy').key).toBe('remote-deploy');
  });

  test('parses global launcher flags separately from delegated tokens', () => {
    const parsed = parseCliArgs(['profile', 'remote-bounded-smoke', '--dry-run', '--profile-dir', 'custom-profiles']);
    expect(parsed.command).toBe('profile');
    expect(parsed.options.dryRun).toBe(true);
    expect(parsed.options.profileDir).toBe(path.resolve('custom-profiles'));
    expect(parsed.tokens).toEqual(['profile', 'remote-bounded-smoke']);
  });

  test('parses remote deploy preflight flags as launcher options', () => {
    const parsed = parseCliArgs([
      'remote',
      'bounded',
      '--remote-deploy', 'never',
      '--remote-deploy-force',
      '--remote-deploy-ssh-host', 'ubuntu@example.com',
      '--remote-deploy-status-url', 'http://example.com:3200/api/status',
    ]);

    expect(parsed.command).toBe('remote');
    expect(parsed.options.remoteDeploy).toBe('never');
    expect(parsed.options.remoteDeployForce).toBe(true);
    expect(parsed.options.remoteDeploySshHost).toBe('ubuntu@example.com');
    expect(parsed.options.remoteDeployStatusUrl).toBe('http://example.com:3200/api/status');
    expect(parsed.tokens).toEqual(['remote', 'bounded']);
  });

  test('builds cli args from profile options object', () => {
    expect(optionsObjectToArgs({ json: true, domains: 'bbc.com,reuters.com', poll: 5 })).toEqual([
      '--json',
      '--domains', 'bbc.com,reuters.com',
      '--poll', '5'
    ]);
  });

  test('resolves named profiles inside the default profile directory', () => {
    expect(resolveProfilePath('remote-status', DEFAULT_PROFILE_DIR)).toBe(
      path.resolve(DEFAULT_PROFILE_DIR, 'remote-status.json')
    );
  });

  test('builds invocation from named profile', () => {
    const invocation = buildInvocationFromProfile('remote-bounded-smoke', [], DEFAULT_PROFILE_DIR);
    expect(invocation.tool.key).toBe('remote');
    expect(invocation.args).toEqual([
      'bounded',
      '--domains', 'bbc.com,reuters.com,apnews.com',
      '--max-pages', '50',
      '--poll', '5',
      '--timeout-min', '30'
    ]);
  });

  test('builds invocation for the simple distributed smoke profile', () => {
    const invocation = buildInvocationFromProfile('simple-distributed-smoke', [], DEFAULT_PROFILE_DIR);
    expect(invocation.tool.key).toBe('remote');
    expect(invocation.args).toEqual([
      'bounded',
      '--domains', 'bbc.com',
      '--max-pages', '5',
      '--poll', '5',
      '--timeout-min', '10'
    ]);
  });

  test('builds invocation for the agent-observable Guardian/BBC collect profile', () => {
    const invocation = buildInvocationFromProfile('remote-guardian-bbc-10-agent', [], DEFAULT_PROFILE_DIR);
    expect(invocation.tool.key).toBe('remote');
    expect(invocation.args).toEqual(expect.arrayContaining([
      'collect',
      '--domains', 'theguardian.com,bbc.com',
      '--target-pages', '10',
      '--max-pages', '30',
      '--max-depth', '4',
      '--max-status-failures', '3',
      '--start-retries', '3',
      '--agent-log', 'data/crawl-agent-runs/remote-guardian-bbc-10-{ts}.jsonl',
    ]));
    expect(invocation.args).toContain('--seed-urls-by-domain');
    expect(renderInvocation(invocation)).toContain("'theguardian.com=https://www.theguardian.com/international|");
  });

  test('builds direct tool invocation', () => {
    const invocation = buildInvocationFromTool('place-hubs', ['--depth', '2']);
    expect(invocation.tool.script).toBe('crawl-place-hubs.js');
    expect(invocation.args).toEqual(['--depth', '2']);
  });

  test('resolves an explicit profile JSON path in bare-command mode', () => {
    const profilePath = path.join(DEFAULT_PROFILE_DIR, 'remote-status.json');
    const invocation = buildInvocationFromCommand(profilePath, ['--json'], DEFAULT_PROFILE_DIR);

    expect(invocation.type).toBe('profile');
    expect(invocation.profilePath).toBe(path.resolve(profilePath));
    expect(invocation.args).toEqual(['status', '--json']);
  });

  test('resolves a bare command to a named profile when no tool matches', () => {
    const invocation = buildInvocationFromCommand('remote-status', ['--json'], DEFAULT_PROFILE_DIR);
    expect(invocation.type).toBe('profile');
    expect(invocation.tool.key).toBe('remote');
    expect(invocation.args).toEqual(['status', '--json']);
  });

  test('resolves bare profile names from a custom profile directory', () => {
    withTempProfileDir('custom-status', {
      description: 'Custom profile dir smoke check.',
      tool: 'remote',
      positionals: ['status']
    }, ({ tempDir, profilePath }) => {
      const invocation = buildInvocationFromCommand('custom-status', ['--json'], tempDir);

      expect(invocation.type).toBe('profile');
      expect(invocation.profilePath).toBe(path.resolve(profilePath));
      expect(invocation.args).toEqual(['status', '--json']);
    });
  });

  test('prefers direct tool dispatch when the command matches a tool name', () => {
    const invocation = buildInvocationFromCommand('remote', ['status'], DEFAULT_PROFILE_DIR);
    expect(invocation.type).toBe('tool');
    expect(invocation.tool.key).toBe('remote');
    expect(invocation.args).toEqual(['status']);
  });

  test('keeps tool precedence even when a custom profile directory contains the same name', () => {
    withTempProfileDir('remote', {
      description: 'Conflicting profile name.',
      tool: 'place-hubs',
      options: { depth: 1 }
    }, ({ tempDir }) => {
      const invocation = buildInvocationFromCommand('remote', ['status'], tempDir);

      expect(invocation.type).toBe('tool');
      expect(invocation.tool.key).toBe('remote');
      expect(invocation.args).toEqual(['status']);
    });
  });

  test('prints list output as JSON when requested', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(runCli(['list', '--json'])).toBe(0);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0][0]);
    expect(payload.profileDir).toBe(path.resolve(DEFAULT_PROFILE_DIR));
    expect(payload.profiles.map((profile) => profile.name)).toEqual(expect.arrayContaining([
      'place-hubs-local',
      'remote-bounded-smoke',
      'remote-status',
      'simple-distributed-smoke'
    ]));
    expect(payload.reservedCommands).toEqual(RESERVED_COMMANDS);
  });

  test('rejects unsupported list arguments with a clear error', () => {
    expect(() => runCli(['list', '--bogus'])).toThrow('list only accepts --json');
  });

  test('unknown bare names report how to inspect available tools and profiles', () => {
    expect(() => buildInvocationFromCommand('does-not-exist', [], DEFAULT_PROFILE_DIR)).toThrow(
      'Run "node tools/crawl/index.js list" to inspect available tools and profiles.'
    );
  });
});
