/**
 * Crawl Progress Integration
 * Integrates CrawlProgressIndicator and TelemetryDisplay with SSE events
 * 
 * @module index/crawlProgressIntegration
 */

import { createCrawlProgressIndicator } from '../../express/public/components/CrawlProgressIndicator.js';
import { createTelemetryDisplay } from '../../express/public/components/TelemetryDisplay.js';

const COMPLETION_TYPES = new Set(['completed', 'complete', 'finished', 'done', 'success', 'succeeded']);
const COMPLETION_MESSAGE_TERMS = ['completed', 'complete', 'finished', 'done', 'success', 'succeeded'];

function isTelemetryCompletion(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const rawType = String(entry.type || entry.event || '').toLowerCase();
  if (rawType && COMPLETION_TYPES.has(rawType)) {
    return true;
  }

  const statusLike = String(entry.status || entry.state || entry.context?.status || '').toLowerCase();
  if (statusLike && COMPLETION_TYPES.has(statusLike)) {
    return true;
  }

  const message = typeof entry.message === 'string' ? entry.message.toLowerCase() : '';
  if (message) {
    if (message.includes('not completed') || message.includes('not finished')) {
      return false;
    }

    if (COMPLETION_MESSAGE_TERMS.some(term => message.includes(term))) {
      return true;
    }
  }

  return false;
}

/**
 * Create and wire crawl progress components
 * @param {Object} options - Integration options
 * @param {HTMLElement} options.progressContainer - Container for progress indicator
 * @param {HTMLElement} options.telemetryContainer - Container for telemetry display
 * @param {Function} options.onProgressUpdate - Callback for progress updates
 * @returns {Object} Integration API
 */
