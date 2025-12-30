'use strict';

/**
 * Tests for ActivityTracker
 * 
 * Tests activity logging and retrieval
 */

const { ActivityTracker } = require('../../src/teams/ActivityTracker');
const { ACTIVITY_ACTIONS } = require('../../src/db/sqlite/v1/queries/workspaceAdapter');

describe('ActivityTracker', () => {
  let tracker;
  let mockAdapter;
  let mockLogger;

  beforeEach(() => {
    mockAdapter = {
      logActivity: jest.fn().mockReturnValue({ id: 1 }),
      getWorkspaceActivity: jest.fn().mockReturnValue([]),
      countActivity: jest.fn().mockReturnValue(0),
      deleteOldActivity: jest.fn().mockReturnValue({ deleted: 0 })
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    };

    tracker = new ActivityTracker({
      workspaceAdapter: mockAdapter,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    it('should throw if workspaceAdapter is not provided', () => {
      expect(() => new ActivityTracker({})).toThrow('workspaceAdapter');
    });

    it('should work without logger (uses console)', () => {
      const t = new ActivityTracker({ workspaceAdapter: mockAdapter });
      expect(t).toBeDefined();
    });
  });

  // =================== Logging ===================

  describe('logActivity', () => {
    it('should log activity with details', async () => {
      const result = await tracker.logActivity(1, 1, ACTIVITY_ACTIONS.WORKSPACE_CREATED, {
        details: { name: 'Test Workspace' }
      });

      expect(mockAdapter.logActivity).toHaveBeenCalledWith({
        workspaceId: 1,
        userId: 1,
        action: ACTIVITY_ACTIONS.WORKSPACE_CREATED,
        targetType: null,
        targetId: null,
        details: { name: 'Test Workspace' }
      });
      expect(result.id).toBe(1);
    });

    it('should support targetType and targetId', async () => {
      await tracker.logActivity(1, 1, ACTIVITY_ACTIONS.MEMBER_ADDED, {
        targetType: 'user',
        targetId: 2,
        details: { role: 'editor' }
      });

      const call = mockAdapter.logActivity.mock.calls[0][0];
      expect(call.targetType).toBe('user');
      expect(call.targetId).toBe(2);
      expect(call.details).toEqual({ role: 'editor' });
    });

    it('should handle empty options', async () => {
      await tracker.logActivity(1, 1, ACTIVITY_ACTIONS.WORKSPACE_CREATED);

      const call = mockAdapter.logActivity.mock.calls[0][0];
      expect(call.targetType).toBeNull();
      expect(call.targetId).toBeNull();
      expect(call.details).toBeNull();
    });

    it('should log to logger', async () => {
      await tracker.logActivity(1, 1, ACTIVITY_ACTIONS.WORKSPACE_CREATED, { details: { test: true } });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[ActivityTracker] Logged:')
      );
    });

    it('should warn on unknown action', async () => {
      await tracker.logActivity(1, 1, 'INVALID_ACTION');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown action type')
      );
    });

    it('should return null on adapter error (does not throw)', async () => {
      mockAdapter.logActivity.mockImplementation(() => { throw new Error('DB error'); });

      const result = await tracker.logActivity(1, 1, ACTIVITY_ACTIONS.WORKSPACE_CREATED);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =================== Retrieval ===================

  describe('getActivity', () => {
    it('should return paginated activity', () => {
      const activities = [
        { id: 1, action: ACTIVITY_ACTIONS.WORKSPACE_CREATED },
        { id: 2, action: ACTIVITY_ACTIONS.MEMBER_ADDED }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(10);

      const result = tracker.getActivity(1, { limit: 10, offset: 0 });

      expect(result.activities).toEqual(activities);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should use default limit and offset', () => {
      mockAdapter.getWorkspaceActivity.mockReturnValue([]);
      mockAdapter.countActivity.mockReturnValue(0);

      tracker.getActivity(1);

      expect(mockAdapter.getWorkspaceActivity).toHaveBeenCalledWith(1, { limit: 50, offset: 0 });
    });

    it('should calculate hasMore correctly when at end', () => {
      mockAdapter.getWorkspaceActivity.mockReturnValue([{ id: 1 }]);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getActivity(1);

      expect(result.hasMore).toBe(false);
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity for workspace', () => {
      const activities = [
        { id: 1, action: ACTIVITY_ACTIONS.FEED_CREATED }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);

      const result = tracker.getRecentActivity(1);

      expect(result).toEqual(activities);
    });

    it('should use default limit of 10', () => {
      mockAdapter.getWorkspaceActivity.mockReturnValue([]);

      tracker.getRecentActivity(1);

      expect(mockAdapter.getWorkspaceActivity).toHaveBeenCalledWith(1, { limit: 10, offset: 0 });
    });

    it('should accept custom limit', () => {
      mockAdapter.getWorkspaceActivity.mockReturnValue([]);

      tracker.getRecentActivity(1, 5);

      expect(mockAdapter.getWorkspaceActivity).toHaveBeenCalledWith(1, { limit: 5, offset: 0 });
    });
  });

  describe('getFormattedActivity', () => {
    it('should return activity entries with message field', () => {
      const activities = [
        {
          id: 1,
          userId: 1,
          action: ACTIVITY_ACTIONS.WORKSPACE_CREATED,
          details: null,
          createdAt: '2025-12-26T10:00:00Z'
        }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getFormattedActivity(1);

      expect(result.activities).toHaveLength(1);
      expect(result.activities[0]).toHaveProperty('message');
      expect(result.activities[0].message).toContain('created');
    });

    it('should format member_added action', () => {
      const activities = [
        {
          id: 1,
          userId: 1,
          action: ACTIVITY_ACTIONS.MEMBER_ADDED,
          details: { role: 'editor' },
          createdAt: '2025-12-26T10:00:00Z'
        }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getFormattedActivity(1);

      expect(result.activities[0].message).toContain('added');
      expect(result.activities[0].message).toContain('editor');
    });

    it('should format member_removed action', () => {
      const activities = [
        {
          id: 1,
          userId: 1,
          action: ACTIVITY_ACTIONS.MEMBER_REMOVED,
          details: null,
          createdAt: '2025-12-26T10:00:00Z'
        }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getFormattedActivity(1);

      expect(result.activities[0].message).toContain('removed');
    });

    it('should format feed_created action', () => {
      const activities = [
        {
          id: 1,
          userId: 1,
          action: ACTIVITY_ACTIONS.FEED_CREATED,
          details: { name: 'News Feed' },
          createdAt: '2025-12-26T10:00:00Z'
        }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getFormattedActivity(1);

      expect(result.activities[0].message).toContain('feed');
      expect(result.activities[0].message).toContain('News Feed');
    });

    it('should format annotation_added action', () => {
      const activities = [
        {
          id: 1,
          userId: 1,
          action: ACTIVITY_ACTIONS.ANNOTATION_ADDED,
          details: { type: 'note' },
          createdAt: '2025-12-26T10:00:00Z'
        }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getFormattedActivity(1);

      expect(result.activities[0].message).toContain('note');
    });

    it('should handle unknown action gracefully', () => {
      const activities = [
        {
          id: 1,
          userId: 1,
          action: 'unknown_action',
          details: null,
          createdAt: '2025-12-26T10:00:00Z'
        }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);
      mockAdapter.countActivity.mockReturnValue(1);

      const result = tracker.getFormattedActivity(1);

      expect(result.activities[0].message).toContain('unknown_action');
    });
  });

  // =================== Stats ===================

  describe('getActivityStats', () => {
    it('should return activity statistics', () => {
      const activities = [
        { id: 1, userId: 1, action: ACTIVITY_ACTIONS.WORKSPACE_CREATED, createdAt: '2025-12-26T10:00:00Z' },
        { id: 2, userId: 1, action: ACTIVITY_ACTIONS.MEMBER_ADDED, createdAt: '2025-12-26T10:00:00Z' },
        { id: 3, userId: 2, action: ACTIVITY_ACTIONS.MEMBER_ADDED, createdAt: '2025-12-26T10:00:00Z' },
        { id: 4, userId: 1, action: ACTIVITY_ACTIONS.FEED_CREATED, createdAt: '2025-12-26T10:00:00Z' }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);

      const stats = tracker.getActivityStats(1);

      expect(stats.total).toBe(4);
      expect(stats.byAction[ACTIVITY_ACTIONS.MEMBER_ADDED]).toBe(2);
      expect(stats.byAction[ACTIVITY_ACTIONS.FEED_CREATED]).toBe(1);
      expect(stats.byUser[1]).toBe(3);
      expect(stats.byUser[2]).toBe(1);
    });

    it('should handle empty activity', () => {
      mockAdapter.getWorkspaceActivity.mockReturnValue([]);

      const stats = tracker.getActivityStats(1);

      expect(stats.total).toBe(0);
      expect(stats.byAction).toEqual({});
      expect(stats.byUser).toEqual({});
    });

    it('should return topActions sorted by count', () => {
      const activities = [
        { id: 1, userId: 1, action: ACTIVITY_ACTIONS.MEMBER_ADDED, createdAt: '2025-12-26T10:00:00Z' },
        { id: 2, userId: 1, action: ACTIVITY_ACTIONS.MEMBER_ADDED, createdAt: '2025-12-26T10:00:00Z' },
        { id: 3, userId: 1, action: ACTIVITY_ACTIONS.FEED_CREATED, createdAt: '2025-12-26T10:00:00Z' }
      ];
      mockAdapter.getWorkspaceActivity.mockReturnValue(activities);

      const stats = tracker.getActivityStats(1);

      expect(stats.topActions[0].action).toBe(ACTIVITY_ACTIONS.MEMBER_ADDED);
      expect(stats.topActions[0].count).toBe(2);
    });
  });

  // =================== Cleanup ===================

  describe('cleanup', () => {
    it('should delete activity older than specified days', () => {
      tracker.cleanup(30);

      expect(mockAdapter.deleteOldActivity).toHaveBeenCalledWith(30);
    });

    it('should use default retention of 90 days', () => {
      tracker.cleanup();

      expect(mockAdapter.deleteOldActivity).toHaveBeenCalledWith(90);
    });

    it('should log cleanup operation when items deleted', () => {
      mockAdapter.deleteOldActivity.mockReturnValue({ deleted: 5 });

      tracker.cleanup(30);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 5')
      );
    });

    it('should not log when no items deleted', () => {
      mockAdapter.deleteOldActivity.mockReturnValue({ deleted: 0 });

      tracker.cleanup(30);

      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('should return cleanup result', () => {
      mockAdapter.deleteOldActivity.mockReturnValue({ deleted: 3 });

      const result = tracker.cleanup(30);

      expect(result.deleted).toBe(3);
    });
  });

  // =================== Format Helper ===================

  describe('formatActivity', () => {
    it('should format workspace_created action', () => {
      const activity = {
        id: 1,
        userId: 1,
        action: ACTIVITY_ACTIONS.WORKSPACE_CREATED,
        details: null,
        createdAt: '2025-12-26T10:00:00Z'
      };

      const formatted = tracker.formatActivity(activity);

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('created');
    });

    it('should format member_added with role from details', () => {
      const activity = {
        id: 1,
        userId: 1,
        action: ACTIVITY_ACTIONS.MEMBER_ADDED,
        details: { role: 'editor' },
        createdAt: '2025-12-26T10:00:00Z'
      };

      const formatted = tracker.formatActivity(activity);

      expect(formatted).toContain('editor');
    });

    it('should format member_role_changed with old and new role', () => {
      const activity = {
        id: 1,
        userId: 1,
        action: ACTIVITY_ACTIONS.MEMBER_ROLE_CHANGED,
        details: { oldRole: 'viewer', newRole: 'editor' },
        createdAt: '2025-12-26T10:00:00Z'
      };

      const formatted = tracker.formatActivity(activity);

      expect(formatted).toContain('viewer');
      expect(formatted).toContain('editor');
    });

    it('should use user displayName when available', () => {
      const activity = {
        id: 1,
        userId: 1,
        user: { displayName: 'John Doe' },
        action: ACTIVITY_ACTIONS.WORKSPACE_CREATED,
        details: null,
        createdAt: '2025-12-26T10:00:00Z'
      };

      const formatted = tracker.formatActivity(activity);

      expect(formatted).toContain('John Doe');
    });

    it('should use user email as fallback', () => {
      const activity = {
        id: 1,
        userId: 1,
        user: { email: 'john@example.com' },
        action: ACTIVITY_ACTIONS.WORKSPACE_CREATED,
        details: null,
        createdAt: '2025-12-26T10:00:00Z'
      };

      const formatted = tracker.formatActivity(activity);

      expect(formatted).toContain('john@example.com');
    });

    it('should fallback to User <id> when no user info', () => {
      const activity = {
        id: 1,
        userId: 42,
        action: ACTIVITY_ACTIONS.WORKSPACE_CREATED,
        details: null,
        createdAt: '2025-12-26T10:00:00Z'
      };

      const formatted = tracker.formatActivity(activity);

      expect(formatted).toContain('User 42');
    });
  });
});
