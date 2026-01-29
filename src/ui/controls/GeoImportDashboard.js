'use strict';

/**
 * GeoImportDashboard - Live dashboard for geographic data import operations
 * 
 * Two-column layout with navigation on left, detail view on right.
 * Shows real-time progress of gazetteer imports from GeoNames, OSM, Wikidata.
 * Uses jsgui3 Data_Object for reactive updates via on('change').
 * 
 * Navigation sections:
 * - 🗄️ Database - Database selector
 * - 📋 Pipeline - Import stages stepper
 * - 📦 Sources - Data source cards (GeoNames, Wikidata, OSM)
 * - 📈 Coverage - Before/after statistics
 * - 📝 Log - Live import log
 * 
 * @example Server-side rendering:
 *   const { GeoImportDashboard } = require('./controls/GeoImportDashboard');
 *   const dashboard = new GeoImportDashboard({ context });
 *   const html = dashboard.all_html_render();
 * 
 * @example Client-side activation with live updates:
 *   dashboard.activate();
 *   // Updates flow through WebSocket or polling
 */

const jsgui = require('jsgui3-html');
const { Control, controls } = jsgui;
const createControlFactory = require('./helpers/controlFactory');
const { createTwoColumnLayoutControls } = require('./layouts/TwoColumnLayoutFactory');
const { createProgressBarControl } = require('./ProgressBar');

// Initialize factories with jsgui instance
const {
  el, createSection, createStatItem, createActionButton,
  formatNumber, formatLabel
} = createControlFactory(jsgui);

const { TwoColumnLayout, Sidebar, ContentArea, NavItem, DetailHeader } = createTwoColumnLayoutControls(jsgui);
const ProgressBarControl = createProgressBarControl(jsgui);

// ─────────────────────────────────────────────────────────────────────────────
// Label Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Status display labels with emoji */
const STATUS_LABELS = {
  'idle': '⏸️ Idle',
  'ready': '✅ Ready',
  'running': '🔄 Running',
  'completed': '✅ Complete',
  'error': '❌ Error',
  'pending': '⏳ Pending',
  'missing': '⚠️ Missing',
  'coming-soon': '🚧 Coming Soon'
};

/** Phase display labels with emoji */
const PHASE_LABELS = {
  'idle': '⏸️ Waiting to start',
  'downloading': '📥 Downloading files...',
  'parsing': '📑 Parsing data...',
  'importing': '💾 Importing to database...',
  'indexing': '🔍 Building indexes...',
  'validating': '✅ Validating data...',
  'completed': '🎉 Import complete!',
  'error': '❌ Error occurred'
};

// ─────────────────────────────────────────────────────────────────────────────
// Source Card Control - Shows individual data source status
// ─────────────────────────────────────────────────────────────────────────────

