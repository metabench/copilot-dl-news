'use strict';

/**
 * PuppeteerDomainManager Tests
 * 
 * Tests for auto-learning domains that require Puppeteer fallback
 * based on ECONNRESET failure patterns.
 */

const { PuppeteerDomainManager } = require('../../../src/crawler/PuppeteerDomainManager');

describe('PuppeteerDomainManager', () => {
  let manager;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    manager = new PuppeteerDomainManager({
      autoSave: false, // Don't save to disk in tests
      logger: mockLogger
    });
  });

  afterEach(() => {
    manager.clearTracking();
  });

  describe('isTrackingEnabled()', () => {
    it('returns true when tracking is enabled', () => {
      manager.updateSettings({ trackingEnabled: true });
      expect(manager.isTrackingEnabled()).toBe(true);
    });

    it('returns false when tracking is disabled', () => {
      manager.updateSettings({ trackingEnabled: false });
      expect(manager.isTrackingEnabled()).toBe(false);
    });
  });

  describe('config getter', () => {
    it('returns current settings', () => {
      manager.updateSettings({ autoLearnThreshold: 5, autoApprove: true });
      const config = manager.config;
      
      expect(config.settings.autoLearnThreshold).toBe(5);
      expect(config.settings.autoApprove).toBe(true);
    });
  });

  describe('recordFailure()', () => {
    beforeEach(() => {
      manager.updateSettings({
        autoLearnEnabled: true,
        autoLearnThreshold: 3,
        autoLearnWindowMs: 300000,
        autoApprove: true,
        trackingEnabled: true
      });
    });

    it('tracks failures below threshold', () => {
      const result = manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page1', 'ECONNRESET');
      
      expect(result.learned).toBe(false);
      expect(result.pending).toBe(false);
      expect(result.count).toBe(1);
      expect(result.tracked).toBe(true);
    });

    it('auto-learns domain after threshold failures', () => {
      // Simulate 3 failures (threshold)
      manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page1', 'ECONNRESET');
      manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page2', 'ECONNRESET');
      const result = manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page3', 'ECONNRESET');
      
      expect(result.learned).toBe(true);
      expect(result.failureCount).toBe(3);
      expect(manager.shouldUsePuppeteer('blocked.example.com')).toBe(true);
    });

    it('emits domain:learned event on auto-learning', () => {
      const learnedHandler = jest.fn();
      manager.on('domain:learned', learnedHandler);
      
      manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page1', 'ECONNRESET');
      manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page2', 'ECONNRESET');
      manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page3', 'ECONNRESET');
      
      expect(learnedHandler).toHaveBeenCalledTimes(1);
      expect(learnedHandler).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'blocked.example.com',
        autoApproved: true
      }));
    });

    it('adds to pending when autoApprove is false', () => {
      manager.updateSettings({ autoApprove: false });
      
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page1', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page2', 'ECONNRESET');
      const result = manager.recordFailure('pending.example.com', 'https://pending.example.com/page3', 'ECONNRESET');
      
      expect(result.learned).toBe(false);
      expect(result.pending).toBe(true);
      expect(manager.shouldUsePuppeteer('pending.example.com')).toBe(false);
      expect(manager.getPendingDomains()).toHaveLength(1);
    });

    it('emits domain:pending event when requiring approval', () => {
      manager.updateSettings({ autoApprove: false });
      const pendingHandler = jest.fn();
      manager.on('domain:pending', pendingHandler);
      
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page1', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page2', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page3', 'ECONNRESET');
      
      expect(pendingHandler).toHaveBeenCalledTimes(1);
      expect(pendingHandler).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'pending.example.com'
      }));
    });

    it('clears old failures outside time window', () => {
      const shortWindowMs = 100; // Very short window for testing
      manager.updateSettings({ autoLearnWindowMs: shortWindowMs });
      
      // First failure
      manager.recordFailure('time.example.com', 'https://time.example.com/page1', 'ECONNRESET');
      
      // Wait for window to expire
      return new Promise(resolve => setTimeout(resolve, shortWindowMs + 50)).then(() => {
        // Second failure after window expired - should start fresh
        const result = manager.recordFailure('time.example.com', 'https://time.example.com/page2', 'ECONNRESET');
        expect(result.count).toBe(1); // First failure expired
      });
    });

    it('skips tracking if domain is already active', () => {
      manager.addDomain('active.example.com', 'Manual add');
      
      const result = manager.recordFailure('active.example.com', 'https://active.example.com/page1', 'ECONNRESET');
      
      expect(result.alreadyActive).toBe(true);
      expect(result.count).toBe(0);
    });

    it('does nothing when tracking is disabled', () => {
      manager.updateSettings({ trackingEnabled: false });
      
      const result = manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page1', 'ECONNRESET');
      
      expect(result.count).toBe(0);
      expect(result.learned).toBe(false);
    });
  });

  describe('shouldUsePuppeteer()', () => {
    it('returns true for manually added domains', () => {
      manager.addDomain('manual.example.com', 'TLS fingerprinting');
      expect(manager.shouldUsePuppeteer('manual.example.com')).toBe(true);
    });

    it('returns true for subdomains of added domains', () => {
      manager.addDomain('example.com', 'Base domain');
      expect(manager.shouldUsePuppeteer('www.example.com')).toBe(true);
      expect(manager.shouldUsePuppeteer('api.example.com')).toBe(true);
    });

    it('returns false for unrelated domains', () => {
      manager.addDomain('example.com', 'Base domain');
      expect(manager.shouldUsePuppeteer('other.com')).toBe(false);
      expect(manager.shouldUsePuppeteer('example.org')).toBe(false);
    });
  });

  describe('approveDomain()', () => {
    beforeEach(() => {
      manager.updateSettings({ autoApprove: false, autoLearnThreshold: 3, autoLearnEnabled: true });
    });

    it('moves domain from pending to learned', () => {
      // Create pending domain
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page1', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page2', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page3', 'ECONNRESET');
      
      expect(manager.shouldUsePuppeteer('pending.example.com')).toBe(false);
      expect(manager.getPendingDomains()).toHaveLength(1);
      
      // Approve it
      const result = manager.approveDomain('pending.example.com');
      
      expect(result).toBe(true);
      expect(manager.shouldUsePuppeteer('pending.example.com')).toBe(true);
      expect(manager.getPendingDomains()).toHaveLength(0);
    });

    it('emits domain:approved event', () => {
      const approvedHandler = jest.fn();
      manager.on('domain:approved', approvedHandler);
      
      // Create pending domain
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page1', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page2', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page3', 'ECONNRESET');
      
      manager.approveDomain('pending.example.com');
      
      expect(approvedHandler).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'pending.example.com'
      }));
    });
  });

  describe('rejectDomain()', () => {
    beforeEach(() => {
      manager.updateSettings({ autoApprove: false, autoLearnThreshold: 3, autoLearnEnabled: true });
    });

    it('removes domain from pending', () => {
      // Create pending domain
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page1', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page2', 'ECONNRESET');
      manager.recordFailure('pending.example.com', 'https://pending.example.com/page3', 'ECONNRESET');
      
      expect(manager.getPendingDomains()).toHaveLength(1);
      
      const result = manager.rejectDomain('pending.example.com');
      
      expect(result).toBe(true);
      expect(manager.getPendingDomains()).toHaveLength(0);
      expect(manager.shouldUsePuppeteer('pending.example.com')).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('returns comprehensive status', () => {
      manager.addDomain('manual.com', 'Manual');
      manager.updateSettings({ autoLearnThreshold: 3, autoApprove: true });
      
      // Create some tracking
      manager.recordFailure('tracking.com', 'https://tracking.com/page1', 'ECONNRESET');
      
      const status = manager.getStatus();
      
      expect(status.loaded).toBe(true);
      expect(status.counts.manual).toBe(1);
      expect(status.counts.tracking).toBe(1);
      expect(status.settings.autoLearnThreshold).toBe(3);
      expect(status.domains.manual).toContain('manual.com');
    });
  });

  describe('base domain extraction', () => {
    it('handles standard domains', () => {
      manager.updateSettings({ autoApprove: true, autoLearnThreshold: 1, autoLearnEnabled: true });
      
      manager.recordFailure('www.example.com', 'https://www.example.com/', 'ECONNRESET');
      
      // Should extract base domain
      expect(manager.shouldUsePuppeteer('example.com')).toBe(true);
      expect(manager.shouldUsePuppeteer('other.example.com')).toBe(true);
    });

    it('handles UK-style TLDs', () => {
      manager.updateSettings({ autoApprove: true, autoLearnThreshold: 1, autoLearnEnabled: true });
      
      manager.recordFailure('www.example.co.uk', 'https://www.example.co.uk/', 'ECONNRESET');
      
      expect(manager.shouldUsePuppeteer('example.co.uk')).toBe(true);
    });
  });

  describe('approveAllPending()', () => {
    beforeEach(() => {
      manager.updateSettings({ autoApprove: false, autoLearnThreshold: 2, autoLearnEnabled: true });
    });

    it('approves all pending domains', () => {
      // Create multiple pending domains
      manager.recordFailure('pending1.com', 'https://pending1.com/', 'ECONNRESET');
      manager.recordFailure('pending1.com', 'https://pending1.com/', 'ECONNRESET');
      manager.recordFailure('pending2.com', 'https://pending2.com/', 'ECONNRESET');
      manager.recordFailure('pending2.com', 'https://pending2.com/', 'ECONNRESET');
      
      expect(manager.getPendingDomains()).toHaveLength(2);
      
      const count = manager.approveAllPending();
      
      expect(count).toBe(2);
      expect(manager.getPendingDomains()).toHaveLength(0);
      expect(manager.shouldUsePuppeteer('pending1.com')).toBe(true);
      expect(manager.shouldUsePuppeteer('pending2.com')).toBe(true);
    });
  });
});
