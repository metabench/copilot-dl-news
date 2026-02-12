'use strict';

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

/**
 * WebhookDashboard - Main dashboard view
 * 
 * Renders the complete webhook management dashboard with:
 * - Header with title and "New Webhook" button
 * - Metrics summary row
 * - Grid of webhook cards
 */
class WebhookDashboard extends Control {
  constructor(spec = {}) {
    super(spec);
    
    this.webhooks = spec.webhooks || [];
    this.metrics = spec.metrics || {
      total: 0,
      enabled: 0,
      disabled: 0,
      eventTypes: 0
    };
    this.eventTypes = spec.eventTypes || [];
  }

  all_html_render() {
    const metricsHtml = this._renderMetrics();
    const webhooksHtml = this._renderWebhooks();

    return `
      <nav class="hub-nav">
        <a href="http://localhost:3000" class="hub-nav__link">← Back to Ops Hub</a>
      </nav>
      
      <header class="dashboard-header">
        <div>
          <h1 class="dashboard-header__title">🔗 Webhook Management</h1>
          <p class="dashboard-header__subtitle">Configure integrations and event subscriptions</p>
        </div>
        <button class="btn btn--primary" data-action="show-create-form">+ New Webhook</button>
      </header>
      
      <main class="dashboard-main">
        ${metricsHtml}
        ${webhooksHtml}
      </main>
      
      ${this._renderCreateModal()}
      
      <script>
        ${this._getClientScript()}
      </script>
    `;
  }

  _renderMetrics() {
    const { total, enabled, disabled, eventTypes } = this.metrics;

    return `
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-card__value">${total}</div>
          <div class="metric-card__label">Total Webhooks</div>
        </div>
        <div class="metric-card metric-card--success">
          <div class="metric-card__value">${enabled}</div>
          <div class="metric-card__label">Active</div>
        </div>
        <div class="metric-card metric-card--danger">
          <div class="metric-card__value">${disabled}</div>
          <div class="metric-card__label">Disabled</div>
        </div>
        <div class="metric-card metric-card--info">
          <div class="metric-card__value">${eventTypes}</div>
          <div class="metric-card__label">Event Types</div>
        </div>
      </div>
    `;
  }

  _renderWebhooks() {
    if (this.webhooks.length === 0) {
      return `
        <div class="panel">
          <h3 class="panel__title">📋 Webhooks</h3>
          <div class="empty-state">
            <div class="empty-state__icon">🔔</div>
            <p>No webhooks configured yet.</p>
            <p style="color: var(--text-muted);">Create one to start receiving event notifications.</p>
            <button class="btn btn--primary" data-action="show-create-form" style="margin-top: 16px;">
              + Create First Webhook
            </button>
          </div>
        </div>
      `;
    }

    const cards = this.webhooks.map(w => this._renderWebhookCard(w)).join('');

    return `
      <div class="panel">
        <h3 class="panel__title">📋 Webhooks (${this.webhooks.length})</h3>
        <div class="webhook-grid">
          ${cards}
        </div>
      </div>
    `;
  }

  _renderWebhookCard(webhook) {
    const events = Array.isArray(webhook.events) ? webhook.events : JSON.parse(webhook.events || '[]');
    const statusClass = webhook.enabled ? 'enabled' : 'disabled';
    const statusText = webhook.enabled ? 'Active' : 'Disabled';
    
    const eventBadges = events.slice(0, 4).map(e => 
      `<span class="event-badge">${this._escapeHtml(e)}</span>`
    ).join('');
    
    const moreEvents = events.length > 4 
      ? `<span class="event-badge">+${events.length - 4} more</span>`
      : '';

    return `
      <div class="webhook-card" data-id="${webhook.id}">
        <div class="webhook-card__header">
          <h4 class="webhook-card__name">${this._escapeHtml(webhook.name)}</h4>
          <span class="webhook-card__status webhook-card__status--${statusClass}">${statusText}</span>
        </div>
        <div class="webhook-card__url">${this._escapeHtml(webhook.url)}</div>
        <div class="webhook-card__events">
          ${eventBadges}
          ${moreEvents}
        </div>
        <div class="webhook-card__actions">
          <button class="btn btn--secondary btn--small" data-action="toggle-webhook" data-webhook-id="${webhook.id}" data-enabled="${!webhook.enabled}">
            ${webhook.enabled ? 'Disable' : 'Enable'}
          </button>
          <button class="btn btn--secondary btn--small" data-action="test-webhook" data-webhook-id="${webhook.id}">Test</button>
          <button class="btn btn--danger btn--small" data-action="delete-webhook" data-webhook-id="${webhook.id}">Delete</button>
        </div>
      </div>
    `;
  }

