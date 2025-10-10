/**
 * Background Tasks UI Module
 * 
 * Provides UI controls for managing background tasks:
 * - Task picker/selector
 * - Configuration parameters
 * - Start/pause/resume/cancel controls
 * - Progress display
 */

const { each, tof } = require('lang-tools');
const { createAnalysisProgressBar } = require('./AnalysisProgressBar');

const analysisProgressControllers = new Map();
const telemetryState = {
  events: [],
  maxEntries: 200,
  paused: false,
  autoScroll: true,
  container: null
};
const severityLabels = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
  debug: 'Debug'
};

/**
 * Initialize background tasks UI
 */
function initBackgroundTasksUI(sseManager) {
  const container = document.getElementById('background-tasks-container');
  if (!container) {
    console.warn('[BackgroundTasksUI] Container not found');
    return;
  }
  
  // Render UI
  container.innerHTML = renderTaskManagerUI();
  telemetryState.container = document.getElementById('telemetry-stream');
  setTelemetryEmptyState(true);
  updateTelemetryPausedUi();
  
  // Setup event listeners
  setupEventListeners(sseManager);
  
  // Load initial task list
  refreshTaskList();
  
  // Subscribe to SSE updates
  if (sseManager) {
    sseManager.on('background-task', (data) => {
      handleTaskUpdate(data);
    });
  }
  
  console.log('[BackgroundTasksUI] Initialized');
}

/**
 * Render task manager UI HTML
 */
