'use strict';

/**
 * Tests for RoleManager
 * 
 * Tests role-based access control and permission checking
 */

const { RoleManager } = require('../../src/teams/RoleManager');
const { ROLES, ROLE_HIERARCHY } = require('../../src/data/db/sqlite/v1/queries/workspaceAdapter');

describe('RoleManager', () => {
  let roleManager;
  let mockAdapter;
  let mockLogger;

  beforeEach(() => {
    mockAdapter = {
      getMember: jest.fn(),
      getWorkspaceById: jest.fn(),
      isMember: jest.fn()
    };

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    roleManager = new RoleManager({
      workspaceAdapter: mockAdapter,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    it('should throw if adapter is not provided', () => {
      expect(() => new RoleManager({})).toThrow('RoleManager requires a workspaceAdapter');
    });

    it('should work without logger', () => {
      const rm = new RoleManager({ workspaceAdapter: mockAdapter });
      expect(rm).toBeDefined();
    });
  });

  describe('getUserRole', () => {
    it('should return user role in workspace', () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.EDITOR });

      const role = roleManager.getUserRole(1, 1);

      expect(role).toBe(ROLES.EDITOR);
      expect(mockAdapter.getMember).toHaveBeenCalledWith(1, 1);
    });

    it('should return null if user is not a member', () => {
      mockAdapter.getMember.mockReturnValue(null);

      const role = roleManager.getUserRole(999, 1);

      expect(role).toBeNull();
    });
  });

  describe('hasRolePermission', () => {
    describe('admin role', () => {
      it('should have all permissions', () => {
        expect(roleManager.hasRolePermission(ROLES.ADMIN, 'manage_members')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.ADMIN, 'manage_workspace')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.ADMIN, 'edit_feeds')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.ADMIN, 'view_feeds')).toBe(true);
      });
    });

    describe('editor role', () => {
      it('should have editor permissions', () => {
        expect(roleManager.hasRolePermission(ROLES.EDITOR, 'edit_feeds')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.EDITOR, 'create_feed')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.EDITOR, 'view_feeds')).toBe(true);
      });

      it('should not have admin permissions', () => {
        expect(roleManager.hasRolePermission(ROLES.EDITOR, 'manage_members')).toBe(false);
        expect(roleManager.hasRolePermission(ROLES.EDITOR, 'delete_workspace')).toBe(false);
      });
    });

    describe('viewer role', () => {
      it('should have viewer permissions', () => {
        expect(roleManager.hasRolePermission(ROLES.VIEWER, 'view_feeds')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.VIEWER, 'view_members')).toBe(true);
        expect(roleManager.hasRolePermission(ROLES.VIEWER, 'add_annotations')).toBe(true);
      });

      it('should not have editor permissions', () => {
        expect(roleManager.hasRolePermission(ROLES.VIEWER, 'edit_feeds')).toBe(false);
        expect(roleManager.hasRolePermission(ROLES.VIEWER, 'create_feed')).toBe(false);
      });

      it('should not have admin permissions', () => {
        expect(roleManager.hasRolePermission(ROLES.VIEWER, 'manage_members')).toBe(false);
      });
    });

    describe('invalid inputs', () => {
      it('should return false for unknown role', () => {
        expect(roleManager.hasRolePermission('superadmin', 'view_feeds')).toBe(false);
      });

      it('should return false for unknown action', () => {
        expect(roleManager.hasRolePermission(ROLES.ADMIN, 'unknown_action')).toBe(false);
      });

      it('should return false for null role', () => {
        expect(roleManager.hasRolePermission(null, 'view_feeds')).toBe(false);
      });
    });
  });

  describe('checkPermission', () => {
    it('should return true if user has permission', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.ADMIN });

      const result = await roleManager.checkPermission(1, 1, 'manage_members');

      expect(result).toBe(true);
    });

    it('should return false if user lacks permission', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.VIEWER });

      const result = await roleManager.checkPermission(1, 1, 'manage_members');

      expect(result).toBe(false);
    });

    it('should return false if user is not a member', async () => {
      mockAdapter.getMember.mockReturnValue(null);

      const result = await roleManager.checkPermission(999, 1, 'view_feeds');

      expect(result).toBe(false);
    });

    it('should check member role before returning', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.ADMIN });

      await roleManager.checkPermission(1, 1, 'manage_members');

      expect(mockAdapter.getMember).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all admin permissions', () => {
      const permissions = roleManager.getRolePermissions(ROLES.ADMIN);

      expect(permissions).toContain('manage_members');
      expect(permissions).toContain('manage_workspace');
      expect(permissions).toContain('edit_feeds');
      expect(permissions).toContain('view_feeds');
    });

    it('should return editor permissions', () => {
      const permissions = roleManager.getRolePermissions(ROLES.EDITOR);

      expect(permissions).toContain('edit_feeds');
      expect(permissions).toContain('view_feeds');
      expect(permissions).not.toContain('manage_members');
    });

    it('should return viewer permissions', () => {
      const permissions = roleManager.getRolePermissions(ROLES.VIEWER);

      expect(permissions).toContain('view_feeds');
      expect(permissions).not.toContain('edit_feeds');
      expect(permissions).not.toContain('manage_members');
    });

    it('should return empty array for unknown role', () => {
      const permissions = roleManager.getRolePermissions('superadmin');

      expect(permissions).toEqual([]);
    });
  });

  describe('compareRoles', () => {
    it('should correctly compare role levels', () => {
      // Admin is higher than editor
      expect(roleManager.compareRoles(ROLES.ADMIN, ROLES.EDITOR)).toBe(1);
      // Editor is higher than viewer
      expect(roleManager.compareRoles(ROLES.EDITOR, ROLES.VIEWER)).toBe(1);
      // Same roles
      expect(roleManager.compareRoles(ROLES.ADMIN, ROLES.ADMIN)).toBe(0);
      // Viewer is lower than admin
      expect(roleManager.compareRoles(ROLES.VIEWER, ROLES.ADMIN)).toBe(-1);
    });

    it('should handle unknown roles', () => {
      // Unknown roles get index -1, so comparison might vary
      const result = roleManager.compareRoles('unknown', ROLES.VIEWER);
      expect(typeof result).toBe('number');
    });
  });

  describe('canManageRole', () => {
    it('should allow admin to manage lower roles', () => {
      expect(roleManager.canManageRole(ROLES.ADMIN, ROLES.EDITOR)).toBe(true);
      expect(roleManager.canManageRole(ROLES.ADMIN, ROLES.VIEWER)).toBe(true);
    });

    it('should not allow non-admins to manage anyone', () => {
      // Based on the implementation, only admins can manage roles
      expect(roleManager.canManageRole(ROLES.EDITOR, ROLES.VIEWER)).toBe(false);
      expect(roleManager.canManageRole(ROLES.VIEWER, ROLES.VIEWER)).toBe(false);
    });
  });

  describe('isMember', () => {
    it('should return true if user is a member', () => {
      mockAdapter.isMember.mockReturnValue(true);

      expect(roleManager.isMember(1, 1)).toBe(true);
    });

    it('should return false if user is not a member', () => {
      mockAdapter.isMember.mockReturnValue(false);

      expect(roleManager.isMember(999, 1)).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true if user is admin', () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.ADMIN });

      expect(roleManager.isAdmin(1, 1)).toBe(true);
    });

    it('should return false if user is not admin', () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.VIEWER });

      expect(roleManager.isAdmin(1, 1)).toBe(false);
    });
  });

  describe('getAvailableRoles', () => {
    it('should return all available roles', () => {
      const roles = roleManager.getAvailableRoles();

      expect(roles).toContain(ROLES.ADMIN);
      expect(roles).toContain(ROLES.EDITOR);
      expect(roles).toContain(ROLES.VIEWER);
    });
  });
});

