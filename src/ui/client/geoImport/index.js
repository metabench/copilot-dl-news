// Import jsgui3-client and register controls using the standard controlRegistry pattern
const jsgui = require('jsgui3-client');
const { registerControlType } = require('../../controls/controlRegistry');

// Import TwoColumnLayout controls and register them with jsgui
const { createTwoColumnLayoutControls } = require('../../controls/layouts/TwoColumnLayoutFactory');
const layoutControls = createTwoColumnLayoutControls(jsgui);

// Import dashboard controls for client-side activation
const { 
  GeoImportDashboard, 
  SourceCard, 
  ProgressRing, 
  LiveLog,
  StagesStepper
} = require('../../controls/GeoImportDashboard');

// Build a list of controls to register
const LAYOUT_CONTROLS = [
  { type: 'nav_item', control: layoutControls.NavItem },
  { type: 'sidebar', control: layoutControls.Sidebar },
  { type: 'content_area', control: layoutControls.ContentArea },
  { type: 'two_column_layout', control: layoutControls.TwoColumnLayout },
  { type: 'detail_header', control: layoutControls.DetailHeader }
];

// Dashboard-specific controls
const DASHBOARD_CONTROLS = [
  { type: 'geo_import_dashboard', control: GeoImportDashboard },
  { type: 'source_card', control: SourceCard },
  { type: 'progress_ring', control: ProgressRing },
  { type: 'live_log', control: LiveLog },
  { type: 'stages_stepper', control: StagesStepper }
];

// Register all controls on the jsgui module itself
[...LAYOUT_CONTROLS, ...DASHBOARD_CONTROLS].forEach(({ type, control }) => {
  registerControlType(type, control, { jsguiInstance: jsgui });
});

// Debug: log what's registered
console.log('[GeoImport] jsgui.controls keys:', Object.keys(jsgui.controls || {}));
console.log('[GeoImport] jsgui.map_Controls keys:', Object.keys(jsgui.map_Controls || {}));

/**
 * Inject registered controls into a jsgui context.
 * This is called during pre_activate and activate to ensure the context
 * has access to our custom control constructors.
 */
function injectControlsIntoContext(context) {
  if (!context) return;
  console.log('[GeoImport] Injecting controls into context');
  const map = context.map_Controls || (context.map_Controls = {});
  
  // Copy from jsgui.map_Controls
  if (jsgui.map_Controls) {
    Object.keys(jsgui.map_Controls).forEach(key => {
      if (!map[key]) {
        map[key] = jsgui.map_Controls[key];
      }
    });
  }
  
  // Ensure all our controls (layout + dashboard) are in the context
  [...LAYOUT_CONTROLS, ...DASHBOARD_CONTROLS].forEach(({ type, control }) => {
    const key = type.toLowerCase();
    if (!map[key]) {
      map[key] = control;
    }
  });
  
  console.log('[GeoImport] context.map_Controls keys after injection:', Object.keys(map));
}

// Hook into jsgui's pre_activate to inject controls
const originalPreActivate = jsgui.pre_activate;
if (typeof originalPreActivate === 'function') {
  jsgui.pre_activate = function wrappedPreActivate(context, ...args) {
    injectControlsIntoContext(context);
    return originalPreActivate.call(this, context, ...args);
  };
}

// Hook into jsgui's activate to inject controls
const originalActivate = jsgui.activate;
if (typeof originalActivate === 'function') {
  jsgui.activate = function wrappedActivate(context, ...args) {
    injectControlsIntoContext(context);
    return originalActivate.call(this, context, ...args);
  };
}

// Hook into Client_Page_Context constructor
const ClientPageContext = jsgui.Client_Page_Context;
if (typeof ClientPageContext === 'function') {
  class GeoImportClientPageContext extends ClientPageContext {
    constructor(...args) {
      super(...args);
      injectControlsIntoContext(this);
    }
  }
  jsgui.Client_Page_Context = GeoImportClientPageContext;
}

console.log('[GeoImport] Layout controls registered:', LAYOUT_CONTROLS.map(c => c.type).join(', '));

