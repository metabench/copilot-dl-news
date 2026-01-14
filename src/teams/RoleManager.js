'use strict';

/**
 * RoleManager - Role-based access control for workspaces
 * 
 * Handles:
 * - Permission checks for workspace actions
 * - Role hierarchy (admin > editor > viewer)
 * - Action-to-role mapping
 * 
 * Roles:
 * - admin: Full access - manage members, delete workspace, all editor permissions
 * - editor: Create/edit shared feeds, add team-visible annotations
 * - viewer: Read-only - view feeds, see team annotations, add private annotations only
 * 
 * All database operations go through the workspaceAdapter (no SQL here).
 * 
 * @module RoleManager
 */

const { ROLES, ROLE_HIERARCHY } = require('../data/db/sqlite/v1/queries/workspaceAdapter');

/**
 * Actions and their minimum required roles
 */
const ACTION_PERMISSIONS = {
  // Admin-only actions
  manage_members: ROLES.ADMIN,
  manage_workspace: ROLES.ADMIN,
  delete_workspace: ROLES.ADMIN,
  
  // Editor+ actions
  edit_feeds: ROLES.EDITOR,
  create_feed: ROLES.EDITOR,
  delete_feed: ROLES.EDITOR,
  add_team_annotations: ROLES.EDITOR,
  
  // Viewer+ actions (any member can do)
  view_feeds: ROLES.VIEWER,
  view_members: ROLES.VIEWER,
  view_annotations: ROLES.VIEWER,
  add_annotations: ROLES.VIEWER,       // Private annotations
  view_activity: ROLES.VIEWER
};

/**
 * RoleManager class
 */
class RoleManager {
  /**
   * Create a RoleManager
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.workspaceAdapter - Workspace database adapter
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.workspaceAdapter) {
      throw new Error('RoleManager requires a workspaceAdapter');
    }
    
    this.workspaceAdapter = options.workspaceAdapter;
    this.logger = options.logger || console;
  }

  /**
   * Check if a user has permission for an action in a workspace
   * 
   * @param {number} userId - User ID
   * @param {number} workspaceId - Workspace ID
   * @param {string} action - Action to check
   * @returns {Promise<boolean>} True if permitted
   */
  async checkPermission(userId, workspaceId, action) {
    // Get user's role in workspace
    const member = this.workspaceAdapter.getMember(workspaceId, userId);
    
    // Not a member = no permission
    if (!member) {
      return false;
    }
    
    // Check if user's role meets the minimum requirement
    return this.hasRolePermission(member.role, action);
  }

  /**
   * Check if a role has permission for an action (no DB lookup)
   * 
   * @param {string} role - User's role
   * @param {string} action - Action to check
   * @returns {boolean} True if permitted
   */
  hasRolePermission(role, action) {
    const requiredRole = ACTION_PERMISSIONS[action];
    
    // Unknown action = deny
    if (!requiredRole) {
      this.logger.warn(`[RoleManager] Unknown action: ${action}`);
      return false;
    }
    
    // Compare role hierarchy positions
    const userRoleIndex = ROLE_HIERARCHY.indexOf(role);
    const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
    
    // Invalid role = deny
    if (userRoleIndex === -1) {
      return false;
    }
    
    // User's role must be >= required role in hierarchy
    return userRoleIndex >= requiredRoleIndex;
  }

  /**
   * Get user's role in a workspace
   * 
   * @param {number} userId - User ID
   * @param {number} workspaceId - Workspace ID
   * @returns {string|null} Role or null if not a member
   */
  getUserRole(userId, workspaceId) {
    const member = this.workspaceAdapter.getMember(workspaceId, userId);
    return member ? member.role : null;
  }

  /**
   * Check if user is a member of workspace
   * 
   * @param {number} userId - User ID
   * @param {number} workspaceId - Workspace ID
   * @returns {boolean}
   */
  isMember(userId, workspaceId) {
    return this.workspaceAdapter.isMember(workspaceId, userId);
  }

  /**
   * Check if user is an admin of workspace
   * 
   * @param {number} userId - User ID
   * @param {number} workspaceId - Workspace ID
   * @returns {boolean}
   */
  isAdmin(userId, workspaceId) {
    const member = this.workspaceAdapter.getMember(workspaceId, userId);
    return member && member.role === ROLES.ADMIN;
  }

  /**
   * Check if user is the workspace owner
   * 
   * @param {number} userId - User ID
   * @param {number} workspaceId - Workspace ID
   * @returns {boolean}
   */
  isOwner(userId, workspaceId) {
    const workspace = this.workspaceAdapter.getWorkspaceById(workspaceId);
    return workspace && workspace.ownerId === userId;
  }

  /**
   * Get all permissions for a role
   * 
   * @param {string} role - Role name
   * @returns {string[]} List of allowed actions
   */
  getRolePermissions(role) {
    const roleIndex = ROLE_HIERARCHY.indexOf(role);
    if (roleIndex === -1) {
      return [];
    }
    
    return Object.entries(ACTION_PERMISSIONS)
      .filter(([, requiredRole]) => {
        const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
        return roleIndex >= requiredIndex;
      })
      .map(([action]) => action);
  }

  /**
   * Get all available roles
   * 
   * @returns {string[]} Role names in hierarchy order
   */
  getAvailableRoles() {
    return [...ROLE_HIERARCHY];
  }

  /**
   * Get role description
   * 
   * @param {string} role - Role name
   * @returns {Object} Role info with description and permissions
   */
  getRoleInfo(role) {
    const descriptions = {
      [ROLES.ADMIN]: 'Full access - manage members, workspace settings, and all content',
      [ROLES.EDITOR]: 'Can create and edit shared feeds and team annotations',
      [ROLES.VIEWER]: 'Read-only access to feeds and annotations, can add private annotations'
    };
    
    return {
      name: role,
      description: descriptions[role] || 'Unknown role',
      permissions: this.getRolePermissions(role),
      hierarchyLevel: ROLE_HIERARCHY.indexOf(role)
    };
  }

  /**
   * Compare two roles
   * 
   * @param {string} role1 - First role
   * @param {string} role2 - Second role
   * @returns {number} -1 if role1 < role2, 0 if equal, 1 if role1 > role2
   */
  compareRoles(role1, role2) {
    const index1 = ROLE_HIERARCHY.indexOf(role1);
    const index2 = ROLE_HIERARCHY.indexOf(role2);
    
    if (index1 < index2) return -1;
    if (index1 > index2) return 1;
    return 0;
  }

  /**
   * Check if role can manage another role
   * Admins can manage editors and viewers
   * Editors cannot manage anyone
   * Viewers cannot manage anyone
   * 
   * @param {string} actorRole - Actor's role
   * @param {string} targetRole - Target user's role
   * @returns {boolean}
   */
  canManageRole(actorRole, targetRole) {
    // Only admins can manage roles
    if (actorRole !== ROLES.ADMIN) {
      return false;
    }
    
    // Admins can manage all roles except other admins (owner handles that)
    return targetRole !== ROLES.ADMIN;
  }

  /**
   * Require permission or throw
   * Convenience method for middleware/service use
   * 
   * @param {number} userId - User ID
   * @param {number} workspaceId - Workspace ID
   * @param {string} action - Action to check
   * @throws {Error} If permission denied
   */
  async requirePermission(userId, workspaceId, action) {
    const hasPermission = await this.checkPermission(userId, workspaceId, action);
    if (!hasPermission) {
      throw new Error(`Permission denied: ${action}`);
    }
  }
}

module.exports = {
  RoleManager,
  ROLES,
  ROLE_HIERARCHY,
  ACTION_PERMISSIONS
};
