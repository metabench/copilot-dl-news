/**
 * CrawlProgressIndicator.js
 * 
 * Reusable component for displaying crawl progress with:
 * - Dual-level progress bars (main task + sub-task)
 * - Determinate progress (with known totals)
 * - Indeterminate progress (spinners)
 * - Stage labels and status indicators
 * - Telemetry integration
 * 
 * Usage:
 *   const indicator = createCrawlProgressIndicator({
 *     container: document.getElementById('progress-container'),
 *     jobId: '2025-10-08_12-34-56',
 *     onStateChange: (state) => console.log('State changed:', state)
 *   });
 *   
 *   indicator.updateProgress({ visited: 10, total: 100, stage: 'crawling' });
 *   indicator.updateSubTask({ current: 5, total: 50, label: 'Processing countries' });
 *   indicator.setStage('analyzing');
 *   indicator.destroy();
 */

/**
 * Create a crawl progress indicator instance
 * 
 * @param {Object} options
 * @param {HTMLElement} options.container - Container element
 * @param {string} [options.jobId] - Job identifier
 * @param {Function} [options.onStateChange] - Callback when state changes
 * @returns {Object} Progress indicator API
 */
function createCrawlProgressIndicator(options = {}) {
  const {
    container,
    jobId = null,
    onStateChange = null
  } = options;

  if (!container) {
    throw new Error('CrawlProgressIndicator requires a container element');
  }

  // Internal state
  const state = {
    jobId,
    mainTask: {
      current: 0,
      total: null,
      percentage: 0,
      stage: 'initializing',
      stageLabel: 'Initializing',
      status: 'running'
    },
    subTask: {
      current: 0,
      total: null,
      percentage: 0,
      label: null,
      visible: false
    },
    telemetry: [],
    lastUpdate: Date.now()
  };

  // Create DOM structure
  const root = document.createElement('div');
  root.className = 'crawl-progress-indicator';
  root.dataset.jobId = jobId || '';

  const header = document.createElement('div');
  header.className = 'crawl-progress-indicator__header';
  
  const stageLabel = document.createElement('div');
  stageLabel.className = 'crawl-progress-indicator__stage-label';
  stageLabel.textContent = state.mainTask.stageLabel;
  
  const statusBadge = document.createElement('span');
  statusBadge.className = 'crawl-progress-indicator__status-badge';
  statusBadge.dataset.status = state.mainTask.status;
  statusBadge.textContent = state.mainTask.status;
  
  header.appendChild(stageLabel);
  header.appendChild(statusBadge);

  // Main progress bar
  const mainProgressContainer = document.createElement('div');
  mainProgressContainer.className = 'crawl-progress-indicator__main-progress';
  
  const mainBar = document.createElement('div');
  mainBar.className = 'progress-bar-container';
  
  const mainBarFill = document.createElement('div');
  mainBarFill.className = 'progress-bar-fill';
  mainBarFill.style.width = '0%';
  
  const mainBarLabel = document.createElement('div');
  mainBarLabel.className = 'progress-bar-label';
  mainBarLabel.textContent = '0%';
  
  mainBar.appendChild(mainBarFill);
  mainBar.appendChild(mainBarLabel);
  mainProgressContainer.appendChild(mainBar);

  // Sub-task progress bar (initially hidden)
  const subProgressContainer = document.createElement('div');
  subProgressContainer.className = 'crawl-progress-indicator__sub-progress';
  subProgressContainer.style.display = 'none';
  
  const subTaskLabel = document.createElement('div');
  subTaskLabel.className = 'crawl-progress-indicator__sub-label';
  
  const subBar = document.createElement('div');
  subBar.className = 'progress-bar-container progress-bar-container--small';
  
  const subBarFill = document.createElement('div');
  subBarFill.className = 'progress-bar-fill progress-bar-fill--sub';
  subBarFill.style.width = '0%';
  
  const subBarLabel = document.createElement('div');
  subBarLabel.className = 'progress-bar-label progress-bar-label--small';
  subBarLabel.textContent = '0%';
  
  subBar.appendChild(subBarFill);
  subBar.appendChild(subBarLabel);
  subProgressContainer.appendChild(subTaskLabel);
  subProgressContainer.appendChild(subBar);

  // Assemble
  root.appendChild(header);
  root.appendChild(mainProgressContainer);
  root.appendChild(subProgressContainer);
  container.appendChild(root);

  /**
   * Update main task progress
   * 
   * @param {Object} progress
   * @param {number} [progress.current] - Current value
   * @param {number} [progress.total] - Total value (null for indeterminate)
   * @param {string} [progress.stage] - Stage identifier
   * @param {string} [progress.stageLabel] - Human-readable stage label
   * @param {string} [progress.status] - Status (running, paused, completed, failed)
   */
  function updateProgress(progress = {}) {
    if (progress.stage && progress.stage !== state.mainTask.stage) {
      state.mainTask.stage = progress.stage;
      state.mainTask.stageLabel = progress.stageLabel || capitalizeStage(progress.stage);
      stageLabel.textContent = state.mainTask.stageLabel;
    }

    if (progress.stageLabel) {
      state.mainTask.stageLabel = progress.stageLabel;
      stageLabel.textContent = progress.stageLabel;
    }

    if (progress.status && progress.status !== state.mainTask.status) {
      state.mainTask.status = progress.status;
      statusBadge.textContent = progress.status;
      statusBadge.dataset.status = progress.status;
    }

    if (typeof progress.current === 'number') {
      state.mainTask.current = progress.current;
    }

    if (typeof progress.total === 'number' || progress.total === null) {
      state.mainTask.total = progress.total;
    }

    // Calculate percentage
    if (state.mainTask.total && state.mainTask.total > 0) {
      state.mainTask.percentage = Math.round((state.mainTask.current / state.mainTask.total) * 100);
      mainBarFill.style.width = `${state.mainTask.percentage}%`;
      mainBarLabel.textContent = `${state.mainTask.current} / ${state.mainTask.total} (${state.mainTask.percentage}%)`;
      mainBarFill.classList.remove('progress-bar-fill--indeterminate');
    } else {
      // Indeterminate
      mainBarFill.classList.add('progress-bar-fill--indeterminate');
      mainBarLabel.textContent = state.mainTask.current > 0 
        ? `${state.mainTask.current} processed` 
        : 'Processing...';
    }

    state.lastUpdate = Date.now();
    notifyStateChange();
  }

  /**
   * Update sub-task progress
   * 
   * @param {Object} subTask
   * @param {number} [subTask.current] - Current value
   * @param {number} [subTask.total] - Total value (null for indeterminate)
   * @param {string} [subTask.label] - Sub-task label
   * @param {boolean} [subTask.visible] - Show/hide sub-task bar
   */
  function updateSubTask(subTask = {}) {
    if (typeof subTask.visible === 'boolean') {
      state.subTask.visible = subTask.visible;
      subProgressContainer.style.display = subTask.visible ? 'block' : 'none';
    }

    if (subTask.label !== undefined) {
      state.subTask.label = subTask.label;
      subTaskLabel.textContent = subTask.label || '';
    }

    if (typeof subTask.current === 'number') {
      state.subTask.current = subTask.current;
    }

    if (typeof subTask.total === 'number' || subTask.total === null) {
      state.subTask.total = subTask.total;
    }

    // Calculate percentage
    if (state.subTask.total && state.subTask.total > 0) {
      state.subTask.percentage = Math.round((state.subTask.current / state.subTask.total) * 100);
      subBarFill.style.width = `${state.subTask.percentage}%`;
      subBarLabel.textContent = `${state.subTask.current} / ${state.subTask.total} (${state.subTask.percentage}%)`;
      subBarFill.classList.remove('progress-bar-fill--indeterminate');
    } else if (state.subTask.visible) {
      // Indeterminate
      subBarFill.classList.add('progress-bar-fill--indeterminate');
      subBarLabel.textContent = state.subTask.current > 0 
        ? `${state.subTask.current} processed` 
        : 'Processing...';
    }

    // Auto-show if not explicitly hidden
    if (state.subTask.label && typeof subTask.visible !== 'boolean') {
      state.subTask.visible = true;
      subProgressContainer.style.display = 'block';
    }

    state.lastUpdate = Date.now();
    notifyStateChange();
  }

  /**
   * Set stage without updating progress
   * 
   * @param {string} stage - Stage identifier
   * @param {string} [label] - Human-readable label
   */
  function setStage(stage, label = null) {
    updateProgress({ stage, stageLabel: label });
  }

  /**
   * Set status
   * 
   * @param {string} status - Status (running, paused, completed, failed)
   */
  function setStatus(status) {
    updateProgress({ status });
  }

  /**
   * Hide sub-task bar
   */
  function hideSubTask() {
    updateSubTask({ visible: false });
  }

  /**
   * Show sub-task bar
   */
  function showSubTask() {
    updateSubTask({ visible: true });
  }

  /**
   * Get current state
   * 
   * @returns {Object} Current state snapshot
   */
  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Destroy the indicator and clean up
   */
  function destroy() {
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  /**
   * Capitalize stage name
   * 
   * @param {string} stage
   * @returns {string}
   */
  function capitalizeStage(stage) {
    if (!stage) return 'Processing';
    return stage
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Notify state change callback
   */
  function notifyStateChange() {
    if (typeof onStateChange === 'function') {
      try {
        onStateChange(getState());
      } catch (_) {}
    }
  }

  // Public API
  return {
    updateProgress,
    updateSubTask,
    setStage,
    setStatus,
    hideSubTask,
    showSubTask,
    getState,
    destroy,
    // Direct element access for custom styling
    elements: {
      root,
      header,
      stageLabel,
      statusBadge,
      mainBar,
      mainBarFill,
      mainBarLabel,
      subProgressContainer,
      subTaskLabel,
      subBar,
      subBarFill,
      subBarLabel
    }
  };
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCrawlProgressIndicator };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.createCrawlProgressIndicator = createCrawlProgressIndicator;
}
