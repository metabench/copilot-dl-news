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
  buildRemoteDeployPreflightDryRunCommand,
  buildRemoteDryRunGraphFeedback,
  executeInvocation,
  extractRemoteDryRunHosts,
  optionsObjectToArgs,
  parseCliArgs,
  renderInvocation,
  resolveProfilePath,
  resolveToolSpec,
  runCli,
} = require('../../tools/crawl/index');
const {
  makeGraphFeedbackArtifact,
} = require('./crawl/helpers/graph-feedback-fixtures');

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

  function withTempArtifact(host, callback) {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact(host)));
    try {
      return callback(artifactPath);
    } finally {
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }
  }

  function withTempArtifactObject(artifact, callback) {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    try {
      return callback(artifactPath);
    } finally {
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }
  }

  test('resolves known tool aliases', () => {
    expect(resolveToolSpec('remote').script).toBe('crawl-remote.js');
    expect(resolveToolSpec('multimodal').key).toBe('multi-modal');
    expect(resolveToolSpec('guess').key).toBe('guess-place-hubs');
    expect(resolveToolSpec('deploy').key).toBe('remote-deploy');
  });

  test('parses global launcher flags separately from delegated tokens', () => {
    const parsed = parseCliArgs([
      'profile',
      'remote-bounded-smoke',
      '--dry-run',
      '--graph-feedback-artifact=tmp/graph-feedback-plan.json',
      '--profile-dir',
      'custom-profiles',
    ]);
    expect(parsed.command).toBe('profile');
    expect(parsed.options.dryRun).toBe(true);
    expect(parsed.options.graphFeedbackArtifactPath).toBe('tmp/graph-feedback-plan.json');
    expect(parsed.options.profileDir).toBe(path.resolve('custom-profiles'));
    expect(parsed.tokens).toEqual(['profile', 'remote-bounded-smoke']);
  });

  test('parses explicit live graph feedback seed flag separately from delegated tokens', () => {
    const parsed = parseCliArgs([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--graph-feedback-artifact',
      'tmp/graph-feedback-plan.json',
      '--use-graph-feedback-seeds',
    ]);

    expect(parsed.command).toBe('remote');
    expect(parsed.options.graphFeedbackArtifactPath).toBe('tmp/graph-feedback-plan.json');
    expect(parsed.options.useGraphFeedbackSeeds).toBe(true);
    expect(parsed.tokens).toEqual(['remote', 'bounded', '--domains', 'bbc.com']);
  });

  test('parses graph feedback preview evidence and seed attempt log flags as launcher options', () => {
    const parsed = parseCliArgs([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--graph-feedback-artifact',
      'tmp/graph-feedback-plan.json',
      '--use-graph-feedback-seeds',
      '--graph-feedback-preview-evidence',
      'tmp/preview.json',
      '--graph-feedback-approval-checklist',
      'tmp/approval.json',
      '--graph-feedback-approval-readiness=tmp/readiness.json',
      '--graph-feedback-post-seed-checklist',
      'tmp/post-seed-checklist.json',
      '--seed-attempt-log=tmp/seed-attempts.jsonl',
    ]);

    expect(parsed.options.graphFeedbackPreviewEvidencePath).toBe('tmp/preview.json');
    expect(parsed.options.graphFeedbackApprovalChecklistPath).toBe('tmp/approval.json');
    expect(parsed.options.graphFeedbackApprovalReadinessPath).toBe('tmp/readiness.json');
    expect(parsed.options.graphFeedbackPostSeedChecklistPath).toBe('tmp/post-seed-checklist.json');
    expect(parsed.options.seedAttemptLogPath).toBe('tmp/seed-attempts.jsonl');
    expect(parsed.tokens).toEqual(['remote', 'bounded', '--domains', 'bbc.com']);
  });

  test('requires a path for the graph feedback artifact launcher flag', () => {
    expect(() => parseCliArgs(['remote', 'status', '--graph-feedback-artifact']))
      .toThrow('--graph-feedback-artifact requires a path');
  });

  test('parses remote deploy preflight flags as launcher options', () => {
    const parsed = parseCliArgs([
      'remote',
      'bounded',
      '--remote-deploy', 'never',
      '--remote-deploy-force',
      '--remote-deploy-ssh-host', 'ubuntu@example.com',
      '--remote-deploy-status-host', 'worker.example.com',
      '--remote-deploy-status-port', '4300',
      '--remote-deploy-status-url', 'http://example.com:3200/api/status',
      '--remote-deploy-remote-dir', '/srv/crawler-test',
      '--remote-deploy-service', 'crawl-server-v4-test',
      '--remote-deploy-skip-busy-check',
      '--remote-deploy-skip-db-build',
      '--remote-deploy-skip-health-check',
    ]);

    expect(parsed.command).toBe('remote');
    expect(parsed.options.remoteDeploy).toBe('never');
    expect(parsed.options.remoteDeployForce).toBe(true);
    expect(parsed.options.remoteDeploySshHost).toBe('ubuntu@example.com');
    expect(parsed.options.remoteDeployStatusHost).toBe('worker.example.com');
    expect(parsed.options.remoteDeployStatusPort).toBe('4300');
    expect(parsed.options.remoteDeployStatusUrl).toBe('http://example.com:3200/api/status');
    expect(parsed.options.remoteDeployRemoteDir).toBe('/srv/crawler-test');
    expect(parsed.options.remoteDeployService).toBe('crawl-server-v4-test');
    expect(parsed.options.remoteDeploySkipBusyCheck).toBe(true);
    expect(parsed.options.remoteDeploySkipDbBuild).toBe(true);
    expect(parsed.options.remoteDeploySkipHealthCheck).toBe(true);
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

  test('builds invocation for the tiny local monitored smoke profile', () => {
    const invocation = buildInvocationFromProfile('local-tiny-monitored-smoke', [], DEFAULT_PROFILE_DIR);
    expect(invocation.tool.key).toBe('batch');
    expect(invocation.args).toEqual([
      '--operation', 'basicArticleCrawl',
      '--max-pages', '1',
      '--max-depth', '0',
      '--concurrency', '1',
      '--retries', '0',
      '--request-timeout-ms', '20000',
      'https://www.bbc.com/news',
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

  test('extracts graph-feedback hosts from remote dry-run args', () => {
    expect(extractRemoteDryRunHosts([
      'bounded',
      '--domains', 'BBC.com,reuters.com',
      '--domain=apnews.com',
      '--domains=npr.org,bbc.com',
    ])).toEqual(['bbc.com', 'reuters.com', 'apnews.com', 'npr.org']);
  });

  test('builds graph feedback dry-run explanation for remote invocation hosts', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);
      const explanation = buildRemoteDryRunGraphFeedback(invocation, {
        graphFeedbackArtifactPath: artifactPath,
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      expect(explanation.mode).toBe('artifact-dry-run');
      expect(explanation.plannedHosts).toEqual(['bbc.com']);
      expect(explanation.domains[0].candidates[0]).toEqual(expect.objectContaining({
        url: 'https://bbc.com/news',
        wouldEnqueue: false,
        wouldSeedRemote: false,
        wouldChangeCollect: false,
      }));
    });
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

  test('dry-run remote invocation can attach read-only graph feedback summary', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      expect(runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toBe(0);

      const output = logSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('node tools/crawl/crawl-remote.js bounded --domains bbc.com');
      expect(output).toContain('Graph feedback summary (read-only):');
      expect(output).toContain('Planned hosts: bbc.com');
      expect(output).toContain('https://bbc.com/news - missing content');
      expect(output).toContain('Actions: no URLs enqueued; no remote crawlers seeded; collect behavior unchanged.');
    });
  });

  test('dry-run remote invocation prints deploy preflight command with explicit recovery target details', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(runCli([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--dry-run',
      '--remote-deploy',
      'always',
      '--remote-deploy-status-host',
      'worker.example.com',
      '--remote-deploy-status-port',
      '4300',
      '--remote-deploy-remote-dir',
      '/srv/crawler-test',
      '--remote-deploy-service',
      'crawl-server-v4-test',
      '--remote-deploy-skip-busy-check',
      '--remote-deploy-skip-health-check',
    ])).toBe(0);

    const output = logSpy.mock.calls.map(call => call[0]).join('\n');
    expect(output).toContain('Remote deploy preflight: node tools/crawl/deploy-remote-server.js --apply --force-build');
    expect(output).toContain('--status-host worker.example.com');
    expect(output).toContain('--status-port 4300');
    expect(output).toContain('--remote-dir /srv/crawler-test');
    expect(output).toContain('--service crawl-server-v4-test');
    expect(output).toContain('--skip-busy-check');
    expect(output).toContain('--skip-health-check');
  });

  test('remote deploy dry-run command is omitted for non-start remote commands', () => {
    const invocation = buildInvocationFromTool('remote', ['status']);

    expect(buildRemoteDeployPreflightDryRunCommand(invocation, {
      remoteDeploy: 'always',
    })).toBeNull();
  });

  test('dry-run remote profile can attach read-only graph feedback summary', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      expect(runCli([
        'simple-distributed-smoke',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toBe(0);

      const output = logSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('node tools/crawl/crawl-remote.js bounded --domains bbc.com');
      expect(output).toContain('Profile:');
      expect(output).toContain('Graph feedback summary (read-only):');
      expect(output).toContain('Planned hosts: bbc.com');
      expect(output).toContain('Actions: no URLs enqueued; no remote crawlers seeded; collect behavior unchanged.');
    });
  });

  test('dry-run remote invocation with explicit live flag previews appended seed args without contacting remote', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      expect(runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toBe(0);

      const output = logSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('--seed-urls-by-domain');
      expect(output).toContain('bbc.com=https://bbc.com/news');
      expect(output).toContain('Graph feedback summary (read-only):');
      expect(output).toContain('Graph feedback live seed plan (dry-run preview):');
      expect(output).toContain('Actions: dry-run only; no remote seed request is sent.');
    });
  });

  test('dry-run live graph feedback preview writes bounded evidence without contacting remote', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        expect(runCli([
          'remote',
          'bounded',
          '--domains',
          'bbc.com',
          '--dry-run',
          '--graph-feedback-artifact',
          artifactPath,
          '--use-graph-feedback-seeds',
          '--graph-feedback-preview-evidence',
          evidencePath,
        ])).toBe(0);

        const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        const output = logSpy.mock.calls.map(call => call[0]).join('\n');
        expect(evidence.mode).toBe('graph-feedback-live-seed-preview-evidence');
        expect(evidence.fingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(evidence.candidateCount).toBe(1);
        expect(JSON.stringify(evidence)).not.toContain('https://bbc.com/news');
        expect(output).toContain('Graph feedback live seed plan (dry-run preview):');
        expect(output).toContain('Preview fingerprint:');
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_e) { /* ignore */ }
      }
    });
  });

  test('dry-run live graph feedback preview writes approval checklist without contacting remote', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const checklistPath = path.join(os.tmpdir(), `graph-feedback-approval-${Date.now()}-${Math.random()}.json`);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        expect(runCli([
          'remote',
          'bounded',
          '--domains',
          'bbc.com',
          '--dry-run',
          '--graph-feedback-artifact',
          artifactPath,
          '--use-graph-feedback-seeds',
          '--graph-feedback-preview-evidence',
          evidencePath,
          '--graph-feedback-approval-checklist',
          checklistPath,
        ])).toBe(0);

        const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
        const raw = fs.readFileSync(checklistPath, 'utf8');
        const output = logSpy.mock.calls.map(call => call[0]).join('\n');
        expect(checklist.mode).toBe('graph-feedback-live-seed-approval-checklist');
        expect(checklist.approvalReadyForHuman).toBe(true);
        expect(checklist.realSeedAuthorized).toBe(false);
        expect(checklist.constraints).toEqual(expect.objectContaining({
          maxHosts: 1,
          maxCandidates: 3,
          timeoutSeconds: 30,
        }));
        expect(checklist.previewEvidence.path).toBe(evidencePath);
        expect(checklist.postSeedVerification.commands.map(command => command.name)).toEqual(expect.arrayContaining([
          'health',
          'status',
          'one-round-sync',
          'local-db-recent',
        ]));
        expect(raw).not.toContain('https://bbc.com/news');
        expect(output).toContain('Graph feedback live seed plan (dry-run preview):');
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_e) { /* ignore */ }
        try { fs.unlinkSync(checklistPath); } catch (_e) { /* ignore */ }
      }
    });
  });

  test('dry-run live graph feedback preview writes approval readiness without contacting remote', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const checklistPath = path.join(os.tmpdir(), `graph-feedback-approval-${Date.now()}-${Math.random()}.json`);
      const readinessPath = path.join(os.tmpdir(), `graph-feedback-readiness-${Date.now()}-${Math.random()}.json`);
      const postSeedChecklistPath = path.join(os.tmpdir(), `graph-feedback-post-seed-checklist-${Date.now()}-${Math.random()}.json`);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        expect(runCli([
          'remote',
          'bounded',
          '--domains',
          'bbc.com',
          '--dry-run',
          '--graph-feedback-artifact',
          artifactPath,
          '--use-graph-feedback-seeds',
          '--graph-feedback-preview-evidence',
          evidencePath,
          '--graph-feedback-approval-checklist',
          checklistPath,
          '--graph-feedback-approval-readiness',
          readinessPath,
          '--graph-feedback-post-seed-checklist',
          postSeedChecklistPath,
        ])).toBe(0);

        const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
        const postSeedChecklist = JSON.parse(fs.readFileSync(postSeedChecklistPath, 'utf8'));
        const raw = fs.readFileSync(readinessPath, 'utf8');
        const output = logSpy.mock.calls.map(call => call[0]).join('\n');
        expect(readiness.mode).toBe('graph-feedback-live-seed-approval-readiness');
        expect(readiness.readyForApproval).toBe(true);
        expect(readiness.realSeedAuthorized).toBe(false);
        expect(readiness.approvalChecklistPath).toBe(checklistPath);
        expect(readiness.previewEvidencePath).toBe(evidencePath);
        expect(readiness.summary).toEqual(expect.objectContaining({
          readyForApproval: true,
          blockerCount: 0,
          plannedHostCount: 1,
          candidateCount: 1,
        }));
        expect(readiness.remoteUsability.commandNames).toEqual(expect.arrayContaining([
          'health',
          'status-build',
          'recent-errors',
          'content-probe',
          'deploy-preflight',
        ]));
        expect(readiness.postSeedVerificationPlan.commandNames).toEqual(expect.arrayContaining([
          'health',
          'status',
          'errors',
          'content',
          'one-round-sync',
          'local-db-recent',
        ]));
        expect(readiness.postSeedVerificationPlan.rollbackCommandNames).toEqual(expect.arrayContaining([
          'stop-target-hosts',
          'status-after-stop',
        ]));
        expect(postSeedChecklist.mode).toBe('graph-feedback-live-seed-post-seed-verification');
        expect(postSeedChecklist.commands.map(command => command.name)).toEqual(expect.arrayContaining([
          'health',
          'status',
          'errors',
          'content',
          'one-round-sync',
          'local-db-recent',
        ]));
        expect(readiness.checks.find(check => check.name === 'preview-evidence-match')).toEqual(expect.objectContaining({
          ok: true,
        }));
        expect(readiness.checks.find(check => check.name === 'remote-usability-proof')).toEqual(expect.objectContaining({
          ok: true,
        }));
        expect(raw).not.toContain('https://bbc.com/news');
        expect(output).toContain('Graph feedback live seed plan (dry-run preview):');
      } finally {
        for (const filePath of [evidencePath, checklistPath, readinessPath, postSeedChecklistPath]) {
          try { fs.unlinkSync(filePath); } catch (_e) { /* ignore */ }
        }
      }
    });
  });

  test('live remote invocation sends graph feedback seeds only with explicit flag and validated artifact', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const spawn = jest.fn(() => ({ status: 0 }));
      const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);

      try {
        expect(runCli([
          'remote',
          'bounded',
          '--domains',
          'bbc.com',
          '--dry-run',
          '--graph-feedback-artifact',
          artifactPath,
          '--use-graph-feedback-seeds',
          '--graph-feedback-preview-evidence',
          evidencePath,
        ])).toBe(0);
        logSpy.mockClear();

        expect(executeInvocation(invocation, false, {
          graphFeedbackArtifactPath: artifactPath,
          graphFeedbackPreviewEvidencePath: evidencePath,
          useGraphFeedbackSeeds: true,
          remoteDeploy: 'never',
          generatedAt: '2026-05-26T12:00:00.000Z',
          spawnSync: spawn,
          err: { write: jest.fn() },
        })).toBe(0);

        expect(spawn).toHaveBeenCalledTimes(1);
        const spawnedArgs = spawn.mock.calls[0][1];
        expect(spawnedArgs).toEqual(expect.arrayContaining([
          invocation.tool.scriptPath,
          'bounded',
          '--domains',
          'bbc.com',
          '--seed-urls-by-domain',
          'bbc.com=https://bbc.com/news',
        ]));
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_e) { /* ignore */ }
      }
    });
  });

  test('live remote invocation can verify dry-run preview evidence before seeding', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const spawn = jest.fn(() => ({ status: 0 }));
      const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);

      try {
        expect(runCli([
          'remote',
          'bounded',
          '--domains',
          'bbc.com',
          '--dry-run',
          '--graph-feedback-artifact',
          artifactPath,
          '--use-graph-feedback-seeds',
          '--graph-feedback-preview-evidence',
          evidencePath,
        ])).toBe(0);
        logSpy.mockClear();

        expect(executeInvocation(invocation, false, {
          graphFeedbackArtifactPath: artifactPath,
          graphFeedbackPreviewEvidencePath: evidencePath,
          useGraphFeedbackSeeds: true,
          remoteDeploy: 'never',
          generatedAt: '2026-05-26T12:00:00.000Z',
          spawnSync: spawn,
          err: { write: jest.fn() },
        })).toBe(0);

        expect(spawn).toHaveBeenCalledTimes(1);
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_e) { /* ignore */ }
      }
    });
  });

  test('live graph feedback seeding through the CLI requires preview evidence', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('live mode requires --graph-feedback-preview-evidence');
    });
  });

  test('live remote invocation rejects mismatched dry-run preview evidence before spawning', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const spawn = jest.fn(() => ({ status: 0 }));
      const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);
      fs.writeFileSync(evidencePath, JSON.stringify({
        schemaVersion: 1,
        mode: 'graph-feedback-live-seed-preview-evidence',
        fingerprintAlgorithm: 'sha256:stable-json:v1',
        fingerprint: '0'.repeat(64),
      }));

      try {
        expect(() => executeInvocation(invocation, false, {
          graphFeedbackArtifactPath: artifactPath,
          graphFeedbackPreviewEvidencePath: evidencePath,
          useGraphFeedbackSeeds: true,
          remoteDeploy: 'never',
          generatedAt: '2026-05-26T12:00:00.000Z',
          spawnSync: spawn,
          err: { write: jest.fn() },
        })).toThrow('fingerprint does not match');
        expect(spawn).not.toHaveBeenCalled();
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_e) { /* ignore */ }
      }
    });
  });

  test('live remote invocation appends compact seed-attempt log without candidate URL dumps', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const logPath = path.join(os.tmpdir(), `graph-feedback-seed-attempt-${Date.now()}-${Math.random()}.jsonl`);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const spawn = jest.fn(() => ({ status: 0 }));
      const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);

      try {
        expect(runCli([
          'remote',
          'bounded',
          '--domains',
          'bbc.com',
          '--dry-run',
          '--graph-feedback-artifact',
          artifactPath,
          '--use-graph-feedback-seeds',
          '--graph-feedback-preview-evidence',
          evidencePath,
        ])).toBe(0);
        logSpy.mockClear();

        expect(executeInvocation(invocation, false, {
          graphFeedbackArtifactPath: artifactPath,
          graphFeedbackPreviewEvidencePath: evidencePath,
          seedAttemptLogPath: logPath,
          useGraphFeedbackSeeds: true,
          remoteDeploy: 'never',
          generatedAt: '2026-05-26T12:00:00.000Z',
          spawnSync: spawn,
          err: { write: jest.fn() },
        })).toBe(0);

        const raw = fs.readFileSync(logPath, 'utf8');
        const record = JSON.parse(raw.trim());
        expect(record.mode).toBe('graph-feedback-live-seed-attempt');
        expect(record.candidateCount).toBe(1);
        expect(record.requestBodyBytes).toBeGreaterThan(0);
        expect(raw).not.toContain('https://bbc.com/news');
        expect(record.delegatedCommand).toContain('[redacted:graph-feedback-seeds]');
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_e) { /* ignore */ }
        try { fs.unlinkSync(logPath); } catch (_e) { /* ignore */ }
      }
    });
  });

  test('normal live remote invocation does not add graph feedback seed args without explicit flag', () => {
    const spawn = jest.fn(() => ({ status: 0 }));
    const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);

    expect(executeInvocation(invocation, false, {
      remoteDeploy: 'never',
      spawnSync: spawn,
    })).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).not.toContain('--seed-urls-by-domain');
  });

  test('graph feedback artifact host mismatch is rejected for remote dry-run', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'reuters.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toThrow('requested host(s) not present in artifact: reuters.com');

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  test('profile graph feedback artifact host mismatch fails before printing dry-run command', () => {
    withTempArtifact('www.bbc.com', (artifactPath) => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      expect(() => runCli([
        'simple-distributed-smoke',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toThrow('requested host(s) not present in artifact: bbc.com');

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  test('graph feedback artifact requires remote dry-run hosts', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'status',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toThrow('requires remote --domain or --domains');
    });
  });

  test('malformed graph feedback artifact schema is rejected for remote dry-run', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com', { schemaVersion: 2 })));
    try {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toThrow('schemaVersion must be 1');
    } finally {
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }
  });

  test('graph feedback artifact is rejected outside launcher dry-run', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toThrow('dry-run only unless --use-graph-feedback-seeds');
    });
  });

  test('preview evidence and seed attempt logs require explicit live graph feedback seed mode', () => {
    expect(() => runCli([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--graph-feedback-preview-evidence',
      'tmp/preview.json',
    ])).toThrow('only supported with --use-graph-feedback-seeds');

    expect(() => runCli([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--graph-feedback-approval-checklist',
      'tmp/approval.json',
    ])).toThrow('only supported with --use-graph-feedback-seeds');

    expect(() => runCli([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--seed-attempt-log',
      'tmp/attempt.jsonl',
    ])).toThrow('only supported with --use-graph-feedback-seeds');

    expect(() => runCli([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--graph-feedback-post-seed-checklist',
      'tmp/post-seed.json',
    ])).toThrow('only supported with --use-graph-feedback-seeds');
  });

  test('approval checklist is dry-run only and requires preview evidence', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-approval-checklist',
        'tmp/approval.json',
      ])).toThrow('requires --graph-feedback-preview-evidence');

      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-preview-evidence',
        'tmp/preview.json',
        '--graph-feedback-approval-checklist',
        'tmp/approval.json',
      ])).toThrow('dry-run only');
    });
  });

  test('approval readiness is dry-run only and requires checklist plus preview evidence', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-preview-evidence',
        'tmp/preview.json',
        '--graph-feedback-approval-readiness',
        'tmp/readiness.json',
      ])).toThrow('requires --graph-feedback-approval-checklist');

      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-approval-checklist',
        'tmp/approval.json',
        '--graph-feedback-approval-readiness',
        'tmp/readiness.json',
      ])).toThrow('requires --graph-feedback-preview-evidence');

      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-preview-evidence',
        'tmp/preview.json',
        '--graph-feedback-approval-checklist',
        'tmp/approval.json',
        '--graph-feedback-approval-readiness',
        'tmp/readiness.json',
      ])).toThrow('dry-run only');
    });
  });

  test('post-seed checklist is dry-run only and requires preview evidence', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-post-seed-checklist',
        'tmp/post-seed.json',
      ])).toThrow('requires --graph-feedback-preview-evidence');

      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--graph-feedback-preview-evidence',
        'tmp/preview.json',
        '--graph-feedback-post-seed-checklist',
        'tmp/post-seed.json',
      ])).toThrow('dry-run only');
    });
  });

  test('seed attempt log is rejected in dry-run because preview evidence is the dry-run proof', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
        '--seed-attempt-log',
        'tmp/attempt.jsonl',
      ])).toThrow('records live delegation only');
    });
  });

  test('live graph feedback seeding requires explicit artifact path', () => {
    expect(() => runCli([
      'remote',
      'bounded',
      '--domains',
      'bbc.com',
      '--use-graph-feedback-seeds',
    ])).toThrow('--use-graph-feedback-seeds requires --graph-feedback-artifact <path>');
  });

  test('live graph feedback seeding rejects non-start and hostless remote paths', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'status',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('only supported for explicit remote start, launch, bounded, or run commands');

      expect(() => runCli([
        'remote',
        'start',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('requires remote --domain or --domains');
    });
  });

  test('live graph feedback seeding rejects collect to avoid changing collect behavior', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'collect',
        '--domains',
        'bbc.com',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('only supported for explicit remote start, launch, bounded, or run commands');
    });
  });

  test('live graph feedback seeding rejects pre-existing seed flags instead of merging seeds', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--seed-urls',
        'https://bbc.com/old',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('cannot be combined with existing --seed-urls or --seed-urls-by-domain flags');
    });
  });

  test('live graph feedback seeding rejects stale, mismatched, oversized, and bad artifacts', () => {
    withTempArtifactObject(makeGraphFeedbackArtifact('bbc.com', {
      generatedAt: '2026-05-01T00:00:00.000Z',
    }), (artifactPath) => {
      const invocation = buildInvocationFromTool('remote', ['bounded', '--domains', 'bbc.com']);
      expect(() => executeInvocation(invocation, true, {
        graphFeedbackArtifactPath: artifactPath,
        useGraphFeedbackSeeds: true,
        generatedAt: '2026-05-26T12:00:00.000Z',
      })).toThrow('rejects artifacts older than 7 days');
    });

    withTempArtifact('www.bbc.com', (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('requested host(s) not present in artifact: bbc.com');
    });

    const oversizedPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(oversizedPath, 'x'.repeat(257 * 1024));
    try {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        oversizedPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('max supported size is');
    } finally {
      try { fs.unlinkSync(oversizedPath); } catch (_e) { /* ignore */ }
    }

    withTempArtifactObject(makeGraphFeedbackArtifact('bbc.com', { schemaVersion: 2 }), (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('schemaVersion must be 1');
    });
  });

  test('live graph feedback seeding rejects unsafe candidate bounds and URLs', () => {
    const tooManyHosts = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'];
    withTempArtifactObject({
      ...makeGraphFeedbackArtifact('a.com'),
      domainCount: 6,
      recommendationCount: 6,
      domains: tooManyHosts.map(host => makeGraphFeedbackArtifact(host).domains[0]),
    }, (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        tooManyHosts.join(','),
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('supports at most 5 host');
    });

    const manyRecommendations = Array.from({ length: 11 }, (_, index) => ({
      url: `https://bbc.com/seed-${index}`,
    }));
    withTempArtifactObject(makeGraphFeedbackArtifact('bbc.com', {
      limits: {
        perHostLimit: 11,
        sampleLimit: 1,
        maxPerHostLimit: 200,
        maxSampleLimit: 50,
      },
      recommendationCount: 11,
      domainOverrides: { recommendations: manyRecommendations },
    }), (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('max live seed candidates per host is 10');
    });

    withTempArtifactObject(makeGraphFeedbackArtifact('bbc.com', {
      domainOverrides: {
        recommendations: [{ url: 'https://example.com/news' }],
      },
    }), (artifactPath) => {
      expect(() => runCli([
        'remote',
        'bounded',
        '--domains',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
        '--use-graph-feedback-seeds',
      ])).toThrow('live seed URL host mismatch');
    });
  });

  test('graph feedback artifact is rejected for non-remote dry-run targets', () => {
    withTempArtifact('bbc.com', (artifactPath) => {
      expect(() => runCli([
        'batch',
        'bbc.com',
        '--dry-run',
        '--graph-feedback-artifact',
        artifactPath,
      ])).toThrow('only supported for remote dry-run invocations');
    });
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
