'use strict';

/**
 * Workspaces API Routes (v1)
 * 
 * REST endpoints for team workspaces and collaboration:
 * - POST /workspaces - Create workspace
 * - GET /workspaces - List user's workspaces
 * - GET /workspaces/:id - Get workspace details
 * - PATCH /workspaces/:id - Update workspace
 * - DELETE /workspaces/:id - Delete workspace
 * - POST /workspaces/:id/members - Add member
 * - DELETE /workspaces/:id/members/:userId - Remove member
 * - PATCH /workspaces/:id/members/:userId - Update member role
 * - GET /workspaces/:id/members - List members
 * - GET /workspaces/:id/feeds - List shared feeds
 * - POST /workspaces/:id/feeds - Create shared feed
 * - PATCH /workspaces/:id/feeds/:feedId - Update feed
 * - DELETE /workspaces/:id/feeds/:feedId - Delete feed
 * - POST /articles/:id/annotations - Create annotation
 * - GET /articles/:id/annotations - Get annotations
 * - DELETE /annotations/:id - Delete annotation
 * - GET /workspaces/:id/activity - Get activity feed
 * 
 * @module workspaces routes
 */

const express = require('express');

/**
 * Create workspaces router
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.workspaceService - WorkspaceService instance
 * @param {Object} options.annotationService - AnnotationService instance
 * @param {Object} options.sharedFeedService - SharedFeedService instance
 * @param {Object} options.activityTracker - ActivityTracker instance
 * @param {Object} options.userService - UserService instance (for auth)
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Workspaces router
 */
