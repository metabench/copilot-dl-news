'use strict';

/**
 * AnnotationService - Manage content annotations
 * 
 * Handles:
 * - Creating highlights, notes, and tags on content
 * - Private annotations (user-only) vs workspace-shared annotations
 * - Permission checks for workspace annotations
 * - Annotation retrieval with filtering
 * 
 * All database operations go through the workspaceAdapter (no SQL here).
 * 
 * @module AnnotationService
 */

const { ANNOTATION_TYPES, ACTIVITY_ACTIONS } = require('../db/sqlite/v1/queries/workspaceAdapter');

/**
 * AnnotationService class
 */
class AnnotationService {
  /**
   * Create an AnnotationService
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.workspaceAdapter - Workspace database adapter
   * @param {Object} [options.roleManager] - RoleManager instance
   * @param {Object} [options.activityTracker] - ActivityTracker instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.workspaceAdapter) {
      throw new Error('AnnotationService requires a workspaceAdapter');
    }
    
    this.workspaceAdapter = options.workspaceAdapter;
    this.roleManager = options.roleManager || null;
    this.activityTracker = options.activityTracker || null;
    this.logger = options.logger || console;
  }

  // =================== Annotation CRUD ===================

  /**
   * Create an annotation on content
   * 
   * @param {number} userId - Creating user ID
   * @param {number} contentId - Content ID to annotate
   * @param {Object} data - Annotation data
   * @param {string} data.type - Annotation type (highlight, note, tag)
   * @param {Object} data.data - Type-specific data
   * @param {number} [data.workspaceId] - Workspace ID for team-visible annotation
   * @returns {Promise<Object>} Created annotation
   * @throws {Error} If validation fails or permission denied
   */
  async createAnnotation(userId, contentId, { type, data, workspaceId = null }) {
    // Validate type
    if (!Object.values(ANNOTATION_TYPES).includes(type)) {
      throw new Error(`Invalid annotation type: ${type}. Must be one of: ${Object.values(ANNOTATION_TYPES).join(', ')}`);
    }
    
    // Validate data for type
    this._validateAnnotationData(type, data);
    
    // If workspace annotation, check permission
    if (workspaceId) {
      await this._checkWorkspaceAnnotationPermission(userId, workspaceId);
    }
    
    // Create annotation
    const result = this.workspaceAdapter.createAnnotation({
      contentId,
      userId,
      workspaceId,
      type,
      data
    });
    
    // Log activity if workspace annotation
    if (workspaceId && this.activityTracker) {
      await this.activityTracker.logActivity(workspaceId, userId, ACTIVITY_ACTIONS.ANNOTATION_ADDED, {
        targetType: 'content',
        targetId: contentId,
        details: { type, annotationId: result.id }
      });
    }
    
    this.logger.log(`[AnnotationService] Annotation created: ${type} on content ${contentId} by user ${userId}`);
    
    return this.workspaceAdapter.getAnnotationById(result.id);
  }

  /**
   * Create a highlight annotation
   * 
   * @param {number} userId - User ID
   * @param {number} contentId - Content ID
   * @param {Object} options - Highlight options
   * @param {string} options.text - Highlighted text
   * @param {number} [options.startOffset] - Start position
   * @param {number} [options.endOffset] - End position
   * @param {string} [options.color] - Highlight color
   * @param {number} [options.workspaceId] - Workspace ID
   * @returns {Promise<Object>} Created annotation
   */
  async createHighlight(userId, contentId, { text, startOffset, endOffset, color = 'yellow', workspaceId = null }) {
    return this.createAnnotation(userId, contentId, {
      type: ANNOTATION_TYPES.HIGHLIGHT,
      data: { text, startOffset, endOffset, color },
      workspaceId
    });
  }

  /**
   * Create a note annotation
   * 
   * @param {number} userId - User ID
   * @param {number} contentId - Content ID
   * @param {Object} options - Note options
   * @param {string} options.text - Note text
   * @param {string} [options.context] - Context text being noted on
   * @param {number} [options.workspaceId] - Workspace ID
   * @returns {Promise<Object>} Created annotation
   */
  async createNote(userId, contentId, { text, context = null, workspaceId = null }) {
    return this.createAnnotation(userId, contentId, {
      type: ANNOTATION_TYPES.NOTE,
      data: { text, context },
      workspaceId
    });
  }

