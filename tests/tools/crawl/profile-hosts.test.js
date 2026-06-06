'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_PROFILE_DIR,
  buildProfileCompatibilitySummary,
  buildProfileHostPlanFromProfile,
  loadCrawlProfileHostPlan,
} = require('../../../tools/crawl/lib/profile-hosts');

describe('crawl profile host extraction', () => {
  async function withTempProfileDir(files, callback) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-profile-hosts-'));
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(tempDir, `${name}.json`), body);
    }
    try {
      return await callback(tempDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  test('extracts static hosts from a single-host remote profile', async () => {
    const profile = await loadCrawlProfileHostPlan('simple-distributed-smoke', {
      profileDir: DEFAULT_PROFILE_DIR,
    });

    expect(profile).toEqual(expect.objectContaining({
      profileName: 'simple-distributed-smoke',
      tool: 'remote',
      positionals: ['bounded'],
      hosts: ['bbc.com'],
      hasStaticHosts: true,
    }));
    expect(profile.hostSources).toEqual([
      { field: 'options.domains', rawValue: 'bbc.com', hosts: ['bbc.com'] },
    ]);
    expect(profile.caveats).toEqual([]);
  });

  test('extracts static hosts from a multi-host remote profile', async () => {
    const profile = await loadCrawlProfileHostPlan('remote-guardian-bbc-2new', {
      profileDir: DEFAULT_PROFILE_DIR,
    });

    expect(profile.tool).toBe('remote');
    expect(profile.positionals).toEqual(['collect']);
    expect(profile.hosts).toEqual(['theguardian.com', 'bbc.com']);
    expect(profile.hostSources[0].field).toBe('options.domains');
  });

  test('extracts safe static hosts from args and root host fields', () => {
    const profile = buildProfileHostPlanFromProfile({
      tool: 'remote',
      domain: 'BBC.com',
      args: ['bounded', '--domains', 'reuters.com,apnews.com', '--domain=npr.org'],
    }, {
      profileName: 'args-profile',
      profilePath: '/tmp/args-profile.json',
    });

    expect(profile.hosts).toEqual(['bbc.com', 'reuters.com', 'apnews.com', 'npr.org']);
    expect(profile.hostSources.map(source => source.field)).toEqual([
      'domain',
      'args.--domains',
      'args.--domain',
    ]);
  });

  test('reports a caveat for profiles without static hosts', async () => {
    const profile = await loadCrawlProfileHostPlan('remote-status', {
      profileDir: DEFAULT_PROFILE_DIR,
    });

    expect(profile.hosts).toEqual([]);
    expect(profile.hasStaticHosts).toBe(false);
    expect(profile.caveats[0]).toContain('No static host/domain fields found');
  });

  test('reports orchestrator, e2e, and local fallback caveats with static hosts', async () => {
    const orchestrator = await loadCrawlProfileHostPlan('news-10x1000', {
      profileDir: DEFAULT_PROFILE_DIR,
    });
    const e2e = await loadCrawlProfileHostPlan('news-10x1000-15m-e2e', {
      profileDir: DEFAULT_PROFILE_DIR,
    });
    const local = await loadCrawlProfileHostPlan('local-news-10x1000', {
      profileDir: DEFAULT_PROFILE_DIR,
    });

    expect(orchestrator.hosts).toContain('bbc.com');
    expect(orchestrator.caveats.join(' ')).toContain('may choose remote or local');
    expect(e2e.hosts).toContain('bbc.com');
    expect(e2e.caveats.join(' ')).toContain('preflight, crawl, drain');
    expect(local.hasStaticHosts).toBe(false);
    expect(local.caveats.join(' ')).toContain('Local batch profile');
  });

  test('rejects missing and malformed profile files clearly', async () => {
    await withTempProfileDir({
      malformed: '{',
      missingTool: JSON.stringify({ description: 'No tool.' }),
    }, async (tempDir) => {
      await expect(loadCrawlProfileHostPlan('does-not-exist', {
        profileDir: tempDir,
      })).rejects.toThrow('Profile not found');

      await expect(loadCrawlProfileHostPlan('malformed', {
        profileDir: tempDir,
      })).rejects.toThrow('Failed to parse profile JSON');

      await expect(loadCrawlProfileHostPlan('missingTool', {
        profileDir: tempDir,
      })).rejects.toThrow('Profile must include a string "tool" field');
    });
  });

  test('builds a compact compatibility summary for supplied profiles', async () => {
    const summary = await buildProfileCompatibilitySummary([
      'simple-distributed-smoke',
      'remote-bounded-smoke',
    ], {
      profileDir: DEFAULT_PROFILE_DIR,
    });

    expect(summary.mode).toBe('profile-compatibility-summary');
    expect(summary.profileCount).toBe(2);
    expect(summary.profiles.map(profile => profile.profileName)).toEqual([
      'simple-distributed-smoke',
      'remote-bounded-smoke',
    ]);
    expect(summary.profiles[1].hosts).toEqual(['bbc.com', 'reuters.com', 'apnews.com']);
    expect(summary.actionPolicy).toEqual({
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    });
  });

  test('default compatibility summary covers common profile classes', async () => {
    const summary = await buildProfileCompatibilitySummary(undefined, {
      profileDir: DEFAULT_PROFILE_DIR,
    });

    expect(summary.profiles.map(profile => profile.profileName)).toEqual(expect.arrayContaining([
      'simple-distributed-smoke',
      'remote-news-10x1000',
      'news-10x1000',
      'news-10x1000-15m-e2e',
      'news-10x1000-fast-visible',
      'remote-drain',
      'remote-status',
      'local-news-10x1000',
    ]));
    expect(summary.profiles.find(profile => profile.profileName === 'remote-status').hasStaticHosts).toBe(false);
    expect(summary.profiles.find(profile => profile.profileName === 'news-10x1000').caveats.join(' '))
      .toContain('or local execution');
  });
});
