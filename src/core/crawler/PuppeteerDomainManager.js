'use strict';

/**
 * PuppeteerDomainManager - Manages domains that require Puppeteer fallback
 * 
 * Handles:
 * - Loading/saving domain config from config/puppeteer-domains.json
 * - Tracking ECONNRESET failures per domain
 * - Auto-learning domains that consistently fail
 * - Providing domain lookup for FetchPipeline
 * 
 * @module PuppeteerDomainManager
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../config/puppeteer-domains.json');

const DEFAULT_SETTINGS = Object.freeze({
  autoLearnEnabled: true,
  autoLearnThreshold: 3,        // failures before learning
  autoLearnWindowMs: 5 * 60 * 1000, // 5 minute window
  autoApprove: false,           // require manual approval
  trackingEnabled: true
});

/**
 * @typedef {Object} DomainEntry
 * @property {string} domain
 * @property {string} reason
 * @property {string} addedAt - ISO timestamp
 * @property {string} addedBy - 'manual' | 'auto-learned' | 'default'
 * @property {string} [approvedAt] - ISO timestamp when approved (for learned)
 */

/**
 * @typedef {Object} FailureRecord
 * @property {number} count
 * @property {number[]} timestamps - Unix timestamps of failures
 * @property {string} lastUrl
 * @property {string} lastError
 */

