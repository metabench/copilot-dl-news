/**
 * ProgressConnectorControl - Network/data layer for progress display
 * 
 * Handles SSE/polling connections and debounces updates before passing
 * to a ProgressDisplayControl. Separates network concerns from display.
 * 
 * This control:
 * - Connects to SSE or polling endpoints
 * - Debounces incoming updates
 * - Wraps a ProgressDisplayControl
 * - Emits events for external handlers
 */
'use strict';

const jsgui = require('jsgui3-html');
const { ProgressDisplayControl } = require('./ProgressDisplayControl');

class ProgressConnectorControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context - jsgui3 page context
   * @param {HTMLElement} [spec.el] - Existing DOM element (for activation)
   * @param {string} [spec.sseUrl] - SSE endpoint URL
   * @param {string} [spec.pollUrl] - Polling endpoint URL (fallback)
   * @param {number} [spec.pollIntervalMs=2000] - Polling interval
   * @param {string} [spec.title] - Title for display
   * @param {string} [spec.description] - Description for display
   * @param {boolean} [spec.autoConnect=false] - Auto-connect on activation
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'progress_connector'
    });

    this._config = {
      sseUrl: spec.sseUrl ?? null,
      pollUrl: spec.pollUrl ?? null,
      pollIntervalMs: spec.pollIntervalMs ?? 2000,
      autoConnect: spec.autoConnect === true,
      title: spec.title ?? 'Progress',
      description: spec.description ?? null
    };

    // Connection state
    this._eventSource = null;
    this._pollTimer = null;
    this._connected = false;

    // Event listeners
    this._listeners = {
      progress: [],
      complete: [],
      error: [],
      connected: [],
      disconnected: []
    };

    this.add_class('pconnector');
    this.dom.attributes['data-jsgui-control'] = 'progress-connector';
    this.dom.attributes['data-sse-url'] = this._config.sseUrl || '';
    this.dom.attributes['data-poll-url'] = this._config.pollUrl || '';
    this.dom.attributes['data-auto-connect'] = this._config.autoConnect ? '1' : '0';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    // Wrap a ProgressDisplayControl
    this._displayEl = new ProgressDisplayControl({
      context: ctx,
      title: this._config.title,
      description: this._config.description
    });
    this.add(this._displayEl);
  }

  /**
   * Client-side activation
   */
  activate() {
    if (this.__active) return;
    this.__active = true;

    const el = this.dom?.el;
    if (!el) return;

    // Read config from data attributes
    this._config.sseUrl = el.getAttribute('data-sse-url') || null;
    this._config.pollUrl = el.getAttribute('data-poll-url') || null;
    this._config.autoConnect = el.getAttribute('data-auto-connect') === '1';

    // Activate child display
    if (this._displayEl?.activate) {
      this._displayEl.activate();
    }

    // Auto-connect if configured
    if (this._config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Start connection to progress source
   */
  connect() {
    if (this._connected) return;

    if (this._config.sseUrl) {
      this._connectSSE();
    } else if (this._config.pollUrl) {
      this._startPolling();
    }
  }

  /**
   * Stop connection
   */
  disconnect() {
    this._stopSSE();
    this._stopPolling();
    this._connected = false;
    this._emit('disconnected');
  }

  /**
   * Connect to SSE endpoint
   */
  _connectSSE() {
    this._stopSSE();

    try {
      this._eventSource = new EventSource(this._config.sseUrl);
      
      this._eventSource.onopen = () => {
        this._connected = true;
        this._emit('connected');
      };

      this._eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.warn('[ProgressConnector] Failed to parse SSE message:', e);
        }
      };

      this._eventSource.onerror = () => {
        // Fall back to polling on SSE failure
        this._stopSSE();
        if (this._config.pollUrl) {
          console.log('[ProgressConnector] SSE failed, falling back to polling');
          this._startPolling();
        } else {
          this._emit('error', new Error('SSE connection failed'));
        }
      };
    } catch (e) {
      console.error('[ProgressConnector] Failed to create EventSource:', e);
      if (this._config.pollUrl) {
        this._startPolling();
      }
    }
  }

  /**
   * Stop SSE connection
   */
  _stopSSE() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
  }

  /**
   * Start polling fallback
   */
  _startPolling() {
    if (this._pollTimer) return;
    
    this._connected = true;
    this._emit('connected');

    const poll = async () => {
      try {
        const res = await fetch(this._config.pollUrl);
        if (!res.ok) return;
        const data = await res.json();
        if (data) {
          this._handleMessage(data);
        }
      } catch (e) {
        // Ignore polling errors - keep trying
      }
    };

    // Initial poll
    poll();
    this._pollTimer = setInterval(poll, this._config.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Handle incoming message from SSE or polling
   */
  _handleMessage(msg) {
    // Support different message formats
    const type = msg.type || (msg.phase === 'complete' ? 'complete' : 'next');
    const value = msg.value || msg.state || msg;

    switch (type) {
      case 'next':
      case 'progress':
        this._handleProgress(value);
        break;
      case 'complete':
        this._handleComplete(value);
        break;
      case 'error':
        this._handleError(msg.error || msg.message);
        break;
    }
  }

  /**
   * Handle progress update
   */
  _handleProgress(state) {
    // Map to display state format
    const displayState = {
      phase: state.phase || 'running',
      current: state.processed ?? state.current ?? 0,
      total: state.total ?? 100,
      message: state.currentUrl ?? state.message ?? '',
      throughput: state.recordsPerSecond 
        ? { value: state.recordsPerSecond, unit: 'rec/s' }
        : state.bytesPerSecond 
          ? { value: state.bytesPerSecond / 1024, unit: 'KB/s' }
          : null,
      etaMs: state.etaMs ?? null,
      warnings: state.warnings ?? []
    };

    // Update display (display handles debouncing internally)
    if (this._displayEl?.setState) {
      this._displayEl.setState(displayState);
    }

    this._emit('progress', state);
  }

  /**
   * Handle completion
   */
  _handleComplete(result) {
    if (this._displayEl?.setState) {
      this._displayEl.setState({
        phase: 'complete',
        current: this._displayEl.getState?.()?.total || 100,
        total: this._displayEl.getState?.()?.total || 100,
        message: 'Complete',
        etaMs: 0
      });
    }

    this.disconnect();
    this._emit('complete', result);
  }

  /**
   * Handle error
   */
  _handleError(error) {
    if (this._displayEl?.setState) {
      this._displayEl.setState({
        phase: 'error',
        message: typeof error === 'string' ? error : error.message,
        warnings: [{ message: 'An error occurred', level: 'error' }]
      });
    }

    this._emit('error', error);
  }

  /**
   * Subscribe to connector events (not jsgui3 events)
   * NOTE: Named addListener/removeListener to avoid conflict with jsgui3's on() method
   */
  addListener(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback);
    }
    return () => this.removeListener(event, callback);
  }

  /**
   * Unsubscribe from connector events
   */
  removeListener(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to listeners
   */
  _emit(event, data) {
    const listeners = this._listeners[event];
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[ProgressConnector] Error in ${event} handler:`, e);
        }
      }
    }
  }

  /**
   * Manual state update (for non-network use)
   */
  updateProgress(state) {
    this._handleProgress(state);
  }

  /**
   * Get current display state
   */
  getState() {
    return this._displayEl?.getState?.() || null;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.disconnect();
    if (this._displayEl?.destroy) {
      this._displayEl.destroy();
    }
    this._listeners = { progress: [], complete: [], error: [], connected: [], disconnected: [] };
  }
}

// Minimal CSS for the connector wrapper
ProgressConnectorControl.CSS = `
.pconnector {
  /* Inherits from display control */
}
`;

module.exports = { ProgressConnectorControl };
