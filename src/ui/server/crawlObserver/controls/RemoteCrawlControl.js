'use strict';

const jsgui = require('jsgui3-html');
const { makeTextEl, makeButton } = require('../../shared/utils/jsgui3Helpers');

class RemoteCrawlControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._basePath = spec.basePath ? String(spec.basePath) : '';
  }

  _withBasePath(routePath) {
    const base = this._basePath;
    const p = routePath ? String(routePath) : '';
    if (!base) return p;
    if (p === '/') return base + '/';
    return base + p;
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { padding: '24px', maxWidth: '600px', margin: '0 auto' }
    }));

    container.add(makeTextEl(this.context, 'h2', '🚀 Remote Crawl Controller', {
      style: { marginBottom: '16px' }
    }));

    container.add(makeTextEl(this.context, 'p', 'Launch a new remote crawler job directly from the dashboard.', {
      style: { marginBottom: '24px', color: '#b9c0d0' }
    }));

    const panel = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        padding: '20px',
        borderRadius: '8px',
        background: '#16213e',
        border: '1px solid #2a3a5a'
      }
    }));

    const form = panel.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      attr: { id: 'remote-crawl-form' }
    }));

    // Domains input
    {
      const row = form.add(new jsgui.Control({ context: this.context, tagName: 'div', style: { marginBottom: '16px' } }));
      row.add(makeTextEl(this.context, 'label', 'Domains (comma separated)', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#d7def0' } }));
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'rc-domains', type: 'text', placeholder: 'e.g. bbc.com, theguardian.com' },
        style: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
    }

    // Profile input
    {
      const row = form.add(new jsgui.Control({ context: this.context, tagName: 'div', style: { marginBottom: '24px' } }));
      row.add(makeTextEl(this.context, 'label', 'Or Profile Name', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#d7def0' } }));
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'rc-profile', type: 'text', placeholder: 'e.g. 2-guardian-bbc' },
        style: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
    }

    // Submit button
    const btnRow = form.add(new jsgui.Control({ context: this.context, tagName: 'div', style: { display: 'flex', alignItems: 'center', gap: '12px' } }));
    
    const submitBtn = btnRow.add(new jsgui.Control({
      context: this.context,
      tagName: 'button',
      attr: { id: 'rc-submit', type: 'button' },
      style: {
        padding: '10px 16px',
        borderRadius: '6px',
        border: 'none',
        background: '#2f8f6b',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 'bold'
      }
    }));
    submitBtn.add(new jsgui.Text_Node({ context: this.context, text: '▶ Spawn Crawler' }));

    const statusEl = btnRow.add(new jsgui.Control({
      context: this.context,
      tagName: 'span',
      attr: { id: 'rc-status' },
      style: { fontSize: '14px', color: '#cfe7ff' }
    }));

    // Client-side script
    this._renderScript(container);
  }

  _renderScript(container) {
    const script = container.add(new jsgui.Control({ context: this.context, tagName: 'script' }));
    script.add(new jsgui.Text_Node({
      context: this.context,
      text: `
(function() {
  const btn = document.getElementById('rc-submit');
  const domainsInput = document.getElementById('rc-domains');
  const profileInput = document.getElementById('rc-profile');
  const statusEl = document.getElementById('rc-status');

  if (!btn) return;

  btn.addEventListener('click', async () => {
    const domains = (domainsInput.value || '').trim();
    const profile = (profileInput.value || '').trim();

    if (!domains && !profile) {
      statusEl.textContent = '❌ Please provide either domains or a profile.';
      statusEl.style.color = '#ff8888';
      return;
    }

    btn.disabled = true;
    btn.style.opacity = '0.5';
    statusEl.textContent = '⏳ Spawning...';
    statusEl.style.color = '#e1b64a';

    try {
      const res = await fetch('${this._withBasePath('/api/crawl/spawn')}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains, profile })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to spawn process');
      }

      statusEl.textContent = '✅ Success! PID: ' + data.pid;
      statusEl.style.color = '#2f8f6b';
      
      // Clear inputs
      domainsInput.value = '';
      profileInput.value = '';
    } catch (err) {
      statusEl.textContent = '❌ Error: ' + err.message;
      statusEl.style.color = '#ff8888';
    } finally {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
})();
      `.trim()
    }));
  }
}

module.exports = RemoteCrawlControl;