class PuppeteerDomainManager extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.configPath] - Path to config file
   * @param {Object} [opts.logger] - Logger with info/warn/error methods
   * @param {boolean} [opts.autoSave=true] - Auto-save on changes
   */
  constructor(opts = {}) {
    super();
    this.configPath = opts.configPath || DEFAULT_CONFIG_PATH;
    this.logger = opts.logger || console;
    this.autoSave = opts.autoSave !== false;
    
    /** @type {Map<string, DomainEntry>} */
    this._manualDomains = new Map();
    
    /** @type {Map<string, DomainEntry>} */
    this._learnedDomains = new Map();
    
    /** @type {Map<string, DomainEntry>} */
    this._pendingDomains = new Map();
    
    /** @type {Map<string, FailureRecord>} */
    this._failureTracking = new Map();
    
    this._settings = { ...DEFAULT_SETTINGS };
    this._browserLifecycle = null;
    this._loaded = false;
    this._dirty = false;
  }

  /**
   * Load config from disk
   * @returns {boolean} success
   */
  load() {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.logger.info(`[PuppeteerDomainManager] No config at ${this.configPath}, using defaults`);
        this._loaded = true;
        return true;
      }

      const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      
      // Load domains
      this._manualDomains.clear();
      this._learnedDomains.clear();
      this._pendingDomains.clear();
      
      for (const entry of data.domains?.manual || []) {
        this._manualDomains.set(entry.domain.toLowerCase(), entry);
      }
      for (const entry of data.domains?.learned || []) {
        this._learnedDomains.set(entry.domain.toLowerCase(), entry);
      }
      for (const entry of data.domains?.pending || []) {
        this._pendingDomains.set(entry.domain.toLowerCase(), entry);
      }
      
      // Load settings
      if (data.settings) {
        Object.assign(this._settings, data.settings);
      }
      
      // Load browser lifecycle settings
      if (data.browserLifecycle) {
        this._browserLifecycle = { ...data.browserLifecycle };
      }
      
      this._loaded = true;
      this.logger.info(`[PuppeteerDomainManager] Loaded ${this.getActiveDomains().length} active domains`);
      return true;
    } catch (err) {
      this.logger.error(`[PuppeteerDomainManager] Failed to load config: ${err.message}`);
      this._loaded = true; // Mark as loaded to prevent repeated failures
      return false;
    }
  }

  /**
   * Save config to disk
   * @returns {boolean} success
   */
  save() {
    try {
      const data = {
        $schema: './schema/puppeteer-domains.schema.json',
        version: 1,
        description: 'Domains that require Puppeteer fallback due to TLS fingerprinting (JA3/JA4 blocking)',
        updatedAt: new Date().toISOString(),
        domains: {
          manual: Array.from(this._manualDomains.values()),
          learned: Array.from(this._learnedDomains.values()),
          pending: Array.from(this._pendingDomains.values())
        },
        settings: this._settings
      };
      
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      this._dirty = false;
      this.logger.info(`[PuppeteerDomainManager] Saved config to ${this.configPath}`);
      return true;
    } catch (err) {
      this.logger.error(`[PuppeteerDomainManager] Failed to save config: ${err.message}`);
      return false;
    }
  }

  /**
   * Get all active domains (manual + learned)
   * @returns {string[]}
   */
  getActiveDomains() {
    const domains = new Set([
      ...this._manualDomains.keys(),
      ...this._learnedDomains.keys()
    ]);
    return Array.from(domains);
  }

  /**
   * Check if a host should use Puppeteer fallback
   * @param {string} host - hostname to check
   * @returns {boolean}
   */
  shouldUsePuppeteer(host) {
    if (!this._loaded) this.load();
    
    const lowerHost = host.toLowerCase();
    
    // Check active domains
    for (const domain of this.getActiveDomains()) {
      if (lowerHost === domain || lowerHost.endsWith('.' + domain)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Record an ECONNRESET failure for a domain
   * @param {string} host - hostname that failed
   * @param {string} url - full URL that failed
   * @param {string} [errorMessage] - error details
   * @returns {{learned: boolean, pending: boolean, count: number}}
   */
  recordFailure(host, url, errorMessage = 'ECONNRESET') {
    if (!this._loaded) this.load();
    if (!this._settings.trackingEnabled) {
      return { learned: false, pending: false, count: 0 };
    }
    
    const domain = this._extractBaseDomain(host);
    const now = Date.now();
    
    // Skip if already active
    if (this.shouldUsePuppeteer(domain)) {
      return { learned: false, pending: false, count: 0, alreadyActive: true };
    }
    
    // Get or create failure record
    let record = this._failureTracking.get(domain);
    if (!record) {
      record = { count: 0, timestamps: [], lastUrl: '', lastError: '' };
      this._failureTracking.set(domain, record);
    }
    
    // Clean old timestamps outside window
    const windowStart = now - this._settings.autoLearnWindowMs;
    record.timestamps = record.timestamps.filter(ts => ts > windowStart);
    
    // Add new failure
    record.timestamps.push(now);
    record.count = record.timestamps.length;
    record.lastUrl = url;
    record.lastError = errorMessage;
    
    // Check if threshold reached
    if (this._settings.autoLearnEnabled && record.count >= this._settings.autoLearnThreshold) {
      return this._promoteToLearned(domain, record);
    }
    
    this.emit('failure:recorded', { domain, count: record.count, threshold: this._settings.autoLearnThreshold });
    return { learned: false, pending: false, count: record.count, tracked: true, failureCount: record.count };
  }

  /**
   * Promote a domain to learned status
   * @private
   */
  _promoteToLearned(domain, record) {
    const entry = {
      domain,
      reason: `Auto-learned: ${record.count}x ECONNRESET in ${this._settings.autoLearnWindowMs / 1000}s`,
      addedAt: new Date().toISOString(),
      addedBy: 'auto-learned',
      lastUrl: record.lastUrl,
      lastError: record.lastError,
      failureCount: record.count
    };
    
    if (this._settings.autoApprove) {
      // Add directly to learned (active)
      this._learnedDomains.set(domain, entry);
      this._failureTracking.delete(domain);
      this._dirty = true;
      
      this.logger.info(`[PuppeteerDomainManager] Auto-learned domain: ${domain} (${record.count} failures)`);
      this.emit('domain:learned', { domain, entry, autoApproved: true });
      
      if (this.autoSave) this.save();
      return { learned: true, pending: false, count: record.count, failureCount: record.count };
    } else {
      // Add to pending for manual approval
      this._pendingDomains.set(domain, entry);
      this._failureTracking.delete(domain);
      this._dirty = true;
      
      this.logger.info(`[PuppeteerDomainManager] Domain pending approval: ${domain} (${record.count} failures)`);
      this.emit('domain:pending', { domain, entry });
      
      if (this.autoSave) this.save();
      return { learned: false, pending: true, count: record.count, failureCount: record.count };
    }
  }

  /**
   * Extract base domain from hostname
   * @private
   */
  _extractBaseDomain(host) {
    const parts = host.toLowerCase().split('.');
    if (parts.length <= 2) return host.toLowerCase();
    
    // Handle common TLDs
    const twoPartTLDs = ['co.uk', 'com.au', 'co.nz', 'com.br', 'co.jp'];
    const lastTwo = parts.slice(-2).join('.');
    if (twoPartTLDs.includes(lastTwo)) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  /**
   * Approve a pending domain
   * @param {string} domain
   * @returns {boolean} success
   */
  approveDomain(domain) {
    const lowerDomain = domain.toLowerCase();
    const entry = this._pendingDomains.get(lowerDomain);
    if (!entry) return false;
    
    entry.approvedAt = new Date().toISOString();
    this._learnedDomains.set(lowerDomain, entry);
    this._pendingDomains.delete(lowerDomain);
    this._dirty = true;
    
    this.logger.info(`[PuppeteerDomainManager] Approved domain: ${domain}`);
    this.emit('domain:approved', { domain, entry });
    
    if (this.autoSave) this.save();
    return true;
  }

  /**
   * Reject a pending domain
   * @param {string} domain
   * @returns {boolean} success
   */
  rejectDomain(domain) {
    const lowerDomain = domain.toLowerCase();
    const entry = this._pendingDomains.get(lowerDomain);
    if (!entry) return false;
    
    this._pendingDomains.delete(lowerDomain);
    this._dirty = true;
    
    this.logger.info(`[PuppeteerDomainManager] Rejected domain: ${domain}`);
    this.emit('domain:rejected', { domain, entry });
    
    if (this.autoSave) this.save();
    return true;
  }

  /**
   * Manually add a domain
   * @param {string} domain
   * @param {string} [reason]
   * @returns {boolean} success
   */
  addDomain(domain, reason = 'Manually added') {
    const lowerDomain = domain.toLowerCase();
    
    if (this._manualDomains.has(lowerDomain) || this._learnedDomains.has(lowerDomain)) {
      return false; // Already exists
    }
    
    const entry = {
      domain: lowerDomain,
      reason,
      addedAt: new Date().toISOString(),
      addedBy: 'manual'
    };
    
    this._manualDomains.set(lowerDomain, entry);
    this._pendingDomains.delete(lowerDomain); // Remove from pending if there
    this._dirty = true;
    
    this.logger.info(`[PuppeteerDomainManager] Added domain: ${domain}`);
    this.emit('domain:added', { domain, entry });
    
    if (this.autoSave) this.save();
    return true;
  }

  /**
   * Remove a domain
   * @param {string} domain
   * @returns {boolean} success
   */
  removeDomain(domain) {
    const lowerDomain = domain.toLowerCase();
    let removed = false;
    
    if (this._manualDomains.delete(lowerDomain)) removed = true;
    if (this._learnedDomains.delete(lowerDomain)) removed = true;
    if (this._pendingDomains.delete(lowerDomain)) removed = true;
    
    if (removed) {
      this._dirty = true;
      this.logger.info(`[PuppeteerDomainManager] Removed domain: ${domain}`);
      this.emit('domain:removed', { domain });
      if (this.autoSave) this.save();
    }
    
    return removed;
  }

  /**
   * Get status summary
   * @returns {Object}
   */
  getStatus() {
    return {
      loaded: this._loaded,
      configPath: this.configPath,
      settings: { ...this._settings },
      browserLifecycle: this._browserLifecycle,
      counts: {
        manual: this._manualDomains.size,
        learned: this._learnedDomains.size,
        pending: this._pendingDomains.size,
        tracking: this._failureTracking.size,
        active: this.getActiveDomains().length
      },
      domains: {
        manual: Array.from(this._manualDomains.keys()),
        learned: Array.from(this._learnedDomains.keys()),
        pending: Array.from(this._pendingDomains.keys())
      },
      tracking: Object.fromEntries(
        Array.from(this._failureTracking.entries()).map(([k, v]) => [k, {
          count: v.count,
          lastUrl: v.lastUrl,
          threshold: this._settings.autoLearnThreshold
        }])
      )
    };
  }

  /**
   * Get pending domains for review
   * @returns {DomainEntry[]}
   */
  getPendingDomains() {
    return Array.from(this._pendingDomains.values());
  }

  /**
   * Check if failure tracking is enabled
   * @returns {boolean}
   */
  isTrackingEnabled() {
    return this._settings.trackingEnabled !== false;
  }

  /**
   * Get current settings (for external access)
   * @returns {Object}
   */
  get config() {
    return {
      settings: { ...this._settings },
      browserLifecycle: this._browserLifecycle ? { ...this._browserLifecycle } : null
    };
  }

  /**
   * Update settings
   * @param {Object} newSettings
   */
  updateSettings(newSettings) {
    Object.assign(this._settings, newSettings);
    this._dirty = true;
    if (this.autoSave) this.save();
  }

  /**
   * Approve all pending domains
   * @returns {number} count approved
   */
  approveAllPending() {
    const pending = Array.from(this._pendingDomains.keys());
    let count = 0;
    for (const domain of pending) {
      if (this.approveDomain(domain)) count++;
    }
    return count;
  }

  /**
   * Clear failure tracking (useful for testing)
   */
  clearTracking() {
    this._failureTracking.clear();
  }
}

module.exports = { PuppeteerDomainManager };
