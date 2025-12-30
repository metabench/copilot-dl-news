'use strict';

/**
 * AuditLogger - Centralized audit logging for admin actions
 * 
 * Provides a consistent interface for logging all admin actions
 * to the audit_log table for compliance and debugging.
 * 
 * Action types:
 * - user_suspended, user_unsuspended
 * - role_changed
 * - config_updated
 * - crawl_started, crawl_stopped
 * 
 * @module AuditLogger
 */

/**
 * Audit action constants
 */
const AUDIT_ACTIONS = {
  USER_SUSPENDED: 'user_suspended',
  USER_UNSUSPENDED: 'user_unsuspended',
  ROLE_CHANGED: 'role_changed',
  CONFIG_UPDATED: 'config_updated',
  CRAWL_STARTED: 'crawl_started',
  CRAWL_STOPPED: 'crawl_stopped',
  USER_DELETED: 'user_deleted',
  SYSTEM_MAINTENANCE: 'system_maintenance',
  SETTINGS_UPDATED: 'settings_updated'
};

/**
 * Target type constants
 */
const TARGET_TYPES = {
  USER: 'user',
  CRAWL: 'crawl',
  CONFIG: 'config',
  SYSTEM: 'system'
};

/**
 * AuditLogger class
 */
class AuditLogger {
  /**
   * Create an AuditLogger
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.adminAdapter - Admin database adapter
   * @param {Object} [options.logger] - Optional logger instance
   */
  constructor(options = {}) {
    if (!options.adminAdapter) {
      throw new Error('AuditLogger requires an adminAdapter');
    }
    
    this.adminAdapter = options.adminAdapter;
    this.logger = options.logger || console;
  }

  /**
   * Log an admin action
   * 
   * @param {number} adminId - ID of admin performing action
   * @param {string} action - Action type (from AUDIT_ACTIONS)
   * @param {Object} [options] - Additional options
   * @param {string} [options.targetType] - Type of target entity
   * @param {number} [options.targetId] - ID of target entity
   * @param {Object} [options.details] - Additional details
   * @returns {{ id: number }}
   */
  log(adminId, action, { targetType = null, targetId = null, details = null } = {}) {
    if (!adminId) {
      throw new Error('adminId is required');
    }
    
    if (!action) {
      throw new Error('action is required');
    }
    
    const result = this.adminAdapter.logAction({
      adminId,
      action,
      targetType,
      targetId,
      details
    });
    
    this.logger.info(`[AuditLogger] ${action} by admin ${adminId}`, {
      targetType,
      targetId,
      details
    });
    
    return result;
  }

  /**
   * Log user suspension
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User being suspended
   * @param {string} [reason] - Reason for suspension
   * @returns {{ id: number }}
   */
  logUserSuspended(adminId, userId, reason = null) {
    return this.log(adminId, AUDIT_ACTIONS.USER_SUSPENDED, {
      targetType: TARGET_TYPES.USER,
      targetId: userId,
      details: { reason }
    });
  }

  /**
   * Log user unsuspension
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User being unsuspended
   * @returns {{ id: number }}
   */
  logUserUnsuspended(adminId, userId) {
    return this.log(adminId, AUDIT_ACTIONS.USER_UNSUSPENDED, {
      targetType: TARGET_TYPES.USER,
      targetId: userId
    });
  }

  /**
   * Log role change
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User whose role is changing
   * @param {string} oldRole - Previous role
   * @param {string} newRole - New role
   * @returns {{ id: number }}
   */
  logRoleChanged(adminId, userId, oldRole, newRole) {
    return this.log(adminId, AUDIT_ACTIONS.ROLE_CHANGED, {
      targetType: TARGET_TYPES.USER,
      targetId: userId,
      details: { oldRole, newRole }
    });
  }

  /**
   * Log config update
   * 
   * @param {number} adminId - Admin performing action
   * @param {string} configKey - Configuration key that changed
   * @param {Object} [changes] - What changed
   * @returns {{ id: number }}
   */
  logConfigUpdated(adminId, configKey, changes = null) {
    return this.log(adminId, AUDIT_ACTIONS.CONFIG_UPDATED, {
      targetType: TARGET_TYPES.CONFIG,
      details: { configKey, changes }
    });
  }

  /**
   * Log crawl started
   * 
   * @param {number} adminId - Admin who started the crawl
   * @param {number} crawlId - Crawl job ID
   * @param {Object} [config] - Crawl configuration
   * @returns {{ id: number }}
   */
  logCrawlStarted(adminId, crawlId, config = null) {
    return this.log(adminId, AUDIT_ACTIONS.CRAWL_STARTED, {
      targetType: TARGET_TYPES.CRAWL,
      targetId: crawlId,
      details: config
    });
  }

  /**
   * Log crawl stopped
   * 
   * @param {number} adminId - Admin who stopped the crawl
   * @param {number} crawlId - Crawl job ID
   * @param {string} [reason] - Reason for stopping
   * @returns {{ id: number }}
   */
  logCrawlStopped(adminId, crawlId, reason = null) {
    return this.log(adminId, AUDIT_ACTIONS.CRAWL_STOPPED, {
      targetType: TARGET_TYPES.CRAWL,
      targetId: crawlId,
      details: { reason }
    });
  }

  /**
   * Log user deletion
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User being deleted
   * @param {string} email - User's email (for record since user will be gone)
   * @returns {{ id: number }}
   */
  logUserDeleted(adminId, userId, email) {
    return this.log(adminId, AUDIT_ACTIONS.USER_DELETED, {
      targetType: TARGET_TYPES.USER,
      targetId: userId,
      details: { email }
    });
  }

  /**
   * Log system maintenance action
   * 
   * @param {number} adminId - Admin performing action
   * @param {string} action - Maintenance action description
   * @param {Object} [details] - Additional details
   * @returns {{ id: number }}
   */
  logSystemMaintenance(adminId, action, details = null) {
    return this.log(adminId, AUDIT_ACTIONS.SYSTEM_MAINTENANCE, {
      targetType: TARGET_TYPES.SYSTEM,
      details: { action, ...details }
    });
  }
}

module.exports = {
  AuditLogger,
  AUDIT_ACTIONS,
  TARGET_TYPES
};
