'use strict';

/**
 * Admin Dashboard Check Script
 * 
 * Validates:
 * 1. AdminService loads and initializes
 * 2. AuditLogger can log entries
 * 3. UI controls render correctly
 * 4. Server can be created (without starting)
 * 
 * Usage: node src/ui/server/adminDashboard/checks/admin-dashboard.check.js
 */

const path = require('path');
const assert = require('assert');
const Database = require('better-sqlite3');

console.log('🛡️ Admin Dashboard Check\n');
console.log('─'.repeat(50));

// ─────────────────────────────────────────────────────────────
// Test 1: AdminAdapter loads and can query
// ─────────────────────────────────────────────────────────────
console.log('\n[1] Testing AdminAdapter...');

const { createAdminAdapter } = require('../../../../data/db/sqlite/v1/queries/adminAdapter');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL DEFAULT '',
    display_name TEXT,
    settings TEXT DEFAULT '{}',
    role TEXT DEFAULT 'user',
    is_active INTEGER DEFAULT 1,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT,
    suspended_at TEXT,
    suspended_reason TEXT
  )
`);
db.exec(`
  CREATE TABLE crawl_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT DEFAULT 'pending',
    urls_found INTEGER DEFAULT 0,
    urls_processed INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    pages_crawled INTEGER DEFAULT 0,
    error_message TEXT
  )
`);
db.exec(`
  CREATE TABLE user_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    event_type TEXT,
    timestamp TEXT
  )
`);
db.exec(`
  CREATE TABLE user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    token TEXT,
    expires_at TEXT
  )
`);
db.exec(`
  CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT
  )
`);
db.exec(`
  CREATE TABLE http_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER
  )
`);
db.exec(`
  CREATE TABLE content_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER
  )
