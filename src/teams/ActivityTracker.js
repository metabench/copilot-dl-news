'use strict';

/**
 * ActivityTracker - Log and retrieve workspace activity
 * 
 * Handles:
 * - Logging workspace events (member changes, feed updates, etc.)
 * - Retrieving activity feeds with pagination
 * - Activity cleanup for old records
 * 
 * All database operations go through the workspaceAdapter (no SQL here).
 * 
 * @module ActivityTracker
 */

const { ACTIVITY_ACTIONS } = require('../db/sqlite/v1/queries/workspaceAdapter');

/**
 * ActivityTracker class
 */
class ActivityTracker {
  /**
   * Create an ActivityTracker
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.workspaceAdapter - Workspace database adapter
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.workspaceAdapter) {
      throw new Error('ActivityTracker requires a workspaceAdapter');
    }
    
    this.workspaceAdapter = options.workspaceAdapter;
    this.logger = options.logger || console;
  }

  /**
   * Log an activity in a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - User who performed the action
   * @param {string} action - Action type (from ACTIVITY_ACTIONS)
   * @param {Object} [options] - Additional options
   * @param {string} [options.targetType] - Type of target (user, feed, annotation, etc.)
   * @param {number} [options.targetId] - ID of the target
   * @param {Object} [options.details] - Additional details
   * @returns {Promise<Object>} Logged activity
   */
  async logActivity(workspaceId, userId, action, { targetType = null, targetId = null, details = null } = {}) {
    // Validate action (optional, for better debugging)
    const validActions = Object.values(ACTIVITY_ACTIONS);
    if (!validActions.includes(action)) {
      this.logger.warn(`[ActivityTracker] Unknown action type: ${action}`);
    }
    
    try {
      const result = this.workspaceAdapter.logActivity({
        workspaceId,
        userId,
        action,
        targetType,
        targetId,
        details
      });
      
      this.logger.log(`[ActivityTracker] Logged: ${action} in workspace ${workspaceId} by user ${userId}`);
      
      return {
        id: result.id,
        workspaceId,
        userId,
        action,
        targetType,
        targetId,
        details
      };
    } catch (err) {
      this.logger.error(`[ActivityTracker] Failed to log activity:`, err.message);
      // Don't throw - activity logging should not break main operations
      return null;
    }
  }

  /**
   * Get activity feed for a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {Object} [options] - Pagination options
   * @param {number} [options.limit=50] - Max activities
   * @param {number} [options.offset=0] - Offset for pagination
   * @returns {Object} Activity feed with pagination info
   */
  getActivity(workspaceId, { limit = 50, offset = 0 } = {}) {
    const activities = this.workspaceAdapter.getWorkspaceActivity(workspaceId, { limit, offset });
    const total = this.workspaceAdapter.countActivity(workspaceId);
    
    return {
      activities,
      total,
      limit,
      offset,
      hasMore: offset + activities.length < total
    };
  }

  /**
   * Get recent activity for a workspace
   * Convenience method for dashboard/widget use
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} [limit=10] - Max activities
   * @returns {Array<Object>} Recent activities
   */
  getRecentActivity(workspaceId, limit = 10) {
    return this.workspaceAdapter.getWorkspaceActivity(workspaceId, { limit, offset: 0 });
  }

  /**
   * Format activity for display
   * Converts action + details into human-readable message
   * 
   * @param {Object} activity - Activity record
   * @returns {string} Formatted message
   */
  formatActivity(activity) {
    const user = activity.user?.displayName || activity.user?.email || `User ${activity.userId}`;
    const details = activity.details || {};
    
    switch (activity.action) {
      case ACTIVITY_ACTIONS.WORKSPACE_CREATED:
        return `${user} created the workspace`;
        
      case ACTIVITY_ACTIONS.MEMBER_ADDED:
        return `${user} added a new member as ${details.role || 'viewer'}`;
        
      case ACTIVITY_ACTIONS.MEMBER_REMOVED:
        return `${user} removed a member from the workspace`;
        
      case ACTIVITY_ACTIONS.MEMBER_ROLE_CHANGED:
        return `${user} changed a member's role from ${details.oldRole} to ${details.newRole}`;
        
      case ACTIVITY_ACTIONS.FEED_CREATED:
        return `${user} created a shared feed "${details.name || 'Untitled'}"`;
        
      case ACTIVITY_ACTIONS.FEED_UPDATED:
        return `${user} updated a shared feed`;
        
      case ACTIVITY_ACTIONS.FEED_DELETED:
        return `${user} deleted a shared feed`;
        
      case ACTIVITY_ACTIONS.ANNOTATION_ADDED:
        return `${user} added a ${details.type || 'annotation'}`;
        
      case ACTIVITY_ACTIONS.ANNOTATION_DELETED:
        return `${user} removed an annotation`;
        
      default:
        return `${user} performed action: ${activity.action}`;
    }
  }

  /**
   * Get activity with formatted messages
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {Object} [options] - Pagination options
   * @returns {Object} Activity feed with formatted messages
   */
  getFormattedActivity(workspaceId, { limit = 50, offset = 0 } = {}) {
    const result = this.getActivity(workspaceId, { limit, offset });
    
    result.activities = result.activities.map(activity => ({
      ...activity,
      message: this.formatActivity(activity)
    }));
    
    return result;
  }

  /**
   * Cleanup old activity records
   * Should be called periodically
   * 
   * @param {number} [days=90] - Delete activities older than this
   * @returns {Object} Cleanup result
   */
  cleanup(days = 90) {
    const result = this.workspaceAdapter.deleteOldActivity(days);
    
    if (result.deleted > 0) {
      this.logger.log(`[ActivityTracker] Cleaned up ${result.deleted} old activities`);
    }
    
    return result;
  }

  /**
   * Get activity stats for a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @returns {Object} Activity statistics
   */
  getActivityStats(workspaceId) {
    const activities = this.workspaceAdapter.getWorkspaceActivity(workspaceId, { limit: 1000, offset: 0 });
    
    // Group by action type
    const byAction = {};
    for (const activity of activities) {
      byAction[activity.action] = (byAction[activity.action] || 0) + 1;
    }
    
    // Group by user
    const byUser = {};
    for (const activity of activities) {
      const userId = activity.userId;
      byUser[userId] = (byUser[userId] || 0) + 1;
    }
    
    // Count by day (last 7 days)
    const byDay = {};
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const dayKey = day.toISOString().split('T')[0];
      byDay[dayKey] = 0;
    }
    
    for (const activity of activities) {
      const dayKey = activity.createdAt.split('T')[0];
      if (byDay.hasOwnProperty(dayKey)) {
        byDay[dayKey]++;
      }
    }
    
    return {
      total: activities.length,
      byAction,
      byUser,
      byDay,
      topActions: Object.entries(byAction)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([action, count]) => ({ action, count }))
    };
  }
}

module.exports = {
  ActivityTracker,
  ACTIVITY_ACTIONS
};
