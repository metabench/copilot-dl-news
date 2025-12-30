'use strict';

/**
 * Controls index for Admin Dashboard
 */

const { UserManagementPanel, getStatusClass, getRoleClass } = require('./UserManagementPanel');
const { SystemHealthPanel, formatBytes, formatUptime, getGaugeClass } = require('./SystemHealthPanel');
const { AuditLogPanel, getActionClass, getActionIcon, formatAction, formatRelativeTime } = require('./AuditLogPanel');
const { CrawlManagementPanel, getStatusClass: getCrawlStatusClass, getStatusIcon, formatDuration } = require('./CrawlManagementPanel');
const { ConfigEditorPanel } = require('./ConfigEditorPanel');

module.exports = {
  // Panels
  UserManagementPanel,
  SystemHealthPanel,
  AuditLogPanel,
  CrawlManagementPanel,
  ConfigEditorPanel,
  
  // Utilities
  getStatusClass,
  getRoleClass,
  formatBytes,
  formatUptime,
  getGaugeClass,
  getActionClass,
  getActionIcon,
  formatAction,
  formatRelativeTime,
  getCrawlStatusClass,
  getStatusIcon,
  formatDuration
};
