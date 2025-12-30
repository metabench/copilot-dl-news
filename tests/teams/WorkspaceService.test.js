'use strict';

/**
 * Tests for WorkspaceService
 * 
 * Tests workspace CRUD and member management with mock adapters.
 * Service methods are async, so tests use async/await patterns.
 */

const { WorkspaceService } = require('../../src/teams/WorkspaceService');
const { ROLES, ACTIVITY_ACTIONS } = require('../../src/db/sqlite/v1/queries/workspaceAdapter');

describe('WorkspaceService', () => {
  let service;
  let mockAdapter;
  let mockRoleManager;
  let mockActivityTracker;
  let mockLogger;

  beforeEach(() => {
    // Create mock adapter with all methods used by WorkspaceService
    mockAdapter = {
      // Workspace CRUD
      createWorkspace: jest.fn().mockReturnValue({ id: 1, slug: 'test' }),
      getWorkspaceById: jest.fn(),
      getWorkspaceBySlug: jest.fn(),
      updateWorkspace: jest.fn().mockReturnValue({ changes: 1 }),
      deleteWorkspace: jest.fn().mockReturnValue({ changes: 1 }),
      listUserWorkspaces: jest.fn().mockReturnValue([]),
      
      // Member management
      addMember: jest.fn().mockReturnValue({ changes: 1 }),
      getMember: jest.fn(),
      updateMemberRole: jest.fn().mockReturnValue({ changes: 1 }),
      removeMember: jest.fn().mockReturnValue({ changes: 1 }),
      listWorkspaceMembers: jest.fn().mockReturnValue([]),
      isMember: jest.fn().mockReturnValue(false),
      countMembers: jest.fn().mockReturnValue(0),
      
      // Feeds and annotations
      listWorkspaceFeeds: jest.fn().mockReturnValue([]),
      countAnnotations: jest.fn().mockReturnValue(0),
      countActivity: jest.fn().mockReturnValue(0),
      
      // Stats
      getWorkspaceStats: jest.fn().mockReturnValue({
        memberCount: 0,
        feedCount: 0,
        annotationCount: 0
      })
    };

    // Create mock role manager
    mockRoleManager = {
      checkPermission: jest.fn().mockReturnValue(true),
      hasRolePermission: jest.fn().mockReturnValue(true),
      getUserRole: jest.fn()
    };

    // Create mock activity tracker
    mockActivityTracker = {
      logActivity: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock logger
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    service = new WorkspaceService({
      workspaceAdapter: mockAdapter,
      roleManager: mockRoleManager,
      activityTracker: mockActivityTracker,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    it('should throw if adapter is not provided', () => {
      expect(() => new WorkspaceService({})).toThrow('WorkspaceService requires a workspaceAdapter');
    });

    it('should accept optional dependencies', () => {
      const minimalService = new WorkspaceService({ workspaceAdapter: mockAdapter });
      expect(minimalService).toBeDefined();
    });
  });

  // =================== Workspace CRUD ===================

  describe('createWorkspace', () => {
    it('should create workspace with valid name', async () => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Test',
        slug: 'test'
      });

      const result = await service.createWorkspace(1, { name: 'Test' });

      expect(mockAdapter.createWorkspace).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('should pass slug to adapter (adapter handles generation)', async () => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'My Test Workspace',
        slug: 'my-test-workspace'
      });

      await service.createWorkspace(1, { name: 'My Test Workspace' });

      const call = mockAdapter.createWorkspace.mock.calls[0][0];
      expect(call.slug).toBeNull(); // Service passes null, adapter generates slug
      expect(call.name).toBe('My Test Workspace');
    });

    it('should log workspace creation activity', async () => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Test',
        slug: 'test'
      });

      await service.createWorkspace(1, { name: 'Test' });

      expect(mockActivityTracker.logActivity).toHaveBeenCalledWith(
        1,
        1,
        ACTIVITY_ACTIONS.WORKSPACE_CREATED,
        expect.any(Object)
      );
    });

    it('should throw if name is too short', async () => {
      await expect(service.createWorkspace(1, { name: 'A' })).rejects.toThrow('at least 2 characters');
    });

    it('should throw if name is too long', async () => {
      const longName = 'a'.repeat(101);
      await expect(service.createWorkspace(1, { name: longName })).rejects.toThrow('less than 100 characters');
    });
  });

  describe('getWorkspace', () => {
    it('should return workspace by id', () => {
      const workspace = { id: 1, name: 'Test', slug: 'test' };
      mockAdapter.getWorkspaceById.mockReturnValue(workspace);

      const result = service.getWorkspace(1);

      expect(result).toEqual(workspace);
      expect(mockAdapter.getWorkspaceById).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent workspace', () => {
      mockAdapter.getWorkspaceById.mockReturnValue(null);

      const result = service.getWorkspace(999);

      expect(result).toBeNull();
    });
  });

  describe('getWorkspaceBySlug', () => {
    it('should return workspace by slug', () => {
      const workspace = { id: 1, name: 'Test', slug: 'test' };
      mockAdapter.getWorkspaceBySlug.mockReturnValue(workspace);

      const result = service.getWorkspaceBySlug('test');

      expect(result).toEqual(workspace);
      expect(mockAdapter.getWorkspaceBySlug).toHaveBeenCalledWith('test');
    });
  });

  describe('updateWorkspace', () => {
    beforeEach(() => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Original',
        slug: 'original'
      });
    });

    it('should update workspace with permission', async () => {
      await service.updateWorkspace(1, 1, { name: 'Updated' });

      expect(mockRoleManager.checkPermission).toHaveBeenCalledWith(1, 1, 'manage_workspace');
      expect(mockAdapter.updateWorkspace).toHaveBeenCalledWith(1, { name: 'Updated', settings: null });
    });

    it('should throw if workspace not found', async () => {
      mockAdapter.getWorkspaceById.mockReturnValue(null);

      await expect(service.updateWorkspace(999, 1, { name: 'Updated' })).rejects.toThrow('not found');
    });

    it('should throw without permission', async () => {
      mockRoleManager.checkPermission.mockReturnValue(false);

      await expect(service.updateWorkspace(1, 1, { name: 'Updated' })).rejects.toThrow('Permission denied');
    });
  });

  describe('deleteWorkspace', () => {
    beforeEach(() => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Test',
        slug: 'test',
        ownerId: 1  // Use camelCase as adapter normalizes output
      });
    });

    it('should delete workspace if owner', async () => {
      const result = await service.deleteWorkspace(1, 1);

      expect(mockAdapter.deleteWorkspace).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
    });

    it('should throw if not owner', async () => {
      await expect(service.deleteWorkspace(1, 2)).rejects.toThrow('Only the workspace owner can delete it');
    });

    it('should throw if workspace not found', async () => {
      mockAdapter.getWorkspaceById.mockReturnValue(null);

      await expect(service.deleteWorkspace(999, 1)).rejects.toThrow('not found');
    });
  });

  describe('listUserWorkspaces', () => {
    it('should return user workspaces', () => {
      const workspaces = [
        { id: 1, name: 'WS1', role: ROLES.ADMIN },
        { id: 2, name: 'WS2', role: ROLES.VIEWER }
      ];
      mockAdapter.listUserWorkspaces.mockReturnValue(workspaces);

      const result = service.listUserWorkspaces(1);

      expect(result).toEqual(workspaces);
      expect(mockAdapter.listUserWorkspaces).toHaveBeenCalledWith(1);
    });
  });

  describe('isMember', () => {
    it('should return true if user is member', () => {
      mockAdapter.isMember.mockReturnValue(true);

      const result = service.isMember(1, 1);

      expect(result).toBe(true);
      expect(mockAdapter.isMember).toHaveBeenCalledWith(1, 1);
    });

    it('should return false if user is not member', () => {
      mockAdapter.isMember.mockReturnValue(false);

      const result = service.isMember(1, 999);

      expect(result).toBe(false);
    });
  });

  describe('getWorkspaceStats', () => {
    it('should return workspace statistics', () => {
      mockAdapter.getWorkspaceById.mockReturnValue({ id: 1, name: 'Test' });
      mockAdapter.countMembers.mockReturnValue(5);
      mockAdapter.listWorkspaceFeeds.mockReturnValue([{}, {}, {}]); // 3 feeds
      mockAdapter.countActivity.mockReturnValue(10);

      const stats = service.getWorkspaceStats(1);

      expect(stats).toEqual({
        workspaceId: 1,
        memberCount: 5,
        feeds: 3,
        activityCount: 10
      });
    });
    
    it('should return null if workspace not found', () => {
      mockAdapter.getWorkspaceById.mockReturnValue(null);

      const stats = service.getWorkspaceStats(999);

      expect(stats).toBeNull();
    });
  });

  // =================== Member Management ===================

  describe('addMember', () => {
    beforeEach(() => {
      mockAdapter.getWorkspaceById.mockReturnValue({ id: 1, name: 'Test' });
      mockAdapter.isMember.mockReturnValue(false); // Not already a member
    });

    it('should add member with valid role', async () => {
      const member = { userId: 2, role: ROLES.EDITOR };
      mockAdapter.getMember.mockReturnValue(member);

      const result = await service.addMember(1, 1, 2, ROLES.EDITOR);

      expect(mockAdapter.addMember).toHaveBeenCalledWith({
        workspaceId: 1,
        userId: 2,
        role: ROLES.EDITOR
      });
      expect(result.role).toBe(ROLES.EDITOR);
    });

    it('should default to viewer role', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 2, role: ROLES.VIEWER });

      await service.addMember(1, 1, 2);

      expect(mockAdapter.addMember).toHaveBeenCalledWith({
        workspaceId: 1,
        userId: 2,
        role: ROLES.VIEWER
      });
    });

    it('should throw if already a member', async () => {
      mockAdapter.isMember.mockReturnValue(true);

      await expect(service.addMember(1, 1, 2, ROLES.EDITOR)).rejects.toThrow('already a member');
    });

    it('should throw if invalid role', async () => {
      await expect(service.addMember(1, 1, 2, 'superadmin')).rejects.toThrow('Invalid role');
    });

    it('should check permission before adding', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 2, role: ROLES.VIEWER });

      await service.addMember(1, 1, 2);

      expect(mockRoleManager.checkPermission).toHaveBeenCalledWith(1, 1, 'manage_members');
    });

    it('should throw without permission', async () => {
      mockRoleManager.checkPermission.mockReturnValue(false);

      await expect(service.addMember(1, 1, 2)).rejects.toThrow('Permission denied');
    });

    it('should log member addition', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 2, role: ROLES.VIEWER });

      await service.addMember(1, 1, 2);

      expect(mockActivityTracker.logActivity).toHaveBeenCalledWith(
        1,
        1,
        ACTIVITY_ACTIONS.MEMBER_ADDED,
        expect.objectContaining({ 
          targetType: 'user',
          targetId: 2
        })
      );
    });
  });

  describe('updateMemberRole', () => {
    beforeEach(() => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Test',
        ownerId: 1  // camelCase
      });
      mockAdapter.getMember.mockReturnValue({ userId: 2, role: ROLES.VIEWER });
    });

    it('should update member role', async () => {
      const updatedMember = { userId: 2, role: ROLES.EDITOR };
      mockAdapter.getMember
        .mockReturnValueOnce({ userId: 2, role: ROLES.VIEWER }) // Check exists
        .mockReturnValueOnce(updatedMember); // After update

      const result = await service.updateMemberRole(1, 1, 2, ROLES.EDITOR);

      expect(mockAdapter.updateMemberRole).toHaveBeenCalled();
      expect(result.role).toBe(ROLES.EDITOR);
    });

    it('should throw if changing owner role', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.ADMIN });

      await expect(service.updateMemberRole(1, 1, 1, ROLES.VIEWER)).rejects.toThrow("Cannot change the workspace owner's role");
    });

    it('should throw if target not a member', async () => {
      mockAdapter.getMember.mockReturnValue(null);

      await expect(service.updateMemberRole(1, 1, 999, ROLES.EDITOR)).rejects.toThrow('not a member');
    });

    it('should log role change activity', async () => {
      const updatedMember = { userId: 2, role: ROLES.EDITOR };
      mockAdapter.getMember
        .mockReturnValueOnce({ userId: 2, role: ROLES.VIEWER })
        .mockReturnValueOnce(updatedMember);

      await service.updateMemberRole(1, 1, 2, ROLES.EDITOR);

      expect(mockActivityTracker.logActivity).toHaveBeenCalledWith(
        1,
        1,
        ACTIVITY_ACTIONS.MEMBER_ROLE_CHANGED,
        expect.objectContaining({ 
          targetType: 'user',
          targetId: 2
        })
      );
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Test',
        ownerId: 1  // camelCase
      });
      mockAdapter.isMember.mockReturnValue(true); // Default: is a member
    });

    it('should remove member', async () => {
      const result = await service.removeMember(1, 1, 2);

      expect(mockAdapter.removeMember).toHaveBeenCalledWith(1, 2);
      expect(result.success).toBe(true);
    });

    it('should throw if trying to remove owner', async () => {
      await expect(service.removeMember(1, 1, 1)).rejects.toThrow('Cannot remove the workspace owner');
    });

    it('should throw if target not a member', async () => {
      mockAdapter.isMember.mockReturnValue(false);

      await expect(service.removeMember(1, 1, 999)).rejects.toThrow('not a member');
    });

    it('should log member removal', async () => {
      await service.removeMember(1, 1, 2);

      expect(mockActivityTracker.logActivity).toHaveBeenCalledWith(
        1,
        1,
        ACTIVITY_ACTIONS.MEMBER_REMOVED,
        expect.objectContaining({ 
          targetType: 'user',
          targetId: 2
        })
      );
    });
  });

  describe('listMembers', () => {
    it('should return members if user is a member', async () => {
      const members = [
        { userId: 1, role: ROLES.ADMIN },
        { userId: 2, role: ROLES.VIEWER }
      ];
      mockAdapter.isMember.mockReturnValue(true);
      mockAdapter.listWorkspaceMembers.mockReturnValue(members);

      const result = await service.listMembers(1, 1);

      expect(result).toEqual(members);
    });

    it('should throw if user is not a member', async () => {
      mockAdapter.isMember.mockReturnValue(false);

      await expect(service.listMembers(1, 999)).rejects.toThrow('Not a member');
    });
  });

  describe('leaveWorkspace', () => {
    beforeEach(() => {
      mockAdapter.getWorkspaceById.mockReturnValue({
        id: 1,
        name: 'Test',
        ownerId: 1  // camelCase
      });
    });

    it('should allow member to leave', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 2, role: ROLES.VIEWER });

      const result = await service.leaveWorkspace(1, 2);

      expect(mockAdapter.removeMember).toHaveBeenCalledWith(1, 2);
      expect(result.success).toBe(true);
    });

    it('should not allow owner to leave', async () => {
      mockAdapter.getMember.mockReturnValue({ userId: 1, role: ROLES.ADMIN });

      await expect(service.leaveWorkspace(1, 1)).rejects.toThrow('Owner cannot leave');
    });
  });
});