  /**
   * Create a tag annotation
   * 
   * @param {number} userId - User ID
   * @param {number} contentId - Content ID
   * @param {Object} options - Tag options
   * @param {string} options.tag - Tag name
   * @param {string} [options.color] - Tag color
   * @param {number} [options.workspaceId] - Workspace ID
   * @returns {Promise<Object>} Created annotation
   */
  async createTag(userId, contentId, { tag, color = null, workspaceId = null }) {
    return this.createAnnotation(userId, contentId, {
      type: ANNOTATION_TYPES.TAG,
      data: { tag: tag.trim().toLowerCase(), color },
      workspaceId
    });
  }

  /**
   * Get annotation by ID
   * 
   * @param {number} annotationId - Annotation ID
   * @returns {Object|null} Annotation or null
   */
  getAnnotation(annotationId) {
    return this.workspaceAdapter.getAnnotationById(annotationId);
  }

  /**
   * Update annotation data
   * 
   * @param {number} annotationId - Annotation ID
   * @param {number} userId - Acting user ID
   * @param {Object} newData - New annotation data
   * @returns {Promise<Object>} Updated annotation
   * @throws {Error} If not owner or permission denied
   */
  async updateAnnotation(annotationId, userId, newData) {
    const annotation = this.workspaceAdapter.getAnnotationById(annotationId);
    if (!annotation) {
      throw new Error('Annotation not found');
    }
    
    // Only owner can update
    if (annotation.userId !== userId) {
      throw new Error('Only the annotation creator can update it');
    }
    
    // Validate new data for type
    this._validateAnnotationData(annotation.type, newData);
    
    this.workspaceAdapter.updateAnnotation(annotationId, newData);
    
    this.logger.log(`[AnnotationService] Annotation ${annotationId} updated by user ${userId}`);
    
    return this.workspaceAdapter.getAnnotationById(annotationId);
  }

  /**
   * Delete annotation
   * 
   * @param {number} annotationId - Annotation ID
   * @param {number} userId - Acting user ID
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If not owner
   */
  async deleteAnnotation(annotationId, userId) {
    const annotation = this.workspaceAdapter.getAnnotationById(annotationId);
    if (!annotation) {
      throw new Error('Annotation not found');
    }
    
    // Only owner can delete
    if (annotation.userId !== userId) {
      throw new Error('Only the annotation creator can delete it');
    }
    
    const workspaceId = annotation.workspaceId;
    
    const result = this.workspaceAdapter.deleteAnnotation(annotationId);
    
    // Log activity if was workspace annotation
    if (workspaceId && this.activityTracker) {
      await this.activityTracker.logActivity(workspaceId, userId, ACTIVITY_ACTIONS.ANNOTATION_DELETED, {
        targetType: 'annotation',
        targetId: annotationId,
        details: { type: annotation.type }
      });
    }
    
    this.logger.log(`[AnnotationService] Annotation ${annotationId} deleted by user ${userId}`);
    
    return {
      success: result.changes > 0,
      message: 'Annotation deleted successfully'
    };
  }

  // =================== Annotation Retrieval ===================

  /**
   * Get annotations for content
   * 
   * Returns annotations visible to the user:
   * - User's own private annotations
   * - Workspace annotations (if user is a member)
   * 
   * @param {number} contentId - Content ID
   * @param {Object} [options] - Filter options
   * @param {number} [options.userId] - Filter to user's annotations only
   * @param {number} [options.workspaceId] - Filter to workspace annotations
   * @param {string} [options.type] - Filter by annotation type
   * @returns {Array<Object>} Annotations
   */
  getAnnotations(contentId, { userId = null, workspaceId = null, type = null } = {}) {
    let annotations = this.workspaceAdapter.getContentAnnotations(contentId, {
      userId,
      workspaceId
    });
    
    // Filter by type if specified
    if (type) {
      annotations = annotations.filter(a => a.type === type);
    }
    
    return annotations;
  }

  /**
   * Get user's own annotations on content
   * 
   * @param {number} userId - User ID
   * @param {number} contentId - Content ID
   * @returns {Array<Object>} User's annotations
   */
  getUserContentAnnotations(userId, contentId) {
    return this.workspaceAdapter.getContentAnnotations(contentId, { userId });
  }

