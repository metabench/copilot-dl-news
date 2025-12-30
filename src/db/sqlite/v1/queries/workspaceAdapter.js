'use strict';

/**
 * Workspace Database Adapter
 * 
 * Provides database access for team workspaces and collaboration:
 * - Workspace CRUD operations
 * - Member management with roles
 * - Shared feeds
 * - Annotations (highlights, notes, tags)
 * - Activity tracking
 * 
 * ALL SQL for workspace features lives here - UI/service layers must NOT import better-sqlite3.
 * 
 * @module workspaceAdapter
 */

const crypto = require('crypto');

/**
 * Default roles and their hierarchy (higher index = more permissions)
 */
const ROLES = {
  VIEWER: 'viewer',
  EDITOR: 'editor',
  ADMIN: 'admin'
};

/**
 * Role hierarchy for permission checks
 */
const ROLE_HIERARCHY = ['viewer', 'editor', 'admin'];

/**
 * Annotation types
 */
const ANNOTATION_TYPES = {
  HIGHLIGHT: 'highlight',
  NOTE: 'note',
  TAG: 'tag'
};

/**
 * Activity action types
 */
const ACTIVITY_ACTIONS = {
  WORKSPACE_CREATED: 'workspace_created',
  MEMBER_ADDED: 'member_added',
  MEMBER_REMOVED: 'member_removed',
  MEMBER_ROLE_CHANGED: 'member_role_changed',
  FEED_CREATED: 'feed_created',
  FEED_UPDATED: 'feed_updated',
  FEED_DELETED: 'feed_deleted',
  ANNOTATION_ADDED: 'annotation_added',
  ANNOTATION_DELETED: 'annotation_deleted'
};

/**
 * Generate a URL-safe slug from a name
 * @param {string} name - Name to slugify
 * @returns {string}
 */
function generateSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  
  // Add random suffix to ensure uniqueness
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${base}-${suffix}`;
}

/**
 * Ensure workspace-related tables exist
 * @param {import('better-sqlite3').Database} db
 */
function ensureWorkspaceSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureWorkspaceSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    -- Workspaces table
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      owner_id INTEGER NOT NULL,
      settings TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Workspace members with roles
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(workspace_id, user_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Shared feeds within workspaces
    CREATE TABLE IF NOT EXISTS shared_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      query TEXT,
      filters TEXT DEFAULT '{}',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Annotations on content (highlights, notes, tags)
    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER,
      type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    -- Workspace activity log
    CREATE TABLE IF NOT EXISTS workspace_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
    CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
    
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
    
    CREATE INDEX IF NOT EXISTS idx_shared_feeds_workspace ON shared_feeds(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_shared_feeds_creator ON shared_feeds(created_by);
    
    CREATE INDEX IF NOT EXISTS idx_annotations_content ON annotations(content_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_workspace ON annotations(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
    
    CREATE INDEX IF NOT EXISTS idx_workspace_activity_workspace ON workspace_activity(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_activity_user ON workspace_activity(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_activity_created ON workspace_activity(created_at);
  `);
}

/**
 * Create workspace adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Workspace adapter methods
 */
function createWorkspaceAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createWorkspaceAdapter requires a better-sqlite3 database handle');
  }

  ensureWorkspaceSchema(db);

  // Prepared statements
  const stmts = {
    // =================== Workspaces ===================
    
    createWorkspace: db.prepare(`
      INSERT INTO workspaces (name, slug, owner_id, settings, created_at)
      VALUES (@name, @slug, @owner_id, @settings, datetime('now'))
    `),
    
    getWorkspaceById: db.prepare(`
      SELECT w.id, w.name, w.slug, w.owner_id, w.settings, w.created_at,
             u.email as owner_email, u.display_name as owner_name
      FROM workspaces w
      INNER JOIN users u ON u.id = w.owner_id
      WHERE w.id = ?
    `),
    
    getWorkspaceBySlug: db.prepare(`
      SELECT w.id, w.name, w.slug, w.owner_id, w.settings, w.created_at,
             u.email as owner_email, u.display_name as owner_name
      FROM workspaces w
      INNER JOIN users u ON u.id = w.owner_id
      WHERE w.slug = ?
    `),
    
    updateWorkspace: db.prepare(`
      UPDATE workspaces
      SET name = COALESCE(@name, name),
          settings = COALESCE(@settings, settings)
      WHERE id = @id
    `),
    
    deleteWorkspace: db.prepare(`
      DELETE FROM workspaces WHERE id = ?
    `),
    
    listUserWorkspaces: db.prepare(`
      SELECT w.id, w.name, w.slug, w.owner_id, w.settings, w.created_at,
             wm.role, wm.joined_at,
             u.email as owner_email, u.display_name as owner_name
      FROM workspaces w
      INNER JOIN workspace_members wm ON wm.workspace_id = w.id
      INNER JOIN users u ON u.id = w.owner_id
      WHERE wm.user_id = ?
      ORDER BY wm.joined_at DESC
    `),
    
    countWorkspaces: db.prepare(`
      SELECT COUNT(*) as total FROM workspaces
    `),
    
    // =================== Members ===================
    
    addMember: db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
      VALUES (@workspace_id, @user_id, @role, datetime('now'))
    `),
    
    getMember: db.prepare(`
      SELECT wm.workspace_id, wm.user_id, wm.role, wm.joined_at,
             u.email, u.display_name
      FROM workspace_members wm
      INNER JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ? AND wm.user_id = ?
    `),
    
    updateMemberRole: db.prepare(`
      UPDATE workspace_members
      SET role = @role
      WHERE workspace_id = @workspace_id AND user_id = @user_id
    `),
    
    removeMember: db.prepare(`
      DELETE FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `),
    
    listWorkspaceMembers: db.prepare(`
      SELECT wm.workspace_id, wm.user_id, wm.role, wm.joined_at,
             u.email, u.display_name
      FROM workspace_members wm
      INNER JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ?
      ORDER BY wm.joined_at ASC
    `),
    
    countWorkspaceMembers: db.prepare(`
      SELECT COUNT(*) as total FROM workspace_members WHERE workspace_id = ?
    `),
    
    isMember: db.prepare(`
      SELECT 1 as is_member FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `),
    
    // =================== Shared Feeds ===================
    
    createSharedFeed: db.prepare(`
      INSERT INTO shared_feeds (workspace_id, name, query, filters, created_by, created_at, updated_at)
      VALUES (@workspace_id, @name, @query, @filters, @created_by, datetime('now'), datetime('now'))
    `),
    
    getSharedFeedById: db.prepare(`
      SELECT sf.id, sf.workspace_id, sf.name, sf.query, sf.filters, 
             sf.created_by, sf.created_at, sf.updated_at,
             u.email as creator_email, u.display_name as creator_name
      FROM shared_feeds sf
      INNER JOIN users u ON u.id = sf.created_by
      WHERE sf.id = ?
    `),
    
    updateSharedFeed: db.prepare(`
      UPDATE shared_feeds
      SET name = COALESCE(@name, name),
          query = COALESCE(@query, query),
          filters = COALESCE(@filters, filters),
          updated_at = datetime('now')
      WHERE id = @id
    `),
    
    deleteSharedFeed: db.prepare(`
      DELETE FROM shared_feeds WHERE id = ?
    `),
    
    listWorkspaceFeeds: db.prepare(`
      SELECT sf.id, sf.workspace_id, sf.name, sf.query, sf.filters, 
             sf.created_by, sf.created_at, sf.updated_at,
             u.email as creator_email, u.display_name as creator_name
      FROM shared_feeds sf
      INNER JOIN users u ON u.id = sf.created_by
      WHERE sf.workspace_id = ?
      ORDER BY sf.created_at DESC
    `),
    
    // =================== Annotations ===================
    
    createAnnotation: db.prepare(`
      INSERT INTO annotations (content_id, user_id, workspace_id, type, data, created_at, updated_at)
      VALUES (@content_id, @user_id, @workspace_id, @type, @data, datetime('now'), datetime('now'))
    `),
    
    getAnnotationById: db.prepare(`
      SELECT a.id, a.content_id, a.user_id, a.workspace_id, a.type, a.data,
             a.created_at, a.updated_at,
             u.email as user_email, u.display_name as user_name
      FROM annotations a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.id = ?
    `),
    
    updateAnnotation: db.prepare(`
      UPDATE annotations
      SET data = @data,
          updated_at = datetime('now')
      WHERE id = @id
    `),
    
    deleteAnnotation: db.prepare(`
      DELETE FROM annotations WHERE id = ?
    `),
    
    getContentAnnotations: db.prepare(`
      SELECT a.id, a.content_id, a.user_id, a.workspace_id, a.type, a.data,
             a.created_at, a.updated_at,
             u.email as user_email, u.display_name as user_name
      FROM annotations a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.content_id = ?
      ORDER BY a.created_at DESC
    `),
    
    getContentAnnotationsByUser: db.prepare(`
      SELECT a.id, a.content_id, a.user_id, a.workspace_id, a.type, a.data,
             a.created_at, a.updated_at,
             u.email as user_email, u.display_name as user_name
      FROM annotations a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.content_id = ? AND a.user_id = ?
      ORDER BY a.created_at DESC
    `),
    
    getContentAnnotationsByWorkspace: db.prepare(`
      SELECT a.id, a.content_id, a.user_id, a.workspace_id, a.type, a.data,
             a.created_at, a.updated_at,
             u.email as user_email, u.display_name as user_name
      FROM annotations a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.content_id = ? AND a.workspace_id = ?
      ORDER BY a.created_at DESC
    `),
    
    getUserAnnotations: db.prepare(`
      SELECT a.id, a.content_id, a.user_id, a.workspace_id, a.type, a.data,
             a.created_at, a.updated_at
      FROM annotations a
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `),
    
    getWorkspaceAnnotations: db.prepare(`
      SELECT a.id, a.content_id, a.user_id, a.workspace_id, a.type, a.data,
             a.created_at, a.updated_at,
             u.email as user_email, u.display_name as user_name
      FROM annotations a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.workspace_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `),
    
    // =================== Activity ===================
    
    logActivity: db.prepare(`
      INSERT INTO workspace_activity (workspace_id, user_id, action, target_type, target_id, details, created_at)
      VALUES (@workspace_id, @user_id, @action, @target_type, @target_id, @details, datetime('now'))
    `),
    
    getWorkspaceActivity: db.prepare(`
      SELECT wa.id, wa.workspace_id, wa.user_id, wa.action, wa.target_type,
             wa.target_id, wa.details, wa.created_at,
             u.email as user_email, u.display_name as user_name
      FROM workspace_activity wa
      INNER JOIN users u ON u.id = wa.user_id
      WHERE wa.workspace_id = ?
      ORDER BY wa.created_at DESC
      LIMIT ? OFFSET ?
    `),
    
    countWorkspaceActivity: db.prepare(`
      SELECT COUNT(*) as total FROM workspace_activity WHERE workspace_id = ?
    `),
    
    deleteOldActivity: db.prepare(`
      DELETE FROM workspace_activity
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `),
    
    // =================== Stats ===================
    
    getStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM workspaces) as total_workspaces,
        (SELECT COUNT(*) FROM workspace_members) as total_memberships,
        (SELECT COUNT(*) FROM shared_feeds) as total_shared_feeds,
        (SELECT COUNT(*) FROM annotations) as total_annotations,
        (SELECT COUNT(*) FROM workspace_activity WHERE created_at >= datetime('now', '-1 day')) as activity_last_24h
    `)
  };

  /**
   * Normalize workspace row from database
   */
  function normalizeWorkspace(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.owner_id,
      settings: row.settings ? JSON.parse(row.settings) : {},
      createdAt: row.created_at,
      owner: row.owner_email ? {
        id: row.owner_id,
        email: row.owner_email,
        displayName: row.owner_name
      } : null,
      role: row.role || null,
      joinedAt: row.joined_at || null
    };
  }

  /**
   * Normalize member row from database
   */
  function normalizeMember(row) {
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      email: row.email,
      displayName: row.display_name
    };
  }

  /**
   * Normalize shared feed row from database
   */
  function normalizeSharedFeed(row) {
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      query: row.query,
      filters: row.filters ? JSON.parse(row.filters) : {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      creator: row.creator_email ? {
        id: row.created_by,
        email: row.creator_email,
        displayName: row.creator_name
      } : null
    };
  }

  /**
   * Normalize annotation row from database
   */
  function normalizeAnnotation(row) {
    if (!row) return null;
    return {
      id: row.id,
      contentId: row.content_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      type: row.type,
      data: row.data ? JSON.parse(row.data) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: row.user_email ? {
        id: row.user_id,
        email: row.user_email,
        displayName: row.user_name
      } : null
    };
  }

  /**
   * Normalize activity row from database
   */
  function normalizeActivity(row) {
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details ? JSON.parse(row.details) : null,
      createdAt: row.created_at,
      user: row.user_email ? {
        id: row.user_id,
        email: row.user_email,
        displayName: row.user_name
      } : null
    };
  }

  return {
    // Export constants
    ROLES,
    ROLE_HIERARCHY,
    ANNOTATION_TYPES,
    ACTIVITY_ACTIONS,

    // =================== Workspace CRUD ===================

    /**
     * Create a new workspace
     * @param {Object} data - Workspace data
     * @param {number} data.ownerId - Owner user ID
     * @param {string} data.name - Workspace name
     * @param {string} [data.slug] - URL slug (auto-generated if not provided)
     * @param {Object} [data.settings={}] - Workspace settings
     * @returns {{id: number, slug: string}}
     */
    createWorkspace({ ownerId, name, slug = null, settings = {} }) {
      if (!ownerId || !name) {
        throw new Error('ownerId and name are required');
      }
      
      const finalSlug = slug || generateSlug(name);
      
      try {
        const result = stmts.createWorkspace.run({
          owner_id: ownerId,
          name: name.trim(),
          slug: finalSlug,
          settings: JSON.stringify(settings)
        });
        
        // Auto-add owner as admin member
        stmts.addMember.run({
          workspace_id: result.lastInsertRowid,
          user_id: ownerId,
          role: ROLES.ADMIN
        });
        
        return {
          id: result.lastInsertRowid,
          slug: finalSlug
        };
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('Workspace slug already exists');
        }
        throw err;
      }
    },

    /**
     * Get workspace by ID
     * @param {number} workspaceId - Workspace ID
     * @returns {Object|null}
     */
    getWorkspaceById(workspaceId) {
      const row = stmts.getWorkspaceById.get(workspaceId);
      return normalizeWorkspace(row);
    },

    /**
     * Get workspace by slug
     * @param {string} slug - Workspace slug
     * @returns {Object|null}
     */
    getWorkspaceBySlug(slug) {
      const row = stmts.getWorkspaceBySlug.get(slug);
      return normalizeWorkspace(row);
    },

    /**
     * Update workspace
     * @param {number} workspaceId - Workspace ID
     * @param {Object} updates - Fields to update
     * @returns {{changes: number}}
     */
    updateWorkspace(workspaceId, { name = null, settings = null }) {
      const result = stmts.updateWorkspace.run({
        id: workspaceId,
        name,
        settings: settings ? JSON.stringify(settings) : null
      });
      return { changes: result.changes };
    },

    /**
     * Delete workspace and all related data
     * @param {number} workspaceId - Workspace ID
     * @returns {{changes: number}}
     */
    deleteWorkspace(workspaceId) {
      const result = stmts.deleteWorkspace.run(workspaceId);
      return { changes: result.changes };
    },

    /**
     * List workspaces for a user
     * @param {number} userId - User ID
     * @returns {Array<Object>}
     */
    listUserWorkspaces(userId) {
      const rows = stmts.listUserWorkspaces.all(userId);
      return rows.map(normalizeWorkspace);
    },

    // =================== Member Management ===================

    /**
     * Add a member to a workspace
     * @param {Object} data - Member data
     * @param {number} data.workspaceId - Workspace ID
     * @param {number} data.userId - User ID
     * @param {string} [data.role='viewer'] - Role
     * @returns {{changes: number}}
     */
    addMember({ workspaceId, userId, role = ROLES.VIEWER }) {
      if (!ROLE_HIERARCHY.includes(role)) {
        throw new Error(`Invalid role: ${role}`);
      }
      
      try {
        const result = stmts.addMember.run({
          workspace_id: workspaceId,
          user_id: userId,
          role
        });
        return { changes: result.changes };
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          throw new Error('User is already a member of this workspace');
        }
        throw err;
      }
    },

    /**
     * Get a member of a workspace
     * @param {number} workspaceId - Workspace ID
     * @param {number} userId - User ID
     * @returns {Object|null}
     */
    getMember(workspaceId, userId) {
      const row = stmts.getMember.get(workspaceId, userId);
      return normalizeMember(row);
    },

    /**
     * Update member role
     * @param {Object} data - Update data
     * @param {number} data.workspaceId - Workspace ID
     * @param {number} data.userId - User ID
     * @param {string} data.role - New role
     * @returns {{changes: number}}
     */
    updateMemberRole({ workspaceId, userId, role }) {
      if (!ROLE_HIERARCHY.includes(role)) {
        throw new Error(`Invalid role: ${role}`);
      }
      
      const result = stmts.updateMemberRole.run({
        workspace_id: workspaceId,
        user_id: userId,
        role
      });
      return { changes: result.changes };
    },

    /**
     * Remove a member from a workspace
     * @param {number} workspaceId - Workspace ID
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    removeMember(workspaceId, userId) {
      const result = stmts.removeMember.run(workspaceId, userId);
      return { changes: result.changes };
    },

    /**
     * List members of a workspace
     * @param {number} workspaceId - Workspace ID
     * @returns {Array<Object>}
     */
    listWorkspaceMembers(workspaceId) {
      const rows = stmts.listWorkspaceMembers.all(workspaceId);
      return rows.map(normalizeMember);
    },

    /**
     * Check if user is a member of workspace
     * @param {number} workspaceId - Workspace ID
     * @param {number} userId - User ID
     * @returns {boolean}
     */
    isMember(workspaceId, userId) {
      const row = stmts.isMember.get(workspaceId, userId);
      return !!row;
    },

    /**
     * Get member count for workspace
     * @param {number} workspaceId - Workspace ID
     * @returns {number}
     */
    countMembers(workspaceId) {
      return stmts.countWorkspaceMembers.get(workspaceId).total;
    },

    // =================== Shared Feeds ===================

    /**
     * Create a shared feed
     * @param {Object} data - Feed data
     * @param {number} data.workspaceId - Workspace ID
     * @param {number} data.createdBy - Creator user ID
     * @param {string} data.name - Feed name
     * @param {string} [data.query] - Search query
     * @param {Object} [data.filters={}] - Feed filters
     * @returns {{id: number}}
     */
    createSharedFeed({ workspaceId, createdBy, name, query = null, filters = {} }) {
      const result = stmts.createSharedFeed.run({
        workspace_id: workspaceId,
        created_by: createdBy,
        name: name.trim(),
        query,
        filters: JSON.stringify(filters)
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get shared feed by ID
     * @param {number} feedId - Feed ID
     * @returns {Object|null}
     */
    getSharedFeedById(feedId) {
      const row = stmts.getSharedFeedById.get(feedId);
      return normalizeSharedFeed(row);
    },

    /**
     * Update shared feed
     * @param {number} feedId - Feed ID
     * @param {Object} updates - Fields to update
     * @returns {{changes: number}}
     */
    updateSharedFeed(feedId, { name = null, query = null, filters = null }) {
      const result = stmts.updateSharedFeed.run({
        id: feedId,
        name,
        query,
        filters: filters ? JSON.stringify(filters) : null
      });
      return { changes: result.changes };
    },

    /**
     * Delete shared feed
     * @param {number} feedId - Feed ID
     * @returns {{changes: number}}
     */
    deleteSharedFeed(feedId) {
      const result = stmts.deleteSharedFeed.run(feedId);
      return { changes: result.changes };
    },

    /**
     * List feeds for a workspace
     * @param {number} workspaceId - Workspace ID
     * @returns {Array<Object>}
     */
    listWorkspaceFeeds(workspaceId) {
      const rows = stmts.listWorkspaceFeeds.all(workspaceId);
      return rows.map(normalizeSharedFeed);
    },

    // =================== Annotations ===================

    /**
     * Create an annotation
     * @param {Object} data - Annotation data
     * @param {number} data.contentId - Content ID
     * @param {number} data.userId - User ID
     * @param {number} [data.workspaceId] - Workspace ID (null for private)
     * @param {string} data.type - Annotation type (highlight, note, tag)
     * @param {Object} data.data - Annotation data
     * @returns {{id: number}}
     */
    createAnnotation({ contentId, userId, workspaceId = null, type, data }) {
      if (!Object.values(ANNOTATION_TYPES).includes(type)) {
        throw new Error(`Invalid annotation type: ${type}`);
      }
      
      const result = stmts.createAnnotation.run({
        content_id: contentId,
        user_id: userId,
        workspace_id: workspaceId,
        type,
        data: JSON.stringify(data)
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get annotation by ID
     * @param {number} annotationId - Annotation ID
     * @returns {Object|null}
     */
    getAnnotationById(annotationId) {
      const row = stmts.getAnnotationById.get(annotationId);
      return normalizeAnnotation(row);
    },

    /**
     * Update annotation data
     * @param {number} annotationId - Annotation ID
     * @param {Object} data - New annotation data
     * @returns {{changes: number}}
     */
    updateAnnotation(annotationId, data) {
      const result = stmts.updateAnnotation.run({
        id: annotationId,
        data: JSON.stringify(data)
      });
      return { changes: result.changes };
    },

    /**
     * Delete annotation
     * @param {number} annotationId - Annotation ID
     * @returns {{changes: number}}
     */
    deleteAnnotation(annotationId) {
      const result = stmts.deleteAnnotation.run(annotationId);
      return { changes: result.changes };
    },

    /**
     * Get annotations for content
     * @param {number} contentId - Content ID
     * @param {Object} [options] - Filter options
     * @param {number} [options.userId] - Filter by user
     * @param {number} [options.workspaceId] - Filter by workspace
     * @returns {Array<Object>}
     */
    getContentAnnotations(contentId, { userId = null, workspaceId = null } = {}) {
      let rows;
      if (userId) {
        rows = stmts.getContentAnnotationsByUser.all(contentId, userId);
      } else if (workspaceId) {
        rows = stmts.getContentAnnotationsByWorkspace.all(contentId, workspaceId);
      } else {
        rows = stmts.getContentAnnotations.all(contentId);
      }
      return rows.map(normalizeAnnotation);
    },

    /**
     * Get annotations by user
     * @param {number} userId - User ID
     * @param {number} [limit=50] - Max annotations
     * @returns {Array<Object>}
     */
    getUserAnnotations(userId, limit = 50) {
      const rows = stmts.getUserAnnotations.all(userId, limit);
      return rows.map(normalizeAnnotation);
    },

    /**
     * Get annotations for a workspace
     * @param {number} workspaceId - Workspace ID
     * @param {number} [limit=100] - Max annotations
     * @returns {Array<Object>}
     */
    getWorkspaceAnnotations(workspaceId, limit = 100) {
      const rows = stmts.getWorkspaceAnnotations.all(workspaceId, limit);
      return rows.map(normalizeAnnotation);
    },

    // =================== Activity ===================

    /**
     * Log an activity
     * @param {Object} data - Activity data
     * @param {number} data.workspaceId - Workspace ID
     * @param {number} data.userId - User ID
     * @param {string} data.action - Action type
     * @param {string} [data.targetType] - Target type
     * @param {number} [data.targetId] - Target ID
     * @param {Object} [data.details] - Additional details
     * @returns {{id: number}}
     */
    logActivity({ workspaceId, userId, action, targetType = null, targetId = null, details = null }) {
      const result = stmts.logActivity.run({
        workspace_id: workspaceId,
        user_id: userId,
        action,
        target_type: targetType,
        target_id: targetId,
        details: details ? JSON.stringify(details) : null
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get workspace activity
     * @param {number} workspaceId - Workspace ID
     * @param {Object} [options] - Pagination options
     * @param {number} [options.limit=50] - Max activities
     * @param {number} [options.offset=0] - Offset
     * @returns {Array<Object>}
     */
    getWorkspaceActivity(workspaceId, { limit = 50, offset = 0 } = {}) {
      const rows = stmts.getWorkspaceActivity.all(workspaceId, limit, offset);
      return rows.map(normalizeActivity);
    },

    /**
     * Count workspace activities
     * @param {number} workspaceId - Workspace ID
     * @returns {number}
     */
    countActivity(workspaceId) {
      return stmts.countWorkspaceActivity.get(workspaceId).total;
    },

    /**
     * Delete old activity records
     * @param {number} [days=90] - Delete activities older than this
     * @returns {{deleted: number}}
     */
    deleteOldActivity(days = 90) {
      const result = stmts.deleteOldActivity.run(days);
      return { deleted: result.changes };
    },

    // =================== Stats ===================

    /**
     * Get workspace system statistics
     * @returns {Object}
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        totalWorkspaces: row.total_workspaces || 0,
        totalMemberships: row.total_memberships || 0,
        totalSharedFeeds: row.total_shared_feeds || 0,
        totalAnnotations: row.total_annotations || 0,
        activityLast24h: row.activity_last_24h || 0
      };
    },

    /**
     * Count workspaces
     * @returns {number}
     */
    countWorkspaces() {
      return stmts.countWorkspaces.get().total;
    }
  };
}

module.exports = {
  createWorkspaceAdapter,
  ensureWorkspaceSchema,
  generateSlug,
  ROLES,
  ROLE_HIERARCHY,
  ANNOTATION_TYPES,
  ACTIVITY_ACTIONS
};
