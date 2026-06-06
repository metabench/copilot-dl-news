'use strict';

const fsSync = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReadOnlyGraphFeedbackPlan,
  closeDb,
  createReadOnlyWebsiteGraphAnalysisService,
  importNewsDbAnalysis,
} = require('../../../tools/crawl/lib/graph-feedback-loader');
const {
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_URL_LENGTH,
  MAX_OPERATOR_REPORT_PROFILES,
  buildArtifactHostComparisonFromPlan,
  buildArtifactEvidence,
  buildArtifactPlanningDryRunFromPlan,
  buildArtifactWorkflowRecipe,
  buildOperatorReport,
  buildOperatorReadinessSummary,
  buildProfileReadiness,
  buildProfilePreflightReport,
  buildProfileWorkflowChecklist,
  parseArgs,
  parsePreflightFormat,
  parseReportFormat,
  parseWorkflowFormat,
  readGraphFeedbackArtifactFile,
  renderOperatorReportMarkdown,
  renderProfilePreflightText,
  renderProfileWorkflowChecklistMarkdown,
  resolveProfileAwareDomains,
  run,
  usage,
  validateGraphFeedbackArtifact,
  writeTextArtifact,
  writeJsonArtifact,
} = require('../../../tools/crawl/graph-feedback');
const {
  makeGraphFeedbackArtifact: makeBaseGraphFeedbackArtifact,
} = require('./helpers/graph-feedback-fixtures');