class SourceCard extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'source_card' });
    
    this.source = spec.source || {
      id: 'unknown',
      name: 'Unknown Source',
      emoji: '❓',
      status: 'idle',
      description: ''
    };
    
    this.add_class('geo-source-card');
    this.add_class(`source-${this.source.id}`);
    this.add_class(`status-${this.source.status}`);
    
    // Add coming-soon class if applicable
    if (this.source.comingSoon) {
      this.add_class('coming-soon');
    }
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const { name, emoji, status, description, stats, lastRun, comingSoon, plannedFeatures, available } = this.source;
    const ctx = this.context;
    
    // Header row: emoji + name + status badge
    const header = el(ctx, 'div', null, 'source-header');
    header.add(el(ctx, 'span', emoji, 'source-emoji'));
    header.add(el(ctx, 'span', name, 'source-name'));
    
    // Status badge - special handling for coming-soon
    if (comingSoon) {
      const badge = el(ctx, 'span', '🚧 Coming Soon', 'status-badge');
      badge.add_class('status-coming-soon');
      header.add(badge);
    } else {
      const badge = el(ctx, 'span', STATUS_LABELS[status] || status, 'status-badge');
      badge.add_class(`status-${status}`);
      header.add(badge);
    }
    this.add(header);
    
    // Description
    if (description) {
      this.add(el(ctx, 'p', description, 'source-description'));
    }
    
    // Planned features list for coming-soon sources
    if (comingSoon && plannedFeatures && plannedFeatures.length > 0) {
      const featuresList = el(ctx, 'div', null, 'planned-features');
      featuresList.add(el(ctx, 'span', '📋 Planned:', 'features-label'));
      const featuresText = plannedFeatures.map(f => `• ${f}`).join('  ');
      featuresList.add(el(ctx, 'span', featuresText, 'features-list'));
      this.add(featuresList);
    }
    
    // Stats grid - show placeholder for coming-soon
    if (stats) {
      const grid = el(ctx, 'div', null, 'stats-grid');
      if (comingSoon) {
        grid.add_class('stats-disabled');
      }
      for (const [key, value] of Object.entries(stats)) {
        grid.add(createStatItem(ctx, formatLabel(key), value));
      }
      this.add(grid);
    }
    
    // Last run or availability message
    if (lastRun) {
      this.add(el(ctx, 'div', `Last run: ${lastRun}`, 'last-run'));
    } else if (comingSoon) {
      this.add(el(ctx, 'div', '⏳ Backend integration in development', 'availability-note'));
    } else if (available) {
      this.add(el(ctx, 'div', '✅ Ready to import', 'availability-note ready'));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress Ring Control - Circular SVG progress indicator
// ─────────────────────────────────────────────────────────────────────────────

class ProgressRing extends Control {
  constructor(spec = {}) {
    // Extract custom properties to avoid jsgui3's built-in size setter collision
    const { progress = 0, size = 120, strokeWidth = 8, color = '#4CAF50', ...restSpec } = spec;
    
    super({ ...restSpec, tagName: 'div', __type_name: 'progress_ring' });
    
    this._progress = progress;
    this._ringSize = size;
    this._strokeWidth = strokeWidth;
    this._color = color;
    
    this.add_class('progress-ring-container');
    this.dom.attributes['data-progress'] = String(progress);
    this.dom.attributes['data-ring-size'] = String(size);
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const { _ringSize: size, _strokeWidth: sw, _progress: progress, _color: color } = this;
    const ctx = this.context;
    
    const radius = (size - sw) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;
    const center = size / 2;
    
    // SVG element
    const svg = new Control({ context: ctx, tagName: 'svg' });
    svg.add_class('progress-ring');
    svg.dom.attributes = {
      width: size, height: size,
      viewBox: `0 0 ${size} ${size}`
    };
    
    // Background circle
    const bgCircle = new Control({ context: ctx, tagName: 'circle' });
    bgCircle.dom.attributes = {
      cx: center, cy: center, r: radius,
      fill: 'none', stroke: '#e0e0e0', 'stroke-width': sw
    };
    svg.add(bgCircle);
    
    // Progress arc
    const arc = new Control({ context: ctx, tagName: 'circle' });
    arc.add_class('progress-ring-circle');
    arc.dom.attributes = {
      cx: center, cy: center, r: radius,
      fill: 'none', stroke: color, 'stroke-width': sw,
      'stroke-linecap': 'round',
      'stroke-dasharray': circumference,
      'stroke-dashoffset': offset,
      transform: `rotate(-90 ${center} ${center})`
    };
    svg.add(arc);
    
    this.add(svg);
    this.add(el(ctx, 'div', `${Math.round(progress)}%`, 'progress-ring-text'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stages Stepper Control - Visual pipeline progress indicator
// ─────────────────────────────────────────────────────────────────────────────

/** Import stage definitions with emoji and description */
const IMPORT_STAGES = [
  { id: 'idle', label: 'Ready', emoji: '⏸️', description: 'Waiting to start' },
  { id: 'validating', label: 'Validating', emoji: '🔍', description: 'Checking source files' },
  { id: 'counting', label: 'Counting', emoji: '📊', description: 'Counting records' },
  { id: 'preparing', label: 'Preparing', emoji: '⚙️', description: 'Setting up database' },
  { id: 'importing', label: 'Importing', emoji: '💾', description: 'Importing records' },
  { id: 'indexing', label: 'Indexing', emoji: '🗂️', description: 'Building indexes' },
  { id: 'verifying', label: 'Verifying', emoji: '✅', description: 'Validating coverage' },
  { id: 'complete', label: 'Complete', emoji: '🎉', description: 'Import finished' }
];

/** Maps status to stage index for highlighting */
const STAGE_INDEX = IMPORT_STAGES.reduce((acc, stage, i) => {
  acc[stage.id] = i;
  return acc;
}, {});

class StagesStepper extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'stages_stepper' });
    
    this.currentStage = spec.currentStage || 'idle';
    this.stages = spec.stages || IMPORT_STAGES;
    this._stageElements = {};
    
    this.add_class('stages-stepper');
    this.dom.attributes['data-current-stage'] = this.currentStage;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    const currentIndex = STAGE_INDEX[this.currentStage] ?? 0;
    
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      const stageEl = el(ctx, 'div', null, 'stage-item');
      stageEl.dom.attributes['data-stage-id'] = stage.id;
      
      // Determine state: completed, current, or pending
      if (i < currentIndex) {
        stageEl.add_class('stage-completed');
      } else if (i === currentIndex) {
        stageEl.add_class('stage-current');
      } else {
        stageEl.add_class('stage-pending');
      }
      
      // Stage marker (circle with emoji or checkmark)
      const marker = el(ctx, 'div', null, 'stage-marker');
      if (i < currentIndex) {
        marker.add('✓');
      } else {
        marker.add(stage.emoji);
      }
      stageEl.add(marker);
      
      // Stage label
      const label = el(ctx, 'div', stage.label, 'stage-label');
      stageEl.add(label);
      
      // Connector line (except for last stage)
      if (i < this.stages.length - 1) {
        const connector = el(ctx, 'div', null, 'stage-connector');
        if (i < currentIndex) {
          connector.add_class('connector-completed');
        }
        stageEl.add(connector);
      }
      
      this._stageElements[stage.id] = stageEl;
      this.add(stageEl);
    }
  }
  
  /**
   * Update current stage (client-side)
   * @param {string} stageId - Stage ID to set as current
   */
  setStage(stageId) {
    this.currentStage = stageId;
    this.dom.attributes['data-current-stage'] = stageId;
    // DOM update handled by client-side script
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Log Control - Scrolling log viewer
// ─────────────────────────────────────────────────────────────────────────────

class LiveLog extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'live_log' });
    
    this.entries = spec.entries || [];
    this.maxEntries = spec.maxEntries || 100;
    this._logBody = null;
    this._logLevels = this._resolveLogLevels(this.entries);
    this._activeLevels = {};
    this._logLevels.forEach(level => { this._activeLevels[level.id] = true; });
    
    this.add_class('live-log');
    this._applyLevelAttributes();
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    this.add(this._buildHeader());
    
    this._logBody = el(ctx, 'div', null, 'log-body');
    this._logBody.dom.attributes['data-log-container'] = 'true';
    
    for (const entry of this.entries.slice(-this.maxEntries)) {
      this._logBody.add(this._createLogEntry(entry));
    }
    this.add(this._logBody);
  }
  
  _createLogEntry(entry) {
    const ctx = this.context;
    const row = el(ctx, 'div', null, 'log-entry');
    row.add_class(`log-${entry.level || 'info'}`);
    row.dom.attributes['data-log-level'] = entry.level || 'info';
    row.add(el(ctx, 'span', entry.time || new Date().toLocaleTimeString(), 'log-timestamp'));
    row.add(el(ctx, 'span', entry.message, 'log-message'));
    return row;
  }
  
  addEntry(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
  }

  _resolveLogLevels(entries = []) {
    const defaults = [
      { id: 'info', label: 'Info' },
      { id: 'success', label: 'Success' },
      { id: 'warning', label: 'Warning' },
      { id: 'error', label: 'Error' }
    ];
    const seen = new Set(entries.map(e => (e.level || '').toLowerCase()).filter(Boolean));
    const merged = [...defaults];
    seen.forEach(level => {
      if (!merged.some(l => l.id === level)) {
        merged.push({ id: level, label: formatLabel(level) });
      }
    });
    return merged;
  }

  _applyLevelAttributes() {
    Object.entries(this._activeLevels || {}).forEach(([level, enabled]) => {
      this.dom.attributes[`data-allow-${level}`] = enabled ? 'true' : 'false';
    });
  }

  _buildHeader() {
    const ctx = this.context;
    const header = el(ctx, 'div', null, 'log-header');

    const title = el(ctx, 'div', '📋 Import Log', 'log-title');
    header.add(title);

    const filter = new Control({ context: ctx, tagName: 'details' });
    filter.add_class('log-filter');
    const trigger = new Control({ context: ctx, tagName: 'summary' });
    trigger.add_class('log-filter__trigger');
    trigger.add(el(ctx, 'span', 'Filter logs', 'log-filter__text'));
    trigger.add(el(ctx, 'span', '▾', 'log-filter__chevron'));
    filter.add(trigger);

    const panel = new Control({ context: ctx, tagName: 'div' });
    panel.add_class('log-filter__panel');
    this._logLevels.forEach(level => panel.add(this._createFilterOption(level)));
    filter.add(panel);

    header.add(filter);
    return header;
  }

  _createFilterOption(level) {
    const ctx = this.context;
    const option = new Control({ context: ctx, tagName: 'label' });
    option.add_class('log-filter__option');
    option.add_class(`log-${level.id}`);

    const checkbox = new jsgui.input({ context: ctx });
    checkbox.dom.attributes.type = 'checkbox';
    checkbox.dom.attributes.name = 'log-filter';
    checkbox.dom.attributes.value = level.id;
    checkbox.dom.attributes['data-log-filter-level'] = level.id;
    checkbox.dom.attributes.checked = 'checked';
    option.add(checkbox);

    option.add(el(ctx, 'span', null, 'log-filter__swatch'));
    option.add(el(ctx, 'span', level.label, 'log-filter__label'));

    return option;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Control
// ─────────────────────────────────────────────────────────────────────────────

/** Default data sources */
const DEFAULT_SOURCES = {
  geonames: {
    id: 'geonames',
    name: 'GeoNames',
    emoji: '🌍',
    status: 'ready',
    description: 'cities15000.txt: ~25,000 cities with population >15K',
    stats: { expected_cities: 25000, expected_names: 150000 },
    available: true
  },
  wikidata: {
    id: 'wikidata',
    name: 'Wikidata',
    emoji: '📚',
    status: 'coming-soon',
    description: 'SPARQL queries for Wikidata IDs, population updates, and multilingual names',
    stats: { linked_entities: '—' },
    available: false,
    comingSoon: true,
    plannedFeatures: ['Entity linking', 'Population sync', 'Multilingual labels']
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    emoji: '🗺️',
    status: 'coming-soon',
    description: 'Administrative boundaries and spatial containment queries',
    stats: { boundaries: '—' },
    available: false,
    comingSoon: true,
    plannedFeatures: ['Admin boundaries', 'Spatial queries', 'PostGIS integration']
  }
};

/** Default log entries */
const DEFAULT_LOGS = [
  { time: '10:30:00', level: 'info', message: 'Import dashboard initialized' },
  { time: '10:30:01', level: 'info', message: 'Checking GeoNames file availability...' },
  { time: '10:30:02', level: 'success', message: 'cities15000.txt found (2.9 MB)' },
  { time: '10:30:03', level: 'info', message: 'Ready to import 24,687 cities' }
];

/** Navigation sections for the dashboard */
const NAV_SECTIONS = [
  { id: 'database', label: 'Database', icon: '🗄️' },
  { id: 'pipeline', label: 'Pipeline', icon: '📋' },
  { id: 'sources', label: 'Data Sources', icon: '📦' },
  { id: 'coverage', label: 'Coverage', icon: '📈' },
  { id: 'log', label: 'Import Log', icon: '📝' }
];

class GeoImportDashboard extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'geo_import_dashboard' });
    
    this.add_class('geo-import-dashboard');
    this.dom.attributes['data-jsgui-control'] = 'geo_import_dashboard';
    
    // Active view
    this.activeView = spec.activeView || 'pipeline';
    
    // Layout controls
    this._layout = null;
    this._sidebar = null;
    this._contentArea = null;
    
    // Child control references
    this._progressRing = null;
    this._stagesStepper = null;
    this._sourceCards = {};
    this._liveLog = null;
    
    // Database selector (passed from server)
    this._dbSelector = spec.dbSelector || null;
    
    // State with sensible defaults
    this.importState = {
      phase: 'idle',
      currentSource: null,
      progress: { current: 0, total: 0 },
      sources: DEFAULT_SOURCES,
      logs: [],
      totals: {
        places_before: 508,
        places_after: 0,
        names_before: 14855,
        names_after: 0
      },
      ...spec.importState
    };
    
    if (!spec.el) this.compose();
  }
  
  setImportState(state) {
    this.importState = { ...this.importState, ...state };
  }
  
  setDbSelector(dbSelector) {
    this._dbSelector = dbSelector;
  }
  
  compose() {
    const ctx = this.context;
    
    // Create two-column layout
    this._layout = new TwoColumnLayout({
      context: ctx,
      sidebarTitle: 'Gazetteer Import',
      sidebarIcon: '🌐',
      sidebarWidth: 240,
      navItems: NAV_SECTIONS.map(s => ({
        ...s,
        selected: s.id === this.activeView
      })),
      selectedId: this.activeView,
      contentTitle: this._getViewTitle(this.activeView),
      contentIcon: this._getViewIcon(this.activeView),
      contentSubtitle: this._getViewSubtitle(this.activeView)
    });
    
    // Store references
    this._sidebar = this._layout.sidebar;
    this._contentArea = this._layout.contentArea;
    
    // Add content based on active view
    this._composeActiveView();
    
    // Add actions at bottom of sidebar
    this._composeActions();
    
    this.add(this._layout);
  }
  
  _getViewTitle(viewId) {
    const titles = {
      database: 'Database Selection',
      pipeline: 'Import Pipeline',
      sources: 'Data Sources',
      coverage: 'Coverage Statistics',
      log: 'Import Log'
    };
    return titles[viewId] || 'Details';
  }
  
  _getViewIcon(viewId) {
    const item = NAV_SECTIONS.find(s => s.id === viewId);
    return item ? item.icon : '📋';
  }
  
  _getViewSubtitle(viewId) {
    const subtitles = {
      database: 'Select and configure target database',
      pipeline: 'Track import stage progress',
      sources: 'Configure and monitor data sources',
      coverage: 'Before and after import statistics',
      log: 'Real-time import activity log'
    };
    return subtitles[viewId] || null;
  }
  
  _composeActiveView() {
    const contentBody = this._contentArea.getBody();
    
    switch (this.activeView) {
      case 'database':
        this._composeDatabaseView(contentBody);
        break;
      case 'pipeline':
        this._composePipelineView(contentBody);
        break;
      case 'sources':
        this._composeSourcesView(contentBody);
        break;
      case 'coverage':
        this._composeCoverageView(contentBody);
        break;
      case 'log':
        this._composeLogView(contentBody);
        break;
      default:
        this._composePipelineView(contentBody);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // View Composers
  // ─────────────────────────────────────────────────────────────────────────
  
  _composeDatabaseView(container) {
    const ctx = this.context;
    
    // If we have a database selector from server, add it
    if (this._dbSelector) {
      container.add(this._dbSelector);
    } else {
      // Placeholder
      const placeholder = el(ctx, 'div', null, 'db-placeholder');
      placeholder.add(el(ctx, 'p', '🗄️ Database selector will appear here'));
      placeholder.add(el(ctx, 'p', 'Current path: data/gazetteer.db', 'db-path'));
      container.add(placeholder);
    }
    
    // Database stats summary
    const stats = el(ctx, 'div', null, 'db-stats-compact');
    stats.add(createStatItem(ctx, 'Places', this.importState.totals.places_before || 0));
    stats.add(createStatItem(ctx, 'Names', this.importState.totals.names_before || 0));
    container.add(stats);
  }
  
  _composePipelineView(container) {
    const ctx = this.context;
    const { current, total } = this.importState.progress;
    const percent = total > 0 ? (current / total) * 100 : 0;
    const ratio = total > 0 ? (current / total) : 0;
    
    // Stages stepper
    this._stagesStepper = new StagesStepper({
      context: ctx,
      currentStage: this.importState.phase || 'idle',
      stages: IMPORT_STAGES
    });
    container.add(this._stagesStepper);
    
    // Progress section
    const progressContainer = el(ctx, 'div', null, 'progress-compact');
    
    // Progress ring (smaller for compact view)
    this._progressRing = new ProgressRing({
      context: ctx,
      progress: percent,
      size: 100,
      strokeWidth: 8,
      color: this._getProgressColor(percent)
    });
    progressContainer.add(this._progressRing);

    // Linear progress bar (primary determinate indicator)
    this._progressBar = new ProgressBarControl({
      context: ctx,
      value: ratio,
      showPercentage: true,
      variant: 'compact',
      color: 'gold',
      indeterminate: !(total > 0)
    });
    progressContainer.add(this._progressBar);

    // Stall / stale indicator (client will fill)
    const stall = el(ctx, 'div', '', 'progress-stall');
    stall.dom.attributes['data-role'] = 'progress-stall';
    progressContainer.add(stall);
    
    // Stats
    const stats = el(ctx, 'div', null, 'progress-stats-compact');
    stats.add(el(ctx, 'div', `${formatNumber(current)} / ${formatNumber(total)} records`, 'progress-count'));
    stats.add(el(ctx, 'div', PHASE_LABELS[this.importState.phase] || this.importState.phase, 'progress-phase'));
    progressContainer.add(stats);
    
    container.add(progressContainer);
  }
  
  _composeSourcesView(container) {
    const ctx = this.context;
    
    // Source cards in compact grid
    const grid = el(ctx, 'div', null, 'sources-grid-compact');
    for (const source of Object.values(this.importState.sources)) {
      const card = new SourceCard({ context: ctx, source });
      this._sourceCards[source.id] = card;
      grid.add(card);
    }
    container.add(grid);

    // Plan preview panel (client fills via /api/geo-import/plan)
    const planPanel = el(ctx, 'div', null, 'plan-preview');
    planPanel.dom.attributes['data-role'] = 'plan-preview';
    planPanel.add(el(ctx, 'div', '🧭 Plan preview will appear here. Click “Plan” in the sidebar to load.', 'plan-preview__placeholder'));
    container.add(planPanel);
  }
  
  _composeCoverageView(container) {
    const ctx = this.context;
    const { totals } = this.importState;
    
    const grid = el(ctx, 'div', null, 'coverage-grid-compact');
    
    // Before column
    grid.add(this._createCoverageColumn('Before', {
      places: totals.places_before,
      names: totals.names_before,
      ukCities: 5,
      usCities: 10
    }, 'before'));
    
    // Arrow
    grid.add(el(ctx, 'div', '➡️', 'coverage-arrow'));
    
    // After column
    grid.add(this._createCoverageColumn('After', {
      places: totals.places_after || '~25,000',
      names: totals.names_after || '~150,000',
      ukCities: '500+',
      usCities: '3,000+'
    }, 'after'));
    
    container.add(grid);
  }
  
  _composeLogView(container) {
    const ctx = this.context;
    
    this._liveLog = new LiveLog({
      context: ctx,
      entries: this.importState.logs.length > 0 ? this.importState.logs : DEFAULT_LOGS,
      maxEntries: 200
    });
    container.add(this._liveLog);
  }
  
  _composeActions() {
    const ctx = this.context;
    
    // Actions panel at bottom of sidebar
    const actionsPanel = el(ctx, 'div', null, 'sidebar-actions');
    
    actionsPanel.add(createActionButton(ctx, '🧭', 'Plan', 'preview-plan', 'secondary'));
    actionsPanel.add(createActionButton(ctx, '🚀', 'Start', 'start-import', 'primary'));
    actionsPanel.add(createActionButton(ctx, '⏸️', 'Pause', 'pause-import', 'secondary', true));
    actionsPanel.add(createActionButton(ctx, '🛑', 'Cancel', 'cancel-import', 'danger', true));
    
    this._sidebar.add(actionsPanel);
  }
  
  _createCoverageColumn(label, stats, type) {
    const ctx = this.context;
    const col = el(ctx, 'div', null, 'coverage-column');
    col.add_class(`coverage-${type}`);
    col.add(el(ctx, 'h3', label));
    
    for (const [key, value] of Object.entries(stats)) {
      const item = el(ctx, 'div', null, 'coverage-item');
      item.add(el(ctx, 'span', formatNumber(value), 'coverage-value'));
      item.add(el(ctx, 'span', formatLabel(key), 'coverage-label'));
      col.add(item);
    }
    return col;
  }
  
  _getProgressColor(percent) {
    if (percent < 25) return '#c9a227'; // Gold
    if (percent < 50) return '#daa520';
    if (percent < 75) return '#b8860b';
    return '#c9a227';
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Client-Side Activation
  // ─────────────────────────────────────────────────────────────────────────
  
  activate() {
    if (this.__active) return;
    super.activate();
    this._bindActionButtons();
    this._bindNavigation();
  }
  
  /**
   * Bind navigation events using jsgui3 event system
   * 
   * Event flow:
   * 1. NavItem.activate() binds DOM click → raises 'select' event
   * 2. Sidebar.addNavItem() subscribes to NavItem's 'select' → re-raises as 'nav-select'
   * 3. TwoColumnLayout.compose() subscribes to Sidebar's 'nav-select' → re-raises as 'view-change'
   * 4. Dashboard.activate() subscribes to TwoColumnLayout's 'view-change' → handles navigation
   */
  _bindNavigation() {
    if (!this._layout) return;
    
    // Subscribe to the layout's 'view-change' event using jsgui3 native event system
    this._layout.on('view-change', (data) => {
      console.log('[GeoImportDashboard] view-change event received:', data);
      this._handleViewChange(data.id);
    });
  }
  
  _handleViewChange(viewId) {
    console.log('[GeoImportDashboard] Switching to view:', viewId);
    // Navigate via URL change (server handles view rendering)
    window.location.search = `?view=${viewId}`;
  }
  
  /**
   * Bind action buttons using jsgui3 delegation pattern
   * Uses this.on() where possible, falls back to querySelector for specific data-action elements
   */
  _bindActionButtons() {
    if (!this.dom.el) return;
    
    // Use delegated event handling for action buttons
    this.on('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      
      const action = actionBtn.getAttribute('data-action');
      switch (action) {
        case 'start-import':
          this._handleStartImport();
          break;
        case 'pause-import':
          this._handlePauseImport();
          break;
        case 'cancel-import':
          this._handleCancelImport();
          break;
      }
    });
  }
  
  _handleStartImport() {
    console.log('[GeoImportDashboard] Starting import...');
  }
  
  _handlePauseImport() {
    console.log('[GeoImportDashboard] Pausing import...');
  }
  
  _handleCancelImport() {
    console.log('[GeoImportDashboard] Cancelling import...');
  }
}

// Register controls
controls.GeoImportDashboard = GeoImportDashboard;
controls.SourceCard = SourceCard;
controls.ProgressRing = ProgressRing;
controls.LiveLog = LiveLog;

module.exports = { 
  GeoImportDashboard, 
  SourceCard, 
  ProgressRing, 
  LiveLog 
};