function renderTaskManagerUI() {
  return `
    <div class="background-tasks-ui">
      <div class="task-creator">
        <h3>Create Background Task</h3>
        
        <div class="form-group">
          <label for="task-type-select">Task Type:</label>
          <select id="task-type-select" class="form-control">
            <option value="">-- Select Task Type --</option>
            <option value="article-compression">Article Compression (Brotli)</option>
            <option value="analysis-run">Content Analysis (AI)</option>
          </select>
        </div>
        
        <div id="task-config-container" class="task-config" style="display: none;">
          <!-- Task-specific configuration will be rendered here -->
        </div>
        
        <div class="form-actions">
          <button id="create-task-btn" class="btn btn-primary" disabled>
            Create Task
          </button>
          <button id="create-and-start-btn" class="btn btn-success" disabled>
            Create & Start
          </button>
        </div>
      </div>
      
      <div class="task-list-container">
        <h3>Active & Recent Tasks</h3>
        <div id="task-list" class="task-list">
          <p class="loading">Loading tasks...</p>
        </div>
      </div>

      <div class="telemetry-container" id="telemetry-container">
        <div class="telemetry-header">
          <h3>Diagnostics Telemetry</h3>
          <div class="telemetry-controls">
            <label class="telemetry-control">
              <input type="checkbox" id="telemetry-autoscroll" checked /> Auto-scroll
            </label>
            <button class="btn btn-secondary btn-sm" id="telemetry-pause-btn" data-paused="0">Pause</button>
            <button class="btn btn-sm" id="telemetry-clear-btn">Clear</button>
          </div>
        </div>
        <div class="telemetry-stream is-empty" id="telemetry-stream">
          <div class="telemetry-empty">Telemetry events will appear once background tasks or crawls emit diagnostics.</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render compression task configuration form
 */
function renderCompressionTaskConfig() {
  return `
    <h4>Compression Settings</h4>
    
    <div class="form-group">
      <label for="brotli-quality">Brotli Quality (0-11):</label>
      <input type="number" id="brotli-quality" class="form-control" 
             value="10" min="0" max="11" />
      <small class="form-text">Higher = better compression, slower. Default: 10</small>
    </div>
    
    <div class="form-group">
      <label for="brotli-window">Window Size:</label>
      <select id="brotli-window" class="form-control">
        <option value="16">64 KB (fast)</option>
        <option value="18">256 KB</option>
        <option value="20">1 MB</option>
        <option value="22">4 MB</option>
        <option value="24" selected>256 MB (best compression)</option>
      </select>
      <small class="form-text">Larger window = better compression for large files</small>
    </div>
    
    <div class="form-group">
      <label for="batch-size">Batch Size:</label>
      <input type="number" id="batch-size" class="form-control" 
             value="100" min="10" max="1000" step="10" />
      <small class="form-text">Number of articles to process per batch</small>
    </div>
    
    <div class="form-group">
      <label for="delay-ms">Delay Between Batches (ms):</label>
      <input type="number" id="delay-ms" class="form-control" 
             value="0" min="0" max="5000" step="100" />
      <small class="form-text">Throttle processing to reduce system load</small>
    </div>
    
    <div class="form-group">
      <label>
        <input type="checkbox" id="use-worker-pool" checked />
        Use Worker Thread Pool (recommended for large datasets)
      </label>
    </div>
  `;
}

/**
 * Render analysis task configuration form
 */
function renderAnalysisTaskConfig() {
  return `
    <h4>Analysis Settings</h4>
    
    <div class="form-group">
      <label for="analysis-version">Analysis Version:</label>
      <select id="analysis-version" class="form-control">
        <option value="2" selected>Version 2 (Latest)</option>
        <option value="1">Version 1 (Legacy)</option>
      </select>
      <small class="form-text">Select which analysis algorithm to use</small>
    </div>
    
    <div class="form-group">
      <label for="batch-size-analysis">Batch Size:</label>
      <input type="number" id="batch-size-analysis" class="form-control" 
             value="10" min="1" max="100" step="1" />
      <small class="form-text">Number of articles to analyze per batch</small>
    </div>
    
    <div class="form-group">
      <label for="delay-ms-analysis">Delay Between Batches (ms):</label>
      <input type="number" id="delay-ms-analysis" class="form-control" 
             value="100" min="0" max="5000" step="100" />
      <small class="form-text">Throttle to avoid rate limits (recommended: 100-500ms)</small>
    </div>
    
    <div class="form-group">
      <label>
        <input type="checkbox" id="force-reanalysis" />
        Force Re-analysis (overwrite existing analysis)
      </label>
    </div>
  `;
}

/**
 * Setup event listeners
 */
function setupEventListeners(sseManager) {
  // Task type selection
  const taskTypeSelect = document.getElementById('task-type-select');
  taskTypeSelect?.addEventListener('change', (e) => {
    handleTaskTypeChange(e.target.value);
  });
  
  // Create task buttons
  document.getElementById('create-task-btn')?.addEventListener('click', () => {
    createTask(false);
  });
  
  document.getElementById('create-and-start-btn')?.addEventListener('click', () => {
    createTask(true);
  });

  const telemetryClearBtn = document.getElementById('telemetry-clear-btn');
  telemetryClearBtn?.addEventListener('click', () => clearTelemetryEvents());

  const telemetryPauseBtn = document.getElementById('telemetry-pause-btn');
  telemetryPauseBtn?.addEventListener('click', () => toggleTelemetryPaused());

  const telemetryAutoScroll = document.getElementById('telemetry-autoscroll');
  telemetryAutoScroll?.addEventListener('change', (e) => {
    telemetryState.autoScroll = !!e.target.checked;
    if (telemetryState.autoScroll && !telemetryState.paused) {
      scrollTelemetryToBottom();
    }
  });
}

/**
 * Handle task type selection change
 */
function handleTaskTypeChange(taskType) {
  const configContainer = document.getElementById('task-config-container');
  const createBtn = document.getElementById('create-task-btn');
  const createStartBtn = document.getElementById('create-and-start-btn');
  
  if (!taskType) {
    configContainer.style.display = 'none';
    createBtn.disabled = true;
    createStartBtn.disabled = true;
    return;
  }
  
  // Render task-specific configuration
  if (taskType === 'article-compression') {
    configContainer.innerHTML = renderCompressionTaskConfig();
    configContainer.style.display = 'block';
    createBtn.disabled = false;
    createStartBtn.disabled = false;
  } else if (taskType === 'analysis-run') {
    configContainer.innerHTML = renderAnalysisTaskConfig();
    configContainer.style.display = 'block';
    createBtn.disabled = false;
    createStartBtn.disabled = false;
  }
}

/**
 * Add task to list optimistically (before server refresh)
 * Provides immediate UI feedback when task is started
 */
function addTaskToListOptimistically(task) {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  
  const existingCard = taskList.querySelector(`.task-card[data-task-id="${task.id}"]`);
  if (existingCard) {
    updateTaskCard(task);
    return;
  }

  // Ensure container exists
  let tasksContainer = taskList.querySelector('.tasks');
  if (!tasksContainer) {
    taskList.innerHTML = '<div class="tasks"></div>';
    tasksContainer = taskList.querySelector('.tasks');
  }

  const defaults = {
    progress: {
      current: 0,
      total: 0,
      percent: 0,
      message: null
    },
    metadata: null
  };

  const cardHtml = renderTaskCard({ ...defaults, ...task });
  const temp = document.createElement('div');
  temp.innerHTML = cardHtml;
  const card = temp.firstElementChild;
  tasksContainer.prepend(card);
  attachTaskControlListeners();

  if (task.task_type === 'analysis-run') {
    ensureAnalysisProgressBar({ ...defaults, ...task });
  }
}

/**
 * Create background task
 */
async function createTask(autoStart) {
  const taskType = document.getElementById('task-type-select')?.value;
  if (!taskType) return;
  
  // Gather configuration
  const config = gatherTaskConfig(taskType);
  
  try {
    const response = await fetch('/api/background-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType,
        parameters: config,  // API expects 'parameters', not 'config'
        autoStart
      })
    });
    
    const result = await response.json();
    
    // Handle rate limiting (429) with proposed actions
    if (response.status === 429 && result.proposedActions) {
      if (typeof showProposedActionsPopup === 'function') {
        showProposedActionsPopup(result, () => {
          // Refresh task list after action executed
          refreshTaskList();
        });
      } else {
        showNotification('warning', result.error?.message || 'Rate limited. Please try again later.');
      }
      return;
    }
    
    if (result.success) {
      showNotification('success', `Task ${autoStart ? 'started' : 'created'} successfully`);
      
      // Optimistic UI: Add task immediately to list if autoStart
      if (autoStart && result.task) {
        addTaskToListOptimistically(result.task);
      }
      
      // Then refresh to get accurate state
      refreshTaskList();
    } else {
      showNotification('error', `Failed to create task: ${result.error}`);
    }
  } catch (error) {
    showNotification('error', `Error creating task: ${error.message}`);
  }
}

/**
 * Gather task configuration from form
 */
function gatherTaskConfig(taskType) {
  if (taskType === 'article-compression') {
    return {
      brotliQuality: parseInt(document.getElementById('brotli-quality')?.value || '10'),
      brotliWindow: parseInt(document.getElementById('brotli-window')?.value || '24'),
      batchSize: parseInt(document.getElementById('batch-size')?.value || '100'),
      delayMs: parseInt(document.getElementById('delay-ms')?.value || '0'),
      useWorkerPool: document.getElementById('use-worker-pool')?.checked || false
    };
  } else if (taskType === 'analysis-run') {
    return {
      version: parseInt(document.getElementById('analysis-version')?.value || '2'),
      batchSize: parseInt(document.getElementById('batch-size-analysis')?.value || '10'),
      delayMs: parseInt(document.getElementById('delay-ms-analysis')?.value || '100'),
      force: document.getElementById('force-reanalysis')?.checked || false
    };
  }
  
  return {};
}

/**
 * Refresh task list
 */
async function refreshTaskList() {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  
  try {
    const response = await fetch('/api/background-tasks?limit=20');
    const result = await response.json();
    
    if (result.success && result.tasks) {
      renderTaskList(result.tasks);
    } else {
      taskList.innerHTML = '<p class="error">Failed to load tasks</p>';
    }
  } catch (error) {
    taskList.innerHTML = `<p class="error">Error loading tasks: ${error.message}</p>`;
  }
}

/**
 * Render task list
 */
function renderTaskList(tasks) {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  
  if (tasks.length === 0) {
    taskList.innerHTML = '<p class="no-tasks">No tasks yet. Create one above!</p>';
    cleanupAnalysisProgressBars(new Set());
    return;
  }
  
  let html = '<div class="tasks">';
  
  each(tasks, (task) => {
    html += renderTaskCard(task);
  });
  
  html += '</div>';
  taskList.innerHTML = html;
  
  // Attach event listeners to task controls
  attachTaskControlListeners();

  const activeAnalysisIds = new Set();
  each(tasks, (task) => {
    if (task.task_type === 'analysis-run') {
      activeAnalysisIds.add(task.id);
      ensureAnalysisProgressBar(task);
    } else {
      destroyAnalysisProgressBar(task.id);
    }
  });
  cleanupAnalysisProgressBars(activeAnalysisIds);
}

/**
 * Render individual task card
 */
function renderTaskCard(task) {
  const statusClass = `status-${task.status}`;
  const progress = task.progress || { current: 0, total: 0, percent: 0, message: null };
  
  // Determine which controls to show
  const showStart = task.status === 'pending';
  const showPause = task.status === 'running' || task.status === 'resuming';
  const showResume = task.status === 'paused';
  const showStop = task.status === 'running' || task.status === 'paused' || task.status === 'resuming';
  const showDelete = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
  
  // Format status display
  let statusDisplay = task.status;
  let statusIcon = '';
  
  if (task.status === 'resuming') {
    statusDisplay = 'Resuming...';
    statusIcon = '🔄 ';
  } else if (task.status === 'running') {
    statusIcon = '▶️ ';
  } else if (task.status === 'paused') {
    statusIcon = '⏸️ ';
  } else if (task.status === 'completed') {
    statusIcon = '✅ ';
  } else if (task.status === 'failed') {
    statusIcon = '❌ ';
  } else if (task.status === 'cancelled') {
    statusIcon = '🛑 ';
  }
  
  const isAnalysisTask = task.task_type === 'analysis-run';
  // Enhanced progress display
  const hasValidProgress = progress.total > 0;
  const progressPercent = hasValidProgress ? progress.percent : 0;
  const progressText = hasValidProgress 
    ? `${progress.current} / ${progress.total} (${progressPercent}%)`
    : (task.status === 'resuming' ? 'Loading progress...' : 'Starting...');

  const analysisProgressExtras = [];
  if (progress.message) {
    analysisProgressExtras.push(`<div class="progress-message">${progress.message}</div>`);
  }
  if (task.status === 'resuming' && !hasValidProgress) {
    analysisProgressExtras.push('<div class="progress-message resuming-hint">Resuming from previous session...</div>');
  }

  const progressSection = isAnalysisTask ? `
      <div class="task-progress analysis-task-progress" data-task-id="${task.id}">
        <div class="analysis-progress-bar-host" data-task-id="${task.id}"></div>
        <div class="progress-text">${progressText}</div>
        ${analysisProgressExtras.join('')}
      </div>
    ` : `
      <div class="task-progress">
        <div class="progress-bar-container">
          <div class="progress-bar ${task.status === 'resuming' ? 'progress-bar-resuming' : ''}" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-text">
          ${progressText}
        </div>
        ${progress.message ? `<div class="progress-message">${progress.message}</div>` : ''}
        ${task.status === 'resuming' && !hasValidProgress ? `<div class="progress-message resuming-hint">Resuming from previous session...</div>` : ''}
      </div>
    `;
  
  return `
    <div class="task-card ${statusClass}" data-task-id="${task.id}">
      <div class="task-header">
        <span class="task-type">${task.task_type}</span>
        <span class="task-status badge badge-${task.status}">${statusIcon}${statusDisplay}</span>
      </div>
      
      ${progressSection}
      
      <div class="task-metadata">
        <div><strong>Created:</strong> ${formatDate(task.created_at)}</div>
        ${task.started_at ? `<div><strong>Started:</strong> ${formatDate(task.started_at)}</div>` : ''}
        ${task.resume_started_at ? `<div><strong>Resumed:</strong> ${formatDate(task.resume_started_at)}</div>` : ''}
        ${task.completed_at ? `<div><strong>Completed:</strong> ${formatDate(task.completed_at)}</div>` : ''}
        ${task.error_message ? `<div class="error-message"><strong>Error:</strong> ${task.error_message}</div>` : ''}
      </div>
      
      <div class="task-controls">
        ${showStart ? `<button class="btn btn-sm btn-success" data-action="start" data-task-id="${task.id}">Start</button>` : ''}
        ${showPause ? `<button class="btn btn-sm btn-warning" data-action="pause" data-task-id="${task.id}">Pause</button>` : ''}
        ${showResume ? `<button class="btn btn-sm btn-success" data-action="resume" data-task-id="${task.id}">Resume</button>` : ''}
        ${showStop ? `<button class="btn btn-sm btn-danger" data-action="stop" data-task-id="${task.id}">Cancel</button>` : ''}
        ${showDelete ? `<button class="btn btn-sm btn-secondary" data-action="delete" data-task-id="${task.id}">Delete</button>` : ''}
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to task control buttons
 */
function attachTaskControlListeners() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      const taskId = e.target.dataset.taskId;
      
      await performTaskAction(action, taskId);
    });
  });
}

