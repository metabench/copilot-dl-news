'use strict';

/**
 * HostHealthBadgesControl — the D4 "per-host health" strip: one badge per host,
 * coloured by class (FAST / POLITE-THROTTLE / SLOW-IRREGULAR / LOW-DATA locally,
 * or RUNNING / IDLE / STOPPED / ERRORED for remote domain-state), with a hover
 * tooltip carrying the gap/CV/MB-s detail.
 *
 * The badge model — including the CONTRAST-SAFE chipStyle (explicit dark bg AND
 * light fg, so a badge never goes invisible on light theme; the cycle-62 trap) —
 * comes verbatim from crawlDashboardCore.normalizeHostHealth /
 * normalizeRemoteDomains via a DashboardDataAdapter, so local and remote badges are
 * styled identically. This control only turns that model into DOM.
 *
 * Prop-driven SSR: pass spec.hostHealth = { badges:[...], empty, emptyText } and
 * compose() renders it; activate() re-fetches the unified model and re-renders.
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;
const { escapeHtml } = require('./crawlDashboardCore');

class HostHealthBadgesControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'section', __type_name: 'crawl_dash_host_health' });
    const hh = spec.hostHealth || {};
    this.badges = Array.isArray(hh.badges) ? hh.badges : [];
    this.empty = this.badges.length === 0;
    this.emptyText = hh.emptyText || 'no host met the threshold recently';
    this.apiBase = spec.apiBase || '/api/v1/crawl/dashboard-model';
    this.add_class('cdash-host-health');
    this.dom.attributes['data-cdash-host-health-root'] = 'true';
    this.dom.attributes['data-cdash-api'] = this.apiBase;
    if (!spec.el) this.compose();
  }

  _badge(b) {
    const badge = new jsgui.Control({ context: this.context, tagName: 'span' });
    badge.add_class('cdash-host-health__badge');
    badge.dom.attributes['data-cdash-host'] = String(b.host || '');
    badge.dom.attributes['data-cdash-cls'] = String(b.cls || '');
    // chipStyle comes from the core: 'background:#241f18;color:#ece8e0;border:...'
    // — explicit fg is present, so the label is readable in both themes. Append
    // only layout properties here; never a bg without the paired fg.
    badge.dom.attributes.style = String(b.chipStyle || '') + ';display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:11px;font-size:12px;';
    if (b.title) badge.dom.attributes.title = String(b.title);

    const dot = new jsgui.Control({ context: this.context, tagName: 'span' });
    dot.add_class('cdash-host-health__dot');
    dot.dom.attributes.style = 'width:8px;height:8px;border-radius:50%;flex:none;background:' + String(b.dotColor || b.color || '#666');
    badge.add(dot);

    const label = new jsgui.Control({ context: this.context, tagName: 'span' });
    // jsgui String_Control does NOT escape text (only attributes) — a host name is
    // constrained but escape defensively so a malformed value can never inject.
    label.add(new StringControl({ context: this.context, text: escapeHtml(b.label || b.host || '') }));
    badge.add(label);
    return badge;
  }

  compose() {
    this._strip = new jsgui.Control({ context: this.context, tagName: 'div' });
    this._strip.add_class('cdash-host-health__strip');
    this._strip.dom.attributes.style = 'display:flex;gap:6px;flex-wrap:wrap;';
    if (this.empty) {
      const empty = new jsgui.Control({ context: this.context, tagName: 'span' });
      empty.add_class('cdash-host-health__empty');
      empty.dom.attributes.style = 'font-size:12px;opacity:0.6;';
      empty.add(new StringControl({ context: this.context, text: this.emptyText }));
      this._strip.add(empty);
    } else {
      this.badges.forEach((b) => this._strip.add(this._badge(b)));
    }
    this.add(this._strip);
  }

  activate() {
    if (this.__active) return;
    this.__active = true;
    const self = this;
    async function refresh() {
      try {
        const res = await fetch(self.apiBase, { cache: 'no-store' });
        if (!res.ok) { self._warnOnce('host-health badges: ' + self.apiBase + ' -> HTTP ' + res.status); return; }
        const model = await res.json();
        if (model && model.hostHealth) self._rerender(model.hostHealth);
      } catch (e) { self._warnOnce('host-health badges: ' + self.apiBase + ' -> ' + (e && e.message)); }
    }
    refresh();
    this._timer = setInterval(refresh, 30000);
  }

  _warnOnce(msg) {
    if (this._warned) return;
    this._warned = true;
    try { console.warn('[cdash] ' + msg); } catch (_) { /* console may be absent */ }
  }

  // Teardown: clear the poll timer + reset the activation guard so a removed
  // control does not leak a 30s interval (adversarial gap, cycle 72).
  remove(...args) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.__active = false;
    // Base Control.remove() detaches via this.parent.content — valid only when
    // mounted; guard so tearing down an unmounted/standalone control never crashes.
    if (this.parent && typeof super.remove === 'function') return super.remove(...args);
    return undefined;
  }

  // Client-side re-render into the existing strip element (uses core badge model).
  _rerender(hostHealth) {
    const stripEl = this._strip && this._strip.dom && this._strip.dom.el;
    if (!stripEl) return;
    const badges = (hostHealth && Array.isArray(hostHealth.badges)) ? hostHealth.badges : [];
    stripEl.innerHTML = '';
    if (!badges.length) {
      const span = stripEl.ownerDocument.createElement('span');
      span.className = 'cdash-host-health__empty';
      span.style.cssText = 'font-size:12px;opacity:0.6;';
      span.textContent = (hostHealth && hostHealth.emptyText) || 'no host met the threshold recently';
      stripEl.appendChild(span);
      return;
    }
    for (const b of badges) {
      const badge = stripEl.ownerDocument.createElement('span');
      badge.className = 'cdash-host-health__badge';
      badge.setAttribute('data-cdash-host', String(b.host || ''));
      badge.setAttribute('data-cdash-cls', String(b.cls || ''));
      badge.style.cssText = String(b.chipStyle || '') + ';display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:11px;font-size:12px;';
      if (b.title) badge.title = String(b.title);
      const dot = stripEl.ownerDocument.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:none;background:' + String(b.dotColor || b.color || '#666');
      const label = stripEl.ownerDocument.createElement('span');
      label.textContent = String(b.label || b.host || '');
      badge.appendChild(dot);
      badge.appendChild(label);
      stripEl.appendChild(badge);
    }
  }
}

module.exports = { HostHealthBadgesControl };
