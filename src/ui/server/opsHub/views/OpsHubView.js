'use strict';

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

// ─────────────────────────────────────────────────────────────
// WLILO Theme - Leather + Gold + Obsidian
// ─────────────────────────────────────────────────────────────

const STYLES = `
  :root {
    --bg-obsidian: #1a1410;
    --bg-leather: linear-gradient(135deg, #3d2b1f 0%, #2a1f17 50%, #1a1410 100%);
    --bg-card: #2a1f17;
    --bg-card-hover: #3d2b1f;
    --gold: #d4a574;
    --gold-light: #e8c9a0;
    --gold-dark: #a67c4e;
    --text-primary: #f5e6d3;
    --text-secondary: #c4a882;
    --border-gold: #8b6914;
    --success: #4ade80;
    --error: #f87171;
    --warning: #fbbf24;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-obsidian);
    color: var(--text-primary);
    min-height: 100vh;
    padding: 0;
  }

  .ops-hub {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }

  .hub-header {
    text-align: center;
    margin-bottom: 3rem;
    padding: 2rem;
    background: var(--bg-leather);
    border-radius: 12px;
    border: 1px solid var(--border-gold);
  }

  .hub-title {
    font-family: Georgia, serif;
    font-size: 2.5rem;
    color: var(--gold);
    margin-bottom: 0.5rem;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  }

  .hub-subtitle {
    color: var(--text-secondary);
    font-size: 1.1rem;
  }

  .status-indicator {
    display: inline-block;
    margin-left: 1rem;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .status-online { background: rgba(74, 222, 128, 0.2); color: var(--success); }
  .status-offline { background: rgba(248, 113, 113, 0.2); color: var(--error); }

  .category-section {
    margin-bottom: 2.5rem;
  }

  .category-header {
    font-family: Georgia, serif;
    font-size: 1.4rem;
    color: var(--gold);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-gold);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .category-icon {
    font-size: 1.2rem;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .dashboard-card {
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 8px;
    padding: 1.25rem;
    transition: all 0.2s ease;
    cursor: pointer;
    text-decoration: none;
    display: block;
    position: relative;
    overflow: hidden;
  }

  .dashboard-card:hover {
    background: var(--bg-card-hover);
    border-color: var(--gold);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }

  .dashboard-card.offline {
    opacity: 0.6;
  }

  .dashboard-card.offline:hover {
    cursor: not-allowed;
    transform: none;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .card-icon {
    font-size: 1.75rem;
    flex-shrink: 0;
  }

  .card-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-status {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .card-status.online { background: var(--success); box-shadow: 0 0 8px var(--success); }
  .card-status.offline { background: var(--error); }

  .card-description {
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.4;
    margin-bottom: 0.75rem;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--gold-dark);
  }

  .card-port {
    font-family: 'Consolas', monospace;
    background: rgba(212, 165, 116, 0.15);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .card-arrow {
    color: var(--gold);
    font-size: 1.2rem;
    transition: transform 0.2s;
  }

  .dashboard-card:hover .card-arrow {
    transform: translateX(4px);
  }

  .refresh-btn {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: var(--bg-leather);
    border: 1px solid var(--gold);
    color: var(--gold);
    padding: 0.75rem 1.5rem;
    border-radius: 30px;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: var(--gold);
    color: var(--bg-obsidian);
  }

  .stats-bar {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
  }

  .stat-value {
    font-weight: 600;
    color: var(--gold-light);
  }

  /* Quick Launch Bar */
  .quick-launch {
    background: rgba(212, 165, 116, 0.1);
    border: 1px solid var(--border-gold);
    border-radius: 8px;
    padding: 1rem 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .quick-launch-label {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-right: 0.5rem;
  }

  .quick-btn {
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    color: var(--text-primary);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    transition: all 0.2s;
  }

  .quick-btn:hover {
    background: var(--gold);
    color: var(--bg-obsidian);
    border-color: var(--gold);
  }

  .quick-btn.online::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
  }
`;

const CATEGORY_ICONS = {
  'Crawler Operations': '🕷️',
  'Data & Analytics': '📊',
  'Administration': '⚙️',
  'Development Tools': '🛠️',
  'Design & Docs': '📚'
};

// ─────────────────────────────────────────────────────────────
// OpsHubView Class
// ─────────────────────────────────────────────────────────────

class OpsHubView extends Control {
  constructor(spec = {}) {
    super(spec);
    this.dashboards = spec.dashboards || [];
  }

  render() {
    // Calculate stats
    let totalDashboards = 0;
    let onlineCount = 0;
    const onlineItems = [];

    for (const cat of this.dashboards) {
      for (const item of cat.items) {
        totalDashboards++;
        if (item.running) {
          onlineCount++;
          onlineItems.push(item);
        }
      }
    }

    // Build quick launch buttons for online dashboards
    const quickLaunchHtml = onlineItems.length > 0 ? `
      <div class="quick-launch">
        <span class="quick-launch-label">Quick Launch:</span>
        ${onlineItems.map(d => `
          <a href="http://localhost:${d.port}" target="_blank" class="quick-btn online">
            ${d.icon} ${d.name}
          </a>
        `).join('')}
      </div>
    ` : '';

    // Build category sections
    const categoriesHtml = this.dashboards.map(cat => `
      <section class="category-section">
        <h2 class="category-header">
          <span class="category-icon">${CATEGORY_ICONS[cat.category] || '📁'}</span>
          ${cat.category}
        </h2>
        <div class="dashboard-grid">
          ${cat.items.map(item => this._renderCard(item)).join('')}
        </div>
      </section>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ops Hub - Dashboard Launcher</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="ops-hub">
    <header class="hub-header">
      <h1 class="hub-title">🎛️ Ops Hub</h1>
      <p class="hub-subtitle">Unified Dashboard Launcher</p>
      <div class="stats-bar">
        <div class="stat-item">
          <span>📊 Total:</span>
          <span class="stat-value">${totalDashboards}</span>
        </div>
        <div class="stat-item">
          <span>🟢 Online:</span>
          <span class="stat-value">${onlineCount}</span>
        </div>
        <div class="stat-item">
          <span>🔴 Offline:</span>
          <span class="stat-value">${totalDashboards - onlineCount}</span>
        </div>
      </div>
    </header>

    ${quickLaunchHtml}

    ${categoriesHtml}
  </div>

  <button class="refresh-btn" onclick="location.reload()">
    🔄 Refresh Status
  </button>

  <script>
    // Auto-refresh status every 30 seconds
    setTimeout(() => location.reload(), 30000);
    
    // Handle offline cards
    document.querySelectorAll('.dashboard-card.offline').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        alert('This dashboard is not currently running.\\n\\nStart it with:\\n  node src/ui/server/' + card.dataset.path + '/server.js');
      });
    });
  </script>
</body>
</html>`;
  }

  _renderCard(item) {
    const statusClass = item.running ? 'online' : 'offline';
    const href = item.running ? `http://localhost:${item.port}` : '#';
    const target = item.running ? '_blank' : '';

    return `
      <a href="${href}" target="${target}" 
         class="dashboard-card ${item.running ? '' : 'offline'}" 
         data-path="${item.path}">
        <div class="card-status ${statusClass}"></div>
        <div class="card-header">
          <span class="card-icon">${item.icon}</span>
          <span class="card-title">${item.name}</span>
        </div>
        <p class="card-description">${item.description}</p>
        <div class="card-footer">
          <span class="card-port">:${item.port}</span>
          <span class="card-arrow">→</span>
        </div>
      </a>
    `;
  }
}

module.exports = { OpsHubView };
