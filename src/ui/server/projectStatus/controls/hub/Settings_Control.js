'use strict';

const { Control } = require('../shared/jsgui');
const { el } = require('../shared/el');

/**
 * Settings_Control — the gear and the page-scale dialog.
 *
 * The retired string pages were rem-based and scaled the root font size; this
 * app's CSS is px throughout, so the scale applies as zoom on the app root —
 * same owner capability, different mechanism, recorded as a deviation in the
 * migration report to revisit if a rem conversion ever happens.
 */
class Settings_Control extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'settings_control';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-settings');
    if (!spec.el) this.compose();
  }

  compose() {
    const ctx = this.context;
    const btn = el(ctx, 'button', 'ps-settings__gear', '⚙');
    Object.assign(btn.dom.attributes, { 'data-settings-gear': 'true', type: 'button', 'aria-label': 'settings' });
    this.add(btn);

    const dlg = el(ctx, 'dialog', 'ps-settings__dlg');
    dlg.dom.attributes['data-settings-dlg'] = 'true';

    const label = el(ctx, 'div', 'ps-settings__label', 'page scale: 100%');
    label.dom.attributes['data-settings-label'] = 'true';
    dlg.add(label);

    const range = el(ctx, 'input');
    Object.assign(range.dom.attributes, {
      type: 'range', min: '80', max: '250', step: '5', value: '100', 'data-settings-range': 'true'
    });
    dlg.add(range);

    const reset = el(ctx, 'button', 'ps-settings__reset', 'reset');
    Object.assign(reset.dom.attributes, { type: 'button', 'data-settings-reset': 'true' });
    dlg.add(reset);

    this.add(dlg);
  }

  activate() {
    if (this.__active) return;
    super.activate();
    const root = this.dom.el;
    if (!root) return;
    const dlg = root.querySelector('[data-settings-dlg]');
    const range = root.querySelector('[data-settings-range]');
    const label = root.querySelector('[data-settings-label]');
    const apply = (pct) => {
      const app = document.querySelector('.ps-root');
      if (app) app.style.zoom = String(pct / 100);
      if (label) label.textContent = `page scale: ${pct}%`;
      if (range) range.value = String(pct);
      try { localStorage.setItem('tp-settings', JSON.stringify({ scalePct: pct })); } catch (_) {}
    };
    try {
      const saved = JSON.parse(localStorage.getItem('tp-settings') || '{}');
      if (saved.scalePct) apply(Number(saved.scalePct));
    } catch (_) {}
    root.querySelector('[data-settings-gear]').addEventListener('click', () => { if (dlg && dlg.showModal) dlg.showModal(); });
    if (range) range.addEventListener('input', () => apply(Number(range.value)));
    root.querySelector('[data-settings-reset]').addEventListener('click', () => apply(100));
    if (dlg) dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
}

Settings_Control.css = `
.ps-settings { position: fixed; top: 10px; right: 12px; z-index: 40; }
.ps-settings__gear { background: #171a20; border: 2px solid #2e3440; color: #b8862e; border-radius: 6px; font-size: 15px; padding: 3px 8px; cursor: pointer; }
.ps-settings__gear:hover { border-color: #b8862e; }
.ps-settings__dlg { background: #14171c; color: #e8e4d8; border: 2px solid #b8862e; border-radius: 8px; padding: 16px 18px; min-width: 260px; }
.ps-settings__dlg::backdrop { background: rgba(6,8,11,0.7); }
.ps-settings__label { font-size: 12px; margin-bottom: 8px; color: #cfcabd; }
.ps-settings__dlg input[type=range] { width: 100%; }
.ps-settings__reset { margin-top: 10px; background: #171a20; color: #8a8778; border: 1px solid #2e3440; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer; }
`;

module.exports = Settings_Control;
