'use strict';

/**
 * Teams Module - Team Workspaces & Collaboration
 * 
 * Provides multi-user workspaces with shared feeds, annotations, and role-based access control.
 * 
 * @module teams
 */

const { WorkspaceService, ROLES, ROLE_HIERARCHY } = require('./WorkspaceService');
const { AnnotationService, ANNOTATION_TYPES } = require('./AnnotationService');
const { RoleManager, ACTION_PERMISSIONS } = require('./RoleManager');
const { ActivityTracker, ACTIVITY_ACTIONS } = require('./ActivityTracker');
const { SharedFeedService } = require('./SharedFeedService');

/**
 * Create a configured teams module with all services wired together
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.workspaceAdapter - Workspace database adapter
 * @param {Object} [options.userAdapter] - User database adapter
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Teams module with all services
 */
function createTeamsModule({ workspaceAdapter, userAdapter = null, logger = console }) {
  if (!workspaceAdapter) {
    throw new Error('createTeamsModule requires a workspaceAdapter');
  }
  
  // Create services with dependencies
  const roleManager = new RoleManager({ workspaceAdapter, logger });
  const activityTracker = new ActivityTracker({ workspaceAdapter, logger });
  
  const workspaceService = new WorkspaceService({
    workspaceAdapter,
    userAdapter,
    roleManager,
    activityTracker,
    logger
  });
  
  const annotationService = new AnnotationService({
    workspaceAdapter,
    roleManager,
    activityTracker,
    logger
  });
  
  const sharedFeedService = new SharedFeedService({
    workspaceAdapter,
    roleManager,
    activityTracker,
    logger
  });
  
  return {
    // Services
    workspaceService,
    annotationService,
    sharedFeedService,
    roleManager,
    activityTracker,
    
    // Constants
    ROLES,
    ROLE_HIERARCHY,
    ANNOTATION_TYPES,
    ACTIVITY_ACTIONS,
    ACTION_PERMISSIONS
  };
}

module.exports = {
  // Main factory
  createTeamsModule,
  
  // Individual services (for direct use)
  WorkspaceService,
  AnnotationService,
  RoleManager,
  ActivityTracker,
  SharedFeedService,
  
  // Constants
  ROLES,
  ROLE_HIERARCHY,
  ANNOTATION_TYPES,
  ACTIVITY_ACTIONS,
  ACTION_PERMISSIONS
};
