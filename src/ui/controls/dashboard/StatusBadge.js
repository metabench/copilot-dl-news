'use strict';

/**
 * StatusBadge - Animated status indicator with anti-jitter patterns
 * 
 * Features:
 * - Fixed width options for layout stability
 * - Smooth color transitions
 * - Optional pulse animation for running states
 * 
 * @module src/ui/controls/dashboard/StatusBadge
 */

/**
 * Factory to create StatusBadge class
 * @param {Object} jsgui - jsgui3-html or jsgui3-client
 * @returns {Function} StatusBadge class
 */
function createStatusBadge(jsgui) {
  const { Control, String_Control } = jsgui;

  const STATUS_CONFIG = {
    idle: { text: 'Idle', modifier: 'idle' },
    starting: { text: 'Starting', modifier: 'starting' },
    running: { text: 'Running', modifier: 'running' },
    complete: { text: 'Complete', modifier: 'complete' },
    success: { text: 'Success', modifier: 'success' },
    error: { text: 'Error', modifier: 'error' },
    warning: { text: 'Warning', modifier: 'warning' }
  };

  class StatusBadge extends Control {
    /**
     * @param {Object} spec
     * @param {Object} spec.context - jsgui3 page context
     * @param {string} [spec.status='idle'] - Initial status
     * @param {boolean} [spec.fixedWidth=false] - Use fixed width for layout stability
     * @param {boolean} [spec.pulse=true] - Pulse animation for running states
     */
    constructor(spec = {}) {
      super({
        ...spec,
        tagName: 'span',
        __type_name: 'dashboard_status_badge'
      });

      this._config = {
        fixedWidth: spec.fixedWidth ?? false,
        pulse: spec.pulse !== false
      };

      this._status = spec.status ?? 'idle';

      this.add_class('dstatus');
      if (this._config.fixedWidth) this.add_class('dstatus--fixed');
      if (this._config.pulse) this.add_class('dstatus--pulse');
      this._applyStatusClass();
      this.dom.attributes['data-jsgui-control'] = 'dashboard-status-badge';

      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const config = STATUS_CONFIG[this._status] || STATUS_CONFIG.idle;
      this._textNode = new String_Control({ context: this.context, text: config.text });
      this.add(this._textNode);
    }

    activate() {
      if (this.__active) return;
      this.__active = true;
    }

    /**
     * Update status
     * @param {string} status - 'idle' | 'starting' | 'running' | 'complete' | 'error' | 'warning'
     */
    setStatus(status) {
      if (this._status === status) return;

      const el = this.dom?.el;
      if (el) {
        // Remove old modifier
        el.classList.remove(`dstatus--${STATUS_CONFIG[this._status]?.modifier || 'idle'}`);
      }

      this._status = status;
      this._applyStatusClass();

      // Update text
      const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
      if (el) {
        el.textContent = config.text;
      }
    }

    _applyStatusClass() {
      const config = STATUS_CONFIG[this._status] || STATUS_CONFIG.idle;
      this.add_class(`dstatus--${config.modifier}`);
    }

    getStatus() {
      return this._status;
    }
  }

  StatusBadge.CSS = `
.dstatus {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  
  /* Smooth color transitions */
  transition: background-color 0.2s ease-out, color 0.2s ease-out;
}

/* ANTI-JITTER: Fixed width prevents layout shift when text changes */
.dstatus--fixed {
  min-width: 80px;
  text-align: center;
}

/* Status variants */
.dstatus--idle {
  background: var(--dstatus-idle-bg, #2a2a4a);
  color: var(--dstatus-idle-color, #a0a0a0);
}

.dstatus--starting {
  background: var(--dstatus-starting-bg, #ffcc00);
  color: var(--dstatus-starting-color, #1a1a2e);
}

.dstatus--running {
  background: var(--dstatus-running-bg, #00d4ff);
  color: var(--dstatus-running-color, #1a1a2e);
}

.dstatus--complete,
.dstatus--success {
  background: var(--dstatus-success-bg, #00ff88);
  color: var(--dstatus-success-color, #1a1a2e);
}

.dstatus--error {
  background: var(--dstatus-error-bg, #ff4444);
  color: var(--dstatus-error-color, #fff);
}

.dstatus--warning {
  background: var(--dstatus-warning-bg, #ffcc00);
  color: var(--dstatus-warning-color, #1a1a2e);
}

/* Pulse animation for running states */
@keyframes dstatus-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.dstatus--pulse.dstatus--running,
.dstatus--pulse.dstatus--starting {
  animation: dstatus-pulse 1.5s ease-in-out infinite;
}
`;

  return StatusBadge;
}

module.exports = { createStatusBadge };
