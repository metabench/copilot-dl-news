'use strict';

/**
 * SharedFeedService - Manage shared feeds within workspaces
 * 
 * Handles:
 * - Creating/updating/deleting shared feeds
 * - Permission checks for feed operations
 * - Activity logging
 * 
 * All database operations go through the workspaceAdapter (no SQL here).
 * 
 * @module SharedFeedService
 */

const { ACTIVITY_ACTIONS } = require('../db/sqlite/v1/queries/workspaceAdapter');

/**
 * SharedFeedService class
 */
class SharedFeedService {
  /**
   * Create a SharedFeedService
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.workspaceAdapter - Workspace database adapter
   * @param {Object} [options.roleManager] - RoleManager instance
   * @param {Object} [options.activityTracker] - ActivityTracker instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.workspaceAdapter) {
      throw new Error('SharedFeedService requires a workspaceAdapter');
    }
    
    this.workspaceAdapter = options.workspaceAdapter;
    this.roleManager = options.roleManager || null;
    this.activityTracker = options.activityTracker || null;
    this.logger = options.logger || console;
  }

  // =================== Feed CRUD ===================

  /**
   * Create a shared feed in a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - Creating user ID
   * @param {Object} data - Feed data
   * @param {string} data.name - Feed name
   * @param {string} [data.query] - Search query
   * @param {Object} [data.filters={}] - Feed filters
   * @returns {Promise<Object>} Created feed
   * @throws {Error} If validation fails or permission denied
   */
  async createFeed(workspaceId, userId, { name, query = null, filters = {} }) {
    // Check permission
    await this._checkPermission(userId, workspaceId, 'create_feed');
    
    // Validate name
    if (!name || name.trim().length < 2) {
      throw new Error('Feed name must be at least 2 characters');
    }
    
    if (name.length > 100) {
      throw new Error('Feed name must be less than 100 characters');
    }
    
    // Create feed
    const result = this.workspaceAdapter.createSharedFeed({
      workspaceId,
      createdBy: userId,
      name: name.trim(),
      query,
      filters
    });
    
    // Log activity
    if (this.activityTracker) {
      await this.activityTracker.logActivity(workspaceId, userId, ACTIVITY_ACTIONS.FEED_CREATED, {
        targetType: 'feed',
        targetId: result.id,
        details: { name: name.trim() }
      });
    }
    
    this.logger.log(`[SharedFeedService] Feed created: ${name} in workspace ${workspaceId} by user ${userId}`);
    
    return this.workspaceAdapter.getSharedFeedById(result.id);
  }

  /**
   * Get a shared feed by ID
   * 
   * @param {number} feedId - Feed ID
   * @returns {Object|null} Feed or null
   */
  getFeed(feedId) {
    return this.workspaceAdapter.getSharedFeedById(feedId);
  }

  /**
   * Update a shared feed
   * 
   * @param {number} feedId - Feed ID
   * @param {number} userId - Acting user ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.name] - New name
   * @param {string} [updates.query] - New query
   * @param {Object} [updates.filters] - New filters
   * @returns {Promise<Object>} Updated feed
   * @throws {Error} If validation fails or permission denied
   */
  async updateFeed(feedId, userId, { name = null, query = null, filters = null }) {
    const feed = this.workspaceAdapter.getSharedFeedById(feedId);
    if (!feed) {
      throw new Error('Feed not found');
    }
    
    // Check permission
    await this._checkPermission(userId, feed.workspaceId, 'edit_feeds');
    
    // Validate name if provided
    if (name !== null) {
      if (name.trim().length < 2) {
        throw new Error('Feed name must be at least 2 characters');
      }
      if (name.length > 100) {
        throw new Error('Feed name must be less than 100 characters');
      }
    }
    
    this.workspaceAdapter.updateSharedFeed(feedId, { name, query, filters });
    
    // Log activity
    if (this.activityTracker) {
      await this.activityTracker.logActivity(feed.workspaceId, userId, ACTIVITY_ACTIONS.FEED_UPDATED, {
        targetType: 'feed',
        targetId: feedId,
        details: { name: name || feed.name }
      });
    }
    
    this.logger.log(`[SharedFeedService] Feed ${feedId} updated by user ${userId}`);
    
    return this.workspaceAdapter.getSharedFeedById(feedId);
  }

  /**
   * Delete a shared feed
   * 
   * @param {number} feedId - Feed ID
   * @param {number} userId - Acting user ID
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If permission denied
   */
  async deleteFeed(feedId, userId) {
    const feed = this.workspaceAdapter.getSharedFeedById(feedId);
    if (!feed) {
      throw new Error('Feed not found');
    }
    
    // Check permission
    await this._checkPermission(userId, feed.workspaceId, 'delete_feed');
    
    const result = this.workspaceAdapter.deleteSharedFeed(feedId);
    
    // Log activity
    if (this.activityTracker) {
      await this.activityTracker.logActivity(feed.workspaceId, userId, ACTIVITY_ACTIONS.FEED_DELETED, {
        targetType: 'feed',
        targetId: feedId,
        details: { name: feed.name }
      });
    }
    
    this.logger.log(`[SharedFeedService] Feed ${feedId} deleted by user ${userId}`);
    
    return {
      success: result.changes > 0,
      message: 'Feed deleted successfully'
    };
  }

  /**
   * List all feeds in a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - Requesting user ID
   * @returns {Promise<Array<Object>>} Feeds list
   * @throws {Error} If not a member
   */
  async listFeeds(workspaceId, userId) {
    // Check permission (view_feeds is viewer-level)
    await this._checkPermission(userId, workspaceId, 'view_feeds');
    
    return this.workspaceAdapter.listWorkspaceFeeds(workspaceId);
  }

  // =================== Private Helpers ===================

  /**
   * Check if user has permission for action
   * @private
   */
  async _checkPermission(userId, workspaceId, action) {
    // Must be a member
    if (!this.workspaceAdapter.isMember(workspaceId, userId)) {
      throw new Error('Not a member of this workspace');
    }
    
    if (this.roleManager) {
      const hasPermission = await this.roleManager.checkPermission(userId, workspaceId, action);
      if (!hasPermission) {
        throw new Error(`Permission denied: ${action}`);
      }
    } else {
      // Fallback: check role directly
      const member = this.workspaceAdapter.getMember(workspaceId, userId);
      const editorActions = ['create_feed', 'edit_feeds', 'delete_feed'];
      
      if (editorActions.includes(action)) {
        if (member.role !== 'admin' && member.role !== 'editor') {
          throw new Error(`Permission denied: ${action}`);
        }
      }
    }
  }
}

module.exports = {
  SharedFeedService
};