/**
 * Perform task action (start/pause/resume/stop/delete)
 */
async function performTaskAction(action, taskId) {
  try {
    let endpoint, method;
    
    if (action === 'delete') {
      endpoint = `/api/background-tasks/${taskId}`;
      method = 'DELETE';
    } else {
      endpoint = `/api/background-tasks/${taskId}/${action}`;
      method = 'POST';
    }
    
    const response = await fetch(endpoint, { method });
    const result = await response.json();
    
    // Handle rate limiting (429) with proposed actions
    if (response.status === 429 && result.proposedActions) {
      if (typeof showProposedActionsPopup === 'function') {
        showProposedActionsPopup(result, () => {
          // Refresh task list after action executed
          refreshTaskList();
        });
      } else {
        showNotification('warning', result.error?.message || 'Rate limited. Please try again later.');
      }
      return;
    }
    
    if (result.success) {
      showNotification('success', `Task ${action} successful`);
      if (action === 'delete') {
        refreshTaskList();
      }
    } else {
      showNotification('error', `Failed to ${action} task: ${result.error}`);
    }
  } catch (error) {
    showNotification('error', `Error performing ${action}: ${error.message}`);
  }
}

/**
 * Handle task update from SSE
 */
function handleTaskUpdate(data) {
  // Update specific task card if visible
  const taskCard = document.querySelector(`[data-task-id="${data.id}"]`);
  
  if (taskCard) {
    // Refresh just this task
    refreshSingleTask(data.id);
  }
}

