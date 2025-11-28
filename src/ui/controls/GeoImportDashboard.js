'use strict';

/**
 * GeoImportDashboard - Live dashboard for geographic data import operations
 * 
 * Shows real-time progress of gazetteer imports from GeoNames, OSM, Wikidata.
 * Uses jsgui3 Data_Object for reactive updates via on('change').
 * 
 * @example Server-side rendering:
 *   const { GeoImportDashboard } = require('./controls/GeoImportDashboard');
 *   const dashboard = new GeoImportDashboard({ context });
 *   dashboard.setImportState({
 *     source: 'geonames',
 *     phase: 'importing',
 *     progress: { current: 5000, total: 25000 },
 *     stats: { places: 5000, names: 45000, skipped: 120 }
 *   });
 *   const html = dashboard.all_html_render();
 * 
 * @example Client-side activation with live updates:
 *   dashboard.activate();
 *   // Updates flow through WebSocket or polling
 */

const jsgui = require('jsgui3-html');
const { Control, controls } = jsgui;
const createControlFactory = require('./helpers/controlFactory');

// Initialize factory with jsgui instance
const {
  el, createSection, createStatItem, createActionButton,
  formatNumber, formatLabel
} = createControlFactory(jsgui);

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
  'missing': '⚠️ Missing'
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
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const { name, emoji, status, description, stats, lastRun } = this.source;
    const ctx = this.context;
    
    // Header row: emoji + name + status badge
    const header = el(ctx, 'div', null, 'source-header');
    header.add(el(ctx, 'span', emoji, 'source-emoji'));
    header.add(el(ctx, 'span', name, 'source-name'));
    
    const badge = el(ctx, 'span', STATUS_LABELS[status] || status, 'status-badge');
    badge.add_class(`status-${status}`);
    header.add(badge);
    this.add(header);
    
    // Description
    if (description) {
      this.add(el(ctx, 'p', description, 'source-description'));
    }
    
    // Stats grid
    if (stats) {
      const grid = el(ctx, 'div', null, 'stats-grid');
      for (const [key, value] of Object.entries(stats)) {
        grid.add(createStatItem(ctx, formatLabel(key), value));
      }
      this.add(grid);
    }
    
    // Last run
    if (lastRun) {
      this.add(el(ctx, 'div', `Last run: ${lastRun}`, 'last-run'));
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
    
    this.add_class('live-log');
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    this.add(el(ctx, 'div', '📋 Import Log', 'log-header'));
    
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
    row.add(el(ctx, 'span', entry.time || new Date().toLocaleTimeString(), 'log-timestamp'));
    row.add(el(ctx, 'span', entry.message, 'log-message'));
    return row;
  }
  
  addEntry(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
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
    stats: { expected_cities: 25000, expected_names: 150000 }
  },
  wikidata: {
    id: 'wikidata',
    name: 'Wikidata',
    emoji: '📚',
    status: 'idle',
    description: 'SPARQL queries for metadata enrichment',
    stats: { linked_entities: 0 }
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    emoji: '🗺️',
    status: 'pending',
    description: 'Local PostGIS database for boundaries',
    stats: { boundaries: 0, spatial_queries: 0 }
  }
};

/** Default log entries */
const DEFAULT_LOGS = [
  { time: '10:30:00', level: 'info', message: 'Import dashboard initialized' },
  { time: '10:30:01', level: 'info', message: 'Checking GeoNames file availability...' },
  { time: '10:30:02', level: 'success', message: 'cities15000.txt found (2.9 MB)' },
  { time: '10:30:03', level: 'info', message: 'Ready to import 24,687 cities' }
];

