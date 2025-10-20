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

function clampPercentage(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function pickNumber(source, fields) {
  if (!source || typeof source !== 'object') return null;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      const raw = source[field];
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

const SUB_PROGRESS_KEYS = [
  'subProgress',
  'subprogress',
  'subTask',
  'subtask',
  'sub_task',
  'secondaryProgress',
  'secondary',
  'childProgress',
  'nestedProgress'
];

function findSubProgressCandidate(source) {
  if (!source || typeof source !== 'object') {
    return { found: false, value: null };
  }
  for (const key of SUB_PROGRESS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return { found: true, value: source[key] };
    }
  }
  return { found: false, value: null };
}

function normalizeSubProgress(source) {
  if (!source || typeof source !== 'object') return null;
  const composite = source.progress && typeof source.progress === 'object'
    ? { ...source, ...source.progress }
    : { ...source };

  const normalized = {};

  const label = composite.label
    ?? composite.name
    ?? composite.stageLabel
    ?? composite.stage
    ?? composite.summary
    ?? composite.message
    ?? composite.title;
  if (label != null) {
    normalized.label = String(label);
  }

  const processed = pickNumber(composite, ['processed', 'current', 'done', 'completed', 'count', 'value']);
  if (processed != null) {
    normalized.processed = processed;
  }

  const updated = pickNumber(composite, ['updated', 'delta']);
  if (updated != null) {
    normalized.updated = updated;
  }

  const total = pickNumber(composite, ['total', 'expected', 'max', 'goal', 'target']);
  if (total != null) {
    normalized.total = total;
  }

  let percentage = pickNumber(composite, ['percentage', 'percent', 'pct']);
  if (percentage != null) {
    percentage = clampPercentage(percentage);
  }
  if (percentage == null) {
    const fraction = pickNumber(composite, ['fraction']);
    if (fraction != null) {
      percentage = clampPercentage(fraction * 100);
    }
  }
  if (percentage == null && Number.isFinite(processed) && Number.isFinite(total) && total > 0) {
    percentage = clampPercentage((processed / total) * 100);
  }
  if (percentage != null) {
    normalized.percentage = percentage;
  }

  if (composite.status != null) {
    normalized.status = String(composite.status);
  }
  if (composite.summary != null && normalized.label == null) {
    normalized.label = String(composite.summary);
  }
  if (composite.message != null) {
    normalized.message = String(composite.message);
  }

  if (Object.keys(normalized).length === 0) {
    return null;
  }
  return normalized;
}

function resolveSubProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return { found: false, normalized: null };
  }
  const direct = findSubProgressCandidate(progress);
  if (direct.found) {
    return { found: true, normalized: normalizeSubProgress(direct.value) };
  }
  if (progress.progress && typeof progress.progress === 'object') {
    const nested = findSubProgressCandidate(progress.progress);
    if (nested.found) {
      return { found: true, normalized: normalizeSubProgress(nested.value) };
    }
  }
  return { found: false, normalized: null };
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
  let currentSubProgress = null;
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
    <div class="analysis-progress-bar__subtask" style="display: none;">
      <div class="analysis-progress-bar__subtask-header">
        <span class="analysis-progress-bar__subtask-label"></span>
        <span class="analysis-progress-bar__subtask-percentage">0%</span>
      </div>
      <div class="analysis-progress-bar__subtask-bar">
        <div class="analysis-progress-bar__subtask-fill" style="width: 0%"></div>
      </div>
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
  const subtaskEls = {
    container: wrapper.querySelector('.analysis-progress-bar__subtask'),
    label: wrapper.querySelector('.analysis-progress-bar__subtask-label'),
    percentage: wrapper.querySelector('.analysis-progress-bar__subtask-percentage'),
    fill: wrapper.querySelector('.analysis-progress-bar__subtask-fill')
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

    if (subtaskEls.container && subtaskEls.label && subtaskEls.percentage && subtaskEls.fill) {
      if (currentSubProgress) {
        subtaskEls.container.style.display = 'flex';

        const labelParts = [];
        if (currentSubProgress.label) {
          labelParts.push(String(currentSubProgress.label));
        }
        if (currentSubProgress.status) {
          labelParts.push(String(currentSubProgress.status));
        }
        subtaskEls.label.textContent = labelParts.length ? labelParts.join(' · ') : 'Sub-task';
        subtaskEls.label.title = currentSubProgress.message || '';

        let pct = Number.isFinite(currentSubProgress.percentage) ? clampPercentage(currentSubProgress.percentage) : null;
        const processed = Number.isFinite(currentSubProgress.processed) ? currentSubProgress.processed : null;
        const total = Number.isFinite(currentSubProgress.total) ? currentSubProgress.total : null;
        const summaryText = currentSubProgress.message || null;

        if (pct == null && processed != null && total != null && total > 0) {
          pct = clampPercentage((processed / total) * 100);
        }

        subtaskEls.fill.classList.remove('analysis-progress-bar__subtask-fill--indeterminate');

        if (pct != null) {
          subtaskEls.fill.style.width = `${pct}%`;
          subtaskEls.percentage.textContent = `${pct}%`;
        } else if (processed != null && total != null && total > 0) {
          const ratioPct = clampPercentage((processed / total) * 100) ?? 0;
          subtaskEls.fill.style.width = `${ratioPct}%`;
          subtaskEls.percentage.textContent = `${formatNumber(processed)} / ${formatNumber(total)}`;
        } else if (processed != null) {
          subtaskEls.fill.style.width = '100%';
          subtaskEls.fill.classList.add('analysis-progress-bar__subtask-fill--indeterminate');
          subtaskEls.percentage.textContent = formatNumber(processed);
        } else if (summaryText) {
          subtaskEls.fill.style.width = '100%';
          subtaskEls.fill.classList.add('analysis-progress-bar__subtask-fill--indeterminate');
          subtaskEls.percentage.textContent = summaryText;
        } else {
          subtaskEls.fill.style.width = '100%';
          subtaskEls.fill.classList.add('analysis-progress-bar__subtask-fill--indeterminate');
          subtaskEls.percentage.textContent = 'Processing…';
        }
      } else {
        subtaskEls.container.style.display = 'none';
        subtaskEls.label.textContent = '';
        subtaskEls.percentage.textContent = '0%';
        subtaskEls.fill.style.width = '0%';
        subtaskEls.fill.classList.remove('analysis-progress-bar__subtask-fill--indeterminate');
      }
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
      currentProgress = { ...currentProgress, ...progress };

      const subCandidate = resolveSubProgress(progress);
      if (subCandidate.found) {
        currentSubProgress = subCandidate.normalized
          ? { ...currentSubProgress, ...subCandidate.normalized }
          : null;
      }
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
    },

    /**
     * Update sub-task progress independently
     * @param {Object|null} subProgress
     */
    updateSubProgress(subProgress) {
      if (subProgress === undefined) return;
      if (subProgress === null) {
        currentSubProgress = null;
        render();
        return;
      }
      const normalized = normalizeSubProgress(subProgress);
      currentSubProgress = normalized ? { ...currentSubProgress, ...normalized } : null;
      render();
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
