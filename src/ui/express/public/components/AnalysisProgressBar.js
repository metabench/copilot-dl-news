/**
 * Analysis Progress Bar Component
 * Compact, real-time progress visualization for analysis runs
 */

const { is_defined, tof } = require('lang-tools');

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "2m 30s", "1h 5m")
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Format number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString();
}

/**
 * Calculate ETA based on current progress
 * @param {Object} progress - Progress object
 * @param {number} progress.processed - Items processed
 * @param {number} progress.total - Total items
 * @param {number} elapsedMs - Elapsed time in milliseconds
 * @returns {number|null} Estimated seconds remaining
 */
function calculateETA(progress, elapsedMs) {
  if (!progress || !progress.total || !progress.processed) return null;
  if (progress.processed === 0 || progress.processed >= progress.total) return null;
  
  const rate = progress.processed / (elapsedMs / 1000); // items per second
  const remaining = progress.total - progress.processed;
  return Math.ceil(remaining / rate);
}

/**
 * Create and render analysis progress bar
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 * @param {string} options.runId - Analysis run ID
 * @param {number} options.startedAt - Start timestamp (ms)
 * @param {Function} options.onCancel - Cancel callback
 * @returns {Object} Progress bar controller
 */
function createAnalysisProgressBar(container, options = {}) {
  if (!container) throw new Error('createAnalysisProgressBar requires container element');
  
  const { runId, startedAt, onCancel, compact = false } = options;
  
  // State
  let currentProgress = null;
  let currentStatus = 'running';
  let updateTimer = null;
  
  // Create elements
  const wrapper = document.createElement('div');
  wrapper.className = compact ? 'analysis-progress-bar analysis-progress-bar--compact' : 'analysis-progress-bar';
  wrapper.innerHTML = `
    <div class="analysis-progress-bar__header">
      <div class="analysis-progress-bar__title">
        <span class="analysis-progress-bar__run-id">${runId || 'Analysis'}</span>
        <span class="analysis-progress-bar__status" data-status="running">Running</span>
      </div>
      <div class="analysis-progress-bar__actions">
        <button class="analysis-progress-bar__cancel-btn" title="Cancel analysis">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z"/>
          </svg>
        </button>
      </div>
    </div>
    
    <div class="analysis-progress-bar__bar-container">
      <div class="analysis-progress-bar__bar">
        <div class="analysis-progress-bar__bar-fill" style="width: 0%"></div>
      </div>
      <div class="analysis-progress-bar__percentage">0%</div>
    </div>
    
    <div class="analysis-progress-bar__metrics">
      <div class="analysis-progress-bar__metric">
        <span class="analysis-progress-bar__metric-label">Processed:</span>
        <span class="analysis-progress-bar__metric-value" data-metric="processed" data-label="P">0</span>
      </div>
      <div class="analysis-progress-bar__metric">
        <span class="analysis-progress-bar__metric-label">Updated:</span>
        <span class="analysis-progress-bar__metric-value" data-metric="updated" data-label="U">0</span>
      </div>
      <div class="analysis-progress-bar__metric">
        <span class="analysis-progress-bar__metric-label">Total:</span>
        <span class="analysis-progress-bar__metric-value" data-metric="total" data-label="T">—</span>
      </div>
      <div class="analysis-progress-bar__metric">
        <span class="analysis-progress-bar__metric-label">Elapsed:</span>
        <span class="analysis-progress-bar__metric-value" data-metric="elapsed" data-label="Time">0s</span>
      </div>
      <div class="analysis-progress-bar__metric">
        <span class="analysis-progress-bar__metric-label">ETA:</span>
        <span class="analysis-progress-bar__metric-value" data-metric="eta" data-label="ETA">—</span>
      </div>
    </div>
  `;
  
  // Add to container
  container.appendChild(wrapper);
  
  // Get element references
  const statusEl = wrapper.querySelector('.analysis-progress-bar__status');
  const barFill = wrapper.querySelector('.analysis-progress-bar__bar-fill');
  const percentageEl = wrapper.querySelector('.analysis-progress-bar__percentage');
  const cancelBtn = wrapper.querySelector('.analysis-progress-bar__cancel-btn');
  const metricEls = {
    processed: wrapper.querySelector('[data-metric="processed"]'),
    updated: wrapper.querySelector('[data-metric="updated"]'),
    total: wrapper.querySelector('[data-metric="total"]'),
    elapsed: wrapper.querySelector('[data-metric="elapsed"]'),
    eta: wrapper.querySelector('[data-metric="eta"]')
  };
  
  // Cancel button handler
  if (cancelBtn && typeof onCancel === 'function') {
    cancelBtn.addEventListener('click', () => {
      if (confirm('Cancel this analysis run?')) {
        onCancel(runId);
      }
    });
  } else if (cancelBtn) {
    cancelBtn.style.display = 'none';
  }
  
  /**
   * Update display based on current state
   */
  function render() {
    const now = Date.now();
    const elapsedMs = startedAt ? now - startedAt : 0;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    
    // Update elapsed time
    if (metricEls.elapsed) {
      metricEls.elapsed.textContent = formatDuration(elapsedSec);
    }
    
    // Update progress metrics
    if (currentProgress) {
      const { processed, updated, total, percentage } = currentProgress;
      
      // Progress bar
      const pct = percentage != null ? percentage : 0;
      if (barFill) {
        barFill.style.width = `${pct}%`;
      }
      if (percentageEl) {
        percentageEl.textContent = `${pct}%`;
      }
      
      // Metrics
      if (metricEls.processed && is_defined(processed)) {
        metricEls.processed.textContent = formatNumber(processed);
      }
      if (metricEls.updated && is_defined(updated)) {
        metricEls.updated.textContent = formatNumber(updated);
      }
      if (metricEls.total && is_defined(total)) {
        metricEls.total.textContent = formatNumber(total);
      }
      
      // Calculate and display ETA
      if (metricEls.eta) {
        const etaSec = calculateETA(currentProgress, elapsedMs);
        metricEls.eta.textContent = etaSec != null ? formatDuration(etaSec) : '—';
      }
    }
    
    // Update status
    if (statusEl) {
      statusEl.textContent = currentStatus === 'running' ? 'Running' :
                            currentStatus === 'completed' ? 'Completed' :
                            currentStatus === 'failed' ? 'Failed' :
                            currentStatus;
      statusEl.setAttribute('data-status', currentStatus);
    }
  }
  
  /**
   * Start auto-update timer
   */
  function startTimer() {
    if (updateTimer) return;
    updateTimer = setInterval(() => {
      if (currentStatus === 'running') {
        render();
      } else {
        stopTimer();
      }
    }, 1000); // Update every second
  }
  
  /**
   * Stop auto-update timer
   */
  function stopTimer() {
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  }
  
  // Start timer
  startTimer();
  
  // Return controller
  return {
    /**
     * Update progress data
     * @param {Object} progress - Progress data
     */
    updateProgress(progress) {
      if (!progress) return;
      currentProgress = { ...progress };
      render();
    },
    
    /**
     * Update status
     * @param {string} status - New status
     */
    updateStatus(status) {
      if (tof(status) === 'string') {
        currentStatus = status;
        render();
        
        if (status !== 'running') {
          stopTimer();
        }
      }
    },
    
    /**
     * Destroy progress bar
     */
    destroy() {
      stopTimer();
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    },
    
    /**
     * Get wrapper element
     */
    getElement() {
      return wrapper;
    }
  };
}

// Support both CommonJS and ES6 imports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createAnalysisProgressBar };
}
if (typeof window !== 'undefined') {
  window.createAnalysisProgressBar = createAnalysisProgressBar;
}

export { createAnalysisProgressBar };
