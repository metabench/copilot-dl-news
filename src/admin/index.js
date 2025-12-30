'use strict';

/**
 * Admin Module - User management and system administration
 * 
 * @module admin
 */

const { AdminService } = require('./AdminService');
const { AuditLogger, AUDIT_ACTIONS, TARGET_TYPES } = require('./AuditLogger');

module.exports = {
  AdminService,
  AuditLogger,
  AUDIT_ACTIONS,
  TARGET_TYPES
};
