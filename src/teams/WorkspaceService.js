'use strict';

/**
 * WorkspaceService - Team workspace management
 * 
 * Handles:
 * - Workspace CRUD operations
 * - Member management with role validation
 * - Permission checking before operations
 * - Activity logging for all actions
 * 
 * All database operations go through the workspaceAdapter (no SQL here).
 * 
 * @module WorkspaceService
 */

const { ROLES, ROLE_HIERARCHY, ACTIVITY_ACTIONS } = require('../db/sqlite/v1/queries/workspaceAdapter');

/**
 * WorkspaceService class
 */
class WorkspaceService {
  /**
   * Create a WorkspaceService
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.workspaceAdapter - Workspace database adapter
   * @param {Object} [options.userAdapter] - User database adapter (for validation)
   * @param {Object} [options.roleManager] - RoleManager instance
   * @param {Object} [options.activityTracker] - ActivityTracker instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.workspaceAdapter) {
      throw new Error('WorkspaceService requires a workspaceAdapter');
    }
    
    this.workspaceAdapter = options.workspaceAdapter;
    this.userAdapter = options.userAdapter || null;
    this.roleManager = options.roleManager || null;
    this.activityTracker = options.activityTracker || null;
    this.logger = options.logger || console;
  }

  // =================== Workspace CRUD ===================

  /**
   * Create a new workspace
   * 
   * @param {number} userId - Creating user ID (becomes owner)
   * @param {Object} data - Workspace data
   * @param {string} data.name - Workspace name
   * @param {string} [data.slug] - URL slug (auto-generated if not provided)
   * @param {Object} [data.settings={}] - Workspace settings
   * @returns {Promise<Object>} Created workspace
   * @throws {Error} If validation fails
   */
  async createWorkspace(userId, { name, slug = null, settings = {} }) {
    // Validate name
    if (!name || name.trim().length < 2) {
      throw new Error('Workspace name must be at least 2 characters');
    }
    
    if (name.length > 100) {
      throw new Error('Workspace name must be less than 100 characters');
    }
    
    // Create workspace (owner is auto-added as admin)
    try {
      const result = this.workspaceAdapter.createWorkspace({
        ownerId: userId,
        name: name.trim(),
        slug,
        settings
      });
      
      // Log activity
      if (this.activityTracker) {
        await this.activityTracker.logActivity(result.id, userId, ACTIVITY_ACTIONS.WORKSPACE_CREATED, {
          targetType: 'workspace',
          targetId: result.id,
          details: { name: name.trim() }
        });
      }
      
      this.logger.log(`[WorkspaceService] Workspace created: ${name} (id: ${result.id}) by user ${userId}`);
      
      // Return full workspace
      return this.workspaceAdapter.getWorkspaceById(result.id);
    } catch (err) {
      this.logger.error(`[WorkspaceService] Failed to create workspace:`, err.message);
      throw err;
    }
  }

  /**
   * Get workspace by ID
   * 
   * @param {number} workspaceId - Workspace ID
   * @returns {Object|null} Workspace or null
   */
  getWorkspace(workspaceId) {
    return this.workspaceAdapter.getWorkspaceById(workspaceId);
  }

  /**
   * Get workspace by slug
   * 
   * @param {string} slug - Workspace slug
   * @returns {Object|null} Workspace or null
   */
  getWorkspaceBySlug(slug) {
    return this.workspaceAdapter.getWorkspaceBySlug(slug);
  }

  /**
   * Update workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - Acting user ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.name] - New name
   * @param {Object} [updates.settings] - New settings
   * @returns {Promise<Object>} Updated workspace
   * @throws {Error} If not authorized or validation fails
   */
  async updateWorkspace(workspaceId, userId, { name = null, settings = null }) {
    // Check permission
    await this._checkPermission(userId, workspaceId, 'manage_workspace');
    
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    
    // Validate name if provided
    if (name !== null) {
      if (name.trim().length < 2) {
        throw new Error('Workspace name must be at least 2 characters');
      }
      if (name.length > 100) {
        throw new Error('Workspace name must be less than 100 characters');
      }
    }
    
    this.workspaceAdapter.updateWorkspace(workspaceId, { name, settings });
    
    this.logger.log(`[WorkspaceService] Workspace ${workspaceId} updated by user ${userId}`);
    
    return this.workspaceAdapter.getWorkspaceById(workspaceId);
  }

