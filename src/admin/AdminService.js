'use strict';

/**
 * AdminService - Core admin operations service
 * 
 * Provides high-level admin operations:
 * - User management (list, get, suspend, unsuspend, role changes)
 * - System health metrics
 * - Audit log access
 * 
 * All operations are logged to the audit trail.
 * 
 * @module AdminService
 */

const os = require('os');
const { AuditLogger, AUDIT_ACTIONS } = require('./AuditLogger');

/**
 * AdminService class
 */
class AdminService {
  /**
   * Create an AdminService
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.adminAdapter - Admin database adapter
   * @param {Object} [options.userAdapter] - Optional user adapter for extra operations
   * @param {Object} [options.logger] - Optional logger instance
   */
  constructor(options = {}) {
    if (!options.adminAdapter) {
      throw new Error('AdminService requires an adminAdapter');
    }
    
    this.adminAdapter = options.adminAdapter;
    this.userAdapter = options.userAdapter || null;
    this.logger = options.logger || console;
    
    this.auditLogger = new AuditLogger({
      adminAdapter: this.adminAdapter,
      logger: this.logger
    });
  }

  // =================== User Management ===================

  /**
   * List users with pagination and search
   * 
   * @param {Object} options - Query options
   * @param {string} [options.search] - Search term
   * @param {number} [options.limit=50] - Max results
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {{ users: Array, total: number }}
   */
  listUsers({ search = null, limit = 50, offset = 0 } = {}) {
    return this.adminAdapter.listUsers({ search, limit, offset });
  }

  /**
   * Get user details with stats
   * 
   * @param {number} userId - User ID
   * @returns {Object|null}
   */
  getUser(userId) {
    return this.adminAdapter.getUser(userId);
  }

  /**
   * Suspend a user
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User to suspend
   * @param {string} [reason] - Reason for suspension
   * @returns {{ success: boolean, changes: number }}
   */
  suspendUser(adminId, userId, reason = null) {
    // Prevent self-suspension
    if (adminId === userId) {
      throw new Error('Cannot suspend yourself');
    }
    
    // Check if user exists
    const user = this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Prevent suspending other admins (super-admin only)
    if (user.role === 'admin') {
      throw new Error('Cannot suspend other admins');
    }
    
    // Check if already suspended
    if (user.suspendedAt || !user.isActive) {
      throw new Error('User is already suspended');
    }
    
    const result = this.adminAdapter.suspendUser(userId, reason);
    
    if (result.changes > 0) {
      this.auditLogger.logUserSuspended(adminId, userId, reason);
    }
    
    return { success: result.changes > 0, changes: result.changes };
  }

  /**
   * Unsuspend a user
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User to unsuspend
   * @returns {{ success: boolean, changes: number }}
   */
  unsuspendUser(adminId, userId) {
    const user = this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if not suspended
    if (!user.suspendedAt && user.isActive) {
      throw new Error('User is not suspended');
    }
    
    const result = this.adminAdapter.unsuspendUser(userId);
    
    if (result.changes > 0) {
      this.auditLogger.logUserUnsuspended(adminId, userId);
    }
    
    return { success: result.changes > 0, changes: result.changes };
  }

  /**
   * Update user role
   * 
   * @param {number} adminId - Admin performing action
   * @param {number} userId - User to update
   * @param {string} newRole - New role
   * @returns {{ success: boolean, changes: number }}
   */
  updateUserRole(adminId, userId, newRole) {
    // Prevent changing own role
    if (adminId === userId) {
      throw new Error('Cannot change your own role');
    }
    
    const user = this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const oldRole = user.role;
    
    if (oldRole === newRole) {
      return { success: false, changes: 0, message: 'Role unchanged' };
    }
    
    const result = this.adminAdapter.updateUserRole(userId, newRole);
    
    if (result.changes > 0) {
      this.auditLogger.logRoleChanged(adminId, userId, oldRole, newRole);
    }
    
    return { success: result.changes > 0, changes: result.changes };
  }

  // =================== System Health ===================

  /**
   * Get system health metrics
   * 
   * @returns {Object}
   */
  getSystemHealth() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const processMemory = process.memoryUsage();
    
    // Calculate CPU usage (average across all cores)
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1);
    
    // Get database stats
    const dbStats = this.adminAdapter.getSystemStats();
    
    return {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        usage: parseFloat(cpuUsage)
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        usagePercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(1)
      },
      process: {
        heapUsed: processMemory.heapUsed,
        heapTotal: processMemory.heapTotal,
        external: processMemory.external,
        rss: processMemory.rss
      },
      uptime: {
        system: os.uptime(),
        process: process.uptime()
      },
      platform: {
        type: os.type(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname()
      },
      database: dbStats.database,
      users: dbStats.users,
      sessions: dbStats.sessions,
      crawls: dbStats.crawls
    };
  }

  /**
   * Get formatted uptime string
   * 
   * @param {number} seconds - Uptime in seconds
   * @returns {string}
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
  }

  /**
   * Format bytes to human-readable
   * 
   * @param {number} bytes - Bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // =================== Audit Log ===================

  /**
   * Get audit log entries
   * 
   * @param {Object} options - Query options
   * @param {string} [options.action] - Filter by action type
   * @param {string} [options.targetType] - Filter by target type
   * @param {number} [options.adminId] - Filter by admin
   * @param {number} [options.limit=50] - Max results
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {{ entries: Array, total: number }}
   */
  getAuditLog({ action = null, targetType = null, adminId = null, limit = 50, offset = 0 } = {}) {
    return this.adminAdapter.getAuditLog({ action, targetType, adminId, limit, offset });
  }

  // =================== Crawl Management ===================

  /**
   * Get recent crawl jobs
   * 
   * @param {number} [limit=10] - Max results
   * @returns {Array}
   */
  getRecentCrawls(limit = 10) {
    return this.adminAdapter.getRecentCrawls(limit);
  }

  /**
   * Get available audit actions
   * 
   * @returns {Object}
   */
  static getAuditActions() {
    return AUDIT_ACTIONS;
  }
}

module.exports = {
  AdminService
};
