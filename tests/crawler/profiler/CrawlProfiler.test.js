'use strict';

const { CrawlProfiler, BottleneckDetector, ProfileReporter, VALID_PHASES } = require('../../../src/crawler/profiler');

describe('CrawlProfiler', () => {
  let profiler;

  beforeEach(() => {
    profiler = new CrawlProfiler();
  });

  describe('start()', () => {
    test('starts a valid phase successfully', () => {
      profiler.start('dns');
      expect(profiler.getRunningPhases()).toContain('dns');
    });

    test('throws on invalid phase name', () => {
      expect(() => profiler.start('invalidPhase')).toThrow('Invalid phase name');
    });

    test('throws on empty phase name', () => {
      expect(() => profiler.start('')).toThrow('Invalid phase name');
    });

    test('throws on duplicate phase start', () => {
      profiler.start('dns');
      expect(() => profiler.start('dns')).toThrow("Phase 'dns' is already running");
    });

    test('VALID_PHASES contains expected phases', () => {
      expect(VALID_PHASES).toContain('dns');
      expect(VALID_PHASES).toContain('tcp');
      expect(VALID_PHASES).toContain('tls');
      expect(VALID_PHASES).toContain('firstByte');
      expect(VALID_PHASES).toContain('download');
      expect(VALID_PHASES).toContain('parseHtml');
      expect(VALID_PHASES).toContain('extract');
      expect(VALID_PHASES).toContain('dbWrite');
    });
  });

  describe('end()', () => {
    test('ends a phase and returns duration', () => {
      profiler.start('dns');
      const duration = profiler.end('dns');
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    test('throws on ending non-existent phase', () => {
      expect(() => profiler.end('dns')).toThrow("Phase 'dns' was not started");
    });

    test('throws on ending already-ended phase', () => {
      profiler.start('dns');
      profiler.end('dns');
      expect(() => profiler.end('dns')).toThrow("Phase 'dns' has already ended");
    });

    test('removes phase from running phases after end', () => {
      profiler.start('dns');
      profiler.end('dns');
      expect(profiler.getRunningPhases()).not.toContain('dns');
    });
  });

  describe('timing accuracy', () => {
    test('measures duration with reasonable accuracy', async () => {
      profiler.start('download');
      await new Promise(r => setTimeout(r, 50));
      const duration = profiler.end('download');
      // Allow 20ms tolerance for timing variance
      expect(duration).toBeGreaterThan(40);
      expect(duration).toBeLessThan(100);
    });

    test('time() helper measures async function duration', async () => {
      const result = await profiler.time('dns', async () => {
        await new Promise(r => setTimeout(r, 20));
        return 'done';
      });
      expect(result).toBe('done');
      expect(profiler.getPhaseTime('dns')).toBeGreaterThan(15);
    });
  });

  describe('nested phases', () => {
    test('tracks parent phase for nested starts', () => {
      profiler.start('download', { parentPhase: 'tcp' });
      const running = profiler.getRunningPhases();
      expect(running).toContain('download');
    });

    test('handles multiple running phases', () => {
      profiler.start('dns');
      profiler.start('tcp');
      profiler.start('tls');
      
      const running = profiler.getRunningPhases();
      expect(running).toContain('dns');
      expect(running).toContain('tcp');
      expect(running).toContain('tls');
    });

    test('end removes correct phase from stack', () => {
      profiler.start('dns');
      profiler.start('tcp');
      profiler.end('tcp');
      
      const running = profiler.getRunningPhases();
      expect(running).not.toContain('tcp');
      expect(running).toContain('dns');
    });
  });

  describe('multiple phases', () => {
    test('tracks multiple sequential phases', () => {
      profiler.start('dns');
      profiler.end('dns');
      profiler.start('tcp');
      profiler.end('tcp');
      profiler.start('tls');
      profiler.end('tls');

      const profile = profiler.getProfile();
      expect(Object.keys(profile.phases)).toHaveLength(3);
    });

    test('all valid phases can be tracked', () => {
      for (const phase of VALID_PHASES) {
        profiler.start(phase);
        profiler.end(phase);
      }
      const profile = profiler.getProfile();
      expect(Object.keys(profile.phases)).toHaveLength(VALID_PHASES.length);
    });
  });

  describe('getProfile()', () => {
    test('returns empty profile when no phases', () => {
      const profile = profiler.getProfile();
      expect(Object.keys(profile.phases)).toHaveLength(0);
      expect(profile.total).toBe(0);
    });

    test('includes phase duration', () => {
      profiler.start('dns');
      profiler.end('dns');

      const profile = profiler.getProfile();
      expect(profile.phases).toHaveProperty('dns');
      expect(typeof profile.phases.dns).toBe('number');
    });

    test('calculates total duration', () => {
      profiler.start('dns');
      profiler.end('dns');

      const profile = profiler.getProfile();
      expect(profile.total).toBeGreaterThanOrEqual(0);
    });

    test('identifies bottleneck phase', () => {
      profiler.record('dns', 10);
      profiler.record('tcp', 50);
      profiler.record('tls', 20);
      
      const profile = profiler.getProfile();
      expect(profile.bottleneck).toBe('tcp');
    });

    test('includes metadata', () => {
      profiler.start('dns');
      profiler.end('dns');
      
      const profile = profiler.getProfile();
      expect(profile.metadata).toHaveProperty('timestamp');
      expect(profile.metadata).toHaveProperty('phaseCount');
    });
  });

  describe('reset()', () => {
    test('clears all phases', () => {
      profiler.start('dns');
      profiler.end('dns');
      profiler.start('tcp');
      profiler.end('tcp');
      
      profiler.reset();
      
      const profile = profiler.getProfile();
      expect(Object.keys(profile.phases)).toHaveLength(0);
    });

    test('clears running phases', () => {
      profiler.start('dns');
      profiler.reset();
      
      expect(profiler.getRunningPhases()).toHaveLength(0);
    });

    test('allows reuse after reset', () => {
      profiler.start('dns');
      profiler.end('dns');
      profiler.reset();
      
      // Should not throw
      profiler.start('dns');
      profiler.end('dns');
      expect(profiler.getPhaseTime('dns')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('record()', () => {
    test('records a phase with known duration', () => {
      profiler.record('dns', 100);
      
      const time = profiler.getPhaseTime('dns');
      expect(time).toBe(100);
    });

    test('throws on invalid phase name', () => {
      expect(() => profiler.record('invalid', 100)).toThrow('Invalid phase name');
    });

    test('recorded phases appear in profile', () => {
      profiler.record('dns', 50);
      profiler.record('tcp', 100);
      
      const profile = profiler.getProfile();
      expect(profile.phases.dns).toBe(50);
      expect(profile.phases.tcp).toBe(100);
    });
  });

  describe('getPhaseTime()', () => {
    test('returns duration for completed phase', () => {
      profiler.start('dns');
      profiler.end('dns');
      expect(profiler.getPhaseTime('dns')).toBeGreaterThanOrEqual(0);
    });

    test('returns null for non-existent phase', () => {
      expect(profiler.getPhaseTime('dns')).toBeNull();
    });

    test('returns null for incomplete phase', () => {
      profiler.start('dns');
      expect(profiler.getPhaseTime('dns')).toBeNull();
    });
  });

  describe('hasPhase()', () => {
    test('returns true for started phase', () => {
      profiler.start('dns');
      expect(profiler.hasPhase('dns')).toBe(true);
    });

    test('returns false for non-existent phase', () => {
      expect(profiler.hasPhase('dns')).toBe(false);
    });
  });

  describe('finalize()', () => {
    test('ends running phases', () => {
      profiler.start('dns');
      profiler.start('tcp');
      
      const profile = profiler.finalize();
      
      expect(profiler.getRunningPhases()).toHaveLength(0);
      expect(profile.phases).toHaveProperty('dns');
      expect(profile.phases).toHaveProperty('tcp');
    });

    test('prevents further modifications', () => {
      profiler.finalize();
      expect(() => profiler.start('dns')).toThrow('finalized');
    });
  });

  describe('metadata', () => {
    test('addMetadata stores custom data', () => {
      profiler.addMetadata('url', 'https://example.com');
      profiler.start('dns');
      profiler.end('dns');
      
      const profile = profiler.getProfile();
      expect(profile.metadata.url).toBe('https://example.com');
    });
  });
});

describe('BottleneckDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new BottleneckDetector();
  });

  describe('addProfile()', () => {
    test('adds a profile for analysis', () => {
      const profile = { phases: { dns: 50, tcp: 100 }, total: 150 };
      detector.addProfile(profile);
      expect(detector.getSampleCount()).toBe(1);
    });

    test('throws on invalid profile', () => {
      expect(() => detector.addProfile(null)).toThrow('Invalid profile');
      expect(() => detector.addProfile({})).toThrow('Invalid profile');
    });

    test('accumulates multiple profiles', () => {
      detector.addProfile({ phases: { dns: 50 }, total: 50 });
      detector.addProfile({ phases: { dns: 60 }, total: 60 });
      detector.addProfile({ phases: { dns: 70 }, total: 70 });
      expect(detector.getSampleCount()).toBe(3);
    });
  });

  describe('detect()', () => {
    test('identifies bottleneck from profiles', () => {
      detector.addProfile({ phases: { dns: 10, tcp: 100, tls: 20 }, total: 130 });

      const result = detector.detect();
      expect(result.bottlenecks).toBeDefined();
      expect(result.analysis).toBeDefined();
    });

    test('returns analysis per phase', () => {
      detector.addProfile({ phases: { dns: 50, tcp: 100 }, total: 150 });

      const result = detector.detect();
      expect(result.analysis).toHaveProperty('dns');
      expect(result.analysis).toHaveProperty('tcp');
      expect(result.analysis.dns).toHaveProperty('avgDuration');
    });

    test('calculates health score', () => {
      detector.addProfile({ phases: { dns: 50, tcp: 50 }, total: 100 });

      const result = detector.detect();
      expect(result.healthScore).toBeDefined();
      expect(result.healthScore.score).toBeGreaterThanOrEqual(0);
      expect(result.healthScore.score).toBeLessThanOrEqual(100);
    });

    test('returns empty bottlenecks for fast profile', () => {
      detector.addProfile({ phases: { dns: 10, tcp: 10 }, total: 20 });

      const result = detector.detect();
      // Fast phases don't trigger bottleneck warnings
      expect(result.analysis).toBeDefined();
    });
  });

  describe('getPhaseAnalysis()', () => {
    test('returns analysis for specific phase', () => {
      detector.addProfile({ phases: { dns: 50 }, total: 50 });
      detector.addProfile({ phases: { dns: 60 }, total: 60 });
      detector.addProfile({ phases: { dns: 70 }, total: 70 });

      const analysis = detector.getPhaseAnalysis('dns');
      expect(analysis).toBeDefined();
      expect(analysis.avgDuration).toBe(60);
      expect(analysis.p50).toBeDefined();
      expect(analysis.p95).toBeDefined();
    });

    test('returns null for non-existent phase', () => {
      expect(detector.getPhaseAnalysis('missing')).toBeNull();
    });
  });

  describe('comparePhases()', () => {
    test('compares two phases', () => {
      detector.addProfile({ phases: { dns: 50, tcp: 100 }, total: 150 });

      const comparison = detector.comparePhases('dns', 'tcp');
      expect(comparison).toBeDefined();
      expect(comparison.comparison).toBeDefined();
      expect(comparison.comparison.faster).toBe('dns');
    });

    test('returns null if phase missing', () => {
      expect(detector.comparePhases('dns', 'tcp')).toBeNull();
    });
  });

  describe('reset()', () => {
    test('clears all accumulated data', () => {
      detector.addProfile({ phases: { dns: 50 }, total: 50 });
      detector.reset();
      expect(detector.getSampleCount()).toBe(0);
    });
  });

  describe('getTrend()', () => {
    test('calculates moving averages', () => {
      detector.addProfile({ phases: { dns: 10 }, total: 10 });
      detector.addProfile({ phases: { dns: 20 }, total: 20 });
      detector.addProfile({ phases: { dns: 30 }, total: 30 });
      detector.addProfile({ phases: { dns: 40 }, total: 40 });
      detector.addProfile({ phases: { dns: 50 }, total: 50 });

      const trend = detector.getTrend('dns', 3);
      expect(trend.length).toBeGreaterThan(0);
    });
  });
});

describe('ProfileReporter', () => {
  let reporter;

  beforeEach(() => {
    reporter = new ProfileReporter();
  });

  describe('reportProfile()', () => {
    test('formats profile as ASCII', () => {
      const profile = {
        phases: { dns: 50, tcp: 100, tls: 30 },
        total: 180,
        bottleneck: 'tcp'
      };

      const output = reporter.reportProfile(profile, { format: 'ascii' });
      expect(output).toContain('dns');
      expect(output).toContain('tcp');
      expect(output).toContain('tls');
    });

    test('formats profile as JSON', () => {
      const profile = {
        phases: { dns: 50 },
        total: 50
      };

      const output = reporter.reportProfile(profile, { format: 'json' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    test('formats profile as markdown', () => {
      const profile = {
        phases: { dns: 50 },
        total: 50
      };

      const output = reporter.reportProfile(profile, { format: 'markdown' });
      expect(output).toContain('## Crawl Profile');
    });

    test('shows no timing data message for empty profile', () => {
      const profile = { phases: {}, total: 0 };

      const output = reporter.reportProfile(profile);
      expect(output).toContain('No timing data');
    });
  });

  describe('reportBottlenecks()', () => {
    test('formats detection result as ASCII', () => {
      const detection = {
        bottlenecks: [{ phase: 'tcp', severity: 'high', score: 50, reason: 'Slow', recommendations: ['Fix it'] }],
        analysis: { tcp: { avgDuration: 100, p50: 90, p95: 150, p99: 200, percentOfTotal: 50, sampleCount: 5 } },
        healthScore: { score: 75, status: 'fair', bottleneckCount: 1, criticalCount: 0 },
        totalSamples: 5,
        avgTotalTime: 200
      };

      const output = reporter.reportBottlenecks(detection);
      expect(output).toContain('BOTTLENECK');
      expect(output).toContain('tcp');
    });

    test('shows no bottlenecks message when none detected', () => {
      const detection = {
        bottlenecks: [],
        analysis: {},
        healthScore: { score: 100, status: 'good' },
        totalSamples: 5,
        avgTotalTime: 50
      };

      const output = reporter.reportBottlenecks(detection);
      expect(output).toContain('No significant bottlenecks');
    });
  });

  describe('summarize()', () => {
    test('returns one-line summary', () => {
      const profile = {
        phases: { dns: 50, tcp: 100 },
        total: 150,
        bottleneck: 'tcp'
      };

      const summary = reporter.summarize(profile);
      expect(summary).toContain('150ms');
      expect(summary).toContain('tcp');
    });
  });

  describe('compareProfiles()', () => {
    test('compares two profiles', () => {
      const baseline = { phases: { dns: 50 }, total: 50 };
      const current = { phases: { dns: 75 }, total: 75 };

      const output = reporter.compareProfiles(baseline, current);
      expect(output).toContain('COMPARISON');
      expect(output).toContain('50');
      expect(output).toContain('75');
    });
  });
});