  /**
   * Delete workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - Acting user ID
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If not authorized
   */
  async deleteWorkspace(workspaceId, userId) {
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    
    // Only owner can delete
    if (workspace.ownerId !== userId) {
      throw new Error('Only the workspace owner can delete it');
    }
    
    const result = this.workspaceAdapter.deleteWorkspace(workspaceId);
    
    this.logger.log(`[WorkspaceService] Workspace ${workspaceId} deleted by owner ${userId}`);
    
    return {
      success: result.changes > 0,
      message: 'Workspace deleted successfully'
    };
  }

  /**
   * List workspaces for a user
   * 
   * @param {number} userId - User ID
   * @returns {Array<Object>} User's workspaces
   */
  listUserWorkspaces(userId) {
    return this.workspaceAdapter.listUserWorkspaces(userId);
  }

  // =================== Member Management ===================

  /**
   * Add a member to a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} actingUserId - User performing the action
   * @param {number} targetUserId - User to add
   * @param {string} [role='viewer'] - Role to assign
   * @returns {Promise<Object>} Added member
   * @throws {Error} If not authorized or user not found
   */
  async addMember(workspaceId, actingUserId, targetUserId, role = ROLES.VIEWER) {
    // Check permission
    await this._checkPermission(actingUserId, workspaceId, 'manage_members');
    
    // Validate role
    if (!ROLE_HIERARCHY.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${ROLE_HIERARCHY.join(', ')}`);
    }
    
    // Verify target user exists (if userAdapter available)
    if (this.userAdapter) {
      const user = this.userAdapter.getUserById(targetUserId);
      if (!user) {
        throw new Error('User not found');
      }
    }
    
    // Check if already a member
    if (this.workspaceAdapter.isMember(workspaceId, targetUserId)) {
      throw new Error('User is already a member of this workspace');
    }
    
    this.workspaceAdapter.addMember({
      workspaceId,
      userId: targetUserId,
      role
    });
    
    // Log activity
    if (this.activityTracker) {
      await this.activityTracker.logActivity(workspaceId, actingUserId, ACTIVITY_ACTIONS.MEMBER_ADDED, {
        targetType: 'user',
        targetId: targetUserId,
        details: { role }
      });
    }
    
    this.logger.log(`[WorkspaceService] User ${targetUserId} added to workspace ${workspaceId} with role ${role}`);
    
    return this.workspaceAdapter.getMember(workspaceId, targetUserId);
  }

  /**
   * Remove a member from a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} actingUserId - User performing the action
   * @param {number} targetUserId - User to remove
   * @returns {Promise<Object>} Removal result
   * @throws {Error} If not authorized
   */
  async removeMember(workspaceId, actingUserId, targetUserId) {
    // Check permission
    await this._checkPermission(actingUserId, workspaceId, 'manage_members');
    
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    
    // Cannot remove the owner
    if (workspace.ownerId === targetUserId) {
      throw new Error('Cannot remove the workspace owner');
    }
    
    // Check if member exists
    if (!this.workspaceAdapter.isMember(workspaceId, targetUserId)) {
      throw new Error('User is not a member of this workspace');
    }
    
    const result = this.workspaceAdapter.removeMember(workspaceId, targetUserId);
    
    // Log activity
    if (this.activityTracker) {
      await this.activityTracker.logActivity(workspaceId, actingUserId, ACTIVITY_ACTIONS.MEMBER_REMOVED, {
        targetType: 'user',
        targetId: targetUserId
      });
    }
    
    this.logger.log(`[WorkspaceService] User ${targetUserId} removed from workspace ${workspaceId}`);
    
    return {
      success: result.changes > 0,
      message: 'Member removed successfully'
    };
  }

  /**
   * Update member role
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} actingUserId - User performing the action
   * @param {number} targetUserId - User to update
   * @param {string} role - New role
   * @returns {Promise<Object>} Updated member
   * @throws {Error} If not authorized or invalid role
   */
  async updateMemberRole(workspaceId, actingUserId, targetUserId, role) {
    // Check permission
    await this._checkPermission(actingUserId, workspaceId, 'manage_members');
    
    // Validate role
    if (!ROLE_HIERARCHY.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${ROLE_HIERARCHY.join(', ')}`);
    }
    
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    
    // Cannot change owner's role
    if (workspace.ownerId === targetUserId) {
      throw new Error('Cannot change the workspace owner\'s role');
    }
    
