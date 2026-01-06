'use strict';

/**
 * ProgressCard - Complete progress card combining bar, status, and stats
 * 
 * A self-contained progress display with:
 * - Header (title + status badge)
 * - Progress bar
 * - Stats grid
 * - Message area
 * - Warning banner
 * 
 * All with anti-jitter patterns for smooth rapid updates.
 * 
 * @module src/ui/controls/dashboard/ProgressCard
 */

// RAF polyfill for Node.js (server-side rendering)
const raf = typeof requestAnimationFrame !== 'undefined'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 16);
const caf = typeof cancelAnimationFrame !== 'undefined'
  ? cancelAnimationFrame
  : clearTimeout;

/**
 * Factory to create ProgressCard class
 * @param {Object} jsgui - jsgui3-html or jsgui3-client
 * @param {Object} deps - Dependencies { ProgressBar, StatusBadge, StatsGrid }
 * @returns {Function} ProgressCard class
 */
function createProgressCard(jsgui, deps) {
  const { Control, String_Control } = jsgui;
  const { ProgressBar, StatusBadge, StatsGrid } = deps;

  class ProgressCard extends Control {
    /**
     * @param {Object} spec
     * @param {Object} spec.context - jsgui3 page context
     * @param {string} [spec.title='Progress'] - Card title
     * @param {string} [spec.variant='default'] - 'default' | 'crawl' | 'analysis' | 'success' | 'error'
     * @param {number} [spec.current=0] - Current progress
     * @param {number} [spec.total=100] - Total
     * @param {string} [spec.status='idle'] - Initial status
     * @param {string} [spec.message=''] - Current message
     * @param {Array} [spec.stats=[]] - Stats to display
     * @param {boolean} [spec.showStats=true] - Show stats grid
     */
    constructor(spec = {}) {
      super({
        ...spec,
        tagName: 'div',
        __type_name: 'dashboard_progress_card'
      });

      this._config = {
        title: spec.title ?? 'Progress',
        variant: spec.variant ?? 'default',
        showStats: spec.showStats !== false
      };

      this._state = {
        current: spec.current ?? 0,
        total: spec.total ?? 100,
        status: spec.status ?? 'idle',
        message: spec.message ?? '',
        warning: null,
        stats: spec.stats ?? []
      };

      // Child controls
      this._statusBadge = null;
      this._progressBar = null;
      this._statsGrid = null;

      // RAF batching
      this._pendingFrame = null;

      this.add_class('dcard');
      this.add_class(`dcard--${this._config.variant}`);
      this.dom.attributes['data-jsgui-control'] = 'dashboard-progress-card';

      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;

      // Header
      this._headerEl = new Control({ context: ctx, tagName: 'div' });
      this._headerEl.add_class('dcard__header');
      this.add(this._headerEl);

      // Title
      const titleEl = new Control({ context: ctx, tagName: 'h3' });
      titleEl.add_class('dcard__title');
      titleEl.add(new String_Control({ context: ctx, text: this._config.title }));
      this._headerEl.add(titleEl);

      // Status badge
      this._statusBadge = new StatusBadge({
        context: ctx,
        status: this._state.status,
        fixedWidth: true
      });
      this._headerEl.add(this._statusBadge);

      // Progress bar
      this._progressBar = new ProgressBar({
        context: ctx,
        current: this._state.current,
        total: this._state.total,
        variant: this._config.variant === 'default' ? 'default' : this._config.variant
      });
      this.add(this._progressBar);

      // Stats grid (optional)
      if (this._config.showStats && this._state.stats.length > 0) {
        this._statsGrid = new StatsGrid({
          context: ctx,
          stats: this._state.stats,
          columns: Math.min(this._state.stats.length, 4)
        });
        this.add(this._statsGrid);
      }

      // Message area
      this._messageEl = new Control({ context: ctx, tagName: 'div' });
      this._messageEl.add_class('dcard__message');
      this._messageEl.add(new String_Control({ 
        context: ctx, 
        text: this._state.message || 'Waiting...' 
      }));
      this.add(this._messageEl);

      // Warning banner (hidden by default)
      this._warningEl = new Control({ context: ctx, tagName: 'div' });
      this._warningEl.add_class('dcard__warning');
      this._warningEl.add_class('dcard__warning--hidden');
      this.add(this._warningEl);
    }

    activate() {
      if (this.__active) return;
      this.__active = true;

      // Activate child controls
      this._statusBadge?.activate?.();
      this._progressBar?.activate?.();
      this._statsGrid?.activate?.();

      // Find DOM elements for SSR activation
      const el = this.dom?.el;
      if (!el) return;

      if (!this._messageEl?.dom?.el) {
        this._messageEl = { dom: { el: el.querySelector('.dcard__message') } };
      }
      if (!this._warningEl?.dom?.el) {
        this._warningEl = { dom: { el: el.querySelector('.dcard__warning') } };
      }
    }

    /**
     * Update card state (public API)
     * @param {Object} partial - Partial state update
     */
    setState(partial) {
      Object.assign(this._state, partial);
      this._scheduleUpdate();
    }

    /**
     * Update progress specifically
     * @param {number} current
     * @param {number} [total]
     */
    setProgress(current, total) {
      this._state.current = current;
      if (total !== undefined) this._state.total = total;
      if (this._progressBar) {
        this._progressBar.setProgress(current, total);
      }
    }

    /**
     * Update status
     * @param {string} status
     */
    setStatus(status) {
      this._state.status = status;
      if (this._statusBadge) {
        this._statusBadge.setStatus(status);
      }
    }

    /**
     * Update message
     * @param {string} message
     */
    setMessage(message) {
      this._state.message = message;
      const el = this._messageEl?.dom?.el;
      if (el) {
        el.textContent = message || 'Waiting...';
      }
    }

    /**
     * Show/hide warning
     * @param {string|null} warning - Warning message or null to hide
     */
    setWarning(warning) {
      this._state.warning = warning;
      const el = this._warningEl?.dom?.el;
      if (!el) return;

      if (warning) {
        el.textContent = `⚠️ ${warning}`;
        el.classList.remove('dcard__warning--hidden');
      } else {
        el.classList.add('dcard__warning--hidden');
      }
    }

    /**
     * Update stats
     * @param {Object} updates - { id: { value, unit? }, ... }
     */
    updateStats(updates) {
      if (this._statsGrid) {
        this._statsGrid.updateStats(updates);
      }
    }

    _scheduleUpdate() {
      if (this._pendingFrame) return;

      this._pendingFrame = raf(() => {
        this._pendingFrame = null;
        this._syncView();
      });
    }

    _syncView() {
      // Update child controls
      if (this._progressBar) {
        this._progressBar.setProgress(this._state.current, this._state.total);
      }
      if (this._statusBadge) {
        this._statusBadge.setStatus(this._state.status);
      }

      // Update message
      const msgEl = this._messageEl?.dom?.el;
      if (msgEl) {
        msgEl.textContent = this._state.message || 'Waiting...';
      }

      // Update warning
      this.setWarning(this._state.warning);
    }

    getState() {
      return { ...this._state };
    }

    destroy() {
      if (this._pendingFrame) {
        cancelAnimationFrame(this._pendingFrame);
        this._pendingFrame = null;
      }
      this._progressBar?.destroy?.();
      this._statsGrid?.destroy?.();
    }
  }

  ProgressCard.CSS = `
.dcard {
  background: var(--dcard-bg, #0f3460);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  
  /* ANTI-JITTER: Contain layout to isolate reflows */
  contain: layout style;
}

/* Variant border-top accents */
.dcard--crawl { border-top: 4px solid var(--dcard-crawl-accent, #ff6b6b); }
.dcard--analysis { border-top: 4px solid var(--dcard-analysis-accent, #4ecdc4); }
.dcard--success { border-top: 4px solid var(--dcard-success-accent, #00ff88); }
.dcard--error { border-top: 4px solid var(--dcard-error-accent, #ff4444); }

.dcard__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.dcard__title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--dcard-title-color, #e8e8e8);
  margin: 0;
}

.dcard__message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--dcard-message-bg, #16213e);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--dcard-message-color, #a0a0a0);
  
  /* ANTI-JITTER: Fixed height prevents layout shift */
  min-height: 2.5rem;
  
  /* Truncate long messages */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Warning banner with CSS transitions */
.dcard__warning {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: var(--dcard-warning-bg, #ffcc00);
  color: var(--dcard-warning-color, #1a1a2e);
  border-radius: 8px;
  font-size: 0.85rem;
  
  /* ANTI-JITTER: Smooth visibility transition */
  transition: opacity 0.2s ease-out, max-height 0.2s ease-out, 
              padding 0.2s ease-out, margin 0.2s ease-out;
  max-height: 100px;
  opacity: 1;
}

.dcard__warning--hidden {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Stats grid spacing when inside card */
.dcard .dstats {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
`;

  return ProgressCard;
}

module.exports = { createProgressCard };
