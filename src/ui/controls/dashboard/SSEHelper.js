'use strict';

/**
 * SSEHelper - Browser-side SSE connection helper
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection status callbacks
 * - Message parsing and routing
 * - Graceful cleanup
 * 
 * Note: This is a plain JS helper, not a jsgui3 control,
 * since it's purely client-side logic.
 * 
 * @module src/ui/controls/dashboard/SSEHelper
 */

/**
 * SSE connection helper for dashboard controls
 * 
 * @example
 * const sse = new SSEHelper({
 *   url: '/sse/progress',
 *   onMessage: (type, data) => card.setState(data),
 *   onConnect: () => badge.setStatus('connected'),
 *   onDisconnect: () => badge.setStatus('disconnected')
 * });
 * sse.connect();
 * 
 * // Cleanup
 * sse.disconnect();
 */
class SSEHelper {
  /**
   * @param {Object} options
   * @param {string} options.url - SSE endpoint URL
   * @param {Function} [options.onMessage] - (type: string, data: any) => void
   * @param {Function} [options.onConnect] - () => void
   * @param {Function} [options.onDisconnect] - () => void
   * @param {number} [options.reconnectDelay=1000] - Initial reconnect delay (ms)
   * @param {number} [options.maxReconnectDelay=30000] - Max reconnect delay (ms)
   */
  constructor(options = {}) {
    this.url = options.url;
    this.onMessage = options.onMessage || (() => {});
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;

    this._eventSource = null;
    this._reconnectTimer = null;
    this._currentDelay = this.reconnectDelay;
    this._connected = false;
    this._shouldReconnect = true;
  }

  /**
   * Connect to SSE endpoint
   */
  connect() {
    if (this._eventSource) return;
    if (typeof EventSource === 'undefined') {
      console.warn('[SSEHelper] EventSource not supported');
      return;
    }

    this._shouldReconnect = true;
    this._eventSource = new EventSource(this.url);

    this._eventSource.onopen = () => {
      this._connected = true;
      this._currentDelay = this.reconnectDelay;  // Reset backoff
      this.onConnect();
    };

    this._eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.onMessage(msg.type, msg.value || msg.data || msg);
      } catch (e) {
        // Try as plain text
        this.onMessage('message', event.data);
      }
    };

    this._eventSource.onerror = () => {
      this._handleDisconnect();
    };
  }

  /**
   * Disconnect and stop reconnecting
   */
  disconnect() {
    this._shouldReconnect = false;
    this._cleanup();
    if (this._connected) {
      this._connected = false;
      this.onDisconnect();
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }

  _handleDisconnect() {
    this._cleanup();

    if (this._connected) {
      this._connected = false;
      this.onDisconnect();
    }

    if (this._shouldReconnect) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      
      // Exponential backoff
      this._currentDelay = Math.min(
        this._currentDelay * 2,
        this.maxReconnectDelay
      );

      this.connect();
    }, this._currentDelay);
  }

  _cleanup() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

// Export as both class and factory for flexibility
module.exports = { SSEHelper };