/**
 * Refresh single task
 */
async function refreshSingleTask(taskId) {
  try {
    const response = await fetch(`/api/background-tasks/${taskId}`);
    const result = await response.json();
    
    if (result.success && result.task) {
      const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
      if (taskCard) {
        const newCard = document.createElement('div');
        newCard.innerHTML = renderTaskCard(result.task);
        taskCard.replaceWith(newCard.firstElementChild);
        attachTaskControlListeners();
        if (result.task.task_type === 'analysis-run') {
          ensureAnalysisProgressBar(result.task);
        } else {
          destroyAnalysisProgressBar(result.task.id);
        }
      }
    }
  } catch (error) {
    console.error('[BackgroundTasksUI] Error refreshing task:', error);
  }
}

/**
 * Show notification
 */
function showNotification(type, message) {
  // Simple notification (can be enhanced with a proper notification system)
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Format date string
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Update a single task card with new data (for real-time SSE updates)
 * This is more efficient than re-rendering the entire list
 */
function updateTaskCard(taskData) {
  const existingCard = document.querySelector(`.task-card[data-task-id="${taskData.id}"]`);
  
  if (existingCard) {
    // Update existing card
    const newCardHTML = renderTaskCard(taskData);
    const temp = document.createElement('div');
    temp.innerHTML = newCardHTML;
    const newCard = temp.firstElementChild;
    
    existingCard.replaceWith(newCard);
    attachTaskControlListeners();
    if (taskData.task_type === 'analysis-run') {
      ensureAnalysisProgressBar(taskData);
    } else {
      destroyAnalysisProgressBar(taskData.id);
    }
  } else {
    // Card doesn't exist, refresh entire list
    refreshTaskList();
  }
}

function ensureAnalysisProgressBar(task) {
  if (task.task_type !== 'analysis-run') {
    destroyAnalysisProgressBar(task.id);
    return;
  }
  const host = document.querySelector(`.analysis-progress-bar-host[data-task-id="${task.id}"]`);
  if (!host) {
    destroyAnalysisProgressBar(task.id);
    return;
  }
  let controller = analysisProgressControllers.get(task.id);
  if (!controller || !controller.getElement || controller.getElement().parentNode !== host) {
    if (controller) {
      controller.destroy();
    }
    controller = createAnalysisProgressBar(host, {
      runId: `Analysis #${task.id}`,
      startedAt: task.started_at ? Date.parse(task.started_at) : Date.now(),
      onCancel: () => performTaskAction('stop', task.id),
      compact: false
    });
    analysisProgressControllers.set(task.id, controller);
  }
  const stats = (task.metadata && task.metadata.stats) || {};
  controller.updateStatus(task.status);
  controller.updateProgress({
    processed: stats.pagesProcessed ?? task.progress.current ?? 0,
    updated: stats.pagesUpdated ?? 0,
    total: task.progress.total ?? 0,
    percentage: task.progress.percent ?? 0
  });
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    controller.updateStatus(task.status);
  }
}