describe('graph-feedback-loader', () => {
  test('imports news-db-analysis from fallback candidates', async () => {
    const module = { WebsiteGraphAnalysisService: function Service() {} };
    const importer = jest.fn(async specifier => {
      if (specifier === 'news-db-analysis') throw new Error('not installed');
      return module;
    });

    const result = await importNewsDbAnalysis({
      importer,
      candidates: ['news-db-analysis', 'file:///tmp/news-db-analysis/dist/index.js'],
    });

    expect(result).toBe(module);
    expect(importer).toHaveBeenCalledWith('news-db-analysis');
    expect(importer).toHaveBeenCalledWith('file:///tmp/news-db-analysis/dist/index.js');
  });

  test('creates WebsiteGraphAnalysisService over read-only news-crawler-db adapter', async () => {
    const db = { graph: {}, close: jest.fn() };
    const openDb = jest.fn(() => db);
    const Service = jest.fn(function ServiceCtor(adapter) {
      this.adapter = adapter;
    });

    const handle = await createReadOnlyWebsiteGraphAnalysisService({
      dbPath: '/tmp/news.db',
      openDb,
      analysisModule: { WebsiteGraphAnalysisService: Service },
    });

    expect(openDb).toHaveBeenCalledWith('/tmp/news.db', {
      readonly: true,
      fileMustExist: true,
    });
    expect(Service).toHaveBeenCalledWith(db);
    expect(handle.service.adapter).toBe(db);

    await handle.close();
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  test('builds feedback plan and always closes DB handle', async () => {
    const close = jest.fn();
    const db = { close };
    const openDb = jest.fn(() => db);
    const Service = jest.fn(function ServiceCtor(adapter) {
      this.adapter = adapter;
    });
    const planBuilder = jest.fn(async (service, domains, options) => ({
      service,
      domains,
      options,
    }));

    const result = await buildReadOnlyGraphFeedbackPlan(['bbc.com'], {
      dbPath: '/tmp/news.db',
      openDb,
      analysisModule: { WebsiteGraphAnalysisService: Service },
      plannerOptions: { perHostLimit: 5 },
      planBuilder,
    });

    expect(result.domains).toEqual(['bbc.com']);
    expect(result.options).toEqual({ perHostLimit: 5 });
    expect(planBuilder).toHaveBeenCalledWith(expect.any(Service), ['bbc.com'], { perHostLimit: 5 });
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('closes DB handle when planner throws', async () => {
    const close = jest.fn();

    await expect(buildReadOnlyGraphFeedbackPlan('bbc.com', {
      openDb: jest.fn(() => ({ close })),
      analysisModule: { WebsiteGraphAnalysisService: function Service() {} },
      planBuilder: jest.fn(async () => { throw new Error('planner failed'); }),
    })).rejects.toThrow('planner failed');

    expect(close).toHaveBeenCalledTimes(1);
  });

  test('closeDb tolerates missing close method', async () => {
    await expect(closeDb({})).resolves.toBeUndefined();
    await expect(closeDb(null)).resolves.toBeUndefined();
  });
});

describe('graph-feedback CLI', () => {
  async function withTempArtifact(artifact, callback) {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fsSync.writeFileSync(artifactPath, JSON.stringify(artifact));
    try {
      return await callback(artifactPath);
    } finally {
      try { fsSync.unlinkSync(artifactPath); } catch (_err) { /* ignore */ }
    }
  }

  function makeGraphFeedbackArtifact(overrides = {}) {
    return makeBaseGraphFeedbackArtifact('bbc.com', {
      domainOverrides: {
        recommendations: [{
          url: 'https://bbc.com/news',
          urlId: 101,
          priorityScore: 42,
          reason: 'missing content',
          sources: ['crawl-priority-features'],
          signals: ['missing-content'],
          metadata: { missingContent: true },
        }],
        diagnostics: {
          orphanSamples: [{ url: 'https://bbc.com/orphan' }],
          deadEndSamples: [],
        },
      },
      ...overrides,
    });
  }

  test('parses domains and bounded planner flags', () => {
    expect(parseArgs([
      '--domains', 'BBC.com,theguardian.com',
      '--limit', '25',
      '--sample-limit', '3',
      '--fetched-only',
      '--fast',
      '--no-include-fetched',
      '--out', 'tmp/graph-feedback-plan.json',
      '--from-artifact', 'tmp/input-plan.json',
      '--profile', 'simple-distributed-smoke',
      '--profile-dir', 'tools/crawl/profiles',
      '--profile-summary',
      '--profile-preflight',
      '--profile-workflow',
      '--operator-report',
      '--all-common-profiles',
      '--report-format', 'markdown',
      '--report-commands', 'minimal',
      '--report-max-profiles', '3',
      '--preflight-format', 'text',
      '--workflow-format', 'markdown',
      '--recipe',
      '--compare-hosts',
      '--generated-at', '2026-05-26T00:00:00.000Z',
    ])).toEqual(expect.objectContaining({
      domains: ['BBC.com', 'theguardian.com'],
      perHostLimit: 25,
      sampleLimit: 3,
      fetchedOnly: true,
      mode: 'fast',
      outPath: 'tmp/graph-feedback-plan.json',
      artifactPath: 'tmp/input-plan.json',
      profileNames: ['simple-distributed-smoke'],
      profileDir: 'tools/crawl/profiles',
      profileSummary: true,
      profilePreflight: true,
      profileWorkflow: true,
      operatorReport: true,
      allCommonProfiles: true,
      reportFormat: 'markdown',
      reportCommands: 'minimal',
      reportMaxProfiles: 3,
      preflightFormat: 'text',
      workflowFormat: 'markdown',
      recipe: true,
      compareHosts: true,
      includeFetched: false,
      generatedAt: '2026-05-26T00:00:00.000Z',
    }));
  });

  test('help distinguishes compact recipe from complete profile workflow', () => {
    const text = usage();

    expect(text).toContain('--recipe');
    expect(text).toContain('compact artifact-derived preview commands');
    expect(text).toContain('--profile-workflow');
    expect(text).toContain('profile workflow checklist');
    expect(text).toContain('--workflow-format <json|markdown>');
  });

  test('prints JSON from injected read-only builder', async () => {
    const chunks = [];
    const builder = jest.fn(async (domains, options) => ({
      schemaVersion: 1,
      domains,
      options,
    }));

    const result = await run(['--domains', 'bbc.com', '--limit', '2', '--json'], {
      buildReadOnlyGraphFeedbackPlan: builder,
      stdout: { write: chunk => chunks.push(chunk) },
    });

    expect(builder).toHaveBeenCalledWith(['bbc.com'], expect.objectContaining({
      plannerOptions: expect.objectContaining({ perHostLimit: 2, mode: 'full' }),
    }));
    expect(result.domains).toEqual(['bbc.com']);
    expect(JSON.parse(chunks.join(''))).toEqual(expect.objectContaining({
      schemaVersion: 1,
      domains: ['bbc.com'],
    }));
  });

  test('rejects missing domains before opening DB', async () => {
    await expect(run([], {
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: jest.fn() },
    })).rejects.toThrow('No domains supplied');
  });

  test('prints artifact planning dry-run without opening the live graph builder', async () => {
    const chunks = [];
    const fs = {
      readFile: jest.fn(async () => JSON.stringify(makeGraphFeedbackArtifact())),
    };
    const liveBuilder = jest.fn();

    const result = await run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--domains', 'BBC.com',
      '--generated-at', '2026-05-26T12:00:00.000Z',
      '--json',
    ], {
      fs,
      buildReadOnlyGraphFeedbackPlan: liveBuilder,
      stdout: { write: chunk => chunks.push(chunk) },
    });

    expect(fs.readFile).toHaveBeenCalledWith('tmp/graph-feedback-plan.json', 'utf8');
    expect(liveBuilder).not.toHaveBeenCalled();
    expect(result.mode).toBe('artifact-dry-run');
    expect(result.actionPolicy).toEqual({
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    });
    expect(result.validation.requestedHosts).toEqual(['bbc.com']);
    expect(result.domains[0].candidates[0]).toEqual(expect.objectContaining({
      url: 'https://bbc.com/news',
      consideration: 'would-consider-as-seed-candidate',
      wouldEnqueue: false,
      wouldSeedRemote: false,
      wouldChangeCollect: false,
    }));
    expect(JSON.parse(chunks.join('')).candidateCount).toBe(1);
  });

  test('prints file-only artifact host comparison without opening the live graph builder', async () => {
    const chunks = [];
    const fs = {
      readFile: jest.fn(async () => JSON.stringify(makeGraphFeedbackArtifact({
        domainOverrides: { host: 'www.bbc.com' },
      }))),
    };
    const liveBuilder = jest.fn();

    const result = await run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--domains', 'bbc.com,www.bbc.com',
      '--compare-hosts',
      '--generated-at', '2026-05-26T12:00:00.000Z',
      '--pretty',
    ], {
      fs,
      buildReadOnlyGraphFeedbackPlan: liveBuilder,
      stdout: { write: chunk => chunks.push(chunk) },
    });

    expect(liveBuilder).not.toHaveBeenCalled();
    expect(result.mode).toBe('artifact-host-comparison');
    expect(result.ok).toBe(false);
    expect(result.artifactHosts).toEqual(['www.bbc.com']);
    expect(result.requestedHosts).toEqual(['bbc.com', 'www.bbc.com']);
    expect(result.plannedHosts).toEqual(['bbc.com', 'www.bbc.com']);
    expect(result.matchedHosts).toEqual(['www.bbc.com']);
    expect(result.missingHosts).toEqual(['bbc.com']);
    expect(result.extraArtifactHosts).toEqual([]);
    expect(result.recommendationCounts).toEqual({ 'www.bbc.com': 1 });
    expect(result.actionPolicy).toEqual({
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    });
    expect(JSON.parse(chunks.join('')).hostCaveat).toContain('Host matching is exact');
  });

  test('prints file-only profile host comparison without opening the live graph builder', async () => {
    const liveBuilder = jest.fn();

    await withTempArtifact(makeGraphFeedbackArtifact({
      domainOverrides: { host: 'www.bbc.com' },
    }), async (artifactPath) => {
      const chunks = [];
      const result = await run([
        '--from-artifact', artifactPath,
        '--profile', 'simple-distributed-smoke',
        '--compare-hosts',
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--pretty',
      ], {
        buildReadOnlyGraphFeedbackPlan: liveBuilder,
        stdout: { write: chunk => chunks.push(chunk) },
      });

      expect(liveBuilder).not.toHaveBeenCalled();
      expect(result.mode).toBe('artifact-host-comparison');
      expect(result.ok).toBe(false);
      expect(result.profile.profileName).toBe('simple-distributed-smoke');
      expect(result.profileHosts).toEqual(['bbc.com']);
      expect(result.plannedHosts).toEqual(['bbc.com']);
      expect(result.matchedHosts).toEqual([]);
      expect(result.missingHosts).toEqual(['bbc.com']);
      expect(result.extraArtifactHosts).toEqual(['www.bbc.com']);
      expect(JSON.parse(chunks.join('')).profile.hostSources[0].field).toBe('options.domains');
    });
  });

  test('validates artifact with static profile hosts', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const result = await run([
        '--from-artifact', artifactPath,
        '--profile', 'simple-distributed-smoke',
        '--json',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      });

      expect(result.mode).toBe('artifact-dry-run');
      expect(result.profile.profileName).toBe('simple-distributed-smoke');
      expect(result.profile.hosts).toEqual(['bbc.com']);
      expect(result.validation.requestedHosts).toEqual(['bbc.com']);
      expect(result.domains[0].host).toBe('bbc.com');
    });
  });

  test('reports hostless profile caveats during host comparison without guessing', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const result = await run([
        '--from-artifact', artifactPath,
        '--profile', 'remote-status',
        '--compare-hosts',
        '--json',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      });

      expect(result.ok).toBe(false);
      expect(result.profile.profileName).toBe('remote-status');
      expect(result.profile.hosts).toEqual([]);
      expect(result.profile.caveats[0]).toContain('No static host/domain fields found');
      expect(result.plannedHosts).toEqual([]);
    });
  });

  test('rejects strict artifact validation when a profile has no static hosts', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      await expect(run([
        '--from-artifact', artifactPath,
        '--profile', 'remote-status',
        '--json',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      })).rejects.toThrow('does not expose static hosts');
    });
  });

  test('rejects profile and explicit domain mismatches before reading artifact', async () => {
    const fs = { readFile: jest.fn() };

    await expect(run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--profile', 'simple-distributed-smoke',
      '--domains', 'www.bbc.com',
      '--compare-hosts',
    ], {
      fs,
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: jest.fn() },
    })).rejects.toThrow('Requested --domains do not match --profile simple-distributed-smoke');

    expect(fs.readFile).not.toHaveBeenCalled();
  });

  test('prints profile-aware recipe commands without opening the live graph builder', async () => {
    const artifact = {
      ...makeGraphFeedbackArtifact(),
      domainCount: 3,
      recommendationCount: 3,
      domains: [
        makeGraphFeedbackArtifact().domains[0],
        {
          ...makeGraphFeedbackArtifact().domains[0],
          host: 'reuters.com',
          recommendations: [{ url: 'https://reuters.com/world' }],
          diagnostics: { orphanSamples: [], deadEndSamples: [] },
        },
        {
          ...makeGraphFeedbackArtifact().domains[0],
          host: 'apnews.com',
          recommendations: [{ url: 'https://apnews.com/world' }],
          diagnostics: { orphanSamples: [], deadEndSamples: [] },
        },
      ],
    };

    await withTempArtifact(artifact, async (artifactPath) => {
      const result = await run([
        '--from-artifact', artifactPath,
        '--profile', 'remote-bounded-smoke',
        '--recipe',
        '--pretty',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      });

      expect(result.mode).toBe('operator-recipe');
      expect(result.profile.profileName).toBe('remote-bounded-smoke');
      expect(result.hosts).toEqual(['bbc.com', 'reuters.com', 'apnews.com']);
      expect(result.commands.map(command => command.step)).toEqual([
        'generate-bounded-artifact',
        'compare-profile-hosts',
        'validate-artifact',
        'preview-local-planning',
        'preview-profile-planning',
      ]);
      expect(result.commands[1].command).toContain('--profile remote-bounded-smoke --compare-hosts --json');
      expect(result.commands[2].command).toContain('--profile remote-bounded-smoke --json');
      expect(result.commands[4].command).toContain('node tools/crawl/index.js remote-bounded-smoke --dry-run --graph-feedback-artifact');
    });
  });

  test('prints a file-only profile compatibility summary', async () => {
    const chunks = [];
    const result = await run([
      '--profile-summary',
      '--profile', 'simple-distributed-smoke',
      '--profile', 'remote-bounded-smoke',
      '--pretty',
    ], {
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: chunk => chunks.push(chunk) },
    });

    expect(result.mode).toBe('profile-compatibility-summary');
    expect(result.profiles.map(profile => profile.profileName)).toEqual([
      'simple-distributed-smoke',
      'remote-bounded-smoke',
    ]);
    expect(result.profiles[1].hosts).toEqual(['bbc.com', 'reuters.com', 'apnews.com']);
    expect(JSON.parse(chunks.join('')).actionPolicy.seedRemoteCrawlers).toBe(false);
  });

  test('prints profile preflight with matching artifact and safe commands', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const chunks = [];
      const result = await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--pretty',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: chunk => chunks.push(chunk) },
      });

      expect(result.mode).toBe('profile-preflight');
      expect(result.ok).toBe(true);
      expect(result.profile.profileName).toBe('simple-distributed-smoke');
      expect(result.plannedHosts).toEqual(['bbc.com']);
      expect(result.artifact.artifactHosts).toEqual(['bbc.com']);
      expect(result.hostComparison).toEqual(expect.objectContaining({
        ok: true,
        matchedHosts: ['bbc.com'],
        missingHosts: [],
        extraArtifactHosts: [],
      }));
      expect(result.recommendedCommands.map(command => command.step)).toEqual([
        'profile-summary',
        'generate-bounded-artifact',
        'compare-profile-hosts',
        'validate-artifact',
        'preview-profile-planning',
      ]);
      expect(JSON.parse(chunks.join('')).actionPolicy.enqueueUrls).toBe(false);
    });
  });

  test('prints profile preflight mismatch without strict validation failure', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact({
      domainOverrides: { host: 'www.bbc.com' },
    }), async (artifactPath) => {
      const result = await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--json',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      });

      expect(result.ok).toBe(false);
      expect(result.artifact.artifactHosts).toEqual(['www.bbc.com']);
      expect(result.hostComparison.missingHosts).toEqual(['bbc.com']);
      expect(result.hostComparison.extraArtifactHosts).toEqual(['www.bbc.com']);
      expect(result.recommendedCommands.map(command => command.step)).toEqual([
        'profile-summary',
        'generate-bounded-artifact',
        'compare-profile-hosts',
      ]);
      expect(result.caveats.join(' ')).toContain('Artifact hosts do not exactly match');
    });
  });

  test('prints profile preflight caveat for hostless profiles', async () => {
    const result = await run([
      '--profile-preflight',
      '--profile', 'remote-status',
      '--json',
    ], {
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: jest.fn() },
    });

    expect(result.ok).toBe(false);
    expect(result.profile.profileName).toBe('remote-status');
    expect(result.plannedHosts).toEqual([]);
    expect(result.artifact).toBeNull();
    expect(result.caveats.join(' ')).toContain('No static host/domain fields found');
    expect(result.recommendedCommands.map(command => command.step)).toEqual(['profile-summary']);
  });

  test('writes bounded profile preflight reports to explicit output paths', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const writer = jest.fn(async () => {});

      const result = await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--out', 'tmp/preflight-report.json',
        '--json',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        writeJsonArtifact: writer,
        stdout: { write: jest.fn() },
      });

      expect(result.mode).toBe('profile-preflight');
      expect(writer).toHaveBeenCalledWith(
        'tmp/preflight-report.json',
        expect.stringContaining('"mode":"profile-preflight"'),
        expect.any(Object)
      );
    });
  });

  test('profile preflight validates explicit domains before artifact reads', async () => {
    const fs = { readFile: jest.fn() };

    await expect(run([
      '--profile-preflight',
      '--profile', 'simple-distributed-smoke',
      '--domains', 'www.bbc.com',
      '--from-artifact', 'tmp/graph-feedback-plan.json',
    ], {
      fs,
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: jest.fn() },
    })).rejects.toThrow('Requested --domains do not match --profile simple-distributed-smoke');

    expect(fs.readFile).not.toHaveBeenCalled();
  });

  test('builds profile preflight from an in-memory artifact', async () => {
    const report = await buildProfilePreflightReport({
      profilePlan: {
        profileName: 'simple-distributed-smoke',
        profileIdentifier: 'simple-distributed-smoke',
        tool: 'remote',
        positionals: ['bounded'],
        hosts: ['bbc.com'],
        hasStaticHosts: true,
        hostSources: [],
        caveats: [],
      },
      domains: ['bbc.com'],
      artifactPath: 'tmp/artifact.json',
      generatedAt: '2026-05-26T12:00:00.000Z',
      fs: {
        readFile: jest.fn(async () => JSON.stringify(makeGraphFeedbackArtifact())),
      },
    });

    expect(report.ok).toBe(true);
    expect(report.artifact.recommendationCount).toBe(1);
    expect(report.candidateCount).toBe(1);
    expect(report.artifact.evidence).toEqual(expect.objectContaining({
      byteSize: expect.any(Number),
      generatedAtValid: true,
      ageSeconds: 43200,
    }));
    expect(report.readiness).toEqual(expect.objectContaining({
      label: 'ready-for-preview',
      staticHostsPresent: true,
      artifactSupplied: true,
      exactHostMatch: true,
      candidateCount: 1,
    }));
    expect(report.recommendedCommands.some(command => command.step === 'preview-profile-planning')).toBe(true);
  });

  test('prints explicit text profile preflight without changing JSON default', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const textChunks = [];
      const textResult = await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--preflight-format', 'text',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: chunk => textChunks.push(chunk) },
      });

      expect(textResult.mode).toBe('profile-preflight');
      const text = textChunks.join('');
      expect(text).toContain('Graph feedback profile preflight (read-only)');
      expect(text).toContain('Readiness: ready-for-preview');
      expect(text).toContain('Artifact age: 12.0h');
      expect(text).toContain('Host match: ok');
      expect(text).toContain('Candidate count for matched hosts: 1');
      expect(text).toContain('Next safest command: node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact');
      expect(text).toContain('Actions: no URLs enqueued; no remote crawlers seeded; collect behavior unchanged.');

      const jsonChunks = [];
      await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: chunk => jsonChunks.push(chunk) },
      });
      expect(JSON.parse(jsonChunks.join('')).mode).toBe('profile-preflight');
    });
  });

  test('writes explicit text profile preflight reports', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const writer = jest.fn(async () => {});

      await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--preflight-format', 'text',
        '--out', 'tmp/preflight.txt',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        writeTextArtifact: writer,
        stdout: { write: jest.fn() },
      });

      expect(writer).toHaveBeenCalledWith(
        'tmp/preflight.txt',
        expect.stringContaining('Graph feedback profile preflight'),
        expect.any(Object)
      );
    });
  });

  test('prints file-only profile workflow checklist with markdown scan output', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const chunks = [];
      const liveBuilder = jest.fn();

      const result = await run([
        '--profile-workflow',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--workflow-format', 'markdown',
      ], {
        buildReadOnlyGraphFeedbackPlan: liveBuilder,
        stdout: { write: chunk => chunks.push(chunk) },
      });

      expect(liveBuilder).not.toHaveBeenCalled();
      expect(result.mode).toBe('profile-workflow-checklist');
      expect(result.profile.profileName).toBe('simple-distributed-smoke');
      expect(result.readiness.label).toBe('ready-for-preview');
      expect(result.artifact.evidence.ageSeconds).toBe(43200);
      expect(result.actionPolicy).toEqual({
        enqueueUrls: false,
        seedRemoteCrawlers: false,
        alterCollectBehavior: false,
      });
      expect(result.checklist.map(item => item.step)).toEqual([
        'profile-host-summary',
        'generate-bounded-artifact',
        'compare-profile-hosts',
        'validate-artifact',
        'profile-preflight-text',
        'compact-operator-report',
        'preview-profile-planning',
      ]);

      const markdown = chunks.join('');
      expect(markdown).toContain('# Graph Feedback Profile Workflow Checklist');
      expect(markdown).toContain('Readiness: ready-for-preview');
      expect(markdown).toContain('--profile-preflight --profile simple-distributed-smoke --from-artifact');
      expect(markdown).toContain('--operator-report --profile simple-distributed-smoke --from-artifact');
      expect(markdown).toContain('node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact');
      expect(markdown).toContain('Action policy: no URLs are enqueued');
      expect(markdown).not.toContain('https://bbc.com/news');
    });
  });

  test('writes profile workflow checklist reports to explicit output paths', async () => {
    const writer = jest.fn(async () => {});

    const result = await run([
      '--profile-workflow',
      '--profile', 'simple-distributed-smoke',
      '--out', 'tmp/profile-workflow.json',
      '--json',
    ], {
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      writeJsonArtifact: writer,
      stdout: { write: jest.fn() },
    });

    expect(result.readiness.label).toBe('needs-artifact');
    expect(writer).toHaveBeenCalledWith(
      'tmp/profile-workflow.json',
      expect.stringContaining('"mode":"profile-workflow-checklist"'),
      expect.any(Object)
    );
  });

  test('renders hostless profile workflow without guessed artifact commands', async () => {
    const checklist = await buildProfileWorkflowChecklist({
      profilePlan: {
        profileName: 'remote-status',
        profileIdentifier: 'remote-status',
        tool: 'remote',
        positionals: ['status'],
        hosts: [],
        hasStaticHosts: false,
        hostSources: [],
        caveats: ['No static host/domain fields found in profile JSON.'],
      },
      generatedAt: '2026-05-26T12:00:00.000Z',
    });
    const markdown = renderProfileWorkflowChecklistMarkdown(checklist);

    expect(checklist.readiness.label).toBe('hostless-caveat');
    expect(checklist.checklist.map(item => item.step)).toEqual([
      'profile-host-summary',
      'profile-preflight-text',
      'compact-operator-report',
    ]);
    expect(markdown).toContain('hostless');
    expect(markdown).not.toContain('--domains');
    expect(markdown.length).toBeLessThan(6000);
  });

  test('profile preflight and operator report warn on stale artifacts without rejecting', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact({
      generatedAt: '2026-05-01T00:00:00.000Z',
    }), async (artifactPath) => {
      const preflightChunks = [];
      const preflight = await run([
        '--profile-preflight',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--preflight-format', 'text',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: chunk => preflightChunks.push(chunk) },
      });

      expect(preflight.readiness.label).toBe('ready-for-preview');
      expect(preflight.caveats.join(' ')).toContain('older than 7 days');
      expect(preflightChunks.join('')).toContain('Artifact is older than 7 days');

      const report = await run([
        '--operator-report',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--format', 'markdown',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      });
      const markdown = renderOperatorReportMarkdown(report);

      expect(report.profiles[0].readiness.label).toBe('ready-for-preview');
      expect(report.caveats.join(' ')).toContain('older than 7 days');
      expect(markdown).toContain('Artifact is older than 7 days');
    });
  });

  test('adds artifact evidence and warnings for invalid or stale generatedAt values', async () => {
    const invalid = buildArtifactEvidence(makeGraphFeedbackArtifact({
      generatedAt: 'not-a-date',
    }), {
      byteSize: 123,
      referenceAt: '2026-05-26T12:00:00.000Z',
    });
    expect(invalid).toEqual(expect.objectContaining({
      byteSize: 123,
      maxBytes: MAX_ARTIFACT_BYTES,
      sizeOk: true,
      generatedAtValid: false,
      ageSeconds: null,
    }));
    expect(invalid.warnings.join(' ')).toContain('generatedAt is invalid');

    const missing = buildArtifactEvidence(makeGraphFeedbackArtifact({
      generatedAt: undefined,
    }), {
      byteSize: 10,
      referenceAt: '2026-05-26T12:00:00.000Z',
    });
    expect(missing.warnings.join(' ')).toContain('generatedAt is missing');

    const stale = buildArtifactEvidence(makeGraphFeedbackArtifact({
      generatedAt: '2026-05-01T00:00:00.000Z',
    }), {
      byteSize: 10,
      referenceAt: '2026-05-26T12:00:00.000Z',
    });
    expect(stale.generatedAtValid).toBe(true);
    expect(stale.warnings.join(' ')).toContain('older than 7 days');
  });

  test('rejects oversized artifacts before parsing', async () => {
    const oversized = `${' '.repeat(MAX_ARTIFACT_BYTES + 1)}{}`;

    await expect(readGraphFeedbackArtifactFile('tmp/too-large.json', {
      fs: { readFile: jest.fn(async () => oversized) },
    })).rejects.toThrow('max supported size');
  });

  test('prints bounded file-only operator report for common profiles', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const chunks = [];
      const liveBuilder = jest.fn();

      const result = await run([
        '--operator-report',
        '--all-common-profiles',
        '--from-artifact', artifactPath,
        '--generated-at', '2026-05-26T12:00:00.000Z',
        '--pretty',
      ], {
        buildReadOnlyGraphFeedbackPlan: liveBuilder,
        stdout: { write: chunk => chunks.push(chunk) },
      });

      expect(liveBuilder).not.toHaveBeenCalled();
      expect(result.mode).toBe('operator-report');
      expect(result.profileCount).toBeGreaterThanOrEqual(10);
      expect(result.actionPolicy).toEqual({
        enqueueUrls: false,
        seedRemoteCrawlers: false,
        alterCollectBehavior: false,
      });
      expect(result.artifact.artifactHosts).toEqual(['bbc.com']);
      expect(result.artifact.evidence).toEqual(expect.objectContaining({
        generatedAtValid: true,
        ageSeconds: 43200,
      }));
      expect(result.readinessSummary).toEqual(expect.objectContaining({
        requestedProfileCount: expect.any(Number),
        reportedProfileCount: result.profileCount,
        artifactSupplied: true,
        artifactSuppliedCount: result.profileCount,
        artifactMissingCount: 0,
        matchedCandidateCount: expect.any(Number),
      }));
      expect(result.readinessSummary.countsByLabel['ready-for-preview']).toBeGreaterThan(0);
      expect(result.readinessSummary.countsByLabel['host-mismatch']).toBeGreaterThan(0);
      expect(result.readinessSummary.countsByLabel['hostless-caveat']).toBeGreaterThan(0);
      const simple = result.profiles.find(item => item.profile.profileName === 'simple-distributed-smoke');
      expect(simple.candidateCount).toBe(1);
      expect(simple.readiness.label).toBe('ready-for-preview');
      expect(result.profiles.find(item => item.profile.profileName === 'remote-status').caveats.join(' '))
        .toContain('No static host/domain fields found');
      expect(result.profiles.find(item => item.profile.profileName === 'remote-status').readiness.label)
        .toBe('hostless-caveat');
      expect(result.profiles.find(item => item.profile.profileName === 'news-10x1000').caveats.join(' '))
        .toContain('may choose remote or local');
      expect(result.profiles.find(item => item.profile.profileName === 'news-10x1000-15m-e2e').caveats.join(' '))
        .toContain('preflight, crawl, drain');

      const output = chunks.join('');
      expect(output.length).toBeLessThan(50000);
      expect(JSON.parse(output).profiles).toHaveLength(result.profileCount);
    });
  });

  test('writes markdown operator reports to explicit output paths', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const chunks = [];
      const writer = jest.fn(async () => {});

      const result = await run([
        '--operator-report',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--format', 'markdown',
        '--out', 'tmp/graph-feedback-operator-report.md',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        writeTextArtifact: writer,
        stdout: { write: chunk => chunks.push(chunk) },
      });

      expect(result.mode).toBe('operator-report');
      expect(writer).toHaveBeenCalledWith(
        'tmp/graph-feedback-operator-report.md',
        expect.stringContaining('# Graph Feedback Operator Report'),
        expect.any(Object)
      );
      const markdown = chunks.join('');
      expect(markdown).toContain('### simple-distributed-smoke');
      expect(markdown).toContain('Action policy: no URLs are enqueued');
      expect(markdown).toContain('preview-profile-planning');
    });
  });

  test('compacts operator report profiles and safe commands when requested', async () => {
    await withTempArtifact(makeGraphFeedbackArtifact(), async (artifactPath) => {
      const chunks = [];

      const result = await run([
        '--operator-report',
        '--all-common-profiles',
        '--from-artifact', artifactPath,
        '--report-max-profiles', '2',
        '--report-commands', 'minimal',
        '--format', 'markdown',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: chunk => chunks.push(chunk) },
      });

      expect(result.profileCount).toBe(2);
      expect(result.profileSelection).toEqual({
        requestedCount: expect.any(Number),
        reportedCount: 2,
        maxProfiles: 2,
        truncated: true,
        omittedCount: expect.any(Number),
      });
      expect(result.reportCommands).toBe('minimal');
      expect(result.profiles.every(profile => profile.recommendedCommands.length <= 1)).toBe(true);
      expect(result.profiles[0].recommendedCommands[0].step).toBe('preview-profile-planning');
      expect(result.profiles[1].recommendedCommands[0].step).toBe('compare-profile-hosts');

      const markdown = chunks.join('');
      expect(markdown).toContain('Profile selection: 2/');
      expect(markdown).toContain('Command detail: minimal.');
      expect(markdown).toContain('Readiness labels: ready-for-preview');
      expect(markdown).toContain('## Readiness Summary');
      expect(markdown).toContain('- Labels:');
      expect(markdown.length).toBeLessThan(8000);
    });
  });

  test('can omit operator report safe commands explicitly', async () => {
    const result = await buildOperatorReport({
      profileNames: ['simple-distributed-smoke'],
      reportCommands: 'none',
      generatedAt: '2026-05-26T12:00:00.000Z',
    });
    const markdown = renderOperatorReportMarkdown(result);

    expect(result.reportCommands).toBe('none');
    expect(result.profiles[0].recommendedCommands).toEqual([]);
    expect(result.readinessSummary).toEqual(expect.objectContaining({
      requestedProfileCount: 1,
      reportedProfileCount: 1,
      artifactSupplied: false,
      artifactMissingCount: 1,
    }));
    expect(result.readinessSummary.countsByLabel['needs-artifact']).toBe(1);
    expect(markdown).toContain('Safe commands: (omitted by report command settings)');
  });

  test('builds operator report data and markdown without candidate dumps', async () => {
    const report = await buildOperatorReport({
      profileNames: ['simple-distributed-smoke'],
      artifactPath: 'tmp/artifact.json',
      generatedAt: '2026-05-26T12:00:00.000Z',
      fs: {
        readFile: jest.fn(async () => JSON.stringify(makeGraphFeedbackArtifact())),
      },
    });
    const markdown = renderOperatorReportMarkdown(report);

    expect(report.artifact.evidence).toEqual(expect.objectContaining({
      generatedAtValid: true,
      ageSeconds: 43200,
    }));
    expect(report.profiles[0].readiness).toEqual(expect.objectContaining({
      label: 'ready-for-preview',
      candidateCount: 1,
    }));
    expect(report.profiles[0].recommendedCommands.map(command => command.step)).toEqual([
      'profile-summary',
      'generate-bounded-artifact',
      'compare-profile-hosts',
      'validate-artifact',
      'preview-profile-planning',
    ]);
    expect(markdown).toContain('- Readiness: ready-for-preview');
    expect(markdown).toContain('- generatedAt valid: yes');
    expect(markdown).toContain('Candidate count for matched hosts: 1');
    expect(markdown).not.toContain('https://bbc.com/news');
  });

  test('computes profile readiness labels for missing artifacts and host mismatches', async () => {
    expect(buildProfileReadiness({
      profile: { hasStaticHosts: true, hosts: ['bbc.com'] },
      plannedHosts: ['bbc.com'],
      artifactSupplied: false,
      caveats: [],
    }).label).toBe('needs-artifact');

    await withTempArtifact(makeGraphFeedbackArtifact({
      domainOverrides: { host: 'www.bbc.com' },
    }), async (artifactPath) => {
      const result = await run([
        '--operator-report',
        '--profile', 'simple-distributed-smoke',
        '--from-artifact', artifactPath,
        '--json',
      ], {
        buildReadOnlyGraphFeedbackPlan: jest.fn(),
        stdout: { write: jest.fn() },
      });

      expect(result.profiles[0].readiness).toEqual(expect.objectContaining({
        label: 'host-mismatch',
        staticHostsPresent: true,
        artifactSupplied: true,
        exactHostMatch: false,
        candidateCount: 0,
      }));
    });

    const hostless = await run([
      '--operator-report',
      '--profile', 'remote-status',
      '--json',
    ], {
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: jest.fn() },
    });
    expect(hostless.profiles[0].readiness.label).toBe('hostless-caveat');
  });

  test('rejects invalid operator report flag combinations and missing values', async () => {
    await expect(run(['--operator-report'], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--operator-report requires --profile <name> or --all-common-profiles');

    await expect(run([
      '--operator-report',
      '--all-common-profiles',
      '--profile', 'simple-distributed-smoke',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('either --all-common-profiles or explicit --profile values');

    await expect(run([
      '--operator-report',
      '--all-common-profiles',
      '--domains', 'bbc.com',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('uses profile hosts only');

    expect(() => parseArgs(['--operator-report', '--out'])).toThrow('--out requires a value');
    expect(() => parseArgs(['--operator-report', '--from-artifact'])).toThrow('--from-artifact requires a value');
    expect(() => parseArgs(['--operator-report', '--report-commands', 'verbose'])).toThrow('Expected report commands full');
    expect(() => parseArgs(['--operator-report', '--report-max-profiles', '0'])).toThrow('positive integer');
    expect(() => parseReportFormat('html')).toThrow('Expected report format json or markdown');
    expect(() => parsePreflightFormat('markdown')).toThrow('Expected preflight format json or text');
    expect(() => parseWorkflowFormat('html')).toThrow('Expected workflow format json or markdown');

    await expect(run([
      '--operator-report',
      '--all-common-profiles',
      '--preflight-format',
      'text',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--preflight-format is only supported with --profile-preflight');

    await expect(run([
      '--operator-report',
      '--all-common-profiles',
      '--report-max-profiles',
      String(MAX_OPERATOR_REPORT_PROFILES + 1),
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow(`--report-max-profiles must be <= ${MAX_OPERATOR_REPORT_PROFILES}`);
  });

  test('rejects invalid profile workflow flag combinations', async () => {
    await expect(run(['--profile-workflow'], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--profile-workflow requires exactly one --profile');

    await expect(run([
      '--profile-workflow',
      '--profile', 'simple-distributed-smoke',
      '--profile', 'remote-bounded-smoke',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--profile-workflow requires exactly one --profile');

    await expect(run([
      '--profile-workflow',
      '--profile', 'simple-distributed-smoke',
      '--domains', 'bbc.com',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--profile-workflow uses profile hosts only');

    await expect(run([
      '--profile-workflow',
      '--profile', 'simple-distributed-smoke',
      '--operator-report',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--profile-workflow cannot be combined');

    await expect(run([
      '--profile-workflow',
      '--profile', 'simple-distributed-smoke',
      '--report-commands', 'minimal',
    ], {
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--profile-workflow does not accept operator-report options');
  });

  test('summarizes readiness aggregates from report profile rows', () => {
    const summary = buildOperatorReadinessSummary([
      {
        readiness: {
          label: 'ready-for-preview',
          staticHostsPresent: true,
          artifactSupplied: true,
          exactHostMatch: true,
          candidateCount: 2,
          caveatCount: 1,
        },
      },
      {
        readiness: {
          label: 'hostless-caveat',
          staticHostsPresent: false,
          artifactSupplied: false,
          exactHostMatch: false,
          candidateCount: 0,
          caveatCount: 2,
        },
      },
    ], {
      requestedProfileCount: 3,
      profileSelection: { omittedCount: 1 },
      artifactSupplied: true,
    });

    expect(summary).toEqual(expect.objectContaining({
      requestedProfileCount: 3,
      reportedProfileCount: 2,
      omittedProfileCount: 1,
      artifactSupplied: true,
      artifactSuppliedCount: 1,
      artifactMissingCount: 1,
      staticHostsPresentCount: 1,
      hostlessProfileCount: 1,
      exactHostMatchCount: 1,
      matchedCandidateCount: 2,
      caveatCount: 3,
    }));
    expect(summary.countsByLabel).toEqual(expect.objectContaining({
      'ready-for-preview': 1,
      'hostless-caveat': 1,
    }));
  });

  test('host comparison validates artifact schema without requiring host match', () => {
    expect(buildArtifactHostComparisonFromPlan(makeGraphFeedbackArtifact(), {
      domains: ['theguardian.com'],
      artifactPath: 'tmp/graph-feedback-plan.json',
      generatedAt: '2026-05-26T12:00:00.000Z',
    })).toEqual(expect.objectContaining({
      ok: false,
      artifactHosts: ['bbc.com'],
      missingHosts: ['theguardian.com'],
    }));

    expect(() => buildArtifactHostComparisonFromPlan({
      ...makeGraphFeedbackArtifact(),
      schemaVersion: 2,
    }, {
      domains: ['bbc.com'],
    })).toThrow('schemaVersion must be 1');
  });

  test('prints file-only artifact workflow recipe without opening the live graph builder', async () => {
    const chunks = [];
    const fs = {
      readFile: jest.fn(async () => JSON.stringify(makeGraphFeedbackArtifact())),
    };
    const liveBuilder = jest.fn();

    const result = await run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--domains', 'bbc.com',
      '--recipe',
      '--pretty',
    ], {
      fs,
      buildReadOnlyGraphFeedbackPlan: liveBuilder,
      stdout: { write: chunk => chunks.push(chunk) },
    });

    expect(liveBuilder).not.toHaveBeenCalled();
    expect(result.mode).toBe('operator-recipe');
    expect(result.hosts).toEqual(['bbc.com']);
    expect(result.actionPolicy).toEqual({
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    });
    expect(result.hostCaveat).toContain('Host matching is exact');
    expect(result.commands.map(item => item.step)).toEqual([
      'generate-bounded-artifact',
      'compare-hosts',
      'validate-artifact',
      'preview-local-planning',
      'preview-remote-planning',
    ]);
    expect(result.commands[1].command).toBe(
      'node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --compare-hosts --json'
    );
    expect(result.commands[2].command).toBe(
      'node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --json'
    );
    expect(result.commands[3].command).toBe(
      'node tools/crawl/run.js --explain --json --graph-feedback-artifact tmp/graph-feedback-plan.json bbc.com'
    );
    expect(result.commands[4].command).toBe(
      'node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json'
    );
    expect(JSON.parse(chunks.join('')).commands).toHaveLength(5);
  });

  test('builds recipe commands for multi-host artifacts with quoted paths', () => {
    const dryRun = buildArtifactPlanningDryRunFromPlan({
      ...makeGraphFeedbackArtifact(),
      domainCount: 2,
      recommendationCount: 2,
      domains: [
        makeGraphFeedbackArtifact().domains[0],
        {
          ...makeGraphFeedbackArtifact().domains[0],
          host: 'theguardian.com',
          recommendations: [{ url: 'https://theguardian.com/world' }],
          diagnostics: { orphanSamples: [], deadEndSamples: [] },
        },
      ],
    }, {
      artifactPath: 'tmp/graph feedback plan.json',
      domains: ['bbc.com', 'theguardian.com'],
      generatedAt: '2026-05-26T12:00:00.000Z',
    });

    const recipe = buildArtifactWorkflowRecipe(dryRun);

    expect(recipe.hosts).toEqual(['bbc.com', 'theguardian.com']);
    expect(recipe.commands[1].command).toContain("'tmp/graph feedback plan.json'");
    expect(recipe.commands[1].command).toContain('--domains bbc.com,theguardian.com');
    expect(recipe.commands[4].command).toContain('remote bounded --domains bbc.com,theguardian.com --dry-run');
  });

  test('rejects recipe output combined with artifact output writing', async () => {
    await expect(run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--domains', 'bbc.com',
      '--recipe',
      '--out', 'tmp/recipe.json',
    ], {
      fs: { readFile: jest.fn() },
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--recipe cannot be combined with --out');
  });

  test('resolves profile and explicit domains only when they agree exactly', () => {
    const profilePlan = {
      profileName: 'remote-bounded-smoke',
      hosts: ['bbc.com', 'reuters.com'],
      hasStaticHosts: true,
    };

    expect(resolveProfileAwareDomains(['reuters.com', 'BBC.com'], profilePlan))
      .toEqual(['bbc.com', 'reuters.com']);
    expect(() => resolveProfileAwareDomains(['bbc.com'], profilePlan))
      .toThrow('missingFromRequested=reuters.com');
  });

  test('rejects ambiguous host comparison flag combinations', async () => {
    await expect(run(['--compare-hosts', '--domains', 'bbc.com'], {
      buildReadOnlyGraphFeedbackPlan: jest.fn(),
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--compare-hosts requires --from-artifact');

    await expect(run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--compare-hosts',
    ], {
      fs: { readFile: jest.fn() },
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--compare-hosts requires --domain or --domains');

    await expect(run([
      '--from-artifact', 'tmp/graph-feedback-plan.json',
      '--domains', 'bbc.com',
      '--compare-hosts',
      '--recipe',
    ], {
      fs: { readFile: jest.fn() },
      stdout: { write: jest.fn() },
    })).rejects.toThrow('--compare-hosts cannot be combined with --recipe');
  });

  test('passes explicit fast mode to the read-only planner', async () => {
    const builder = jest.fn(async () => ({ ok: true }));

    await run(['--domains', 'bbc.com', '--mode', 'fast', '--json'], {
      buildReadOnlyGraphFeedbackPlan: builder,
      stdout: { write: jest.fn() },
    });

    expect(builder).toHaveBeenCalledWith(['bbc.com'], expect.objectContaining({
      plannerOptions: expect.objectContaining({ mode: 'fast' }),
    }));
  });

  test('writes explicit bounded JSON artifact without suppressing stdout', async () => {
    const chunks = [];
    const artifactWriter = jest.fn(async () => {});
    const builder = jest.fn(async () => ({
      schemaVersion: 1,
      recommendationCount: 1,
      domains: [{ host: 'bbc.com', recommendations: [{ url: 'https://bbc.com/a' }] }],
    }));

    await run(['--domains', 'bbc.com', '--out', 'tmp/graph-feedback-plan.json', '--json'], {
      buildReadOnlyGraphFeedbackPlan: builder,
      writeJsonArtifact: artifactWriter,
      stdout: { write: chunk => chunks.push(chunk) },
    });

    expect(artifactWriter).toHaveBeenCalledWith(
      'tmp/graph-feedback-plan.json',
      expect.stringContaining('"recommendationCount":1'),
      expect.any(Object)
    );
    expect(JSON.parse(chunks.join('')).domains[0].recommendations[0].url).toBe('https://bbc.com/a');
  });

  test('writeJsonArtifact creates parent directory and writes UTF-8 JSON', async () => {
    const fs = {
      mkdir: jest.fn(async () => {}),
      writeFile: jest.fn(async () => {}),
    };

    await expect(writeJsonArtifact('tmp/graph-feedback-plan.json', '{"ok":true}\n', {
      fs,
      path: require('path'),
    })).resolves.toBe('tmp/graph-feedback-plan.json');

    expect(fs.mkdir).toHaveBeenCalledWith('tmp', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith('tmp/graph-feedback-plan.json', '{"ok":true}\n', 'utf8');
  });

  test('writeTextArtifact creates parent directory and writes UTF-8 reports', async () => {
    const fs = {
      mkdir: jest.fn(async () => {}),
      writeFile: jest.fn(async () => {}),
    };

    await expect(writeTextArtifact('tmp/graph-feedback-report.md', '# report\n', {
      fs,
      path: require('path'),
    })).resolves.toBe('tmp/graph-feedback-report.md');

    expect(fs.mkdir).toHaveBeenCalledWith('tmp', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith('tmp/graph-feedback-report.md', '# report\n', 'utf8');
  });

  test('rejects blank artifact paths', async () => {
    await expect(writeJsonArtifact('', '{}\n', {
      fs: { mkdir: jest.fn(), writeFile: jest.fn() },
      path: require('path'),
    })).rejects.toThrow('Expected artifact output path');
  });

  test('validates artifact schemaVersion', () => {
    expect(() => validateGraphFeedbackArtifact({
      ...makeGraphFeedbackArtifact(),
      schemaVersion: 2,
    }, ['bbc.com'])).toThrow('schemaVersion must be 1');
  });

  test('validates requested hosts against artifact host list', () => {
    expect(() => validateGraphFeedbackArtifact(makeGraphFeedbackArtifact(), ['theguardian.com']))
      .toThrow('requested host(s) not present in artifact: theguardian.com');
  });

  test('validates artifact limits and per-host recommendation bounds', () => {
    const artifact = makeGraphFeedbackArtifact({
      limits: {
        perHostLimit: 1,
        sampleLimit: 1,
        maxPerHostLimit: 200,
        maxSampleLimit: 50,
      },
      domains: [{
        ...makeGraphFeedbackArtifact().domains[0],
        recommendations: [
          { url: 'https://bbc.com/a' },
          { url: 'https://bbc.com/b' },
        ],
      }],
    });

    expect(() => validateGraphFeedbackArtifact(artifact, ['bbc.com']))
      .toThrow('bbc.com.recommendations length 2 exceeds limits.perHostLimit 1');
  });

  test('validates artifact hard maximum limits', () => {
    const artifact = makeGraphFeedbackArtifact({
      limits: {
        perHostLimit: 201,
        sampleLimit: 51,
        maxPerHostLimit: 201,
        maxSampleLimit: 51,
      },
    });

    expect(() => validateGraphFeedbackArtifact(artifact, ['bbc.com']))
      .toThrow('limits.maxPerHostLimit must be <= 200');
  });

  test('validates aggregate recommendation count bounds', () => {
    const artifact = makeGraphFeedbackArtifact({
      recommendationCount: 99,
    });

    expect(() => validateGraphFeedbackArtifact(artifact, ['bbc.com']))
      .toThrow('recommendationCount 99 does not match recommendations length 1');
  });

  test('validates diagnostic sample bounds', () => {
    const artifact = makeGraphFeedbackArtifact({
      domains: [{
        ...makeGraphFeedbackArtifact().domains[0],
        diagnostics: {
          orphanSamples: [
            { url: 'https://bbc.com/a' },
            { url: 'https://bbc.com/b' },
          ],
          deadEndSamples: [],
        },
      }],
    });

    expect(() => validateGraphFeedbackArtifact(artifact, ['bbc.com']))
      .toThrow('bbc.com.diagnostics.orphanSamples length 2 exceeds limits.sampleLimit 1');
  });

  test('validates recommendation URL length bounds', () => {
    const tooLongUrl = `https://bbc.com/${'x'.repeat(MAX_ARTIFACT_URL_LENGTH)}`;
    const artifact = makeGraphFeedbackArtifact({
      domains: [{
        ...makeGraphFeedbackArtifact().domains[0],
        recommendations: [{ url: tooLongUrl }],
      }],
    });

    expect(() => validateGraphFeedbackArtifact(artifact, ['bbc.com']))
      .toThrow(`exceeds ${MAX_ARTIFACT_URL_LENGTH}`);
  });

  test('filters artifact dry-run to requested hosts after validation', () => {
    const artifact = makeGraphFeedbackArtifact({
      domainCount: 2,
      recommendationCount: 2,
      domains: [
        makeGraphFeedbackArtifact().domains[0],
        {
          ...makeGraphFeedbackArtifact().domains[0],
          host: 'theguardian.com',
          recommendations: [{ url: 'https://theguardian.com/world' }],
          diagnostics: { orphanSamples: [], deadEndSamples: [] },
        },
      ],
    });

    const dryRun = buildArtifactPlanningDryRunFromPlan(artifact, {
      artifactPath: 'tmp/graph-feedback-plan.json',
      domains: ['theguardian.com'],
      generatedAt: '2026-05-26T12:00:00.000Z',
    });

    expect(dryRun.domainCount).toBe(1);
    expect(dryRun.domains[0].host).toBe('theguardian.com');
    expect(dryRun.domains[0].candidates[0].url).toBe('https://theguardian.com/world');
    expect(dryRun.validation.artifactHosts).toEqual(['bbc.com', 'theguardian.com']);
  });
});