  /**
   * Get workspace annotations on content
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} contentId - Content ID
   * @param {number} userId - Requesting user ID (for permission check)
   * @returns {Promise<Array<Object>>} Workspace annotations
   * @throws {Error} If user is not a member
   */
  async getWorkspaceContentAnnotations(workspaceId, contentId, userId) {
    // Check if user is a member
    if (!this.workspaceAdapter.isMember(workspaceId, userId)) {
      throw new Error('Not a member of this workspace');
    }
    
    return this.workspaceAdapter.getContentAnnotations(contentId, { workspaceId });
  }

  /**
   * Get all annotations by a user
   * 
   * @param {number} userId - User ID
   * @param {number} [limit=50] - Max annotations
   * @returns {Array<Object>} User's annotations
   */
  getUserAnnotations(userId, limit = 50) {
    return this.workspaceAdapter.getUserAnnotations(userId, limit);
  }

  /**
   * Get all annotations in a workspace
   * 
   * @param {number} workspaceId - Workspace ID
   * @param {number} userId - Requesting user ID
   * @param {number} [limit=100] - Max annotations
   * @returns {Promise<Array<Object>>} Workspace annotations
   * @throws {Error} If user is not a member
   */
  async getWorkspaceAnnotations(workspaceId, userId, limit = 100) {
    // Check if user is a member
    if (!this.workspaceAdapter.isMember(workspaceId, userId)) {
      throw new Error('Not a member of this workspace');
    }
    
    return this.workspaceAdapter.getWorkspaceAnnotations(workspaceId, limit);
  }

  /**
   * Get visible annotations for content
   * Returns both user's private and workspace annotations they can see
   * 
   * @param {number} contentId - Content ID
   * @param {number} userId - User ID
   * @param {number[]} [workspaceIds] - Workspace IDs user is a member of
   * @returns {Object} Grouped annotations
   */
  getVisibleAnnotations(contentId, userId, workspaceIds = []) {
    // Get user's private annotations
    const privateAnnotations = this.workspaceAdapter.getContentAnnotations(contentId, { userId })
      .filter(a => !a.workspaceId);
    
    // Get workspace annotations for each workspace
    const workspaceAnnotations = {};
    for (const wsId of workspaceIds) {
      if (this.workspaceAdapter.isMember(wsId, userId)) {
        workspaceAnnotations[wsId] = this.workspaceAdapter.getContentAnnotations(contentId, { workspaceId: wsId });
      }
    }
    
    return {
      private: privateAnnotations,
      workspace: workspaceAnnotations,
      total: privateAnnotations.length + Object.values(workspaceAnnotations).flat().length
    };
  }

  // =================== Private Helpers ===================

  /**
   * Validate annotation data for type
   * @private
   */
  _validateAnnotationData(type, data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Annotation data must be an object');
    }
    
    switch (type) {
      case ANNOTATION_TYPES.HIGHLIGHT:
        if (!data.text || typeof data.text !== 'string') {
          throw new Error('Highlight annotation requires text');
        }
        break;
        
      case ANNOTATION_TYPES.NOTE:
        if (!data.text || typeof data.text !== 'string') {
          throw new Error('Note annotation requires text');
        }
        if (data.text.length > 10000) {
          throw new Error('Note text must be less than 10000 characters');
        }
        break;
        
      case ANNOTATION_TYPES.TAG:
        if (!data.tag || typeof data.tag !== 'string') {
          throw new Error('Tag annotation requires tag name');
        }
        if (data.tag.length > 50) {
          throw new Error('Tag must be less than 50 characters');
        }
        break;
        
      default:
        throw new Error(`Unknown annotation type: ${type}`);
    }
  }

  /**
   * Check if user can create workspace annotation
   * @private
   */
  async _checkWorkspaceAnnotationPermission(userId, workspaceId) {
    // Must be a member
    if (!this.workspaceAdapter.isMember(workspaceId, userId)) {
      throw new Error('Not a member of this workspace');
    }
    
    // If role manager, check permission
    if (this.roleManager) {
      const hasPermission = await this.roleManager.checkPermission(userId, workspaceId, 'add_annotations');
      if (!hasPermission) {
        throw new Error('Permission denied: add_annotations');
      }
    }
    // Without role manager, any member can add annotations (we checked membership above)
  }
}

module.exports = {
  AnnotationService,
  ANNOTATION_TYPES
};