function destroyAnalysisProgressBar(taskId) {
  const controller = analysisProgressControllers.get(taskId);
  if (controller) {
    controller.destroy();
    analysisProgressControllers.delete(taskId);
  }
}

function cleanupAnalysisProgressBars(activeIds) {
  analysisProgressControllers.forEach((controller, taskId) => {
    if (!activeIds.has(taskId)) {
      controller.destroy();
      analysisProgressControllers.delete(taskId);
    }
  });
}

function normalizeTelemetryEntry(entry = {}) {
  const ts = entry.ts || entry.timestamp || new Date().toISOString();
  const severity = (entry.severity || '').toLowerCase();
  const allowedSeverity = ['error', 'warning', 'info', 'debug'];
  return {
    id: entry.id || `telemetry-${ts}-${Math.random().toString(16).slice(2, 6)}`,
    ts,
    source: entry.source || 'unknown',
    event: entry.event || entry.type || 'log',
    severity: allowedSeverity.includes(severity) ? severity : 'info',
    message: entry.message || entry.msg || '',
    details: entry.details,
    data: entry.data,
    taskId: entry.taskId,
    taskType: entry.taskType,
    status: entry.status
  };
}

function formatTelemetryTimestamp(ts) {
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (_) {
    return ts;
  }
}

function renderTelemetryRow(entry) {
  const row = document.createElement('div');
  row.className = `telemetry-row severity-${entry.severity}`;
  row.dataset.eventId = entry.id;

  const header = document.createElement('div');
  header.className = 'telemetry-row__header';

  const badge = document.createElement('span');
  badge.className = `telemetry-badge telemetry-badge--${entry.severity}`;
  badge.textContent = severityLabels[entry.severity] || entry.severity;
  header.appendChild(badge);

  const title = document.createElement('span');
  title.className = 'telemetry-title';
  const parts = [entry.source, entry.event, entry.status].filter(Boolean);
  title.textContent = parts.join(' · ') || 'telemetry';
  header.appendChild(title);

  const time = document.createElement('span');
  time.className = 'telemetry-timestamp';
  time.textContent = formatTelemetryTimestamp(entry.ts);
  header.appendChild(time);

  row.appendChild(header);

  const summary = document.createElement('div');
  summary.className = 'telemetry-summary';
  summary.textContent = entry.message || '(no message)';
  row.appendChild(summary);

  if (entry.taskId || entry.taskType) {
    const meta = document.createElement('div');
    meta.className = 'telemetry-meta';
    const metaParts = [];
    if (entry.taskId) metaParts.push(`task #${entry.taskId}`);
    if (entry.taskType) metaParts.push(entry.taskType);
    meta.textContent = metaParts.join(' · ');
    row.appendChild(meta);
  }

  if (entry.details || entry.data) {
    const detailsBlock = document.createElement('pre');
    detailsBlock.className = 'telemetry-details';
    let payload = entry.details;
    if (!payload && typeof entry.data !== 'undefined') {
      try {
        payload = JSON.stringify(entry.data, null, 2);
      } catch (_) {
        payload = String(entry.data);
      }
    }
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    detailsBlock.textContent = text.length > 600 ? `${text.slice(0, 597)}…` : text;
    row.appendChild(detailsBlock);
  }

  return row;
}