class GeoImportDashboard extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'geo_import_dashboard' });
    
    this.add_class('geo-import-dashboard');
    this.dom.attributes['data-jsgui-control'] = 'geo_import_dashboard';
    
    // Child control references
    this._progressRing = null;
    this._stagesStepper = null;
    this._sourceCards = {};
    this._liveLog = null;
    
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
  
  compose() {
    this._composeHeader();
    this._composeStagesSection();
    this._composeProgressSection();
    this._composeSourcesSection();
    this._composeCoverageSection();
    this._composeLogSection();
    this._composeActionsSection();
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Compose Helpers (private)
  // ─────────────────────────────────────────────────────────────────────────
  
  _composeHeader() {
    const ctx = this.context;
    const header = new Control({ context: ctx, tagName: 'header' });
    header.add_class('dashboard-header');
    header.add(el(ctx, 'h1', '🌐 Gazetteer Import Dashboard'));
    header.add(el(ctx, 'p', 'Real-time geographic data import from multiple sources', 'subtitle'));
    this.add(header);
  }
  
  _composeStagesSection() {
    const ctx = this.context;
    const section = createSection(ctx, '📋', 'Import Pipeline', 'stages-section');
    
    this._stagesStepper = new StagesStepper({
      context: ctx,
      currentStage: this.importState.phase || 'idle',
      stages: IMPORT_STAGES
    });
    section.add(this._stagesStepper);
    this.add(section);
  }
  
  _composeProgressSection() {
    const ctx = this.context;
    const { current, total } = this.importState.progress;
    const percent = total > 0 ? (current / total) * 100 : 0;
    
    const section = createSection(ctx, '📊', 'Overall Progress', 'progress-section');
    
    const content = el(ctx, 'div', null, 'progress-content');
    
    // Progress ring
    this._progressRing = new ProgressRing({
      context: ctx,
      progress: percent,
      size: 140,
      strokeWidth: 10,
      color: this._getProgressColor(percent)
    });
    content.add(this._progressRing);
    
    // Stats beside ring
    const stats = el(ctx, 'div', null, 'progress-stats');
    const countLabel = el(ctx, 'div', null, 'progress-stat');
    countLabel.add(`<span class="stat-value">${formatNumber(current)}</span> / <span class="stat-total">${formatNumber(total)}</span> records`);
    stats.add(countLabel);
    stats.add(el(ctx, 'div', PHASE_LABELS[this.importState.phase] || this.importState.phase, 'progress-phase'));
    content.add(stats);
    
    section.add(content);
    this.add(section);
  }
  
  _composeSourcesSection() {
    const ctx = this.context;
    const section = createSection(ctx, '📦', 'Data Sources', 'sources-section');
    
    const grid = el(ctx, 'div', null, 'sources-grid');
    for (const source of Object.values(this.importState.sources)) {
      const card = new SourceCard({ context: ctx, source });
      this._sourceCards[source.id] = card;
      grid.add(card);
    }
    section.add(grid);
    this.add(section);
  }
  
  _composeCoverageSection() {
    const ctx = this.context;
    const { totals } = this.importState;
    
    const section = createSection(ctx, '📈', 'Coverage Improvement', 'coverage-section');
    const grid = el(ctx, 'div', null, 'coverage-grid');
    
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
    
    section.add(grid);
    this.add(section);
  }
  
  _composeLogSection() {
    const ctx = this.context;
    const section = el(ctx, 'section', null, 'log-section');
    
    this._liveLog = new LiveLog({
      context: ctx,
      entries: this.importState.logs.length > 0 ? this.importState.logs : DEFAULT_LOGS
    });
    section.add(this._liveLog);
    this.add(section);
  }
  
  _composeActionsSection() {
    const ctx = this.context;
    const section = el(ctx, 'section', null, 'actions-section');
    
    section.add(createActionButton(ctx, '🚀', 'Start Import', 'start-import', 'primary'));
    section.add(createActionButton(ctx, '⏸️', 'Pause', 'pause-import', 'secondary', true));
    section.add(createActionButton(ctx, '🛑', 'Cancel', 'cancel-import', 'danger', true));
    
    this.add(section);
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
    if (percent < 25) return '#FF9800';
    if (percent < 50) return '#FFC107';
    if (percent < 75) return '#8BC34A';
    return '#4CAF50';
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Client-Side Activation
  // ─────────────────────────────────────────────────────────────────────────
  
  activate() {
    super.activate();
    this._bindActionButtons();
  }
  
  _bindActionButtons() {
    const actions = {
      'start-import': () => this._handleStartImport(),
      'pause-import': () => this._handlePauseImport(),
      'cancel-import': () => this._handleCancelImport()
    };
    
    for (const [action, handler] of Object.entries(actions)) {
      const btn = this.dom_el?.querySelector(`[data-action="${action}"]`);
      if (btn) btn.addEventListener('click', handler);
    }
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