`);

const adminAdapter = createAdminAdapter(db);

// Seed test user
db.prepare('INSERT INTO users (email, display_name, role) VALUES (?, ?, ?)').run('admin@test.com', 'Admin', 'admin');

const stats = adminAdapter.getSystemStats();
assert(stats.users.total === 1, 'Should have 1 user');
assert(stats.users.admins === 1, 'Should have 1 admin');
console.log('  ✓ AdminAdapter created and queried successfully');
console.log(`    Users: ${stats.users.total}, Admins: ${stats.users.admins}`);

// ─────────────────────────────────────────────────────────────
// Test 2: AuditLogger can log entries
// ─────────────────────────────────────────────────────────────
console.log('\n[2] Testing AuditLogger...');

const { AuditLogger, AUDIT_ACTIONS } = require('../../../../admin/AuditLogger');
const auditLogger = new AuditLogger({ adminAdapter });

const logResult = auditLogger.log(1, AUDIT_ACTIONS.USER_SUSPENDED, {
  targetType: 'user',
  targetId: 2,
  details: { reason: 'Test' }
});

assert(logResult.id, 'Should return log entry id');
console.log('  ✓ AuditLogger created and logged entry');
console.log(`    Log ID: ${logResult.id}`);

// ─────────────────────────────────────────────────────────────
// Test 3: AdminService works
// ─────────────────────────────────────────────────────────────
console.log('\n[3] Testing AdminService...');

const { AdminService } = require('../../../../admin/AdminService');
const adminService = new AdminService({ adminAdapter });

const health = adminService.getSystemHealth();
assert(health.cpu, 'Should have CPU info');
assert(health.memory, 'Should have memory info');
assert(health.uptime, 'Should have uptime');
console.log('  ✓ AdminService created and health check works');
console.log(`    CPU: ${health.cpu.usage}%, Memory: ${health.memory.percentage}%`);

// ─────────────────────────────────────────────────────────────
// Test 4: UI Controls render
// ─────────────────────────────────────────────────────────────
console.log('\n[4] Testing UI Controls...');

const jsgui = require('jsgui3-html');
const { UserManagementPanel } = require('../controls/UserManagementPanel');
const { SystemHealthPanel } = require('../controls/SystemHealthPanel');
const { AuditLogPanel } = require('../controls/AuditLogPanel');
const { CrawlManagementPanel } = require('../controls/CrawlManagementPanel');
const { ConfigEditorPanel } = require('../controls/ConfigEditorPanel');

const ctx = new jsgui.Page_Context();

// UserManagementPanel
const userPanel = new UserManagementPanel({
  context: ctx,
  users: [
    { id: 1, email: 'admin@test.com', displayName: 'Admin', role: 'admin', suspended: 0 }
  ],
  total: 1
});
const userHtml = userPanel.all_html_render();
assert(userHtml.includes('admin@test.com'), 'UserManagementPanel should render email');
assert(userHtml.includes('👥'), 'UserManagementPanel should have icon');
console.log('  ✓ UserManagementPanel renders correctly');

// SystemHealthPanel
const healthPanel = new SystemHealthPanel({
  context: ctx,
  health: {
    cpu: { usage: 45, cores: 8 },
    memory: { used: '4.2 GB', total: '16 GB', percentage: 26 },
    uptime: '3d 4h 15m',
    database: { size: '45 MB' },
    users: { total: 100, active: 95 }
  }
});
const healthHtml = healthPanel.all_html_render();
assert(healthHtml.includes('45'), 'SystemHealthPanel should render CPU usage');
assert(healthHtml.includes('💻'), 'SystemHealthPanel should have CPU icon');
console.log('  ✓ SystemHealthPanel renders correctly');

// AuditLogPanel
const auditPanel = new AuditLogPanel({
  context: ctx,
  entries: [
    { id: 1, action: 'user_suspended', admin_email: 'admin@test.com', timestamp: new Date().toISOString() }
  ],
  total: 1
});
const auditHtml = auditPanel.all_html_render();
assert(auditHtml.includes('user_suspended'), 'AuditLogPanel should render action');
console.log('  ✓ AuditLogPanel renders correctly');

// CrawlManagementPanel
const crawlPanel = new CrawlManagementPanel({
  context: ctx,
  crawls: [
    { id: 1, status: 'completed', pages_crawled: 100, started_at: new Date().toISOString() }
  ],
  stats: { running: 1, today: 5 }
});
const crawlHtml = crawlPanel.all_html_render();
assert(crawlHtml.includes('completed'), 'CrawlManagementPanel should render status');
console.log('  ✓ CrawlManagementPanel renders correctly');

// ConfigEditorPanel
const configPanel = new ConfigEditorPanel({
  context: ctx,
  config: { rateLimit: 1000 },
  configKey: 'crawl'
});
const configHtml = configPanel.all_html_render();
assert(configHtml.includes('rateLimit'), 'ConfigEditorPanel should render config');
console.log('  ✓ ConfigEditorPanel renders correctly');

// ─────────────────────────────────────────────────────────────
// Test 5: AdminDashboard view renders
// ─────────────────────────────────────────────────────────────
console.log('\n[5] Testing AdminDashboard view...');

const { AdminDashboard } = require('../views/AdminDashboard');

const dashboard = new AdminDashboard({
  context: ctx,
  health: {
    cpu: { usage: 45 },
    memory: { percentage: 26 },
    uptime: '3d 4h',
    users: { total: 100, active: 95, suspended: 5 },
    sessions: { active: 42 }
  },
  users: { 
    users: [{ id: 1, email: 'test@example.com', role: 'user' }],
    total: 1 
  },
  audit: { entries: [], total: 0 },
  crawls: [],
  crawlStats: { today: 5, running: 0 }
});

const dashboardHtml = dashboard.all_html_render();
assert(dashboardHtml.includes('admin-dashboard'), 'Dashboard should have class');
assert(dashboardHtml.includes('summary-card'), 'Dashboard should have summary cards');
assert(dashboardHtml.includes('Total Users'), 'Dashboard should show user count label');
console.log('  ✓ AdminDashboard renders correctly');
console.log(`    HTML length: ${dashboardHtml.length} chars`);

// ─────────────────────────────────────────────────────────────
// Test 6: Server can be created
// ─────────────────────────────────────────────────────────────
console.log('\n[6] Testing server creation...');

const { createApp } = require('../server');
const app = createApp(adminService);

assert(app, 'Server app should be created');
assert(typeof app.listen === 'function', 'App should have listen function');
console.log('  ✓ Express app created successfully');

// Cleanup
db.close();

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('✅ All checks passed!\n');

console.log('Admin Dashboard Components:');
console.log('  • adminAdapter.js      - DB queries for admin operations');
console.log('  • AuditLogger.js       - Audit logging utility');
console.log('  • AdminService.js      - High-level admin operations');
console.log('  • UserManagementPanel  - User list & actions UI');
console.log('  • SystemHealthPanel    - CPU/memory gauges UI');
console.log('  • AuditLogPanel        - Audit log viewer UI');
console.log('  • CrawlManagementPanel - Crawl job management UI');
console.log('  • ConfigEditorPanel    - JSON config editor UI');
console.log('  • AdminDashboard       - Main dashboard view');
console.log('  • server.js            - Express server (port 3102)');

console.log('\nUsage:');
console.log('  node src/ui/server/adminDashboard/server.js');
console.log('  Open http://localhost:3102');
