'use strict';

/**
 * Tests for AnnotationService
 * 
 * Tests annotation CRUD with permission checking
 */

const { AnnotationService } = require('../../src/teams/AnnotationService');
const { ROLES, ANNOTATION_TYPES, ACTIVITY_ACTIONS } = require('../../src/data/db/sqlite/v1/queries/workspaceAdapter');

describe('AnnotationService', () => {
  let service;
  let mockAdapter;
  let mockRoleManager;
  let mockActivityTracker;
  let mockLogger;

  beforeEach(() => {
    mockAdapter = {
      createAnnotation: jest.fn().mockReturnValue({ id: 1 }),
      getAnnotationById: jest.fn(),
      getWorkspaceAnnotations: jest.fn().mockReturnValue([]),
      getContentAnnotations: jest.fn().mockReturnValue([]),
      getUserAnnotations: jest.fn().mockReturnValue([]),
      getUserContentAnnotations: jest.fn().mockReturnValue([]),
      updateAnnotation: jest.fn().mockReturnValue({ changes: 1 }),
      deleteAnnotation: jest.fn().mockReturnValue({ changes: 1 }),
      getMember: jest.fn(),
      isMember: jest.fn().mockReturnValue(true)
    };

    mockRoleManager = {
      checkPermission: jest.fn().mockReturnValue(true),
      getUserRole: jest.fn().mockReturnValue(ROLES.EDITOR)
    };

    mockActivityTracker = {
      logActivity: jest.fn()
    };

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    service = new AnnotationService({
      workspaceAdapter: mockAdapter,
      roleManager: mockRoleManager,
      activityTracker: mockActivityTracker,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    it('should throw if adapter is not provided', () => {
      expect(() => new AnnotationService({})).toThrow('AnnotationService requires a workspaceAdapter');
    });

    it('should work without optional dependencies', () => {
      const minimalService = new AnnotationService({ workspaceAdapter: mockAdapter });
      expect(minimalService).toBeDefined();
    });
  });

  // =================== Create Annotations ===================

  describe('createAnnotation', () => {
    it('should create annotation with valid type', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        type: ANNOTATION_TYPES.NOTE,
        data: JSON.stringify({ text: 'My note' })
      });

      const result = await service.createAnnotation(1, 100, {
        type: ANNOTATION_TYPES.NOTE,
        data: { text: 'My note' }
      });

      expect(mockAdapter.createAnnotation).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('should create private annotation when no workspace', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        workspaceId: null,
        type: ANNOTATION_TYPES.TAG
      });

      await service.createAnnotation(1, 100, {
        type: ANNOTATION_TYPES.TAG,
        data: { tag: 'important' }
      });

      const call = mockAdapter.createAnnotation.mock.calls[0][0];
      expect(call.workspaceId).toBeNull();
    });

    it('should check permission when creating in workspace', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        workspaceId: 1,
        type: ANNOTATION_TYPES.NOTE
      });

      await service.createAnnotation(1, 100, {
        type: ANNOTATION_TYPES.NOTE,
        data: { text: 'Note' },
        workspaceId: 1
      });

      expect(mockRoleManager.checkPermission).toHaveBeenCalledWith(1, 1, 'add_annotations');
    });

    it('should throw if invalid annotation type', async () => {
      await expect(service.createAnnotation(1, 100, {
        type: 'invalid_type',
        data: {}
      })).rejects.toThrow('Invalid annotation type');
    });

    it('should throw without permission for workspace annotation', async () => {
      mockRoleManager.checkPermission.mockReturnValue(false);

      await expect(service.createAnnotation(1, 100, {
        type: ANNOTATION_TYPES.NOTE,
        data: { text: 'Note' },
        workspaceId: 1
      })).rejects.toThrow('Permission denied');
    });

    it('should log activity when creating workspace annotation', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        workspaceId: 1,
        type: ANNOTATION_TYPES.NOTE
      });

      await service.createAnnotation(1, 100, {
        type: ANNOTATION_TYPES.NOTE,
        data: { text: 'Note' },
        workspaceId: 1
      });

      expect(mockActivityTracker.logActivity).toHaveBeenCalledWith(
        1,
        1,
        ACTIVITY_ACTIONS.ANNOTATION_ADDED,
        expect.objectContaining({ targetId: 100 })
      );
    });
  });

  describe('createHighlight', () => {
    it('should create highlight annotation', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        type: ANNOTATION_TYPES.HIGHLIGHT
      });

      const result = await service.createHighlight(1, 100, {
        text: 'highlighted text',
        startOffset: 10,
        endOffset: 25
      });

      expect(mockAdapter.createAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ANNOTATION_TYPES.HIGHLIGHT
        })
      );
      expect(result.type).toBe(ANNOTATION_TYPES.HIGHLIGHT);
    });
  });

  describe('createNote', () => {
    it('should create note annotation', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        type: ANNOTATION_TYPES.NOTE
      });

      const result = await service.createNote(1, 100, { text: 'My note text' });

      expect(mockAdapter.createAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ANNOTATION_TYPES.NOTE
        })
      );
      expect(result.type).toBe(ANNOTATION_TYPES.NOTE);
    });
  });

  describe('createTag', () => {
    it('should create tag annotation', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        type: ANNOTATION_TYPES.TAG
      });

      const result = await service.createTag(1, 100, { tag: 'important' });

      expect(mockAdapter.createAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ANNOTATION_TYPES.TAG
        })
      );
      expect(result.type).toBe(ANNOTATION_TYPES.TAG);
    });
  });

  // =================== Get Annotations ===================

  describe('getAnnotation', () => {
    it('should return annotation by id', () => {
      const annotation = {
        id: 1,
        type: ANNOTATION_TYPES.NOTE,
        data: JSON.stringify({ text: 'Note' })
      };
      mockAdapter.getAnnotationById.mockReturnValue(annotation);

      const result = service.getAnnotation(1);

      expect(result).toEqual(annotation);
    });

    it('should return null for non-existent annotation', () => {
      mockAdapter.getAnnotationById.mockReturnValue(null);

      const result = service.getAnnotation(999);

      expect(result).toBeNull();
    });
  });

  describe('getWorkspaceAnnotations', () => {
    it('should return annotations for workspace', async () => {
      const annotations = [
        { id: 1, type: ANNOTATION_TYPES.NOTE },
        { id: 2, type: ANNOTATION_TYPES.HIGHLIGHT }
      ];
      mockAdapter.isMember.mockReturnValue(true);
      mockAdapter.getWorkspaceAnnotations.mockReturnValue(annotations);

      const result = await service.getWorkspaceAnnotations(1, 1);

      expect(result).toEqual(annotations);
    });

    it('should throw if user is not a member', async () => {
      mockAdapter.isMember.mockReturnValue(false);

      await expect(service.getWorkspaceAnnotations(1, 999)).rejects.toThrow('Not a member');
    });
  });

  describe('getWorkspaceContentAnnotations', () => {
    it('should return annotations for specific content in workspace', async () => {
      const annotations = [
        { id: 1, contentId: 100, type: ANNOTATION_TYPES.NOTE }
      ];
      mockAdapter.isMember.mockReturnValue(true);
      mockAdapter.getContentAnnotations.mockReturnValue(annotations);

      const result = await service.getWorkspaceContentAnnotations(1, 100, 1);

      expect(result).toEqual(annotations);
      expect(mockAdapter.getContentAnnotations).toHaveBeenCalledWith(100, { workspaceId: 1 });
    });

    it('should throw if user is not a member', async () => {
      mockAdapter.isMember.mockReturnValue(false);

      await expect(service.getWorkspaceContentAnnotations(1, 100, 999)).rejects.toThrow('Not a member');
    });
  });

  describe('getUserAnnotations', () => {
    it('should return user annotations', () => {
      const annotations = [
        { id: 1, userId: 1, type: ANNOTATION_TYPES.TAG }
      ];
      mockAdapter.getUserAnnotations.mockReturnValue(annotations);

      const result = service.getUserAnnotations(1);

      expect(result).toEqual(annotations);
      expect(mockAdapter.getUserAnnotations).toHaveBeenCalledWith(1, 50);
    });

    it('should respect limit', () => {
      mockAdapter.getUserAnnotations.mockReturnValue([]);

      service.getUserAnnotations(1, 25);

      expect(mockAdapter.getUserAnnotations).toHaveBeenCalledWith(1, 25);
    });
  });

  describe('getUserContentAnnotations', () => {
    it('should return user annotations on specific content', () => {
      const annotations = [
        { id: 1, userId: 1, contentId: 100, type: ANNOTATION_TYPES.NOTE }
      ];
      mockAdapter.getContentAnnotations.mockReturnValue(annotations);

      const result = service.getUserContentAnnotations(1, 100);

      expect(result).toEqual(annotations);
      expect(mockAdapter.getContentAnnotations).toHaveBeenCalledWith(100, { userId: 1 });
    });
  });

  // =================== Update Annotation ===================

  describe('updateAnnotation', () => {
    beforeEach(() => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        userId: 1,
        workspaceId: 1,
        type: ANNOTATION_TYPES.NOTE,
        data: { text: 'Original' }
      });
    });

    it('should update annotation data', async () => {
      const updatedAnnotation = {
        id: 1,
        userId: 1,
        type: ANNOTATION_TYPES.NOTE,
        data: { text: 'Updated' }
      };
      mockAdapter.getAnnotationById
        .mockReturnValueOnce({ id: 1, userId: 1, workspaceId: 1, type: ANNOTATION_TYPES.NOTE })
        .mockReturnValueOnce(updatedAnnotation);

      const result = await service.updateAnnotation(1, 1, { text: 'Updated' });

      expect(mockAdapter.updateAnnotation).toHaveBeenCalled();
      expect(result.data).toEqual({ text: 'Updated' });
    });

    it('should throw if annotation not found', async () => {
      mockAdapter.getAnnotationById.mockReturnValue(null);

      await expect(service.updateAnnotation(999, 1, { text: 'Updated' })).rejects.toThrow('not found');
    });

    it('should throw if user is not the creator', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        userId: 2, // Different user
        workspaceId: 1
      });

      await expect(service.updateAnnotation(1, 1, { text: 'Updated' })).rejects.toThrow('Only the annotation creator');
    });
  });

  // =================== Delete Annotation ===================

  describe('deleteAnnotation', () => {
    beforeEach(() => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        userId: 1,
        workspaceId: 1,
        type: ANNOTATION_TYPES.NOTE
      });
    });

    it('should delete annotation', async () => {
      const result = await service.deleteAnnotation(1, 1);

      expect(mockAdapter.deleteAnnotation).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
    });

    it('should throw if annotation not found', async () => {
      mockAdapter.getAnnotationById.mockReturnValue(null);

      await expect(service.deleteAnnotation(999, 1)).rejects.toThrow('not found');
    });

    it('should throw if user is not the creator', async () => {
      mockAdapter.getAnnotationById.mockReturnValue({
        id: 1,
        userId: 2, // Different user
        workspaceId: 1
      });

      await expect(service.deleteAnnotation(1, 1)).rejects.toThrow('Only the annotation creator');
    });

    it('should log activity when deleting workspace annotation', async () => {
      await service.deleteAnnotation(1, 1);

      expect(mockActivityTracker.logActivity).toHaveBeenCalledWith(
        1,
        1,
        ACTIVITY_ACTIONS.ANNOTATION_DELETED,
        expect.any(Object)
      );
    });
  });
});