    // Check if member exists
    const member = this.workspaceAdapter.getMember(workspaceId, targetUserId);
    if (!member) {
      throw new Error('User is not a member of this workspace');
    }
    
    const oldRole = member.role;
    
    this.workspaceAdapter.updateMemberRole({
      workspaceId,
      userId: targetUserId,
      role
    });
    
    // Log activity
    if (this.activityTracker) {
      await this.activityTracker.logActivity(workspaceId, actingUserId, ACTIVITY_ACTIONS.MEMBER_ROLE_CHANGED, {
        targetType: 'user',
        targetId: targetUserId,
        details: { oldRole, newRole: role }
      });
    }
    
    this.logger.log(`[WorkspaceService] User ${targetUserId} role changed from ${oldRole} to ${role} in workspace ${workspaceId}`);
    
    return this.workspaceAdapter.getMember(workspaceId, targetUserId);
  }

  /**
   * List workspace members
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - Requesting user ID
   * @returns {Promise<Array<Object>>} Members list
   * @throws {Error} If not a member
   */
  async listMembers(workspaceId, userId) {
    // Must be a member to see other members
    if (!this.workspaceAdapter.isMember(workspaceId, userId)) {
      throw new Error('Not a member of this workspace');
    }
    
    return this.workspaceAdapter.listWorkspaceMembers(workspaceId);
  }

  /**
   * Get member info
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - User ID to get
   * @returns {Object|null} Member info
   */
  getMember(workspaceId, userId) {
    return this.workspaceAdapter.getMember(workspaceId, userId);
  }

  /**
   * Check if user is a member
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - User ID
   * @returns {boolean}
   */
  isMember(workspaceId, userId) {
    return this.workspaceAdapter.isMember(workspaceId, userId);
  }

  /**
   * Leave a workspace (self-removal)
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - User leaving
   * @returns {Promise<Object>} Result
   * @throws {Error} If owner tries to leave
   */
  async leaveWorkspace(workspaceId, userId) {
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    
    // Owner cannot leave (must delete or transfer ownership)
    if (workspace.ownerId === userId) {
      throw new Error('Owner cannot leave workspace. Transfer ownership or delete the workspace.');
    }
    
    const result = this.workspaceAdapter.removeMember(workspaceId, userId);
    
    this.logger.log(`[WorkspaceService] User ${userId} left workspace ${workspaceId}`);
    
    return {
      success: result.changes > 0,
      message: 'Left workspace successfully'
    };
  }

  // =================== Stats ===================

  /**
   * Get workspace statistics
   * 
   * @param {number} workspaceId - Workspace ID
   * @returns {Object} Workspace stats
   */
  getWorkspaceStats(workspaceId) {
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    if (!workspace) {
      return null;
    }
    
    return {
      workspaceId,
      memberCount: this.workspaceAdapter.countMembers(workspaceId),
      feeds: this.workspaceAdapter.listWorkspaceFeeds(workspaceId).length,
      activityCount: this.workspaceAdapter.countActivity(workspaceId)
    };
  }

  /**
   * Get global workspace stats
   * 
   * @returns {Object} System-wide stats
   */
  getStats() {
    return this.workspaceAdapter.getStats();
  }

  // =================== Private Helpers ===================

  /**
   * Check if user has permission for action
   * @private
   */
  async _checkPermission(userId, workspaceId, action) {
    if (this.roleManager) {
      const hasPermission = await this.roleManager.checkPermission(userId, workspaceId, action);
      if (!hasPermission) {
        throw new Error(`Permission denied: ${action}`);
      }
    } else {
      // Fallback: only admins can manage
      const member = this.workspaceAdapter.getMember(workspaceId, userId);
      if (!member || member.role !== ROLES.ADMIN) {
        throw new Error(`Permission denied: ${action}`);
      }
    }
  }
}

module.exports = {
  WorkspaceService,
  ROLES,
  ROLE_HIERARCHY
};