  _renderCreateModal() {
    const eventCheckboxes = this.eventTypes.map(e => `
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <input type="checkbox" name="events" value="${e}">
        <span>${e}</span>
      </label>
    `).join('');

    return `
      <div id="createModal" class="modal" style="display: none;">
        <div class="modal-backdrop" data-action="hide-create-form"></div>
        <div class="modal-content panel">
          <h3 class="panel__title">Create New Webhook</h3>
          <form id="createWebhookForm" data-action="create-webhook">
            <div style="margin-bottom: 16px;">
              <label style="display: block; color: var(--text-muted); margin-bottom: 4px;">Name</label>
              <input type="text" name="name" required 
                style="width: 100%; padding: 10px; background: var(--bg-obsidian); border: 1px solid var(--border-leather); border-radius: 4px; color: var(--text-cream);">
            </div>
            <div style="margin-bottom: 16px;">
              <label style="display: block; color: var(--text-muted); margin-bottom: 4px;">URL</label>
              <input type="url" name="url" required placeholder="https://..."
                style="width: 100%; padding: 10px; background: var(--bg-obsidian); border: 1px solid var(--border-leather); border-radius: 4px; color: var(--text-cream);">
            </div>
            <div style="margin-bottom: 20px;">
              <label style="display: block; color: var(--text-muted); margin-bottom: 8px;">Events</label>
              ${eventCheckboxes}
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" class="btn btn--secondary" data-action="hide-create-form">Cancel</button>
              <button type="submit" class="btn btn--primary">Create Webhook</button>
            </div>
          </form>
        </div>
      </div>
      
      <style>
        .modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.7);
        }
        .modal-content {
          position: relative;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
        }
      </style>
    `;
  }

  _getClientScript() {
    return `
      function showCreateForm() {
        var m = document.getElementById('createModal');
        if (m) m.style.display = 'flex';
      }
      
      function hideCreateForm() {
        var m = document.getElementById('createModal');
        if (m) m.style.display = 'none';
      }
      
      async function createWebhook(formTarget) {
        var form = formTarget || document.getElementById('createWebhookForm');
        if (!form) return;
        var data = {
          name: form.querySelector('[name="name"]').value,
          url: form.querySelector('[name="url"]').value,
          events: Array.from(form.querySelectorAll('input[name="events"]:checked')).map(function(i) { return i.value; })
        };
        
        if (data.events.length === 0) {
          alert('Please select at least one event type');
          return;
        }
        
        try {
          var res = await fetch('/api/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          var result = await res.json();
          if (result.success) {
            location.reload();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }
      
      async function toggleWebhook(id, enabled) {
        try {
          var res = await fetch('/api/webhooks/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: enabled })
          });
          var result = await res.json();
          if (result.success) {
            location.reload();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }
      
      async function deleteWebhook(id) {
        if (!confirm('Delete this webhook?')) return;
        
        try {
          var res = await fetch('/api/webhooks/' + id, { method: 'DELETE' });
          var result = await res.json();
          if (result.success) {
            location.reload();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }
      
      async function testWebhook(id) {
        alert('Test webhook functionality requires NotificationService integration');
      }

      // Delegated handler for data-action buttons (standalone mode)
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        e.preventDefault();
        if (action === 'show-create-form') showCreateForm();
        else if (action === 'hide-create-form') hideCreateForm();
        else if (action === 'toggle-webhook') toggleWebhook(btn.dataset.webhookId, btn.dataset.enabled === 'true');
        else if (action === 'test-webhook') testWebhook(btn.dataset.webhookId);
        else if (action === 'delete-webhook') deleteWebhook(btn.dataset.webhookId);
      });

      // Delegated submit handler (standalone mode)
      document.addEventListener('submit', function(e) {
        if (e.target.dataset.action === 'create-webhook') {
          e.preventDefault();
          createWebhook(e.target);
        }
      });
    `;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

module.exports = { WebhookDashboard };
