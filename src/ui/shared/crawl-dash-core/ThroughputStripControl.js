'use strict';

/**
 * ThroughputStripControl — the D4 "throughput strip": live per-second crawl rates
 * (docs downloaded/s, docs saved/s, network MB/s, stored MB/s) + queue depth.
 *
 * This is DISTINCT from the existing CrawlThroughputPanelControl (which shows
 * 1h/6h/24h COUNT windows). This strip is the "right now" display governed by the
 * cycle-69 phantom-rate contract — and it takes its numbers already normalized by
 * the shared core (crawlDashboardCore.formatThroughput via a DashboardDataAdapter),
 * so the local page and the remote panel render the identical, active-jobs-only,
 * producer-trusting figures from one implementation.
 *
 * Prop-driven SSR: pass spec.throughput = { formatted: {network,downloaded,saved,
 * stored,queue}, activeCount } and compose() renders it. activate() re-fetches the
 * unified model from spec.apiBase and updates the cells in place.
 *
 * CONTRAST: the strip hardcodes NO background, so its text inherits the theme's
 * foreground and is readable in both light and dark (the contrast trap only bites
 * when a fixed bg is set without a paired fg — see HostHealthBadgesControl for the
 * badge case that DOES set both).
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

// key -> { label, unit }. Order is the display order across the strip.
const STATS = [
  { key: 'downloaded', label: 'Docs down', unit: '/s' },
  { key: 'saved', label: 'Docs saved', unit: '/s' },
  { key: 'network', label: 'Network', unit: ' MB/s' },
  { key: 'stored', label: 'Stored', unit: ' MB/s' },
  { key: 'queue', label: 'Queue', unit: '' },
];

const EMPTY_FORMATTED = { network: '0.00', downloaded: '0.00', saved: '0.00', stored: '0.00', queue: '0' };

class ThroughputStripControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'section', __type_name: 'crawl_dash_throughput_strip' });
    const tp = spec.throughput || {};
    this.formatted = Object.assign({}, EMPTY_FORMATTED, tp.formatted || {});
    this.activeCount = Number.isFinite(tp.activeCount) ? tp.activeCount : 0;
    this.apiBase = spec.apiBase || '/api/v1/crawl/dashboard-model';
    this.add_class('cdash-throughput');
    this.dom.attributes['data-cdash-throughput-root'] = 'true';
    this.dom.attributes['data-cdash-api'] = this.apiBase;
    if (!spec.el) this.compose();
  }

  _cell(stat) {
    const cell = new jsgui.Control({ context: this.context, tagName: 'div' });
    cell.add_class('cdash-throughput__cell');
    cell.dom.attributes.style = 'display:flex;flex-direction:column;gap:2px;min-width:90px;';

    const label = new jsgui.Control({ context: this.context, tagName: 'span' });
    label.add_class('cdash-throughput__label');
    label.dom.attributes.style = 'font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:0.04em;';
    label.add(new StringControl({ context: this.context, text: stat.label }));
    cell.add(label);

    const valueWrap = new jsgui.Control({ context: this.context, tagName: 'span' });
    valueWrap.add_class('cdash-throughput__value');
    valueWrap.dom.attributes.style = 'font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;';

    const value = new jsgui.Control({ context: this.context, tagName: 'span' });
    value.dom.attributes['data-cdash-stat'] = stat.key;
    value.add(new StringControl({ context: this.context, text: String(this.formatted[stat.key]) }));
    valueWrap.add(value);
    if (stat.unit) {
      const unit = new jsgui.Control({ context: this.context, tagName: 'span' });
      unit.dom.attributes.style = 'font-size:11px;opacity:0.6;font-weight:400;';
      unit.add(new StringControl({ context: this.context, text: stat.unit }));
      valueWrap.add(unit);
    }
    cell.add(valueWrap);
    return cell;
  }

  compose() {
    const strip = new jsgui.Control({ context: this.context, tagName: 'div' });
    strip.add_class('cdash-throughput__strip');
    strip.dom.attributes.style = 'display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end;';
    STATS.forEach((stat) => strip.add(this._cell(stat)));
    this.add(strip);

    // Active-jobs count so an idle strip (all zeros) reads as "idle", not "broken".
    const foot = new jsgui.Control({ context: this.context, tagName: 'div' });
    foot.add_class('cdash-throughput__active');
    foot.dom.attributes.style = 'font-size:11px;opacity:0.6;margin-top:6px;';
    foot.dom.attributes['data-cdash-active-count'] = String(this.activeCount);
    foot.add(new StringControl({ context: this.context, text: this.activeCount + ' active job' + (this.activeCount === 1 ? '' : 's') }));
    this.add(foot);
  }

  /** Apply a fresh normalized throughput model to the live DOM (client + tests). */
  update(throughput) {
    const formatted = Object.assign({}, EMPTY_FORMATTED, (throughput && throughput.formatted) || {});
    const root = this.dom && this.dom.el;
    if (!root) { this.formatted = formatted; return; }
    STATS.forEach((stat) => {
      const el = root.querySelector('[data-cdash-stat="' + stat.key + '"]');
      if (el) el.textContent = String(formatted[stat.key]);
    });
    const activeEl = root.querySelector('[data-cdash-active-count]');
    const activeCount = Number.isFinite(throughput && throughput.activeCount) ? throughput.activeCount : 0;
    if (activeEl) {
      activeEl.setAttribute('data-cdash-active-count', String(activeCount));
      activeEl.textContent = activeCount + ' active job' + (activeCount === 1 ? '' : 's');
    }
    this.formatted = formatted;
  }

  activate() {
    if (this.__active) return;
    this.__active = true;
    const self = this;
    async function refresh() {
      try {
        const res = await fetch(self.apiBase, { cache: 'no-store' });
        if (!res.ok) { self._warnOnce('throughput strip: ' + self.apiBase + ' -> HTTP ' + res.status); return; }
        const model = await res.json();
        if (model && model.throughput) self.update(model.throughput);
      } catch (e) { self._warnOnce('throughput strip: ' + self.apiBase + ' -> ' + (e && e.message)); }
    }
    refresh();
    this._timer = setInterval(refresh, 3000);
  }

  // Warn ONCE on the first persistent failure so a wrong apiBase is diagnosable —
  // a silent forever-retrying poller hides a misconfigured route (adversarial nit).
  _warnOnce(msg) {
    if (this._warned) return;
    this._warned = true;
    try { console.warn('[cdash] ' + msg); } catch (_) { /* console may be absent */ }
  }

  // Teardown: clear the poll timer + reset the activation guard so a removed
  // control does not leak a 3s interval (and can be cleanly re-activated). jsgui's
  // base Control exposes remove(); hook it (adversarial gap, cycle 72).
  remove(...args) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.__active = false;
    // Base Control.remove() detaches via this.parent.content — valid only when
    // mounted; guard so tearing down an unmounted/standalone control never crashes.
    if (this.parent && typeof super.remove === 'function') return super.remove(...args);
    return undefined;
  }
}

module.exports = { ThroughputStripControl, STATS, EMPTY_FORMATTED };