(function() {
  'use strict';
  
  // DOM references
  const dashboard = document.querySelector('.geo-import-dashboard');
  const progressRing = document.querySelector('.progress-ring-circle');
  const progressText = document.querySelector('.progress-ring-text');
  const progressStat = document.querySelector('.progress-stat');
  const progressPhase = document.querySelector('.progress-phase');
  const logBody = document.querySelector('.log-body');
  const startBtn = document.querySelector('[data-action="start-import"]');
  const pauseBtn = document.querySelector('[data-action="pause-import"]');
  const cancelBtn = document.querySelector('[data-action="cancel-import"]');
  
  // Connection status indicator
  const statusEl = document.createElement('div');
  statusEl.className = 'connection-status disconnected';
  statusEl.textContent = '⚡ Connecting...';
  document.body.appendChild(statusEl);
  
  // State
  let currentState = null;
  let eventSource = null;
  
  // Metrics tracking
  let metricsHistory = [];
  let stageTimes = {};
  let lastProgressUpdate = Date.now();
  let recordsPerSecond = 0;
  
  // Toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  
  // ─────────────────────────────────────────────────────────────────────────
  // SSE Connection
  // ─────────────────────────────────────────────────────────────────────────
  
  function connectSSE() {
    eventSource = new EventSource('/api/geo-import/events');
    
    eventSource.onopen = () => {
      statusEl.className = 'connection-status connected';
      statusEl.textContent = '🟢 Connected';
      console.log('[GeoImport] SSE connected');
    };
    
    eventSource.onerror = (err) => {
      statusEl.className = 'connection-status disconnected';
      statusEl.textContent = '🔴 Disconnected';
      console.error('[GeoImport] SSE error:', err);
      
      // Reconnect after delay
      setTimeout(connectSSE, 3000);
    };
    
    // Initial state
    eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateUI(currentState);
      console.log('[GeoImport] Initial state:', currentState);
    });
    
    // Progress updates
    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateProgress(currentState);
    });
    
    // Stage changes
    eventSource.addEventListener('stage-change', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateUI(currentState);
    });
    
    // Log entries
    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      appendLog(data.entry);
    });
    
    // State changes
    eventSource.addEventListener('state-change', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateUI(currentState);
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // UI Updates
  // ─────────────────────────────────────────────────────────────────────────
  
  function updateUI(state) {
    updateProgress(state);
    updateStagesStepper(state);
    updateButtons(state);
    updateSourceCards(state);
  }
  
  function updateStagesStepper(state) {
    const stepper = document.querySelector('.stages-stepper');
    if (!stepper) return;
    
    const currentStageId = state.status || state.stage?.id || 'idle';
    const prevStageId = stepper.getAttribute('data-current-stage');
    stepper.setAttribute('data-current-stage', currentStageId);
    
    // Track stage timing
    const now = Date.now();
    if (currentStageId !== prevStageId) {
      // Stage changed - record duration of previous stage
      if (prevStageId && stageTimes[prevStageId]?.start) {
        stageTimes[prevStageId].end = now;
        stageTimes[prevStageId].duration = now - stageTimes[prevStageId].start;
      }
      // Start timing new stage
      stageTimes[currentStageId] = { start: now };
      
      // Show toast notification for stage change
      if (currentStageId !== 'idle') {
        showToast(getStageEmoji(currentStageId) + ' ' + getStageLabel(currentStageId), 'info');
      }
      if (currentStageId === 'complete') {
        showToast('🎉 Import completed successfully!', 'success');
        playCompletionSound();
      }
    }
    
    const stages = stepper.querySelectorAll('.stage-item');
    const stageIds = ['idle', 'validating', 'counting', 'preparing', 'importing', 'indexing', 'verifying', 'complete'];
    const currentIndex = stageIds.indexOf(currentStageId);
    
    stages.forEach((stageEl, index) => {
      const stageId = stageIds[index];
      stageEl.classList.remove('stage-completed', 'stage-current', 'stage-pending');
      
      const connector = stageEl.querySelector('.stage-connector');
      if (connector) {
        connector.classList.remove('connector-completed');
      }
      
      if (index < currentIndex) {
        stageEl.classList.add('stage-completed');
        if (connector) connector.classList.add('connector-completed');
        
        // Add duration badge for completed stages
        addStageDuration(stageEl, stageId);
      } else if (index === currentIndex) {
        stageEl.classList.add('stage-current');
        // Show live duration for current stage
        updateLiveStageDuration(stageEl, stageId);
      } else {
        stageEl.classList.add('stage-pending');
      }
    });
  }
  
  function addStageDuration(stageEl, stageId) {
    let durationEl = stageEl.querySelector('.stage-duration');
    if (!durationEl) {
      durationEl = document.createElement('div');
      durationEl.className = 'stage-duration';
      stageEl.appendChild(durationEl);
    }
    
    const timing = stageTimes[stageId];
    if (timing?.duration) {
      durationEl.textContent = formatDuration(Math.floor(timing.duration / 1000));
    }
  }
  
  function updateLiveStageDuration(stageEl, stageId) {
    let durationEl = stageEl.querySelector('.stage-duration');
    if (!durationEl) {
      durationEl = document.createElement('div');
      durationEl.className = 'stage-duration';
      stageEl.appendChild(durationEl);
    }
    
    const timing = stageTimes[stageId];
    if (timing?.start) {
      const elapsed = Math.floor((Date.now() - timing.start) / 1000);
      durationEl.textContent = formatDuration(elapsed) + '...';
    }
  }
  
  function getStageEmoji(stageId) {
    const emojis = {
      'idle': '⏸️', 'validating': '🔍', 'counting': '📊', 'preparing': '⚙️',
      'importing': '💾', 'indexing': '🗂️', 'verifying': '✅', 'complete': '🎉'
    };
    return emojis[stageId] || '•';
  }
  
  function getStageLabel(stageId) {
    const labels = {
      'idle': 'Ready', 'validating': 'Validating files...', 'counting': 'Counting records...',
      'preparing': 'Preparing database...', 'importing': 'Importing records...',
      'indexing': 'Building indexes...', 'verifying': 'Verifying data...', 'complete': 'Complete'
    };
    return labels[stageId] || stageId;
  }
  
  function updateProgress(state) {
    const { progress, stage } = state;
    const percent = progress.percent || 0;
    const now = Date.now();
    
    // Calculate speed (records per second)
    if (progress.current > 0) {
      const timeDiff = (now - lastProgressUpdate) / 1000;
      if (timeDiff > 0 && metricsHistory.length > 0) {
        const lastProgress = metricsHistory[metricsHistory.length - 1];
        const recordsDiff = progress.current - lastProgress.current;
        if (recordsDiff > 0) {
          recordsPerSecond = Math.round(recordsDiff / timeDiff);
        }
      }
      metricsHistory.push({ current: progress.current, time: now });
      // Keep only last 10 entries
      if (metricsHistory.length > 10) metricsHistory.shift();
      lastProgressUpdate = now;
    }
    
    // Calculate ETA
    const remaining = (progress.total || 0) - (progress.current || 0);
    const etaSeconds = recordsPerSecond > 0 ? Math.ceil(remaining / recordsPerSecond) : 0;
    const etaFormatted = formatDuration(etaSeconds);
    
    // Update ring
    if (progressRing) {
      const radius = progressRing.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percent / 100) * circumference;
      progressRing.style.strokeDashoffset = offset;
    }
    
    // Update text
    if (progressText) {
      progressText.textContent = percent + '%';
    }
    
    // Update stats with animation
    if (progressStat) {
      progressStat.innerHTML = 
        '<span class="stat-value counting">' + formatNumber(progress.current) + '</span> / ' +
        '<span class="stat-total">' + formatNumber(progress.total) + '</span> records';
    }
    
    // Update phase
    if (progressPhase && stage) {
      progressPhase.textContent = stage.emoji + ' ' + stage.description;
    }
    
    // Update metrics (ETA & Speed)
    updateMetrics(etaFormatted, recordsPerSecond, state.elapsed);
  }
  
  function updateMetrics(eta, speed, elapsed) {
    let metricsEl = document.querySelector('.progress-metrics');
    if (!metricsEl) {
      // Create metrics section if it doesn't exist
      metricsEl = document.createElement('div');
      metricsEl.className = 'progress-metrics';
      metricsEl.innerHTML = 
        '<div class="metric-item">' +
          '<span class="metric-value speed" data-metric="speed">0</span>' +
          '<span class="metric-label">Records/sec</span>' +
        '</div>' +
        '<div class="metric-item">' +
          '<span class="metric-value eta" data-metric="eta">--:--</span>' +
          '<span class="metric-label">ETA</span>' +
        '</div>' +
        '<div class="metric-item">' +
          '<span class="metric-value" data-metric="elapsed">00:00</span>' +
          '<span class="metric-label">Elapsed</span>' +
        '</div>';
      const progressStats = document.querySelector('.progress-stats');
      if (progressStats) progressStats.appendChild(metricsEl);
    }
    
    const speedEl = metricsEl.querySelector('[data-metric="speed"]');
    const etaEl = metricsEl.querySelector('[data-metric="eta"]');
    const elapsedEl = metricsEl.querySelector('[data-metric="elapsed"]');
    
    if (speedEl) speedEl.textContent = formatNumber(speed);
    if (etaEl) etaEl.textContent = eta || '--:--';
    if (elapsedEl) elapsedEl.textContent = formatDuration(Math.floor((elapsed || 0) / 1000));
  }
  
  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return '--:--';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }
  
  function updateButtons(state) {
    const { status } = state;
    const isRunning = ['validating', 'counting', 'preparing', 'importing', 'indexing', 'verifying'].includes(status);
    const isPaused = status === 'paused';
    
    if (startBtn) {
      startBtn.disabled = isRunning || isPaused;
      startBtn.textContent = isRunning ? '🔄 Running...' : '🚀 Start Import';
    }
    
    if (pauseBtn) {
      pauseBtn.disabled = !isRunning && !isPaused;
      pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
    }
    
    if (cancelBtn) {
      cancelBtn.disabled = !isRunning && !isPaused;
    }
  }
  
  function updateSourceCards(state) {
    // Update GeoNames card
    const geonamesCard = document.querySelector('.source-geonames');
    if (geonamesCard && state.sources.geonames) {
      const badge = geonamesCard.querySelector('.status-badge');
      if (badge) {
        const status = state.sources.geonames.status;
        badge.className = 'status-badge status-' + status;
        badge.textContent = getStatusLabel(status);
      }
      
      // Update stats
      const statsGrid = geonamesCard.querySelector('.stats-grid');
      if (statsGrid && state.stats) {
        const statItems = statsGrid.querySelectorAll('.stat-item');
        if (statItems[1]) {
          statItems[1].querySelector('.stat-value').textContent = formatNumber(state.stats.processed);
        }
        if (statItems[2]) {
          statItems[2].querySelector('.stat-value').textContent = formatNumber(state.stats.inserted);
        }
      }
    }
  }
  
  function appendLog(entry) {
    if (!logBody) return;
    
    const row = document.createElement('div');
    row.className = 'log-entry log-' + (entry.level || 'info');
    
    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = entry.time;
    row.appendChild(timestamp);
    
    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = entry.message;
    row.appendChild(message);
    
    logBody.appendChild(row);
    logBody.scrollTop = logBody.scrollHeight;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Button Handlers
  // ─────────────────────────────────────────────────────────────────────────
  
  function handleStart() {
    // First do a preflight check
    fetch('/api/geo-import/preflight')
      .then(r => r.json())
      .then(preflight => {
        if (!preflight.ready) {
          // Show download instructions
          showMissingFileAlert(preflight);
          return;
        }
        
        // File exists, start the import
        return fetch('/api/geo-import/start', { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            if (data.error) {
              if (data.instructions) {
                showMissingFileAlert(data);
              } else {
                addLogEntry({ time: new Date().toLocaleTimeString(), level: 'error', message: data.error });
              }
            } else {
              console.log('[GeoImport] Start:', data);
            }
          });
      })
      .catch(err => {
        console.error('[GeoImport] Start error:', err);
        addLogEntry({ time: new Date().toLocaleTimeString(), level: 'error', message: 'Failed to start import: ' + err.message });
      });
  }
  
  function showMissingFileAlert(info) {
    const instructions = info.instructions || [
      '1. Download cities15000.zip from ' + info.downloadUrl,
      '2. Extract cities15000.txt to data/geonames/',
      '3. Click "Start Import" again'
    ];
    
    // Add to log
    addLogEntry({ time: new Date().toLocaleTimeString(), level: 'warning', message: '⚠️ GeoNames data file not found' });
    instructions.forEach(step => {
      addLogEntry({ time: new Date().toLocaleTimeString(), level: 'info', message: step });
    });
    
    // Show alert with download link
    const alertMsg = 'GeoNames data file not found!\\n\\n' + 
      instructions.join('\\n') + '\\n\\n' +
      'Download URL: ' + info.downloadUrl;
    
    if (confirm(alertMsg + '\\n\\nOpen download page?')) {
      window.open(info.downloadUrl, '_blank');
    }
  }
  
  function handlePause() {
    const isPaused = currentState?.status === 'paused';
    const endpoint = isPaused ? '/api/geo-import/resume' : '/api/geo-import/pause';
    
    fetch(endpoint, { method: 'POST' })
      .then(r => r.json())
      .then(data => console.log('[GeoImport] Pause/Resume:', data))
      .catch(err => console.error('[GeoImport] Pause/Resume error:', err));
  }
  
  function handleCancel() {
    if (confirm('Cancel the import?')) {
      fetch('/api/geo-import/cancel', { method: 'POST' })
        .then(r => r.json())
        .then(data => console.log('[GeoImport] Cancel:', data))
        .catch(err => console.error('[GeoImport] Cancel error:', err));
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────
  
  function formatNumber(n) {
    return typeof n === 'number' ? n.toLocaleString() : (n || '0');
  }
  
  function getStatusLabel(status) {
    const labels = {
      'idle': '⏸️ Idle',
      'ready': '✅ Ready',
      'running': '🔄 Running',
      'validating': '🔍 Validating',
      'importing': '💾 Importing',
      'complete': '✅ Complete',
      'error': '❌ Error',
      'pending': '⏳ Pending'
    };
    return labels[status] || status;
  }
  
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  
  function playCompletionSound() {
    // Use Web Audio API for a simple completion chime
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 523.25; // C5
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      
      // Second note (E5) for a pleasant chime
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 659.25; // E5
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.5);
      }, 150);
    } catch (e) {
      // Audio not supported, fail silently
      console.log('[GeoImport] Audio notification not available');
    }
  }
  
  function addLogEntry(entry) {
    appendLog(entry);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Initialize
  // ─────────────────────────────────────────────────────────────────────────
  
  // Bind buttons
  if (startBtn) startBtn.addEventListener('click', handleStart);
  if (pauseBtn) pauseBtn.addEventListener('click', handlePause);
  if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
  
  // Connect SSE
  connectSSE();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Database Selector Handlers
  // ─────────────────────────────────────────────────────────────────────────
  
  const dbSelector = document.querySelector('[data-jsgui-control="database_selector"]') 
    || document.querySelector('.database-selector')
    || document.querySelector('.db-selector-window');
  const dbContextMenu = dbSelector?.querySelector('[data-context-menu="database"]');
  let bodyControl = null;
  let bodyContextMenuHandlersBound = false;
  let activeContextTarget = null;
  
  function ensureBodyControl() {
    if (bodyControl) return bodyControl;
    try {
      if (jsgui && typeof jsgui.Client_Page_Context === 'function') {
        const ctx = new jsgui.Client_Page_Context({ document });
        bodyControl = typeof ctx.body === 'function' ? ctx.body() : null;
      }
    } catch (err) {
      console.warn('[GeoImport] Failed to init jsgui body control', err);
    }
    return bodyControl;
  }
  
  function showDbContextMenu(x, y, targetPath) {
    if (!dbContextMenu) return;
    
    activeContextTarget = targetPath;
    dbContextMenu.style.display = 'block';
    dbContextMenu.style.left = x + 'px';
    dbContextMenu.style.top = y + 'px';
    dbContextMenu.setAttribute('data-target-path', targetPath || '');
    
    requestAnimationFrame(() => adjustDbContextMenuPosition(x, y));
  }
  
  function hideDbContextMenu() {
    if (!dbContextMenu) return;
    dbContextMenu.style.display = 'none';
    dbContextMenu.removeAttribute('data-target-path');
    activeContextTarget = null;
  }
  
  function adjustDbContextMenuPosition(x, y) {
    if (!dbContextMenu) return;
    const rect = dbContextMenu.getBoundingClientRect();
    let left = x;
    let top = y;
    
    if (rect.right > window.innerWidth) {
      left = x - rect.width;
    }
    if (rect.bottom > window.innerHeight) {
      top = y - rect.height;
    }
    
    dbContextMenu.style.left = Math.max(8, left) + 'px';
    dbContextMenu.style.top = Math.max(8, top) + 'px';
  }
  
  function handleDbContextAction(action, targetPath) {
    if (action === 'open-in-explorer') {
      fetch('/api/geo-import/open-in-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      }).catch(err => {
        console.error('Failed to open in explorer:', err);
      });
    }
    
    dbSelector?.dispatchEvent(new CustomEvent('db-context-action', {
      bubbles: true,
      detail: { action, targetPath }
    }));
  }
  
  function bindContextMenuHandlers() {
    if (!dbSelector || !dbContextMenu) return;
    
    if (!bodyContextMenuHandlersBound) {
      const body = ensureBodyControl();
      const outsideHandler = (e) => {
        if (dbContextMenu.style.display === 'block' && !dbContextMenu.contains(e.target)) {
          hideDbContextMenu();
        }
      };
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          hideDbContextMenu();
        }
      };
      
      if (body && typeof body.on === 'function') {
        body.on('click', outsideHandler);
        body.on('keydown', escapeHandler);
      } else {
        document.addEventListener('click', outsideHandler);
        document.addEventListener('keydown', escapeHandler);
      }
      bodyContextMenuHandlersBound = true;
    }
    
    dbSelector.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('.db-item');
      if (!item) return;
      const dbPath = item.getAttribute('data-db-path');
      if (!dbPath || dbPath === '__new__') return;
      
      e.preventDefault();
      showDbContextMenu(e.clientX, e.clientY, dbPath);
    });
    
    dbContextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.db-context-menu-item');
      if (!item) return;
      const action = item.getAttribute('data-action');
      const targetPath = activeContextTarget || dbContextMenu.getAttribute('data-target-path');
      if (action && targetPath) {
        handleDbContextAction(action, targetPath);
      }
      hideDbContextMenu();
    });
  }
  
  function initDatabaseSelector() {
    if (!dbSelector) return;
    
    // Handle database item clicks
    dbSelector.addEventListener('click', function(e) {
      const item = e.target.closest('.db-item');
      if (item) {
        const dbPath = item.getAttribute('data-db-path');
        if (dbPath === '__new__') {
          toggleNewDbInput(true);
        } else {
          selectDatabase(dbPath);
        }
        return;
      }
      
      // Handle action buttons
      const action = e.target.getAttribute('data-action');
      if (action === 'select-default') {
        selectDefaultDatabase();
      } else if (action === 'refresh-list') {
        refreshDatabaseList();
      } else if (action === 'create-new-db') {
        createNewDatabase();
      }
    });
    
    // Handle Enter key in new db input
    const newDbInput = dbSelector.querySelector('[data-input="new-db-name"]');
    if (newDbInput) {
      newDbInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          createNewDatabase();
        }
      });
    }
    
    bindContextMenuHandlers();
  }
  
  function selectDatabase(dbPath) {
    showToast('Switching to ' + dbPath.split('/').pop() + '...', 'info');
    
    fetch('/api/databases/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dbPath })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        showToast('Error: ' + data.error, 'error');
        return;
      }
      
      showToast('Switched to ' + data.path.split(/[\\\\\\/]/).pop(), 'success');
      
      // Update UI
      updateSelectedDatabase(dbPath, data.stats);
      
      // Reload page to get fresh state
      setTimeout(() => location.reload(), 500);
    })
    .catch(err => {
      showToast('Failed to switch: ' + err.message, 'error');
    });
  }
  
  function selectDefaultDatabase() {
    // Find default in the list
    const defaultItem = dbSelector.querySelector('.db-item.default');
    if (defaultItem) {
      const dbPath = defaultItem.getAttribute('data-db-path');
      selectDatabase(dbPath);
    }
  }
  
  function refreshDatabaseList() {
    showToast('Refreshing database list...', 'info');
    
    fetch('/api/databases')
      .then(r => r.json())
      .then(data => {
        updateDatabaseList(data.databases, data.current);
        showToast('Found ' + data.databases.length + ' databases', 'success');
      })
      .catch(err => {
        showToast('Failed to refresh: ' + err.message, 'error');
      });
  }
  
  function createNewDatabase() {
    const input = dbSelector.querySelector('[data-input="new-db-name"]');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) {
      showToast('Please enter a database name', 'warning');
      input.focus();
      return;
    }
    
    showToast('Creating ' + name + '...', 'info');
    
    fetch('/api/databases/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        showToast('Error: ' + data.error, 'error');
        return;
      }
      
      showToast('Created ' + data.name, 'success');
      input.value = '';
      toggleNewDbInput(false);
      
      // Refresh and select new database
      refreshDatabaseList();
      setTimeout(() => selectDatabase(data.path), 500);
    })
    .catch(err => {
      showToast('Failed to create: ' + err.message, 'error');
    });
  }
  
  function toggleNewDbInput(visible) {
    const inputGroup = dbSelector.querySelector('.db-new-input-group');
    const newItem = dbSelector.querySelector('.db-item.new-db');
    
    if (inputGroup) {
      inputGroup.setAttribute('data-visible', visible ? 'true' : 'false');
    }
    if (newItem) {
      newItem.classList.toggle('selected', visible);
    }
    
    if (visible) {
      const input = inputGroup?.querySelector('input');
      if (input) input.focus();
    }
  }
  
  function updateSelectedDatabase(dbPath, stats) {
    // Update selected state in list
    dbSelector.querySelectorAll('.db-item').forEach(item => {
      const isSelected = item.getAttribute('data-db-path') === dbPath;
      item.classList.toggle('selected', isSelected);
      const check = item.querySelector('.db-check');
      if (check) check.textContent = isSelected ? '✓' : '';
    });
    
    // Update info panel
    const infoPanel = dbSelector.querySelector('[data-panel="selected-info"]');
    if (infoPanel && stats) {
      infoPanel.innerHTML = 
        '<div class="info-title">📊 ' + dbPath.split(/[\\\\\\/]/).pop() + '</div>' +
        '<div class="info-stats-grid">' +
          '<div class="info-stat"><span class="stat-emoji">📍</span><span class="stat-value">' + formatNumber(stats.places) + '</span><span class="stat-label">Places</span></div>' +
          '<div class="info-stat"><span class="stat-emoji">🏷️</span><span class="stat-value">' + formatNumber(stats.names) + '</span><span class="stat-label">Names</span></div>' +
          '<div class="info-stat"><span class="stat-emoji">💾</span><span class="stat-value">' + formatFileSize(stats.size) + '</span><span class="stat-label">Size</span></div>' +
        '</div>' +
        '<div class="info-path"><span class="path-label">Path: </span><code class="path-value">' + dbPath + '</code></div>';
    }
    
    // Update coverage section totals
    const coverageBefore = document.querySelector('.coverage-before');
    if (coverageBefore && stats) {
      const placesBefore = coverageBefore.querySelector('.coverage-item:first-child .coverage-value');
      const namesBefore = coverageBefore.querySelector('.coverage-item:nth-child(2) .coverage-value');
      if (placesBefore) placesBefore.textContent = formatNumber(stats.places);
      if (namesBefore) namesBefore.textContent = formatNumber(stats.names);
    }
  }
  
  function updateDatabaseList(databases, currentPath) {
    const list = dbSelector.querySelector('[data-list="databases"]');
    if (!list) return;
    
    // Clear existing items (except empty state)
    list.querySelectorAll('.db-item').forEach(item => item.remove());
    
    // Add new items
    databases.forEach(db => {
      const item = document.createElement('div');
      item.className = 'db-item' + (db.path === currentPath ? ' selected' : '') + (db.isDefault ? ' default' : '');
      item.setAttribute('data-db-path', db.path);
      
      item.innerHTML = 
        '<span class="db-icon">🗄️</span>' +
        '<div class="db-info">' +
          '<div class="db-name-row">' +
            '<span class="db-name">' + db.name + '</span>' +
            (db.isDefault ? '<span class="db-badge default-badge">⭐ Default</span>' : '') +
          '</div>' +
          '<div class="db-stats-row">' +
            '<span class="db-stat">📍 ' + formatNumber(db.places) + ' places</span>' +
            '<span class="db-stat">🏷️ ' + formatNumber(db.names) + ' names</span>' +
            '<span class="db-stat">💾 ' + formatFileSize(db.size) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="db-check">' + (db.path === currentPath ? '✓' : '') + '</span>';
      
      list.appendChild(item);
    });
  }
  
  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return bytes.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }
  
  // Initialize database selector
  initDatabaseSelector();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Navigation Handling
  // ─────────────────────────────────────────────────────────────────────────
  // NOTE: Navigation clicks are now handled by jsgui3 controls (NavItem)
  // via the 'nav-select' CustomEvent system in GeoImportDashboard.activate()
  // 
  // This keeps initialization minimal - just ensures visual state is correct
  // The actual click handling and URL navigation is done by the control framework
  
  function initNavigation() {
    const currentView = new URLSearchParams(window.location.search).get('view') || 'database';
    
    // Set initial visual state for nav items (defensive - server should set this)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const navId = item.getAttribute('data-nav-id');
      if (navId === currentView) {
        item.classList.add('nav-item--selected');
      }
    });
  }
  
  initNavigation();
  
  console.log('[GeoImport] Dashboard initialized');
})();
