'use strict';

/**
 * Admin Dashboard Server
 * 
 * Express server at port 3102 providing:
 * - GET / - Main dashboard (SSR with jsgui3-html)
 * - GET /admin/users - User management page
 * - GET /admin/users/:id - User detail page
 * - POST /admin/users/:id/suspend - Suspend user
 * - POST /admin/users/:id/unsuspend - Unsuspend user
 * - GET /admin/health - System health API
 * - GET /admin/audit - Audit log page
 * - GET /admin/crawls - Crawl management page
 * - GET /admin/config - Configuration editor
 * - PUT /admin/config - Update configuration
 * - API endpoints under /api/admin/*
 * 
 * Usage:
 *   node src/ui/server/adminDashboard/server.js
 *   Open http://localhost:3102
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');

const { createAdminAdapter } = require('../../../data/db/sqlite/v1/queries/adminAdapter');
const { AdminService } = require('../../../admin/AdminService');

const { AdminDashboard } = require('./views/AdminDashboard');
const { 
  UserManagementPanel, 
  SystemHealthPanel, 
  AuditLogPanel, 
  CrawlManagementPanel,
  ConfigEditorPanel 
} = require('./controls');

const PORT = process.env.PORT || 3102;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

// ─────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────

let db;
let adminAdapter;
let adminService;

function initDb(dbPath = DB_PATH) {
  db = new Database(dbPath);
  adminAdapter = createAdminAdapter(db);
  adminService = new AdminService({ adminAdapter });
  return { db, adminAdapter, adminService };
}

// ─────────────────────────────────────────────────────────────
// CSS Styles
// ─────────────────────────────────────────────────────────────

const DASHBOARD_CSS = `
  :root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-card: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --border-color: #475569;
    --accent-green: #22c55e;
    --accent-yellow: #eab308;
    --accent-red: #ef4444;
    --accent-blue: #3b82f6;
    --accent-purple: #a855f7;
  }

  * { box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
  }

  a { color: var(--accent-blue); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header */
  .admin-header {
    background: var(--bg-secondary);
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  .admin-header__title {
    margin: 0 0 4px 0;
    font-size: 24px;
    font-weight: 600;
  }

  .admin-header__subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .admin-header__nav {
    margin-top: 16px;
    display: flex;
    gap: 24px;
  }

  .admin-header__nav-link {
    color: var(--text-secondary);
    padding: 8px 0;
    border-bottom: 2px solid transparent;
  }

  .admin-header__nav-link--active {
    color: var(--text-primary);
    border-bottom-color: var(--accent-blue);
  }

  /* Main content */
  .admin-main {
    padding: 24px;
    max-width: 1600px;
    margin: 0 auto;
  }

  /* Dashboard grid */
  .admin-dashboard__summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .admin-dashboard__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  .admin-dashboard__col {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  @media (max-width: 1200px) {
    .admin-dashboard__grid {
      grid-template-columns: 1fr;
    }
  }

  /* Summary cards */
  .summary-card {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 20px;
    border: 1px solid var(--border-color);
    text-align: center;
  }

  .summary-card__icon {
    font-size: 28px;
    margin-bottom: 8px;
  }

  .summary-card__value {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .summary-card__value a {
    color: inherit;
  }

  .summary-card__label {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .summary-card--success .summary-card__value { color: var(--accent-green); }
  .summary-card--warning .summary-card__value { color: var(--accent-yellow); }
  .summary-card--danger .summary-card__value { color: var(--accent-red); }

  /* Admin panels */
  .admin-panel {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 24px;
    border: 1px solid var(--border-color);
  }

  .admin-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .admin-panel__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .admin-panel__stats {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .admin-panel__search {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .admin-panel__empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-secondary);
  }

  .empty-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  /* Search input */
  .search-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--bg-card);
    border-radius: 6px;
    padding: 0 12px;
  }

  .search-icon {
    color: var(--text-secondary);
    margin-right: 8px;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-primary);
    padding: 12px 0;
    font-size: 14px;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-secondary);
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border-radius: 6px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn--sm {
    padding: 6px 10px;
    font-size: 13px;
  }

  .btn--primary {
    background: var(--accent-blue);
    color: white;
  }

  .btn--primary:hover {
    background: #2563eb;
  }

  .btn--secondary {
    background: var(--bg-card);
    color: var(--text-primary);
  }

  .btn--success {
    background: var(--accent-green);
    color: white;
  }

  .btn--danger {
    background: var(--accent-red);
    color: white;
  }

  /* Tables */
  .admin-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .admin-table__header {
    text-align: left;
    padding: 12px 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    font-weight: 600;
  }

  .admin-table__row {
    border-bottom: 1px solid var(--border-color);
  }

  .admin-table__row:hover {
    background: var(--bg-card);
  }

  .admin-table__cell {
    padding: 12px 16px;
  }

  .admin-table__cell--date {
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .admin-table__cell--actions {
    text-align: right;
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* User info */
  .user-info__name {
    font-weight: 600;
  }

  .user-info__email {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
  }

  .badge--active { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
  .badge--suspended { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }
  .badge--inactive { background: rgba(148, 163, 184, 0.2); color: var(--text-secondary); }
  
  .badge--admin { background: rgba(168, 85, 247, 0.2); color: var(--accent-purple); }
  .badge--moderator { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
  .badge--user { background: rgba(148, 163, 184, 0.2); color: var(--text-secondary); }

  .badge--success { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
  .badge--danger { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }
  .badge--warning { background: rgba(234, 179, 8, 0.2); color: var(--accent-yellow); }
  .badge--info { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
  .badge--primary { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
  .badge--secondary { background: rgba(148, 163, 184, 0.2); color: var(--text-secondary); }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .pagination__btn {
    padding: 8px 16px;
    background: var(--bg-card);
    border-radius: 6px;
  }

  .pagination__info {
    color: var(--text-secondary);
    font-size: 14px;
  }

  /* Health gauges */
  .health-gauges {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .health-gauge {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }

  .health-gauge__icon {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .health-gauge__value {
    font-size: 28px;
    font-weight: 700;
  }

  .health-gauge--healthy .health-gauge__value { color: var(--accent-green); }
  .health-gauge--warning .health-gauge__value { color: var(--accent-yellow); }
  .health-gauge--critical .health-gauge__value { color: var(--accent-red); }

  .health-gauge__label {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .health-gauge__subtitle {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .health-gauge__bar {
    height: 6px;
    background: var(--bg-primary);
    border-radius: 3px;
    margin-top: 12px;
    overflow: hidden;
  }

  .health-gauge__fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent-green);
  }

  .health-gauge--warning .health-gauge__fill { background: var(--accent-yellow); }
  .health-gauge--critical .health-gauge__fill { background: var(--accent-red); }

  /* Stats grid */
  .health-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }

  .health-stat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-card);
    padding: 12px;
    border-radius: 6px;
  }

  .health-stat-card__icon {
    font-size: 20px;
  }

  .health-stat-card__label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .health-stat-card__value {
    font-size: 16px;
    font-weight: 600;
  }

  .health-section {
    margin-top: 24px;
  }

  .health-section__title {
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
  }

  /* Audit log */
  .audit-log__filters {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .form-select {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 14px;
  }

  .audit-log__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .audit-log__entry {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    background: var(--bg-card);
    border-radius: 6px;
    border-left: 3px solid var(--border-color);
  }

  .audit-log__entry--success { border-left-color: var(--accent-green); }
  .audit-log__entry--danger { border-left-color: var(--accent-red); }
  .audit-log__entry--warning { border-left-color: var(--accent-yellow); }
  .audit-log__entry--info { border-left-color: var(--accent-blue); }
  .audit-log__entry--primary { border-left-color: var(--accent-blue); }

  .audit-log__icon {
    font-size: 20px;
  }

  .audit-log__content {
    flex: 1;
  }

  .audit-log__action {
    font-weight: 500;
  }

  .audit-log__target {
    color: var(--text-secondary);
  }

  .audit-log__admin {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .audit-log__details {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
    font-family: monospace;
  }

  .audit-log__time {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  /* Crawl stats */
  .crawl-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .crawl-stat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-card);
    padding: 16px;
    border-radius: 6px;
  }

  .crawl-stat-card__icon {
    font-size: 24px;
  }

  .crawl-stat-card__value {
    font-size: 24px;
    font-weight: 700;
  }

  .crawl-stat-card__label {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* Config editor */
  .config-editor__form {
    margin-bottom: 24px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
  }

  .config-editor__textarea {
    width: 100%;
    min-height: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 16px;
    border-radius: 6px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
  }

  .form-buttons {
    display: flex;
    gap: 12px;
  }

  .config-editor__help {
    background: var(--bg-card);
    padding: 16px;
    border-radius: 6px;
    font-size: 14px;
  }

  .config-editor__help h4 {
    margin: 0 0 12px 0;
  }

  .config-editor__help-list {
    margin: 0;
    padding-left: 20px;
    color: var(--text-secondary);
  }

  .config-editor__help-list li {
    margin-bottom: 6px;
  }

  .config-editor__help-list strong {
    color: var(--text-primary);
  }

  /* Alerts */
  .alert {
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 14px;
  }

  .alert--success {
    background: rgba(34, 197, 94, 0.15);
    color: var(--accent-green);
    border: 1px solid var(--accent-green);
  }

  .alert--danger {
    background: rgba(239, 68, 68, 0.15);
    color: var(--accent-red);
    border: 1px solid var(--accent-red);
  }

  /* Footer */
  .admin-footer {
    padding: 16px 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
    border-top: 1px solid var(--border-color);
  }
`;

const StringControl = jsgui.String_Control;

// ─────────────────────────────────────────────────────────────
// Auth middleware (mock for now)
// ─────────────────────────────────────────────────────────────

/**
 * Require admin role for all routes
 * In production, this would check session token and user role
 */
function requireAdmin(req, res, next) {
  // Mock admin user for development
  req.user = {
    id: 1,
    email: 'admin@example.com',
    role: 'admin'
  };
  
  // Uncomment for production:
  // if (!req.user || req.user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Admin access required' });
  // }
  
  next();
}

// ─────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────

function renderPage(title, content, activePage = 'dashboard') {
  const ctx = new jsgui.Page_Context();
  const page = new jsgui.Standard_Web_Page({ context: ctx });
  
  const titleEl = new jsgui.Control({ context: ctx, tagName: 'title' });
  titleEl.add(new StringControl({ context: ctx, text: title }));
  page.head.add(titleEl);

  const metaViewport = new jsgui.Control({ context: ctx, tagName: 'meta' });
  metaViewport.dom.attributes.name = 'viewport';
  metaViewport.dom.attributes.content = 'width=device-width, initial-scale=1';
  page.head.add(metaViewport);

  const style = new jsgui.Control({ context: ctx, tagName: 'style' });
  style.add(new StringControl({ context: ctx, text: DASHBOARD_CSS }));
  page.head.add(style);

  // Header
  const header = new jsgui.Control({ context: ctx, tagName: 'header' });
  header.add_class('admin-header');
  
  const h1 = new jsgui.Control({ context: ctx, tagName: 'h1' });
  h1.add_class('admin-header__title');
  h1.add(new StringControl({ context: ctx, text: '🛡️ Admin Dashboard' }));
  header.add(h1);

  const subtitle = new jsgui.Control({ context: ctx, tagName: 'p' });
  subtitle.add_class('admin-header__subtitle');
  subtitle.add(new StringControl({ context: ctx, text: 'System administration and user management' }));
  header.add(subtitle);

  // Navigation
  const nav = new jsgui.Control({ context: ctx, tagName: 'nav' });
  nav.add_class('admin-header__nav');

  const navLinks = [
    { href: '/admin', label: '📊 Dashboard', key: 'dashboard' },
    { href: '/admin/users', label: '👥 Users', key: 'users' },
    { href: '/admin/crawls', label: '🕷️ Crawls', key: 'crawls' },
    { href: '/admin/audit', label: '📋 Audit Log', key: 'audit' },
    { href: '/admin/config', label: '⚙️ Config', key: 'config' }
  ];

  for (const link of navLinks) {
    const a = new jsgui.Control({ context: ctx, tagName: 'a' });
    a.dom.attributes.href = link.href;
    a.add_class('admin-header__nav-link');
    if (link.key === activePage) {
      a.add_class('admin-header__nav-link--active');
    }
    a.add(new StringControl({ context: ctx, text: link.label }));
    nav.add(a);
  }

  header.add(nav);
  page.body.add(header);

  // Main content
  const main = new jsgui.Control({ context: ctx, tagName: 'main' });
  main.add_class('admin-main');
  main.dom.attributes.role = 'main';
  main.add(content);
  page.body.add(main);

  // Footer
  const footer = new jsgui.Control({ context: ctx, tagName: 'footer' });
  footer.add_class('admin-footer');
  footer.add(new StringControl({ 
    context: ctx, 
    text: `Generated at ${new Date().toISOString()} • Admin Dashboard v1.0` 
  }));
  page.body.add(footer);

  return page.all_html_render();
}

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

function createApp(service = adminService) {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply admin middleware to all routes
  app.use(requireAdmin);

  // =================== HTML Pages ===================

  // Main dashboard
  app.get('/', (req, res) => {
    try {
      const health = service.getSystemHealth();
      const users = service.listUsers({ limit: 10 });
      const audit = service.getAuditLog({ limit: 10 });
      const crawls = service.getRecentCrawls(10);
      const crawlStats = health.crawls;

      const ctx = new jsgui.Page_Context();
      const dashboard = new AdminDashboard({
        context: ctx,
        health,
        users,
        audit,
        crawls,
        crawlStats
      });

      res.send(renderPage('Admin Dashboard', dashboard, 'dashboard'));
    } catch (err) {
      console.error('Dashboard render error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Redirect /admin to root
  app.get('/admin', (req, res) => res.redirect('/'));

  // Users page
  app.get('/admin/users', (req, res) => {
    try {
      const search = req.query.search || '';
      const offset = parseInt(req.query.offset, 10) || 0;
      const limit = parseInt(req.query.limit, 10) || 50;
      
      const { users, total } = service.listUsers({ search, limit, offset });

      const ctx = new jsgui.Page_Context();
      const panel = new UserManagementPanel({
        context: ctx,
        users,
        total,
        search,
        offset,
        limit
      });

      res.send(renderPage('User Management - Admin', panel, 'users'));
    } catch (err) {
      console.error('Users page error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // User detail page
  app.get('/admin/users/:id', (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const user = service.getUser(userId);
      
      if (!user) {
        return res.status(404).send('User not found');
      }

      const ctx = new jsgui.Page_Context();
      const container = new jsgui.Control({ context: ctx, tagName: 'div' });
      container.add_class('admin-panel');
      
      const title = new jsgui.Control({ context: ctx, tagName: 'h2' });
      title.add_class('admin-panel__title');
      title.add(new StringControl({ context: ctx, text: `👤 ${user.displayName || user.email}` }));
      container.add(title);
      
      // User details as JSON for now
      const pre = new jsgui.Control({ context: ctx, tagName: 'pre' });
      pre.add_class('config-editor__textarea');
      pre.add(new StringControl({ context: ctx, text: JSON.stringify(user, null, 2) }));
      container.add(pre);

      res.send(renderPage(`User ${user.email} - Admin`, container, 'users'));
    } catch (err) {
      console.error('User detail error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Audit log page
  app.get('/admin/audit', (req, res) => {
    try {
      const action = req.query.action || null;
      const offset = parseInt(req.query.offset, 10) || 0;
      const limit = parseInt(req.query.limit, 10) || 50;
      
      const { entries, total } = service.getAuditLog({ action, limit, offset });

      const ctx = new jsgui.Page_Context();
      const panel = new AuditLogPanel({
        context: ctx,
        entries,
        total,
        action,
        offset,
        limit
      });

      res.send(renderPage('Audit Log - Admin', panel, 'audit'));
    } catch (err) {
      console.error('Audit page error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Crawl management page
  app.get('/admin/crawls', (req, res) => {
    try {
      const crawls = service.getRecentCrawls(50);
      const health = service.getSystemHealth();
      const crawlStats = health.crawls;

      const ctx = new jsgui.Page_Context();
      const panel = new CrawlManagementPanel({
        context: ctx,
        crawls,
        stats: crawlStats
      });

      res.send(renderPage('Crawl Management - Admin', panel, 'crawls'));
    } catch (err) {
      console.error('Crawls page error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Config editor page
  app.get('/admin/config', (req, res) => {
    try {
      const configKey = req.query.configKey || 'system';
      const saved = req.query.saved === 'true';
      const error = req.query.error || null;
      
      // Mock config for now
      const config = {
        system: {
          name: 'News Crawler',
          debug: false,
          timezone: 'UTC'
        },
        crawl: {
          rateLimit: 1000,
          maxConcurrent: 5,
          userAgent: 'NewsCrawler/1.0'
        },
        analysis: {
          minConfidence: 0.5,
          enableNER: true
        }
      };

      const ctx = new jsgui.Page_Context();
      const panel = new ConfigEditorPanel({
        context: ctx,
        config: config[configKey] || {},
        configKey,
        error,
        saved
      });

      res.send(renderPage('Configuration - Admin', panel, 'config'));
    } catch (err) {
      console.error('Config page error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Config save endpoint
  app.post('/admin/config', (req, res) => {
    try {
      const { configKey, config } = req.body;
      
      // Validate JSON
      JSON.parse(config);
      
      // TODO: Actually save config
      // adminService.updateConfig(req.user.id, configKey, JSON.parse(config));
      
      res.redirect(`/admin/config?configKey=${configKey}&saved=true`);
    } catch (err) {
      const configKey = req.body.configKey || 'system';
      res.redirect(`/admin/config?configKey=${configKey}&error=${encodeURIComponent(err.message)}`);
    }
  });

  // =================== API Endpoints ===================

  // List users
  app.get('/api/admin/users', (req, res) => {
    try {
      const search = req.query.search || null;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      
      const result = service.listUsers({ search, limit, offset });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get user
  app.get('/api/admin/users/:id', (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const user = service.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      res.json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Suspend user
  app.post('/api/admin/users/:id/suspend', (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const reason = req.body.reason || null;
      
      const result = service.suspendUser(req.user.id, userId, reason);
      res.json({ success: result.success, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Unsuspend user
  app.post('/api/admin/users/:id/unsuspend', (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      const result = service.unsuspendUser(req.user.id, userId);
      res.json({ success: result.success, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Update user role
  app.put('/api/admin/users/:id/role', (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const { role } = req.body;
      
      if (!role) {
        return res.status(400).json({ success: false, error: 'Role is required' });
      }
      
      const result = service.updateUserRole(req.user.id, userId, role);
      res.json({ success: result.success, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // System health
  app.get('/api/admin/health', (req, res) => {
    try {
      const health = service.getSystemHealth();
      res.json({ success: true, data: health });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Audit log
  app.get('/api/admin/audit', (req, res) => {
    try {
      const action = req.query.action || null;
      const targetType = req.query.targetType || null;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      
      const result = service.getAuditLog({ action, targetType, limit, offset });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get crawls
  app.get('/api/admin/crawls', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const crawls = service.getRecentCrawls(limit);
      res.json({ success: true, data: crawls });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Start crawl (stub - would call crawler service)
  app.post('/api/admin/crawls/start', (req, res) => {
    try {
      // TODO: Implement actual crawl start
      res.json({ 
        success: true, 
        data: { message: 'Crawl start not yet implemented' } 
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Stop crawl (stub - would call crawler service)
  app.post('/api/admin/crawls/:id/stop', (req, res) => {
    try {
      const crawlId = parseInt(req.params.id, 10);
      // TODO: Implement actual crawl stop
      res.json({ 
        success: true, 
        data: { message: `Crawl ${crawlId} stop not yet implemented` } 
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get config
  app.get('/api/admin/config', (req, res) => {
    try {
      // Mock config for now
      const config = {
        system: { name: 'News Crawler', debug: false },
        crawl: { rateLimit: 1000 }
      };
      res.json({ success: true, data: config });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update config
  app.put('/api/admin/config', (req, res) => {
    try {
      const { configKey, config } = req.body;
      
      if (!configKey || !config) {
        return res.status(400).json({ success: false, error: 'configKey and config are required' });
      }
      
      // TODO: Actually save config
      res.json({ success: true, data: { message: 'Config updated' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return app;
}

// ─────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────

let server;

function startServer(options = {}) {
  const port = options.port || PORT;
  const dbPath = options.dbPath || DB_PATH;
  
  initDb(dbPath);
  const app = createApp(adminService);
  
  server = app.listen(port, () => {
    console.log(`\n🛡️ Admin Dashboard running at http://localhost:${port}`);
    console.log(`   Database: ${dbPath}\n`);
  });

  return { app, server, close: () => closeServer() };
}

function closeServer() {
  if (server) {
    server.close();
    server = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}

if (require.main === module) {
  startServer();

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeServer();
    process.exit(0);
  });
}

module.exports = { 
  createApp, 
  startServer, 
  closeServer, 
  initDb,
  requireAdmin
};
