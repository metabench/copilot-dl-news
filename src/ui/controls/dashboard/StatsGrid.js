'use strict';

/**
 * StatsGrid - Grid of stat items with anti-jitter patterns
 * 
 * Features:
 * - Tabular numerics for stable number widths
 * - Fixed cell sizing to prevent layout shift
 * - RAF-batched updates for multiple stats
 * 
 * @module src/ui/controls/dashboard/StatsGrid
 */

// RAF polyfill for Node.js (server-side rendering)
const raf = typeof requestAnimationFrame !== 'undefined'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 16);
const caf = typeof cancelAnimationFrame !== 'undefined'
  ? cancelAnimationFrame
  : clearTimeout;

/**
 * Factory to create StatsGrid class
 * @param {Object} jsgui - jsgui3-html or jsgui3-client
 * @returns {Function} StatsGrid class
 */
function createStatsGrid(jsgui) {
  const { Control, String_Control } = jsgui;

  class StatsGrid extends Control {
    /**
     * @param {Object} spec
     * @param {Object} spec.context - jsgui3 page context
     * @param {Array<{id: string, label: string, value: string|number, unit?: string}>} [spec.stats=[]]
     * @param {number} [spec.columns=4] - Number of columns in grid
     */
    constructor(spec = {}) {
      super({
        ...spec,
        tagName: 'div',
        __type_name: 'dashboard_stats_grid'
      });

      this._config = {
        columns: spec.columns ?? 4
      };

      // Store stats by ID for efficient updates
      this._stats = new Map();
      this._statEls = new Map();  // id -> { valueEl, unitEl }

      // RAF batching
      this._pendingFrame = null;
      this._pendingUpdates = new Map();

      this.add_class('dstats');
      this.dom.attributes.style = `--dstats-columns: ${this._config.columns}`;
      this.dom.attributes['data-jsgui-control'] = 'dashboard-stats-grid';

      // Initialize stats from spec
      if (spec.stats && Array.isArray(spec.stats)) {
        spec.stats.forEach(stat => this._stats.set(stat.id, stat));
      }

      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;

      for (const [id, stat] of this._stats) {
        const item = new Control({ context: ctx, tagName: 'div' });
        item.add_class('dstats__item');
        item.dom.attributes['data-stat-id'] = id;

        // Value
        const valueEl = new Control({ context: ctx, tagName: 'div' });
        valueEl.add_class('dstats__value');
        valueEl.add(new String_Control({ context: ctx, text: this._formatValue(stat.value) }));
        if (stat.unit) {
          const unitEl = new Control({ context: ctx, tagName: 'span' });
          unitEl.add_class('dstats__unit');
          unitEl.add(new String_Control({ context: ctx, text: stat.unit }));
          valueEl.add(unitEl);
        }
        item.add(valueEl);

        // Label
        const labelEl = new Control({ context: ctx, tagName: 'div' });
        labelEl.add_class('dstats__label');
        labelEl.add(new String_Control({ context: ctx, text: stat.label }));
        item.add(labelEl);

        this.add(item);
        this._statEls.set(id, { item, valueEl });
      }
    }

    activate() {
      if (this.__active) return;
      this.__active = true;

      const el = this.dom?.el;
      if (!el) return;

      // Find stat elements from SSR
      el.querySelectorAll('.dstats__item').forEach(itemEl => {
        const id = itemEl.getAttribute('data-stat-id');
        if (id) {
          const valueEl = itemEl.querySelector('.dstats__value');
          this._statEls.set(id, { 
            item: { dom: { el: itemEl } }, 
            valueEl: { dom: { el: valueEl } }
          });
        }
      });
    }

    /**
     * Update a single stat (batched via RAF)
     * @param {string} id - Stat ID
     * @param {string|number} value - New value
     * @param {string} [unit] - Optional unit
     */
    updateStat(id, value, unit) {
      // Update logical state immediately
      const stat = this._stats.get(id);
      if (stat) {
        stat.value = value;
        if (unit !== undefined) stat.unit = unit;
      }
      // Queue DOM update (batched)
      this._pendingUpdates.set(id, { value, unit });
      this._scheduleUpdate();
    }

    /**
     * Update multiple stats at once
     * @param {Object} updates - { id: { value, unit? }, ... }
     */
    updateStats(updates) {
      for (const [id, data] of Object.entries(updates)) {
        this._pendingUpdates.set(id, data);
      }
      this._scheduleUpdate();
    }

    /**
     * Add a new stat dynamically
     * @param {Object} stat - { id, label, value, unit? }
     */
    addStat(stat) {
      if (this._stats.has(stat.id)) {
        this.updateStat(stat.id, stat.value, stat.unit);
        return;
      }

      this._stats.set(stat.id, stat);

      // Create DOM element
      const el = this.dom?.el;
      if (el) {
        const itemEl = document.createElement('div');
        itemEl.className = 'dstats__item';
        itemEl.setAttribute('data-stat-id', stat.id);
        itemEl.innerHTML = `
          <div class="dstats__value">${this._formatValue(stat.value)}${stat.unit ? `<span class="dstats__unit">${stat.unit}</span>` : ''}</div>
          <div class="dstats__label">${stat.label}</div>
        `;
        el.appendChild(itemEl);

        this._statEls.set(stat.id, {
          item: { dom: { el: itemEl } },
          valueEl: { dom: { el: itemEl.querySelector('.dstats__value') } }
        });
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
      for (const [id, { value, unit }] of this._pendingUpdates) {
        const els = this._statEls.get(id);
        if (!els?.valueEl?.dom?.el) continue;

        const valueEl = els.valueEl.dom.el;
        const formattedValue = this._formatValue(value);

        // Update value, preserving unit span if present
        const unitSpan = valueEl.querySelector('.dstats__unit');
        if (unitSpan) {
          valueEl.firstChild.textContent = formattedValue;
          if (unit !== undefined) unitSpan.textContent = unit;
        } else if (unit) {
          valueEl.innerHTML = `${formattedValue}<span class="dstats__unit">${unit}</span>`;
        } else {
          valueEl.textContent = formattedValue;
        }
      }

      this._pendingUpdates.clear();
    }

    _formatValue(value) {
      if (typeof value === 'number') {
        if (Number.isInteger(value)) return value.toLocaleString();
        return value.toFixed(1);
      }
      return String(value ?? '--');
    }

    getStats() {
      return Object.fromEntries(this._stats);
    }

    destroy() {
      if (this._pendingFrame) {
        cancelAnimationFrame(this._pendingFrame);
        this._pendingFrame = null;
      }
    }
  }

  StatsGrid.CSS = `
.dstats {
  display: grid;
  grid-template-columns: repeat(var(--dstats-columns, 4), 1fr);
  gap: 1rem;
  
  /* ANTI-JITTER: Contain layout to prevent cascading reflows */
  contain: layout style;
}

.dstats__item {
  text-align: center;
  padding: 0.75rem;
  background: var(--dstats-item-bg, #16213e);
  border-radius: 8px;
  
  /* ANTI-JITTER: Fixed minimum size prevents layout shift */
  min-width: 0;  /* Allow shrinking in grid */
}

.dstats__value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--dstats-value-color, #00d4ff);
  
  /* ANTI-JITTER: Tabular numerics for stable number widths */
  font-variant-numeric: tabular-nums;
  
  /* Prevent text selection during rapid updates */
  user-select: none;
}

.dstats__unit {
  font-size: 0.75em;
  color: var(--dstats-unit-color, #a0a0a0);
  margin-left: 0.25em;
}

.dstats__label {
  font-size: 0.75rem;
  color: var(--dstats-label-color, #a0a0a0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
}

/* Responsive columns */
@media (max-width: 768px) {
  .dstats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .dstats {
    grid-template-columns: 1fr;
  }
}
`;

  return StatsGrid;
}

module.exports = { createStatsGrid };
