#!/usr/bin/env node
'use strict';

/**
 * Roadmap Progress Tracker UI
 * 
 * A lightweight UI to display progress on implementation roadmap items.
 * Reads from data/roadmap.json which can be updated by agents or CLI tools.
 * 
 * Usage:
 *   node src/ui/server/roadmapServer.js [--port 3020]
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const { findProjectRoot } = require('../../shared/utils/project-root');

const DEFAULT_PORT = 3020;
const ROADMAP_FILE = path.join(findProjectRoot(), 'data', 'roadmap.json');

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

function loadRoadmap() {
  try {
    const data = fs.readFileSync(ROADMAP_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {
      title: 'Roadmap',
      description: 'No roadmap data found',
      items: []
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderItem(item) {
  const completedTasks = item.tasks?.filter(t => t.done).length || 0;
  const totalTasks = item.tasks?.length || 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  const statusClass = item.status === 'completed' ? 'status-completed' 
                     : item.status === 'in-progress' ? 'status-in-progress' 
                     : 'status-not-started';
  
  const statusLabel = item.status === 'completed' ? '✅ Complete'
                     : item.status === 'in-progress' ? '🔄 In Progress'
                     : '⏳ Not Started';

  const tasksHtml = (item.tasks || []).map(task => `
    <li class="task ${task.done ? 'task-done' : ''}">
      <span class="task-check">${task.done ? '✓' : '○'}</span>
      <span class="task-title">${escapeHtml(task.title)}</span>
    </li>
  `).join('');

  return `
    <div class="roadmap-item ${statusClass}">
      <div class="item-header">
        <span class="item-icon">${item.icon || '📋'}</span>
        <div class="item-title-block">
          <h3 class="item-title">${escapeHtml(item.title)}</h3>
          <span class="item-status">${statusLabel}</span>
        </div>
        <span class="item-priority">P${item.priority}</span>
      </div>
      
      <p class="item-description">${escapeHtml(item.description)}</p>
      
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${progressPercent}%"></div>
      </div>
      <span class="progress-label">${completedTasks}/${totalTasks} tasks (${progressPercent}%)</span>
      
      <ul class="task-list">${tasksHtml}</ul>
      
      ${item.notes ? `<p class="item-notes">💡 ${escapeHtml(item.notes)}</p>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(roadmap) {
  const { title, description, items, createdAt } = roadmap;
  
  const totalItems = items.length;
  const completedItems = items.filter(i => i.status === 'completed').length;
  const inProgressItems = items.filter(i => i.status === 'in-progress').length;
  const notStartedItems = items.filter(i => i.status === 'not-started').length;
  
  const allTasks = items.flatMap(i => i.tasks || []);
  const completedTasks = allTasks.filter(t => t.done).length;
  const totalTasks = allTasks.length;
  const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const itemsHtml = items.map(renderItem).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title) || 'Roadmap Tracker'}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="roadmap-dashboard">
    <header class="dashboard-header">
      <h1>${escapeHtml(title) || 'Roadmap'}</h1>
      <p class="dashboard-description">${escapeHtml(description) || ''}</p>
      ${createdAt ? `<p class="dashboard-date">Created: ${createdAt}</p>` : ''}
    </header>
    
    <div class="summary-stats">
      <div class="stat-card stat-total">
        <span class="stat-value">${totalItems}</span>
        <span class="stat-label">Total Items</span>
      </div>
      <div class="stat-card stat-complete">
        <span class="stat-value">${completedItems}</span>
        <span class="stat-label">Completed</span>
      </div>
      <div class="stat-card stat-progress">
        <span class="stat-value">${inProgressItems}</span>
        <span class="stat-label">In Progress</span>
      </div>
      <div class="stat-card stat-pending">
        <span class="stat-value">${notStartedItems}</span>
        <span class="stat-label">Not Started</span>
      </div>
    </div>
    
    <div class="overall-progress">
      <div class="overall-progress-bar-container">
        <div class="overall-progress-bar" style="width: ${overallPercent}%"></div>
      </div>
      <span class="overall-label">Overall: ${completedTasks}/${totalTasks} tasks (${overallPercent}%)</span>
    </div>
    
    <div class="roadmap-items">
      ${itemsHtml}
    </div>
    
    <footer class="dashboard-footer">
      <p>Data source: <code>data/roadmap.json</code> • Refresh to see updates</p>
    </footer>
  </div>
</body>
</html>`;
}

function getStyles() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      padding: 20px;
    }
    
    .roadmap-dashboard {
      max-width: 900px;
      margin: 0 auto;
    }
    
    .dashboard-header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    
    .dashboard-header h1 {
      font-size: 2rem;
      color: #fff;
      margin-bottom: 8px;
    }
    
    .dashboard-description {
      color: #a0a0a0;
      font-size: 1rem;
    }
    
    .dashboard-date {
      color: #666;
      font-size: 0.85rem;
      margin-top: 8px;
    }
    
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .stat-card {
      background: rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    
    .stat-value {
      display: block;
      font-size: 2rem;
      font-weight: bold;
      color: #fff;
    }
    
    .stat-label {
      font-size: 0.8rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .stat-complete .stat-value { color: #48bb78; }
    .stat-progress .stat-value { color: #f6ad55; }
    .stat-pending .stat-value { color: #a0aec0; }
    
    .overall-progress {
      margin-bottom: 30px;
      text-align: center;
    }
    
    .overall-progress-bar-container {
      background: rgba(255,255,255,0.1);
      border-radius: 10px;
      height: 20px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    
    .overall-progress-bar {
      background: linear-gradient(90deg, #48bb78, #38a169);
      height: 100%;
      border-radius: 10px;
      transition: width 0.5s ease;
    }
    
    .overall-label {
      color: #a0a0a0;
      font-size: 0.9rem;
    }
    
    .roadmap-items {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .roadmap-item {
      background: rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 20px;
      border-left: 4px solid #4a5568;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .roadmap-item:hover {
      transform: translateX(4px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    
    .roadmap-item.status-completed { border-left-color: #48bb78; }
    .roadmap-item.status-in-progress { border-left-color: #f6ad55; }
    .roadmap-item.status-not-started { border-left-color: #718096; }
    
    .item-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .item-icon {
      font-size: 2rem;
    }
    
    .item-title-block {
      flex: 1;
    }
    
    .item-title {
      font-size: 1.2rem;
      color: #fff;
      margin-bottom: 4px;
    }
    
    .item-status {
      font-size: 0.8rem;
      color: #888;
    }
    
    .item-priority {
      background: rgba(255,255,255,0.1);
      color: #a0a0a0;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: bold;
    }
    
    .item-description {
      color: #b0b0b0;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    
    .progress-bar-container {
      background: rgba(255,255,255,0.1);
      border-radius: 6px;
      height: 8px;
      overflow: hidden;
      margin-bottom: 6px;
      position: relative;
    }
    
    .progress-bar {
      background: linear-gradient(90deg, #4299e1, #3182ce);
      height: 100%;
      border-radius: 6px;
      transition: width 0.3s ease;
    }
    
    .progress-label {
      font-size: 0.8rem;
      color: #888;
    }
    
    .task-list {
      list-style: none;
      margin: 16px 0;
      padding-left: 8px;
    }
    
    .task {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      color: #b0b0b0;
      font-size: 0.9rem;
    }
    
    .task-done {
      color: #68d391;
    }
    
    .task-done .task-title {
      text-decoration: line-through;
      opacity: 0.7;
    }
    
    .task-check {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid currentColor;
      border-radius: 4px;
      font-size: 0.7rem;
    }
    
    .task-done .task-check {
      background: #48bb78;
      border-color: #48bb78;
      color: #fff;
    }
    
    .item-notes {
      background: rgba(246, 173, 85, 0.1);
      border: 1px solid rgba(246, 173, 85, 0.2);
      border-radius: 8px;
      padding: 12px;
      font-size: 0.85rem;
      color: #f6ad55;
      margin-top: 12px;
    }
    
    .dashboard-footer {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 0.85rem;
      padding: 20px;
    }
    
    .dashboard-footer code {
      background: rgba(255,255,255,0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
    }
    
    @media (max-width: 600px) {
      .summary-stats {
        grid-template-columns: repeat(2, 1fr);
      }
      .item-header {
        flex-wrap: wrap;
      }
    }
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Express Server
// ─────────────────────────────────────────────────────────────────────────────

function createServer() {
  const app = express();
  
  app.get('/', (req, res) => {
    const roadmap = loadRoadmap();
    const html = renderPage(roadmap);
    res.type('html').send(html);
  });
  
  app.get('/api/roadmap', (req, res) => {
    const roadmap = loadRoadmap();
    res.json(roadmap);
  });
  
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Simple arg parsing
  if (args.includes('--help')) {
    console.log('Usage: node roadmapServer.js [--port=PORT]');
    process.exit(0);
  }
  
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
  
  const app = createServer();
  
  app.listen(port, () => {
    console.log(`🗺️  Roadmap Tracker running at http://localhost:${port}`);
    console.log(`   Data: ${ROADMAP_FILE}`);
  });
}

module.exports = { createServer, loadRoadmap };
