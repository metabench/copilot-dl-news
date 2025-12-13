'use strict';

const { 
  createDecisionTraceEmitter,
  createNoOpTraceEmitter,
  normalizeDecisionTrace,
  DECISION_KINDS,
  MAX_DETAILS_SIZE_BYTES
} = require('../../src/crawler/decisionTraceHelper');

describe('decisionTraceHelper', () => {
  describe('normalizeDecisionTrace', () => {
    it('should require an object', () => {
      expect(() => normalizeDecisionTrace(null)).toThrow('must be an object');
      expect(() => normalizeDecisionTrace('string')).toThrow('must be an object');
    });
    
    it('should require a kind', () => {
      expect(() => normalizeDecisionTrace({})).toThrow('must have a string "kind"');
      expect(() => normalizeDecisionTrace({ kind: 123 })).toThrow('must have a string "kind"');
    });
    
    it('should normalize a valid trace', () => {
      const trace = normalizeDecisionTrace({
        kind: 'test-decision',
        message: 'Test message',
        details: { foo: 'bar' }
      });
      
      expect(trace.kind).toBe('test-decision');
      expect(trace.message).toBe('Test message');
      expect(trace.details.foo).toBe('bar');
      expect(trace.details.tracedAt).toBeDefined();
      expect(trace.persist).toBe(false);
    });
    
    it('should preserve persist flag', () => {
      const trace = normalizeDecisionTrace({
        kind: 'test',
        persist: true
      });
      expect(trace.persist).toBe(true);
    });
    
    it('should add source to details', () => {
      const trace = normalizeDecisionTrace({
        kind: 'test',
        source: 'test-source'
      });
      expect(trace.details.source).toBe('test-source');
    });
    
    it('should truncate oversized details', () => {
      const largePayload = 'x'.repeat(MAX_DETAILS_SIZE_BYTES + 1000);
      const trace = normalizeDecisionTrace({
        kind: 'test',
        details: { data: largePayload }
      });
      
      expect(trace.details._truncated).toBe(true);
      expect(trace.details._originalSize).toBeGreaterThan(MAX_DETAILS_SIZE_BYTES);
      expect(trace.details.data).toBeUndefined();
    });
  });
  
  describe('createDecisionTraceEmitter', () => {
    it('should require events with emitMilestone', () => {
      expect(() => createDecisionTraceEmitter({}))
        .toThrow('requires events with emitMilestone');
      
      expect(() => createDecisionTraceEmitter({ events: {} }))
        .toThrow('requires events with emitMilestone');
    });
    
    it('should create emitter with all methods', () => {
      const events = { emitMilestone: jest.fn() };
      const emitter = createDecisionTraceEmitter({ events });
      
      expect(typeof emitter.emit).toBe('function');
      expect(typeof emitter.hubFreshness).toBe('function');
      expect(typeof emitter.fetchPolicy).toBe('function');
      expect(typeof emitter.cacheFallback).toBe('function');
      expect(typeof emitter.rateLimit).toBe('function');
      expect(typeof emitter.skipReason).toBe('function');
      expect(emitter.KINDS).toBe(DECISION_KINDS);
    });
    
    it('should emit milestone with normalized trace', () => {
      const events = { emitMilestone: jest.fn() };
      const emitter = createDecisionTraceEmitter({ events, source: 'test' });
      
      emitter.emit({
        kind: 'test-decision',
        message: 'Test',
        details: { foo: 'bar' }
      });
      
      expect(events.emitMilestone).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'test-decision',
          message: 'Test',
          persist: false
        })
      );
      
      const call = events.emitMilestone.mock.calls[0][0];
      expect(call.details.source).toBe('test');
    });
    
    it('should support persistByDefault option', () => {
      const events = { emitMilestone: jest.fn() };
      const emitter = createDecisionTraceEmitter({ 
        events, 
        persistByDefault: true 
      });
      
      emitter.emit({ kind: 'test' });
      
      expect(events.emitMilestone).toHaveBeenCalledWith(
        expect.objectContaining({ persist: true })
      );
    });
    
    it('should allow forcePersist override', () => {
      const events = { emitMilestone: jest.fn() };
      const emitter = createDecisionTraceEmitter({ 
        events, 
        persistByDefault: false 
      });
      
      emitter.emit({ kind: 'test' }, true);
      
      expect(events.emitMilestone).toHaveBeenCalledWith(
        expect.objectContaining({ persist: true })
      );
    });
    
    describe('typed trace methods', () => {
      let events;
      let emitter;
      
      beforeEach(() => {
        events = { emitMilestone: jest.fn() };
        emitter = createDecisionTraceEmitter({ events });
      });
      
      it('hubFreshness should emit correct kind', () => {
        emitter.hubFreshness({
          url: 'https://example.com',
          host: 'example.com',
          effectiveMaxAge: 600000,
          refreshOnStartup: true,
          fallbackToCache: true
        });
        
        expect(events.emitMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: DECISION_KINDS.HUB_FRESHNESS,
            target: 'https://example.com'
          })
        );
      });
      
      it('fetchPolicy should emit correct kind', () => {
        emitter.fetchPolicy({
          url: 'https://example.com',
          policy: 'network-first',
          reason: 'hub refresh'
        });
        
        expect(events.emitMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: DECISION_KINDS.FETCH_POLICY
          })
        );
      });
      
      it('cacheFallback should emit correct kind', () => {
        emitter.cacheFallback({
          url: 'https://example.com',
          networkError: 'timeout',
          fallbackUsed: true,
          cacheAge: 3600000
        });
        
        expect(events.emitMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: DECISION_KINDS.CACHE_FALLBACK
          })
        );
      });
      
      it('rateLimit should emit correct kind', () => {
        emitter.rateLimit({
          url: 'https://example.com/page',
          host: 'example.com',
          action: 'defer',
          backoffMs: 5000
        });
        
        expect(events.emitMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: DECISION_KINDS.RATE_LIMIT
          })
        );
      });
      
      it('skipReason should emit correct kind', () => {
        emitter.skipReason({
          url: 'https://example.com/page',
          reason: 'robots-disallowed',
          classification: 'blocked'
        });
        
        expect(events.emitMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: DECISION_KINDS.SKIP_REASON
          })
        );
      });
    });
  });
  
  describe('createNoOpTraceEmitter', () => {
    it('should create emitter that does nothing', () => {
      const emitter = createNoOpTraceEmitter();
      
      // Should not throw
      const result = emitter.emit({ kind: 'test' });
      expect(result.kind).toBe('noop');
      expect(result.persist).toBe(false);
      
      // All methods should work
      expect(emitter.hubFreshness({})).toEqual(expect.objectContaining({ kind: 'noop' }));
      expect(emitter.fetchPolicy({})).toEqual(expect.objectContaining({ kind: 'noop' }));
    });
  });
});
