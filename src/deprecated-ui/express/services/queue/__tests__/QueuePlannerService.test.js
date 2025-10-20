const { QueuePlannerService } = require('../QueuePlannerService');

describe('QueuePlannerService', () => {
  let service;
  let mockExtractDomain;

  beforeEach(() => {
    mockExtractDomain = jest.fn((url) => {
      if (!url) return null;
      try {
        const parsed = new URL(url);
        return parsed.hostname;
      } catch {
        return null;
      }
    });

    service = new QueuePlannerService({
      extractDomain: mockExtractDomain
    });
  });

  describe('constructor', () => {
    test('should require extractDomain dependency', () => {
      expect(() => new QueuePlannerService()).toThrow('requires extractDomain function');
      expect(() => new QueuePlannerService({})).toThrow('requires extractDomain function');
      expect(() => new QueuePlannerService({ extractDomain: 'not-a-function' })).toThrow('requires extractDomain function');
    });

    test('should accept valid extractDomain function', () => {
      const fn = () => 'example.com';
      expect(() => new QueuePlannerService({ extractDomain: fn })).not.toThrow();
    });
  });

  describe('normalizeQueueRow', () => {
    test('should return null for null/undefined input', () => {
      expect(service.normalizeQueueRow(null)).toBeNull();
      expect(service.normalizeQueueRow(undefined)).toBeNull();
    });

    test('should normalize basic queue row', () => {
      const row = {
        id: 123,
        url: 'https://example.com',
        args: '["--db=news.db"]',
        status: 'incomplete'
      };

      const result = service.normalizeQueueRow(row);

      expect(result).toEqual({
        id: 123,
        url: 'https://example.com',
        args: '["--db=news.db"]',
        status: 'incomplete',
        startedAt: null,
        startedAtIso: null
      });
    });

    test('should handle numeric started_at timestamp', () => {
      const timestamp = 1696723200000; // Oct 8, 2023
      const row = {
        id: 456,
        url: 'https://example.com',
        started_at: timestamp
      };

      const result = service.normalizeQueueRow(row);

      expect(result.startedAt).toBe(timestamp);
      expect(result.startedAtIso).toBe('2023-10-08T00:00:00.000Z');
    });

    test('should handle ISO 8601 started_at string', () => {
      const isoString = '2024-10-07T12:00:00.000Z';
      const row = {
        id: 789,
        url: 'https://example.com',
        started_at: isoString
      };

      const result = service.normalizeQueueRow(row);

      expect(result.startedAt).toBeNull();
      expect(result.startedAtIso).toBe(isoString);
    });

    test('should handle camelCase startedAt property', () => {
      const timestamp = 1696723200000;
      const row = {
        id: 111,
        url: 'https://example.com',
        startedAt: timestamp
      };

      const result = service.normalizeQueueRow(row);

      expect(result.startedAt).toBe(timestamp);
      expect(result.startedAtIso).toBe('2023-10-08T00:00:00.000Z');
    });

    test('should prioritize started_at over startedAt', () => {
      const row = {
        id: 222,
        url: 'https://example.com',
        started_at: 1000000,
        startedAt: 2000000
      };

      const result = service.normalizeQueueRow(row);

      expect(result.startedAt).toBe(1000000);
    });

    test('should handle invalid timestamps gracefully', () => {
      const row = {
        id: 333,
        url: 'https://example.com',
        started_at: 'invalid'
      };

      const result = service.normalizeQueueRow(row);

      expect(result.startedAt).toBeNull();
      expect(result.startedAtIso).toBeNull();
    });

    test('should handle missing URL gracefully', () => {
      const row = {
        id: 444,
        status: 'incomplete'
      };

      const result = service.normalizeQueueRow(row);

      expect(result.url).toBeNull();
    });
  });

  describe('computeResumeInputs', () => {
    test('should detect valid URL', () => {
      const queue = {
        url: 'https://example.com',
        args: null
      };

      const result = service.computeResumeInputs(queue);

      expect(result).toEqual({
        args: [],
        hasArgs: false,
        hasUrl: true,
        argsError: null
      });
    });

    test('should detect valid args array', () => {
      const queue = {
        url: null,
        args: '["--db=news.db", "--max-pages=100"]'
      };

      const result = service.computeResumeInputs(queue);

      expect(result).toEqual({
        args: ['--db=news.db', '--max-pages=100'],
        hasArgs: true,
        hasUrl: false,
        argsError: null
      });
    });

    test('should detect both URL and args', () => {
      const queue = {
        url: 'https://example.com',
        args: '["--db=news.db"]'
      };

      const result = service.computeResumeInputs(queue);

      expect(result.hasUrl).toBe(true);
      expect(result.hasArgs).toBe(true);
      expect(result.args).toEqual(['--db=news.db']);
    });

    test('should reject empty URL', () => {
      const queue = {
        url: '',
        args: null
      };

      const result = service.computeResumeInputs(queue);

      expect(result.hasUrl).toBe(false);
    });

    test('should reject whitespace-only URL', () => {
      const queue = {
        url: '   ',
        args: null
      };

      const result = service.computeResumeInputs(queue);

      expect(result.hasUrl).toBe(false);
    });

    test('should handle args parse error', () => {
      const queue = {
        url: null,
        args: 'invalid-json'
      };

      const result = service.computeResumeInputs(queue);

      expect(result.hasArgs).toBe(false);
      expect(result.argsError).toBe('parse-error');
    });

    test('should handle args not-array error', () => {
      const queue = {
        url: null,
        args: '{"key": "value"}'
      };

      const result = service.computeResumeInputs(queue);

      expect(result.hasArgs).toBe(false);
      expect(result.argsError).toBe('not-array');
    });

    test('should convert non-string args to strings', () => {
      const queue = {
        url: null,
        args: '[123, true, null, "text"]'
      };

      const result = service.computeResumeInputs(queue);

      expect(result.args).toEqual(['123', 'true', 'null', 'text']);
      expect(result.hasArgs).toBe(true);
    });

    test('should handle null queue gracefully', () => {
      const result = service.computeResumeInputs(null);

      expect(result.hasUrl).toBe(false);
      expect(result.hasArgs).toBe(false);
    });
  });

  describe('planResumeQueues', () => {
    test('should select queues when slots available', () => {
      const queues = [
        { id: 1, url: 'https://example.com', status: 'incomplete' },
        { id: 2, url: 'https://test.com', status: 'incomplete' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(2);
      expect(result.selected[0].queue.id).toBe(1);
      expect(result.selected[1].queue.id).toBe(2);
      expect(result.processed).toHaveLength(2);
    });

    test('should respect capacity limits', () => {
      const queues = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'https://test.com' },
        { id: 3, url: 'https://demo.com' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(2);
      const thirdEntry = result.processed[2];
      expect(thirdEntry.state).toBe('queued');
      expect(thirdEntry.reasons).toContain('capacity-exceeded');
    });

    test('should block already-running jobs', () => {
      const queues = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'https://test.com' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set([1]),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(1);
      expect(result.selected[0].queue.id).toBe(2);

      const firstEntry = result.processed[0];
      expect(firstEntry.state).toBe('blocked');
      expect(firstEntry.reasons).toContain('already-running');
    });

    test('should block queues with domain conflicts', () => {
      const queues = [
        { id: 1, url: 'https://example.com/page1' },
        { id: 2, url: 'https://example.com/page2' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set(['example.com'])
      });

      expect(result.selected).toHaveLength(0);

      expect(result.processed[0].state).toBe('blocked');
      expect(result.processed[0].reasons).toContain('domain-conflict');
      expect(result.processed[1].state).toBe('blocked');
      expect(result.processed[1].reasons).toContain('domain-conflict');
    });

    test('should prevent domain conflicts within selection', () => {
      const queues = [
        { id: 1, url: 'https://example.com/page1' },
        { id: 2, url: 'https://example.com/page2' },
        { id: 3, url: 'https://test.com' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 3,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(2);
      expect(result.selected[0].queue.id).toBe(1);
      expect(result.selected[1].queue.id).toBe(3);

      const secondEntry = result.processed[1];
      expect(secondEntry.state).toBe('blocked');
      expect(secondEntry.reasons).toContain('domain-conflict');
    });

    test('should block queues with missing source', () => {
      const queues = [
        { id: 1, url: null, args: null },
        { id: 2, url: '', args: null }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(0);
      expect(result.processed[0].state).toBe('blocked');
      expect(result.processed[0].reasons).toContain('missing-source');
      expect(result.processed[1].state).toBe('blocked');
      expect(result.processed[1].reasons).toContain('missing-source');
    });

    test('should handle queues with args instead of URL', () => {
      const queues = [
        { id: 1, url: null, args: '["--db=news.db", "https://example.com"]' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 1,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(1);
      expect(result.selected[0].resumeInputs.hasArgs).toBe(true);
    });

    test('should skip invalid queue rows', () => {
      const queues = [
        { id: null, url: 'https://example.com' },
        { id: 2, url: 'https://test.com' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(1);
      expect(result.processed).toHaveLength(1);
      expect(result.selected[0].queue.id).toBe(2);
    });

    test('should return info map keyed by queue ID', () => {
      const queues = [
        { id: 123, url: 'https://example.com' },
        { id: 456, url: 'https://test.com' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.info.size).toBe(2);
      expect(result.info.has(123)).toBe(true);
      expect(result.info.has(456)).toBe(true);
      expect(result.info.get(123).queue.id).toBe(123);
    });

    test('should handle empty queue array', () => {
      const result = service.planResumeQueues({
        queues: [],
        availableSlots: 5,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(0);
      expect(result.processed).toHaveLength(0);
      expect(result.info.size).toBe(0);
    });

    test('should handle zero available slots', () => {
      const queues = [
        { id: 1, url: 'https://example.com' }
      ];

      const result = service.planResumeQueues({
        queues,
        availableSlots: 0,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });

      expect(result.selected).toHaveLength(0);
      expect(result.processed[0].state).toBe('queued');
      expect(result.processed[0].reasons).toContain('capacity-exceeded');
    });

    test('should use defaults when options omitted', () => {
      const queues = [
        { id: 1, url: 'https://example.com' }
      ];

      const result = service.planResumeQueues({ queues });

      expect(result.selected).toHaveLength(0);
      expect(result.processed[0].state).toBe('queued');
    });
  });

  describe('collectRunningContext', () => {
    test('should collect running job IDs and domains', () => {
      const mockJobRegistry = {
        getJobs: jest.fn().mockReturnValue([
          [1, { id: 1, url: 'https://example.com' }],
          [2, { id: 2, url: 'https://test.com' }]
        ])
      };

      const result = service.collectRunningContext(mockJobRegistry);

      expect(result.runningJobIds).toEqual(new Set([1, 2]));
      expect(result.runningDomains).toEqual(new Set(['example.com', 'test.com']));
      expect(mockJobRegistry.getJobs).toHaveBeenCalledTimes(1);
    });

    test('should handle jobs without URLs', () => {
      const mockJobRegistry = {
        getJobs: jest.fn().mockReturnValue([
          [1, { id: 1, url: 'https://example.com' }],
          [2, { id: 2, url: null }]
        ])
      };

      const result = service.collectRunningContext(mockJobRegistry);

      expect(result.runningJobIds).toEqual(new Set([1, 2]));
      expect(result.runningDomains).toEqual(new Set(['example.com']));
    });

    test('should handle null jobRegistry', () => {
      const result = service.collectRunningContext(null);

      expect(result.runningJobIds).toEqual(new Set());
      expect(result.runningDomains).toEqual(new Set());
    });

    test('should handle jobRegistry without getJobs method', () => {
      const mockJobRegistry = {};

      const result = service.collectRunningContext(mockJobRegistry);

      expect(result.runningJobIds).toEqual(new Set());
      expect(result.runningDomains).toEqual(new Set());
    });

    test('should handle empty job registry', () => {
      const mockJobRegistry = {
        getJobs: jest.fn().mockReturnValue([])
      };

      const result = service.collectRunningContext(mockJobRegistry);

      expect(result.runningJobIds).toEqual(new Set());
      expect(result.runningDomains).toEqual(new Set());
    });
  });

  describe('buildQueueSummary', () => {
    test('should build comprehensive queue summary', () => {
      const plan = {
        selected: [
          {
            queue: { id: 1, url: 'https://example.com', status: 'incomplete', startedAt: 1000000, startedAtIso: '2023-01-01T00:00:00.000Z' },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false, argsError: null },
            state: 'selected',
            reasons: []
          }
        ],
        processed: [
          {
            queue: { id: 1, url: 'https://example.com', status: 'incomplete', startedAt: 1000000, startedAtIso: '2023-01-01T00:00:00.000Z' },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false, argsError: null },
            state: 'selected',
            reasons: []
          },
          {
            queue: { id: 2, url: 'https://example.com/other', status: 'incomplete', startedAt: 2000000, startedAtIso: '2023-01-01T00:00:02.000Z' },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false, argsError: null },
            state: 'blocked',
            reasons: ['domain-conflict']
          }
        ]
      };

      const now = 5000000;
      const result = service.buildQueueSummary(plan, { now });

      expect(result.queues).toHaveLength(2);
      expect(result.recommendedIds).toEqual([1]);
      expect(result.blockedDomains).toEqual(['example.com']);

      const firstQueue = result.queues[0];
      expect(firstQueue.id).toBe(1);
      expect(firstQueue.url).toBe('https://example.com');
      expect(firstQueue.state).toBe('selected');
      expect(firstQueue.ageMs).toBe(4000000);
    });

    test('should use current time when now not provided', () => {
      const plan = {
        selected: [],
        processed: [
          {
            queue: { id: 1, url: 'https://example.com', status: 'incomplete', startedAt: Date.now() - 10000 },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false, argsError: null },
            state: 'blocked',
            reasons: []
          }
        ]
      };

      const result = service.buildQueueSummary(plan);

      expect(result.queues[0].ageMs).toBeGreaterThanOrEqual(10000);
      expect(result.queues[0].ageMs).toBeLessThan(15000);
    });

    test('should handle queues without timestamps', () => {
      const plan = {
        selected: [],
        processed: [
          {
            queue: { id: 1, url: 'https://example.com', status: 'incomplete', startedAt: null, startedAtIso: null },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false, argsError: null },
            state: 'selected',
            reasons: []
          }
        ]
      };

      const result = service.buildQueueSummary(plan);

      expect(result.queues[0].startedAt).toBeNull();
      expect(result.queues[0].startedAtMs).toBeNull();
      expect(result.queues[0].ageMs).toBeNull();
    });

    test('should include resume input validation status', () => {
      const plan = {
        selected: [],
        processed: [
          {
            queue: { id: 1, url: null, status: 'incomplete' },
            domain: null,
            resumeInputs: { hasUrl: false, hasArgs: true, argsError: null },
            state: 'selected',
            reasons: []
          },
          {
            queue: { id: 2, url: null, status: 'incomplete' },
            domain: null,
            resumeInputs: { hasUrl: false, hasArgs: false, argsError: 'parse-error' },
            state: 'blocked',
            reasons: ['missing-source']
          }
        ]
      };

      const result = service.buildQueueSummary(plan);

      expect(result.queues[0].hasArgs).toBe(true);
      expect(result.queues[0].hasUrl).toBe(false);
      expect(result.queues[0].argsError).toBeNull();

      expect(result.queues[1].hasArgs).toBe(false);
      expect(result.queues[1].hasUrl).toBe(false);
      expect(result.queues[1].argsError).toBe('parse-error');
    });

    test('should extract unique blocked domains', () => {
      const plan = {
        selected: [],
        processed: [
          {
            queue: { id: 1 },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false },
            state: 'blocked',
            reasons: ['domain-conflict']
          },
          {
            queue: { id: 2 },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false },
            state: 'blocked',
            reasons: ['domain-conflict']
          },
          {
            queue: { id: 3 },
            domain: 'test.com',
            resumeInputs: { hasUrl: true, hasArgs: false },
            state: 'blocked',
            reasons: ['domain-conflict']
          }
        ]
      };

      const result = service.buildQueueSummary(plan);

      expect(result.blockedDomains).toHaveLength(2);
      expect(result.blockedDomains).toContain('example.com');
      expect(result.blockedDomains).toContain('test.com');
    });

    test('should not include domains blocked for other reasons', () => {
      const plan = {
        selected: [],
        processed: [
          {
            queue: { id: 1 },
            domain: 'example.com',
            resumeInputs: { hasUrl: true, hasArgs: false },
            state: 'blocked',
            reasons: ['already-running']
          }
        ]
      };

      const result = service.buildQueueSummary(plan);

      expect(result.blockedDomains).toHaveLength(0);
    });
  });
});