function createWorkspacesRouter(options = {}) {
  const {
    workspaceService,
    annotationService,
    sharedFeedService,
    activityTracker,
    userService,
    logger = console
  } = options;
  
  if (!workspaceService) {
    throw new Error('createWorkspacesRouter requires workspaceService');
  }
  
  const router = express.Router();

  // All workspace routes require authentication
  router.use(requireAuth(userService));

  // =================== Workspaces CRUD ===================

  /**
   * POST /api/v1/workspaces
   * Create a new workspace
   */
  router.post('/', async (req, res) => {
    try {
      const { name, slug, settings } = req.body;
      
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Workspace name is required'
        });
      }
      
      const workspace = await workspaceService.createWorkspace(req.user.id, {
        name,
        slug,
        settings
      });
      
      res.status(201).json({
        success: true,
        workspace
      });
    } catch (err) {
      logger.error('[Workspaces API] Create workspace error:', err.message);
      
      if (err.message.includes('slug already exists')) {
        return res.status(409).json({
          success: false,
          error: 'Workspace slug already exists'
        });
      }
      
      if (err.message.includes('at least') || err.message.includes('less than')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create workspace'
      });
    }
  });

  /**
   * GET /api/v1/workspaces
   * List user's workspaces
   */
  router.get('/', async (req, res) => {
    try {
      const workspaces = workspaceService.listUserWorkspaces(req.user.id);
      
      res.json({
        success: true,
        workspaces,
        count: workspaces.length
      });
    } catch (err) {
      logger.error('[Workspaces API] List workspaces error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to list workspaces'
      });
    }
  });

  /**
   * GET /api/v1/workspaces/:id
   * Get workspace details
   */
  router.get('/:id', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      
      const workspace = workspaceService.getWorkspace(workspaceId);
      
      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }
      
      // Check if user is a member
      if (!workspaceService.isMember(workspaceId, req.user.id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      // Add stats
      const stats = workspaceService.getWorkspaceStats(workspaceId);
      
      res.json({
        success: true,
        workspace: {
          ...workspace,
          stats
        }
      });
    } catch (err) {
      logger.error('[Workspaces API] Get workspace error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get workspace'
      });
    }
  });

  /**
   * GET /api/v1/workspaces/by-slug/:slug
   * Get workspace by slug
   */
  router.get('/by-slug/:slug', async (req, res) => {
    try {
      const workspace = workspaceService.getWorkspaceBySlug(req.params.slug);
      
      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }
      
      // Check if user is a member
      if (!workspaceService.isMember(workspace.id, req.user.id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      res.json({
        success: true,
        workspace
      });
    } catch (err) {
      logger.error('[Workspaces API] Get workspace by slug error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get workspace'
      });
    }
  });

  /**
   * PATCH /api/v1/workspaces/:id
   * Update workspace
   */
  router.patch('/:id', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      const { name, settings } = req.body;
      
      const workspace = await workspaceService.updateWorkspace(workspaceId, req.user.id, {
        name,
        settings
      });
      
      res.json({
        success: true,
        workspace
      });
    } catch (err) {
      logger.error('[Workspaces API] Update workspace error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update workspace'
      });
    }
  });

  /**
   * DELETE /api/v1/workspaces/:id
   * Delete workspace
   */
  router.delete('/:id', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      
      const result = await workspaceService.deleteWorkspace(workspaceId, req.user.id);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Workspaces API] Delete workspace error:', err.message);
      
      if (err.message.includes('only the workspace owner')) {
        return res.status(403).json({
          success: false,
          error: 'Only the workspace owner can delete it'
        });
      }
      
      if (err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to delete workspace'
      });
    }
  });

  /**
   * POST /api/v1/workspaces/:id/leave
   * Leave a workspace
   */
  router.post('/:id/leave', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      
      const result = await workspaceService.leaveWorkspace(workspaceId, req.user.id);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Workspaces API] Leave workspace error:', err.message);
      
      if (err.message.includes('Owner cannot leave')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to leave workspace'
      });
    }
  });

  // =================== Members ===================

  /**
   * GET /api/v1/workspaces/:id/members
   * List workspace members
   */
  router.get('/:id/members', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      
      const members = await workspaceService.listMembers(workspaceId, req.user.id);
      
      res.json({
        success: true,
        members,
        count: members.length
      });
    } catch (err) {
      logger.error('[Workspaces API] List members error:', err.message);
      
      if (err.message.includes('Not a member')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to list members'
      });
    }
  });

  /**
   * POST /api/v1/workspaces/:id/members
   * Add member to workspace
   */
  router.post('/:id/members', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      const { userId, role } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }
      
      const member = await workspaceService.addMember(
        workspaceId,
        req.user.id,
        parseInt(userId, 10),
        role
      );
      
      res.status(201).json({
        success: true,
        member
      });
    } catch (err) {
      logger.error('[Workspaces API] Add member error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('already a member')) {
        return res.status(409).json({
          success: false,
          error: 'User is already a member'
        });
      }
      
      if (err.message.includes('User not found')) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      if (err.message.includes('Invalid role')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to add member'
      });
    }
  });

  /**
   * PATCH /api/v1/workspaces/:id/members/:userId
   * Update member role
   */
  router.patch('/:id/members/:userId', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      const targetUserId = parseInt(req.params.userId, 10);
      const { role } = req.body;
      
      if (!role) {
        return res.status(400).json({
          success: false,
          error: 'role is required'
        });
      }
      
      const member = await workspaceService.updateMemberRole(
        workspaceId,
        req.user.id,
        targetUserId,
        role
      );
      
      res.json({
        success: true,
        member
      });
    } catch (err) {
      logger.error('[Workspaces API] Update member role error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('Cannot change') || err.message.includes('Invalid role')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      if (err.message.includes('not a member')) {
        return res.status(404).json({
          success: false,
          error: 'Member not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update member role'
      });
    }
  });

  /**
   * DELETE /api/v1/workspaces/:id/members/:userId
   * Remove member from workspace
   */
  router.delete('/:id/members/:userId', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      const targetUserId = parseInt(req.params.userId, 10);
      
      const result = await workspaceService.removeMember(
        workspaceId,
        req.user.id,
        targetUserId
      );
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Workspaces API] Remove member error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('Cannot remove the workspace owner')) {
        return res.status(400).json({
          success: false,
          error: 'Cannot remove the workspace owner'
        });
      }
      
      if (err.message.includes('not a member')) {
        return res.status(404).json({
          success: false,
          error: 'Member not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to remove member'
      });
    }
  });

  // =================== Shared Feeds ===================

  /**
   * GET /api/v1/workspaces/:id/feeds
   * List workspace feeds
   */
  router.get('/:id/feeds', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      
      if (!sharedFeedService) {
        return res.status(503).json({
          success: false,
          error: 'Shared feeds not available'
        });
      }
      
      const feeds = await sharedFeedService.listFeeds(workspaceId, req.user.id);
      
      res.json({
        success: true,
        feeds,
        count: feeds.length
      });
    } catch (err) {
      logger.error('[Workspaces API] List feeds error:', err.message);
      
      if (err.message.includes('Not a member')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to list feeds'
      });
    }
  });

  /**
   * POST /api/v1/workspaces/:id/feeds
   * Create shared feed
   */
  router.post('/:id/feeds', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      const { name, query, filters } = req.body;
      
      if (!sharedFeedService) {
        return res.status(503).json({
          success: false,
          error: 'Shared feeds not available'
        });
      }
      
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Feed name is required'
        });
      }
      
      const feed = await sharedFeedService.createFeed(workspaceId, req.user.id, {
        name,
        query,
        filters
      });
      
      res.status(201).json({
        success: true,
        feed
      });
    } catch (err) {
      logger.error('[Workspaces API] Create feed error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('at least') || err.message.includes('less than')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create feed'
      });
    }
  });

  /**
   * PATCH /api/v1/workspaces/:id/feeds/:feedId
   * Update shared feed
   */
  router.patch('/:id/feeds/:feedId', async (req, res) => {
    try {
      const feedId = parseInt(req.params.feedId, 10);
      const { name, query, filters } = req.body;
      
      if (!sharedFeedService) {
        return res.status(503).json({
          success: false,
          error: 'Shared feeds not available'
        });
      }
      
      const feed = await sharedFeedService.updateFeed(feedId, req.user.id, {
        name,
        query,
        filters
      });
      
      res.json({
        success: true,
        feed
      });
    } catch (err) {
      logger.error('[Workspaces API] Update feed error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Feed not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update feed'
      });
    }
  });

  /**
   * DELETE /api/v1/workspaces/:id/feeds/:feedId
   * Delete shared feed
   */
  router.delete('/:id/feeds/:feedId', async (req, res) => {
    try {
      const feedId = parseInt(req.params.feedId, 10);
      
      if (!sharedFeedService) {
        return res.status(503).json({
          success: false,
          error: 'Shared feeds not available'
        });
      }
      
      const result = await sharedFeedService.deleteFeed(feedId, req.user.id);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Workspaces API] Delete feed error:', err.message);
      
      if (err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Feed not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to delete feed'
      });
    }
  });

  // =================== Activity ===================

  /**
   * GET /api/v1/workspaces/:id/activity
   * Get workspace activity feed
   */
  router.get('/:id/activity', async (req, res) => {
    try {
      const workspaceId = parseInt(req.params.id, 10);
      
      if (!activityTracker) {
        return res.status(503).json({
          success: false,
          error: 'Activity tracking not available'
        });
      }
      
      // Check if user is a member
      if (!workspaceService.isMember(workspaceId, req.user.id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
      const offset = parseInt(req.query.offset, 10) || 0;
      const formatted = req.query.formatted === 'true';
      
      const result = formatted
        ? activityTracker.getFormattedActivity(workspaceId, { limit, offset })
        : activityTracker.getActivity(workspaceId, { limit, offset });
      
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('[Workspaces API] Get activity error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get activity'
      });
    }
  });

  return router;
}