export function createCrawlProgressIntegration(options = {}) {
  const {
    progressContainer,
    telemetryContainer,
    onProgressUpdate = null
  } = options;

  let progressIndicator = null;
  let telemetryDisplay = null;
  let currentJobId = null;

  // Create progress indicator if container provided
  if (progressContainer) {
    progressIndicator = createCrawlProgressIndicator({
      container: progressContainer,
      showSubTask: true,
      showTelemetry: false // Telemetry in separate component
    });
  }

  // Create telemetry display if container provided
  if (telemetryContainer) {
    telemetryDisplay = createTelemetryDisplay({
      container: telemetryContainer,
      maxEntries: 100,
      autoScroll: true,
      showStats: true
    });
  }

  /**
   * Handle SSE PROGRESS event
   * @param {Object} data - Progress data
   */
  function handleProgress(data) {
    if (!progressIndicator) return;

    const { jobId, visited, downloaded, found, saved, queue } = data;

    // Only update if it's our current job
    if (currentJobId && jobId !== currentJobId) return;

    // Support both web crawl (visited/maxPages) and geography crawl (current/totalItems)
    const current = data.current || visited || 0;
    const total = data.totalItems || data.maxPages || 0;

    // Check if there's actual progress data
    const hasActualProgress = 
      (current > 0 || total > 0) ||
      (downloaded > 0) ||
      (queue > 0);

    // Don't update if no actual progress
    if (!hasActualProgress) return;

    // Update main progress with current/total
    if (total > 0) {
      progressIndicator.updateProgress({
        current: current,
        total: total
      });
    } else if (current > 0) {
      // Show count without percentage if no total
      progressIndicator.updateProgress({
        current: current,
        total: null
      });
    }

    // Update sub-task with queue size (web crawls)
    if (queue > 0) {
      progressIndicator.updateSubTask({
        current: 0,
        total: queue,
        label: `Queue: ${queue} URLs`
      });
      progressIndicator.showSubTask();
    } else {
      progressIndicator.hideSubTask();
    }

    // Callback
    if (onProgressUpdate) {
      onProgressUpdate({ type: 'progress', data });
    }
  }

  /**
   * Handle SSE TELEMETRY event
   * @param {Object} data - Telemetry data
   */
  function handleTelemetry(data) {
    // Add to telemetry display
    if (telemetryDisplay) {
      telemetryDisplay.addEntry(data);
    }

    // Update progress indicator based on telemetry
    if (progressIndicator) {
      const jobId = data.jobId || data.context?.jobId || null;
      if (jobId && (!currentJobId || currentJobId === jobId)) {
        currentJobId = jobId;
      }
      const completionDetected = isTelemetryCompletion(data);
      const jobMatches = !currentJobId || !jobId || currentJobId === jobId;

      // Stage transitions
      if (data.type === 'stage_transition' || data.type === 'started') {
        progressIndicator.setStage(data.stage || data.message);
      }

      // Completion
      if (completionDetected && jobMatches) {
        progressIndicator.setStatus('success');
        progressIndicator.setStage(data.message || data.stage || 'Crawl completed');
        progressIndicator.hideSubTask();
        currentJobId = null;
      } else if (data.type === 'completed') {
        progressIndicator.setStatus('success');
        progressIndicator.setStage(data.message || 'Completed');
      }

      // Errors
      if (data.type === 'error' || data.type === 'failed') {
        progressIndicator.setStatus('error');
        
        // Extract detailed error from telemetry
        let errorMsg = data.message || 'Error';
        if (data.context) {
          if (data.context.errorMessage) {
            errorMsg = data.context.errorMessage;
          } else if (data.context.errorInfo) {
            errorMsg = data.context.errorInfo;
          }
          
          // Add error code if available
          if (data.context.errorCode) {
            errorMsg = `${data.context.errorCode}: ${errorMsg}`;
          }
        }
        
        progressIndicator.setStage(errorMsg);
      }

      // Extract progress from telemetry context
      if (data.context && typeof data.context === 'object') {
        const { current, total, processed, totalItems } = data.context;
        
        if (total || totalItems) {
          const curr = current || processed || 0;
          const tot = total || totalItems || 0;
          progressIndicator.updateProgress({
            current: curr,
            total: tot
          });
        }
      }
    }

    // Callback
    if (onProgressUpdate) {
      const completionDetected = isTelemetryCompletion(data) && (!currentJobId || !data.jobId || data.jobId === currentJobId);
      const payload = { type: 'telemetry', data };
      if (completionDetected) {
        payload.meta = { completionDetected: true };
      }
      onProgressUpdate(payload);
    }
  }

  /**
   * Handle SSE MILESTONE event
   * @param {Object} data - Milestone data
   */
  function handleMilestone(data) {
    if (progressIndicator) {
      progressIndicator.setStage(data.message || 'Milestone reached');
    }

    // Add as telemetry entry
    if (telemetryDisplay) {
      telemetryDisplay.addEntry({
        type: 'info',
        stage: data.stage || 'milestone',
        message: data.message || 'Milestone reached',
        timestamp: data.timestamp || Date.now(),
        context: data
      });
    }

    // Callback
    if (onProgressUpdate) {
      onProgressUpdate({ type: 'milestone', data });
    }
  }

  /**
   * Handle SSE QUEUE event
   * @param {Object} data - Queue data
   */
  function handleQueue(data) {
    if (!progressIndicator) return;

    const { size, added, removed } = data;

    if (size > 0) {
      let subTaskLabel = `Queue: ${size} URLs`;
      if (added > 0) subTaskLabel += ` (+${added})`;
      if (removed > 0) subTaskLabel += ` (-${removed})`;

      progressIndicator.updateSubTask({
        current: 0,
        total: size,
        label: subTaskLabel
      });
      progressIndicator.showSubTask();
    } else {
      progressIndicator.hideSubTask();
    }

    // Callback
    if (onProgressUpdate) {
      onProgressUpdate({ type: 'queue', data });
    }
  }

  /**
   * Handle crawl start
   * @param {Object} data - Start data
   */
  function handleCrawlStart(data) {
    currentJobId = data.jobId || null;

    if (progressIndicator) {
      progressIndicator.setStatus('running');
      progressIndicator.setStage('Starting crawl...');
      progressIndicator.updateProgress({
        current: 0,
        total: data.maxPages || null
      });
      progressIndicator.showSubTask();
      progressIndicator.updateSubTask({
        current: 0,
        total: 0,
        label: 'Initializing...'
      });
    }

    if (telemetryDisplay) {
      telemetryDisplay.clear();
      telemetryDisplay.addEntry({
        type: 'started',
        stage: 'crawl',
        message: `Crawl started (Job ${data.jobId || 'unknown'})`,
        timestamp: Date.now(),
        context: data
      });
    }
  }

  /**
   * Handle crawl completion
   * @param {Object} data - Completion data
   */
  function handleCrawlComplete(data) {
    if (progressIndicator) {
      progressIndicator.setStatus('success');
      progressIndicator.setStage('Crawl completed');
      progressIndicator.hideSubTask();
    }

    if (telemetryDisplay) {
      telemetryDisplay.addEntry({
        type: 'completed',
        stage: 'crawl',
        message: 'Crawl completed successfully',
        timestamp: Date.now(),
        context: data
      });
    }

    currentJobId = null;
  }

  /**
   * Handle crawl error
   * @param {Object} data - Error data
   */
  function handleCrawlError(data) {
    if (progressIndicator) {
      progressIndicator.setStatus('error');
      
      // Extract detailed error information
      let errorMessage = 'Error occurred';
      if (data.message) {
        errorMessage = data.message;
      } else if (data.error) {
        errorMessage = typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error';
      } else if (data.errorMessage) {
        errorMessage = data.errorMessage;
      }
      
      // Add error type/code if available
      if (data.errorCode) {
        errorMessage = `${data.errorCode}: ${errorMessage}`;
      } else if (data.errorName && data.errorName !== 'Error') {
        errorMessage = `${data.errorName}: ${errorMessage}`;
      }
      
      progressIndicator.setStage(errorMessage);
    }

    if (telemetryDisplay) {
      telemetryDisplay.addEntry({
        type: 'error',
        stage: 'crawl',
        message: data.message || data.error?.message || data.errorMessage || 'Crawl error',
        timestamp: Date.now(),
        context: data
      });
    }
  }

  /**
   * Reset all components
   */
  function reset() {
    if (progressIndicator) {
      progressIndicator.setStatus('idle');
      progressIndicator.setStage('Ready');
      progressIndicator.updateProgress(0, 0);
      progressIndicator.hideSubTask();
    }

    if (telemetryDisplay) {
      telemetryDisplay.clear();
    }

    currentJobId = null;
  }

  /**
   * Show/hide components
   * @param {boolean} visible - Visibility state
   */
  function setVisible(visible) {
    if (progressIndicator) {
      const container = progressIndicator.getState().container;
      if (container) {
        container.style.display = visible ? '' : 'none';
      }
    }

    if (telemetryDisplay) {
      telemetryDisplay.setVisible(visible);
    }
  }

  /**
   * Destroy components
   */
  function destroy() {
    if (progressIndicator) {
      progressIndicator.destroy();
    }

    if (telemetryDisplay) {
      telemetryDisplay.destroy();
    }
  }

  // Return API
  return {
    // Event handlers
    handleProgress,
    handleTelemetry,
    handleMilestone,
    handleQueue,
    handleCrawlStart,
    handleCrawlComplete,
    handleCrawlError,

    // Control methods
    reset,
    setVisible,
    destroy,

    // Component access
    progressIndicator,
    telemetryDisplay
  };
}
