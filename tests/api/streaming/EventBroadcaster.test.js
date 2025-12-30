'use strict';

/**
 * Tests for EventBroadcaster
 */

const {
  EventBroadcaster,
  getBroadcaster,
  resetBroadcaster,
  EVENT_TYPES,
  ALL_EVENT_TYPES
} = require('../../../src/api/streaming/EventBroadcaster');

describe('EventBroadcaster', () => {
  let broadcaster;

  beforeEach(() => {
    resetBroadcaster();
    broadcaster = new EventBroadcaster({ historyLimit: 10 });
  });

  afterEach(() => {
    broadcaster.removeAllListeners();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const b = new EventBroadcaster();
      expect(b.historyLimit).toBe(100);
      expect(b.rateLimitPerSecond).toBe(50);
      expect(b.eventHistory).toEqual([]);
    });

    it('should accept custom options', () => {
      const b = new EventBroadcaster({
        historyLimit: 50,
        rateLimitPerSecond: 20
      });
      expect(b.historyLimit).toBe(50);
      expect(b.rateLimitPerSecond).toBe(20);
    });
  });

  describe('emitEvent', () => {
    it('should emit event with timestamp', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e));

      broadcaster.emitEvent('article:new', { id: 1, title: 'Test' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('article:new');
      expect(events[0].payload).toEqual({ id: 1, title: 'Test' });
      expect(events[0].timestamp).toBeDefined();
    });

    it('should extract domain from host', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e));

      broadcaster.emitEvent('article:new', { host: 'example.com' });

      expect(events[0].domain).toBe('example.com');
    });

    it('should extract domain from url', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e));

      broadcaster.emitEvent('article:new', { url: 'https://news.example.com/article' });

      expect(events[0].domain).toBe('news.example.com');
    });

    it('should add event to history', () => {
      broadcaster.emitEvent('article:new', { id: 1 });
      broadcaster.emitEvent('article:new', { id: 2 });

      const history = broadcaster.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should limit history size', () => {
      for (let i = 0; i < 15; i++) {
        broadcaster.emitEvent('article:new', { id: i });
      }

      const history = broadcaster.getHistory();
      expect(history).toHaveLength(10);
      expect(history[0].payload.id).toBe(5); // First 5 were dropped
    });

    it('should update stats', () => {
      broadcaster.emitEvent('article:new', { id: 1 });
      broadcaster.emitEvent('crawl:started', { url: 'http://test.com' });

      const stats = broadcaster.getStats();
      expect(stats.totalEmitted).toBe(2);
      expect(stats.byType['article:new']).toBe(1);
      expect(stats.byType['crawl:started']).toBe(1);
    });

    it('should return false for invalid event type', () => {
      expect(broadcaster.emitEvent(null, {})).toBe(false);
      expect(broadcaster.emitEvent('', {})).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should subscribe and receive events', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e));

      broadcaster.emitEvent('article:new', { id: 1 });
      broadcaster.emitEvent('crawl:started', {});

      expect(events).toHaveLength(2);
    });

    it('should filter by event type', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e), {
        types: ['article:new']
      });

      broadcaster.emitEvent('article:new', { id: 1 });
      broadcaster.emitEvent('crawl:started', {});
      broadcaster.emitEvent('article:new', { id: 2 });

      expect(events).toHaveLength(2);
      expect(events.every(e => e.type === 'article:new')).toBe(true);
    });

    it('should filter by domain', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e), {
        domains: ['example.com']
      });

      broadcaster.emitEvent('article:new', { host: 'example.com', id: 1 });
      broadcaster.emitEvent('article:new', { host: 'other.org', id: 2 });
      broadcaster.emitEvent('article:new', { host: 'sub.example.com', id: 3 });

      expect(events).toHaveLength(2);
      expect(events[0].payload.id).toBe(1);
      expect(events[1].payload.id).toBe(3);
    });

    it('should filter by both type and domain', () => {
      const events = [];
      broadcaster.subscribe((e) => events.push(e), {
        types: ['article:new'],
        domains: ['example.com']
      });

      broadcaster.emitEvent('article:new', { host: 'example.com', id: 1 });
      broadcaster.emitEvent('crawl:started', { host: 'example.com' });
      broadcaster.emitEvent('article:new', { host: 'other.org', id: 2 });

      expect(events).toHaveLength(1);
      expect(events[0].payload.id).toBe(1);
    });

    it('should return subscription with unsubscribe', () => {
      const events = [];
      const sub = broadcaster.subscribe((e) => events.push(e));

      broadcaster.emitEvent('article:new', { id: 1 });
      sub.unsubscribe();
      broadcaster.emitEvent('article:new', { id: 2 });

      expect(events).toHaveLength(1);
    });

    it('should track subscriber count', () => {
      expect(broadcaster.getStats().subscriberCount).toBe(0);

      const sub1 = broadcaster.subscribe(() => {});
      expect(broadcaster.getStats().subscriberCount).toBe(1);

      const sub2 = broadcaster.subscribe(() => {});
      expect(broadcaster.getStats().subscriberCount).toBe(2);

      sub1.unsubscribe();
      expect(broadcaster.getStats().subscriberCount).toBe(1);

      sub2.unsubscribe();
      expect(broadcaster.getStats().subscriberCount).toBe(0);
    });

    it('should catch handler errors', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      broadcaster.subscribe(() => {
        throw new Error('Handler error');
      });

      expect(() => broadcaster.emitEvent('article:new', {})).not.toThrow();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should throw for non-function handler', () => {
      expect(() => broadcaster.subscribe('not a function')).toThrow();
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      broadcaster.emitEvent('article:new', { host: 'a.com', id: 1 });
      broadcaster.emitEvent('crawl:started', { host: 'b.com', id: 2 });
      broadcaster.emitEvent('article:new', { host: 'a.com', id: 3 });
      broadcaster.emitEvent('article:updated', { host: 'c.com', id: 4 });
    });

    it('should return all history', () => {
      expect(broadcaster.getHistory()).toHaveLength(4);
    });

    it('should limit results', () => {
      const history = broadcaster.getHistory({ limit: 2 });
      expect(history).toHaveLength(2);
      expect(history[0].payload.id).toBe(3); // Last 2
      expect(history[1].payload.id).toBe(4);
    });

    it('should filter by types', () => {
      const history = broadcaster.getHistory({ types: ['article:new'] });
      expect(history).toHaveLength(2);
      expect(history.every(e => e.type === 'article:new')).toBe(true);
    });

    it('should filter by domains', () => {
      const history = broadcaster.getHistory({ domains: ['a.com'] });
      expect(history).toHaveLength(2);
    });
  });

  describe('rate limiting', () => {
    it('should rate limit excessive events', () => {
      const b = new EventBroadcaster({ rateLimitPerSecond: 5 });
      let emitted = 0;

      for (let i = 0; i < 10; i++) {
        if (b.emitEvent('article:new', { id: i })) {
          emitted++;
        }
      }

      expect(emitted).toBe(5);
      expect(b.getStats().totalDropped).toBe(5);

      b.removeAllListeners();
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const b1 = getBroadcaster();
      const b2 = getBroadcaster();
      expect(b1).toBe(b2);
    });

    it('should reset singleton', () => {
      const b1 = getBroadcaster();
      resetBroadcaster();
      const b2 = getBroadcaster();
      expect(b1).not.toBe(b2);
    });
  });

  describe('EVENT_TYPES', () => {
    it('should export all event types', () => {
      expect(EVENT_TYPES.CRAWL_STARTED).toBe('crawl:started');
      expect(EVENT_TYPES.ARTICLE_NEW).toBe('article:new');
      expect(ALL_EVENT_TYPES).toContain('crawl:started');
      expect(ALL_EVENT_TYPES).toContain('article:new');
    });
  });
});