/**
 * Create annotations router (separate for /articles/:id/annotations endpoints)
 * 
 * @param {Object} options - Configuration
 * @returns {express.Router} Annotations router
 */
function createAnnotationsRouter(options = {}) {
  const {
    annotationService,
    workspaceService,
    userService,
    logger = console
  } = options;
  
  if (!annotationService) {
    throw new Error('createAnnotationsRouter requires annotationService');
  }
  
  const router = express.Router();

  // All annotation routes require authentication
  router.use(requireAuth(userService));

  /**
   * POST /api/v1/articles/:id/annotations
   * Create annotation on article
   */
  router.post('/articles/:id/annotations', async (req, res) => {
    try {
      const contentId = parseInt(req.params.id, 10);
      const { type, data, workspaceId } = req.body;
      
      if (!type || !data) {
        return res.status(400).json({
          success: false,
          error: 'type and data are required'
        });
      }
      
      const annotation = await annotationService.createAnnotation(req.user.id, contentId, {
        type,
        data,
        workspaceId: workspaceId ? parseInt(workspaceId, 10) : null
      });
      
      res.status(201).json({
        success: true,
        annotation
      });
    } catch (err) {
      logger.error('[Annotations API] Create annotation error:', err.message);
      
      if (err.message.includes('Invalid annotation type')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      if (err.message.includes('Not a member') || err.message.includes('Permission denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create annotation'
      });
    }
  });

  /**
   * GET /api/v1/articles/:id/annotations
   * Get annotations on article
   */
  router.get('/articles/:id/annotations', async (req, res) => {
    try {
      const contentId = parseInt(req.params.id, 10);
      const { workspaceId, type } = req.query;
      
      let annotations;
      
      if (workspaceId) {
        annotations = await annotationService.getWorkspaceContentAnnotations(
          parseInt(workspaceId, 10),
          contentId,
          req.user.id
        );
      } else {
        // Get user's own annotations
        annotations = annotationService.getUserContentAnnotations(req.user.id, contentId);
      }
      
      // Filter by type if specified
      if (type) {
        annotations = annotations.filter(a => a.type === type);
      }
      
      res.json({
        success: true,
        annotations,
        count: annotations.length
      });
    } catch (err) {
      logger.error('[Annotations API] Get annotations error:', err.message);
      
      if (err.message.includes('Not a member')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to get annotations'
      });
    }
  });

  /**
   * PATCH /api/v1/annotations/:id
   * Update annotation
   */
  router.patch('/annotations/:id', async (req, res) => {
    try {
      const annotationId = parseInt(req.params.id, 10);
      const { data } = req.body;
      
      if (!data) {
        return res.status(400).json({
          success: false,
          error: 'data is required'
        });
      }
      
      const annotation = await annotationService.updateAnnotation(annotationId, req.user.id, data);
      
      res.json({
        success: true,
        annotation
      });
    } catch (err) {
      logger.error('[Annotations API] Update annotation error:', err.message);
      
      if (err.message.includes('Only the annotation creator')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Annotation not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update annotation'
      });
    }
  });

  /**
   * DELETE /api/v1/annotations/:id
   * Delete annotation
   */
  router.delete('/annotations/:id', async (req, res) => {
    try {
      const annotationId = parseInt(req.params.id, 10);
      
      const result = await annotationService.deleteAnnotation(annotationId, req.user.id);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Annotations API] Delete annotation error:', err.message);
      
      if (err.message.includes('Only the annotation creator')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
      
      if (err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Annotation not found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to delete annotation'
      });
    }
  });

  /**
   * GET /api/v1/users/:id/annotations
   * Get user's annotations
   */
  router.get('/users/:id/annotations', async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      // Users can only view their own annotations
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
      
      const annotations = annotationService.getUserAnnotations(userId, limit);
      
      res.json({
        success: true,
        annotations,
        count: annotations.length
      });
    } catch (err) {
      logger.error('[Annotations API] Get user annotations error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get annotations'
      });
    }
  });

  return router;
}

// =================== Middleware Helpers ===================

/**
 * Extract token from Authorization header or query
 * 
 * @param {express.Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check query parameter (for SSE/WebSocket)
  if (req.query.token) {
    return req.query.token;
  }
  
  return null;
}

/**
 * Create auth middleware
 * 
 * @param {Object} userService - UserService instance
 * @returns {Function} Express middleware
 */
function requireAuth(userService) {
  return (req, res, next) => {
    if (!userService) {
      return res.status(503).json({
        success: false,
        error: 'Authentication service not available'
      });
    }
    
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const user = userService.validateSession(token);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session'
      });
    }
    
    req.user = user;
    next();
  };
}

module.exports = {
  createWorkspacesRouter,
  createAnnotationsRouter,
  extractToken,
  requireAuth
};
