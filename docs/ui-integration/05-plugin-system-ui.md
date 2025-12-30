# Plugin System UI Integration

## Overview

The Plugin System provides an extensibility framework for custom extractors, analyzers, integrations, and UI widgets. Currently backend-only with no management interface.

## Current Implementation

**Location**: `src/plugins/`

**Existing Files**:
- `PluginManager.js` - Plugin lifecycle (discover, load, activate, deactivate)
- `PluginAPI.js` - Sandboxed API for plugins (hooks, config, storage)
- `PluginRegistry.js` - Local and remote plugin registry

**Existing Features**:
- Plugin discovery from filesystem
- Manifest validation
- Lifecycle management (load → init → activate → deactivate → destroy)
- Sandboxed API (hooks, services, config, log, storage)
- Plugin types: extractor, analyzer, integration, ui-widget

## Full Feature Set for UI

### 1. Plugin Marketplace

**Purpose**: Browse and install available plugins

**Marketplace View**:
- Featured plugins
- Categories (Extractors, Analyzers, Integrations, Widgets)
- Search by name/description
- Sort by popularity, rating, date

**Plugin Card**:
- Icon and name
- Short description
- Author
- Version
- Install count
- Rating (stars)
- Install button

### 2. Installed Plugins Manager

**Plugin List View**:
- Installed plugins table
- Status (active/inactive/error)
- Version with update indicator
- Actions (activate, deactivate, configure, uninstall)

**Plugin Detail View**:
- Full description
- Author information
- Version history
- Permissions required
- Configuration options
- Usage statistics

### 3. Plugin Configuration

**Config Panel**:
- Dynamic form based on plugin manifest
- Input types: text, number, boolean, select, secret
- Validation with error messages
- Save/reset buttons
- Environment-specific overrides

### 4. Plugin Development

**Developer Tools**:
- Plugin scaffold generator
- Manifest validator
- Local plugin testing
- Debug log viewer
- API reference

### 5. Plugin Monitoring

**Health Dashboard**:
- Active plugins count
- Error count
- Hook execution times
- Memory usage per plugin
- Storage usage per plugin

---

## Work To Be Done

### Phase 1: Data Layer (3 hours)

1. **Create plugin tables**
   ```sql
   CREATE TABLE installed_plugins (
     id INTEGER PRIMARY KEY,
     plugin_id TEXT UNIQUE NOT NULL,
     name TEXT NOT NULL,
     version TEXT NOT NULL,
     type TEXT NOT NULL,
     status TEXT DEFAULT 'inactive',
     config_json TEXT,
     installed_at TEXT DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT,
     last_error TEXT
   );
   
   CREATE TABLE plugin_storage (
     id INTEGER PRIMARY KEY,
     plugin_id TEXT NOT NULL,
     key TEXT NOT NULL,
     value TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT,
     UNIQUE(plugin_id, key)
   );
   
   CREATE TABLE plugin_registry (
     id INTEGER PRIMARY KEY,
     plugin_id TEXT UNIQUE NOT NULL,
     name TEXT NOT NULL,
     description TEXT,
     author TEXT,
     version TEXT NOT NULL,
     type TEXT NOT NULL,
     manifest_json TEXT,
     download_url TEXT,
     install_count INTEGER DEFAULT 0,
     rating REAL,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Extend PluginManager for persistence**
   - Save installed plugins to DB
   - Persist plugin config
   - Track activation/errors

### Phase 2: API Endpoints (4 hours)

1. **GET /api/plugins**
   - List installed plugins
   - Include status, version, config

2. **GET /api/plugins/:id**
   - Plugin details
   - Full manifest
   - Usage stats

3. **POST /api/plugins/:id/activate**
   - Activate plugin

4. **POST /api/plugins/:id/deactivate**
   - Deactivate plugin

5. **PATCH /api/plugins/:id/config**
   - Update plugin configuration

6. **DELETE /api/plugins/:id**
   - Uninstall plugin

7. **GET /api/plugins/registry**
   - Browse available plugins
   - Filter by type, search

8. **POST /api/plugins/install**
   - Install from registry
   - Validate manifest

9. **GET /api/plugins/:id/logs**
   - Plugin debug logs

10. **GET /api/admin/plugins/stats**
    - Aggregate plugin health

### Phase 3: UI Components (10 hours)

1. **PluginMarketplace control**
   - File: `src/ui/server/adminDashboard/controls/PluginMarketplace.js`
   - Plugin card grid
   - Search and filter
   - Category tabs
   - Install button with confirm

2. **PluginManager control**
   - Installed plugins table
   - Status toggle
   - Version update indicator
   - Quick action menu

3. **PluginDetail control**
   - Full plugin info
   - Configuration form (dynamic)
   - Permission list
   - Usage statistics

4. **PluginConfig control**
   - Dynamic form renderer
   - Schema-driven inputs
   - Validation display
   - Save/reset actions

5. **PluginDevTools control**
   - Scaffold generator form
   - Manifest validator
   - Log viewer
   - API reference docs

6. **PluginHealthDashboard control**
   - Active plugins count
   - Error alerts
   - Performance metrics
   - Storage usage

### Phase 4: Integration (3 hours)

1. **Connect to PluginManager events**
2. **Add to admin dashboard navigation**
3. **Plugin error notifications**
4. **Auto-update checking**

---

## Estimated Total: 20 hours

## Dependencies

- Existing: `src/plugins/PluginManager.js`
- Existing: `src/plugins/PluginAPI.js`
- Existing: `src/plugins/PluginRegistry.js`
- New: Database tables
- New: REST API routes
- New: Dynamic form renderer

## Success Criteria

- [ ] Users can browse available plugins
- [ ] Plugins can be installed from registry
- [ ] Installed plugins are listed with status
- [ ] Plugins can be activated/deactivated
- [ ] Plugin configuration is editable
- [ ] Plugin errors are visible
- [ ] Update availability is indicated
- [ ] Uninstall removes plugin cleanly