function setTelemetryEmptyState(isEmpty) {
  if (!telemetryState.container) return;
  telemetryState.container.classList.toggle('is-empty', !!isEmpty);
  if (isEmpty) {
    telemetryState.container.innerHTML = '<div class="telemetry-empty">Telemetry events will appear once background tasks or crawls emit diagnostics.</div>';
  }
}

function scrollTelemetryToBottom() {
  if (!telemetryState.container) return;
  telemetryState.container.scrollTop = telemetryState.container.scrollHeight;
}

function updateTelemetryPausedUi() {
  const pauseBtn = document.getElementById('telemetry-pause-btn');
  if (pauseBtn) {
    pauseBtn.dataset.paused = telemetryState.paused ? '1' : '0';
    pauseBtn.textContent = telemetryState.paused ? 'Resume' : 'Pause';
  }
  if (telemetryState.container) {
    telemetryState.container.dataset.paused = telemetryState.paused ? '1' : '0';
  }
}

function appendTelemetryEvent(entry) {
  if (!telemetryState.container) return;
  const normalized = normalizeTelemetryEntry(entry);
  telemetryState.events.push(normalized);
  if (telemetryState.events.length > telemetryState.maxEntries) {
    telemetryState.events.shift();
    const firstRow = telemetryState.container.querySelector('.telemetry-row');
    firstRow?.remove();
  }

  if (telemetryState.container.classList.contains('is-empty')) {
    telemetryState.container.innerHTML = '';
    telemetryState.container.classList.remove('is-empty');
  }

  const row = renderTelemetryRow(normalized);
  telemetryState.container.appendChild(row);

  if (!telemetryState.paused && telemetryState.autoScroll) {
    scrollTelemetryToBottom();
  }
}

function clearTelemetryEvents() {
  telemetryState.events = [];
  setTelemetryEmptyState(true);
}

function toggleTelemetryPaused(forceValue) {
  const next = typeof forceValue === 'boolean' ? forceValue : !telemetryState.paused;
  telemetryState.paused = next;
  updateTelemetryPausedUi();
  if (!telemetryState.paused && telemetryState.autoScroll) {
    scrollTelemetryToBottom();
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initBackgroundTasksUI, updateTaskCard, appendTelemetryEvent, clearTelemetryEvents, toggleTelemetryPaused };
}

if (typeof window !== 'undefined') {
  window.appendBackgroundTelemetry = appendTelemetryEvent;
  window.clearBackgroundTelemetry = clearTelemetryEvents;
  window.toggleBackgroundTelemetryPaused = toggleTelemetryPaused;
}
