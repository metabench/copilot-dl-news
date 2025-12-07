'use strict';

/**
 * CrawlDisplayAdapter - Client-side abstraction for rendering crawl state.
 * 
 * This adapter provides a standardized interface for UI components to
 * display crawl progress, regardless of the underlying crawler implementation.
 * It:
 * 
 * - Consumes telemetry events from SSE
 * - Maintains normalized state for UI binding
 * - Provides helper methods for common display patterns
 * - Supports multiple concurrent crawls
 * 
 * Usage (browser):
 *   const adapter = createCrawlDisplayAdapter({
 *     onStateChange: (state) => updateUI(state),
 *     onProgress: (progress) => updateProgressBar(progress),
 *     onPhaseChange: (phase) => updateStageIndicator(phase)
 *   });
 *   
 *   // Connect to SSE events
 *   eventSource.addEventListener('message', (evt) => {
 *     const payload = JSON.parse(evt.data);
 *     if (payload.type === 'crawl:telemetry') {
 *       adapter.handleEvent(payload.data);
 *     }
 *   });
 * 
 * @module src/ui/client/crawlDisplayAdapter
 */

/**
 * Phase display configuration
 */
const PHASE_DISPLAY = {
  idle: { label: 'Idle', icon: '⏸️', color: 'gray' },
  initializing: { label: 'Initializing', icon: '⚙️', color: 'blue' },
  planning: { label: 'Planning', icon: '📋', color: 'blue' },
  discovering: { label: 'Discovering', icon: '🔍', color: 'cyan' },
  crawling: { label: 'Crawling', icon: '🕷️', color: 'green' },
  processing: { label: 'Processing', icon: '⚡', color: 'yellow' },
  finalizing: { label: 'Finalizing', icon: '📦', color: 'yellow' },
  completed: { label: 'Completed', icon: '✅', color: 'green' },
  failed: { label: 'Failed', icon: '❌', color: 'red' },
  paused: { label: 'Paused', icon: '⏸️', color: 'orange' },
  stopped: { label: 'Stopped', icon: '🛑', color: 'gray' }
};

/**
 * Event type categories for filtering
 */
const EVENT_CATEGORIES = {
  lifecycle: ['crawl:started', 'crawl:stopped', 'crawl:paused', 'crawl:resumed', 'crawl:completed', 'crawl:failed'],
  phase: ['crawl:phase:changed'],
  progress: ['crawl:progress'],
  url: ['crawl:url:visited', 'crawl:url:queued', 'crawl:url:error', 'crawl:url:skipped', 'crawl:url:batch'],
  goal: ['crawl:goal:satisfied', 'crawl:goal:progress'],
  budget: ['crawl:budget:updated', 'crawl:budget:exhausted'],
  worker: ['crawl:worker:spawned', 'crawl:worker:stopped', 'crawl:worker:scaled'],
  system: ['crawl:checkpoint:saved', 'crawl:checkpoint:restored', 'crawl:metrics:snapshot', 'crawl:rate:limited', 'crawl:stalled']
};

/**
 * Default state for a crawl
 */
function createDefaultState() {
  return {
    // Identity
    jobId: null,
    crawlType: 'standard',
    
    // Lifecycle
    phase: 'idle',
    phaseDisplay: PHASE_DISPLAY.idle,
    isActive: false,
    isPaused: false,
    startedAt: null,
    endedAt: null,
    duration: null,
    
    // Progress
    progress: {
      visited: 0,
      queued: 0,
      errors: 0,
      downloaded: 0,
      articles: 0,
      skipped: 0,
      requestsPerSec: null,
      bytesPerSec: null,
      percentComplete: null,
      estimatedRemaining: null
    },
    
    // Goals
    goals: [],
    goalsProgress: {},
    
    // Budget
    budget: {
      limits: {},
      spent: {},
      percentages: {},
      exhausted: false
    },
    
    // Workers
    workers: {
      count: 0,
      active: 0,
      idle: 0
    },
    
    // Recent events (for timeline display)
    recentEvents: [],
    
    // Last update
    lastUpdatedAt: null
  };
}

/**
 * Create a crawl display adapter instance.
 * 
 * @param {Object} options
 * @param {Function} [options.onStateChange] - Callback when any state changes
 * @param {Function} [options.onProgress] - Callback for progress updates
 * @param {Function} [options.onPhaseChange] - Callback for phase changes
 * @param {Function} [options.onEvent] - Callback for all events
 * @param {Function} [options.onError] - Callback for error events
 * @param {Function} [options.onComplete] - Callback when crawl completes
 * @param {number} [options.recentEventsLimit=50] - Max recent events to keep
 * @param {boolean} [options.trackMultiple=false] - Track multiple concurrent crawls
 * @returns {Object} Display adapter API
 */
function createCrawlDisplayAdapter(options = {}) {
  const {
    onStateChange,
    onProgress,
    onPhaseChange,
    onEvent,
    onError,
    onComplete,
    recentEventsLimit = 50,
    trackMultiple = false
  } = options;
  
  // State storage
  let primaryState = createDefaultState();
  const crawlStates = trackMultiple ? new Map() : null;
  
  /**
   * Get state for a specific crawl (or primary)
   */
  function getState(jobId = null) {
    if (trackMultiple && jobId) {
      return crawlStates.get(jobId) || createDefaultState();
    }
    return { ...primaryState };
  }
  
  /**
   * Get all tracked crawl states
   */
  function getAllStates() {
    if (trackMultiple) {
      return Object.fromEntries(crawlStates);
    }
    return { primary: primaryState };
  }
  
  /**
   * Update state and notify listeners
   */
  function updateState(jobId, updates) {
    let state;
    
    if (trackMultiple && jobId) {
      state = crawlStates.get(jobId) || createDefaultState();
      Object.assign(state, updates, { lastUpdatedAt: Date.now() });
      crawlStates.set(jobId, state);
    } else {
      Object.assign(primaryState, updates, { lastUpdatedAt: Date.now() });
      state = primaryState;
    }
    
    if (onStateChange) {
      try {
        onStateChange(state, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onStateChange error:', e);
      }
    }
    
    return state;
  }
  
  /**
   * Handle a telemetry event.
   * This is the main entry point for processing SSE events.
   */
  function handleEvent(event) {
    if (!event || !event.type) return;
    
    const jobId = event.jobId;
    
    // Notify raw event listener
    if (onEvent) {
      try {
        onEvent(event);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onEvent error:', e);
      }
    }
    
    // Route to specific handler
    switch (event.type) {
      case 'crawl:started':
        handleStarted(event, jobId);
        break;
      case 'crawl:stopped':
      case 'crawl:completed':
      case 'crawl:failed':
        handleEnded(event, jobId);
        break;
      case 'crawl:paused':
        handlePaused(event, jobId);
        break;
      case 'crawl:resumed':
        handleResumed(event, jobId);
        break;
      case 'crawl:phase:changed':
        handlePhaseChanged(event, jobId);
        break;
      case 'crawl:progress':
        handleProgress(event, jobId);
        break;
      case 'crawl:goal:satisfied':
        handleGoalSatisfied(event, jobId);
        break;
      case 'crawl:budget:updated':
      case 'crawl:budget:exhausted':
        handleBudget(event, jobId);
        break;
      case 'crawl:worker:scaled':
        handleWorkerScaled(event, jobId);
        break;
      case 'crawl:url:error':
        handleUrlError(event, jobId);
        break;
      case 'crawl:stalled':
        handleStalled(event, jobId);
        break;
      default:
        // Add to recent events
        addRecentEvent(event, jobId);
    }
  }
  
  function handleStarted(event, jobId) {
    const phaseDisplay = PHASE_DISPLAY.initializing;
    updateState(jobId, {
      jobId: event.data?.jobId || jobId,
      crawlType: event.data?.crawlType || event.crawlType || 'standard',
      phase: 'initializing',
      phaseDisplay,
      isActive: true,
      isPaused: false,
      startedAt: event.timestampMs || Date.now(),
      endedAt: null,
      duration: null,
      progress: { visited: 0, queued: 0, errors: 0, downloaded: 0, articles: 0, skipped: 0 },
      recentEvents: []
    });
    addRecentEvent(event, jobId);
  }
  
  function handleEnded(event, jobId) {
    const state = getState(jobId);
    const phase = event.type === 'crawl:completed' ? 'completed' 
      : event.type === 'crawl:failed' ? 'failed' 
      : 'stopped';
    const phaseDisplay = PHASE_DISPLAY[phase];
    const endedAt = event.timestampMs || Date.now();
    const duration = state.startedAt ? endedAt - state.startedAt : null;
    
    updateState(jobId, {
      phase,
      phaseDisplay,
      isActive: false,
      endedAt,
      duration
    });
    addRecentEvent(event, jobId);
    
    if (onComplete) {
      try {
        onComplete(getState(jobId), event);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onComplete error:', e);
      }
    }
  }
  
  function handlePaused(event, jobId) {
    updateState(jobId, {
      phase: 'paused',
      phaseDisplay: PHASE_DISPLAY.paused,
      isPaused: true
    });
    addRecentEvent(event, jobId);
    
    if (onPhaseChange) {
      try {
        onPhaseChange('paused', PHASE_DISPLAY.paused, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onPhaseChange error:', e);
      }
    }
  }
  
  function handleResumed(event, jobId) {
    const phase = event.data?.phase || 'crawling';
    const phaseDisplay = PHASE_DISPLAY[phase] || PHASE_DISPLAY.crawling;
    
    updateState(jobId, {
      phase,
      phaseDisplay,
      isPaused: false
    });
    addRecentEvent(event, jobId);
    
    if (onPhaseChange) {
      try {
        onPhaseChange(phase, phaseDisplay, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onPhaseChange error:', e);
      }
    }
  }
  
  function handlePhaseChanged(event, jobId) {
    const phase = event.data?.phase || 'crawling';
    const phaseDisplay = PHASE_DISPLAY[phase] || { 
      label: phase, 
      icon: '🔄', 
      color: 'gray' 
    };
    
    updateState(jobId, {
      phase,
      phaseDisplay
    });
    addRecentEvent(event, jobId);
    
    if (onPhaseChange) {
      try {
        onPhaseChange(phase, phaseDisplay, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onPhaseChange error:', e);
      }
    }
  }
  
  function handleProgress(event, jobId) {
    const data = event.data || {};
    const state = getState(jobId);
    
    const progress = {
      visited: data.visited ?? state.progress.visited,
      queued: data.queued ?? state.progress.queued,
      errors: data.errors ?? state.progress.errors,
      downloaded: data.downloaded ?? state.progress.downloaded,
      articles: data.articles ?? state.progress.articles,
      skipped: data.skipped ?? state.progress.skipped,
      requestsPerSec: data.requestsPerSec ?? state.progress.requestsPerSec,
      bytesPerSec: data.bytesPerSec ?? state.progress.bytesPerSec,
      percentComplete: data.percentComplete ?? state.progress.percentComplete,
      estimatedRemaining: data.estimatedRemaining ?? state.progress.estimatedRemaining
    };
    
    updateState(jobId, { progress });
    
    if (onProgress) {
      try {
        onProgress(progress, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onProgress error:', e);
      }
    }
  }
  
  function handleGoalSatisfied(event, jobId) {
    const state = getState(jobId);
    const goalId = event.data?.goalId;
    
    if (goalId) {
      const goalsProgress = { ...state.goalsProgress };
      goalsProgress[goalId] = {
        satisfied: true,
        current: event.data?.current,
        target: event.data?.target
      };
      
      updateState(jobId, { goalsProgress });
    }
    addRecentEvent(event, jobId);
  }
  
  function handleBudget(event, jobId) {
    const data = event.data || {};
    updateState(jobId, {
      budget: {
        limits: data.limits || {},
        spent: data.spent || {},
        percentages: data.percentages || {},
        exhausted: data.exhausted || false
      }
    });
    addRecentEvent(event, jobId);
  }
  
  function handleWorkerScaled(event, jobId) {
    updateState(jobId, {
      workers: {
        count: event.data?.to || 0,
        active: event.data?.active || 0,
        idle: event.data?.idle || 0
      }
    });
    addRecentEvent(event, jobId);
  }
  
  function handleUrlError(event, jobId) {
    addRecentEvent(event, jobId);
    
    if (onError) {
      try {
        onError(event.data, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onError error:', e);
      }
    }
  }
  
  function handleStalled(event, jobId) {
    addRecentEvent(event, jobId);
    
    if (onError) {
      try {
        onError({ type: 'stalled', ...event.data }, jobId);
      } catch (e) {
        console.error('[CrawlDisplayAdapter] onError error:', e);
      }
    }
  }
  
  function addRecentEvent(event, jobId) {
    let state;
    if (trackMultiple && jobId) {
      state = crawlStates.get(jobId);
    } else {
      state = primaryState;
    }
    
    if (!state) return;
    
    const recentEvents = [...state.recentEvents, {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      message: event.message,
      severity: event.severity
    }];
    
    // Trim to limit
    while (recentEvents.length > recentEventsLimit) {
      recentEvents.shift();
    }
    
    if (trackMultiple && jobId) {
      state.recentEvents = recentEvents;
      crawlStates.set(jobId, state);
    } else {
      primaryState.recentEvents = recentEvents;
    }
  }
  
  /**
   * Format duration for display
   */
  function formatDuration(ms) {
    if (!ms || !Number.isFinite(ms)) return '—';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
  
  /**
   * Format number with commas
   */
  function formatNumber(num) {
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString();
  }
  
  /**
   * Get summary text for current state
   */
  function getSummaryText(jobId = null) {
    const state = getState(jobId);
    const { phase, progress, isActive } = state;
    
    if (!isActive && phase === 'idle') {
      return 'No active crawl';
    }
    
    if (phase === 'completed') {
      return `Completed: ${formatNumber(progress.visited)} URLs visited`;
    }
    
    if (phase === 'failed') {
      return `Failed: ${formatNumber(progress.errors)} errors`;
    }
    
    return `${state.phaseDisplay.label}: ${formatNumber(progress.visited)} visited, ${formatNumber(progress.queued)} queued`;
  }
  
  /**
   * Reset state for a crawl (or primary)
   */
  function reset(jobId = null) {
    if (trackMultiple && jobId) {
      crawlStates.delete(jobId);
    } else {
      primaryState = createDefaultState();
    }
    
    if (onStateChange) {
      onStateChange(createDefaultState(), jobId);
    }
  }
  
  /**
   * Clean up old completed crawls (for trackMultiple mode)
   */
  function cleanup(maxAge = 3600000) {
    if (!trackMultiple) return;
    
    const now = Date.now();
    for (const [jobId, state] of crawlStates) {
      if (!state.isActive && state.endedAt && (now - state.endedAt) > maxAge) {
        crawlStates.delete(jobId);
      }
    }
  }
  
  return {
    // Event handling
    handleEvent,
    
    // State access
    getState,
    getAllStates,
    reset,
    cleanup,
    
    // Display helpers
    formatDuration,
    formatNumber,
    getSummaryText,
    
    // Constants
    PHASE_DISPLAY,
    EVENT_CATEGORIES
  };
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createCrawlDisplayAdapter,
    PHASE_DISPLAY,
    EVENT_CATEGORIES,
    createDefaultState
  };
}

// Browser global
if (typeof window !== 'undefined') {
  window.CrawlDisplayAdapter = {
    create: createCrawlDisplayAdapter,
    PHASE_DISPLAY,
    EVENT_CATEGORIES
  };
}
