/**
 * @server Goals Explorer
 * @description Interactive UI for exploring project goals with AI-generated detail pages.
 * @ui true
 * @port 3010
 */

/**
 * Goals Explorer Server
 * 
 * Interactive UI for exploring project goals with AI-generated detail pages.
 * Uses jsgui3 patterns for server-side rendering with client-side hydration.
 * OpenAI API generates content on-demand when detail pages don't exist.
 * 
 * Architecture:
 * - Express for HTTP routing
 * - jsgui3-html for SSR (Page_Context + Blank_HTML_Document)
 * - esbuild for client bundle
 * - OpenAI for content generation
 * 
 * Usage:
 *   node src/ui/server/goalsExplorer/server.js
 *   Open http://localhost:3010
 */

"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const jsgui = require("jsgui3-html");

const { GoalsExplorerControl, GoalDetailControl, GoalsListControl } = require("./controls");
const { ensureClientBundle } = require('../utils/ensureClientBundle");

// Try to load OpenAI bridge if available
let OpenAIAgentBridge;
try {
  const bridgePath = path.join(__dirname, "../../../../tools/ai/openai-agent-bridge.js");
  if (fs.existsSync(bridgePath)) {
    OpenAIAgentBridge = require(bridgePath).OpenAIAgentBridge;
  }
} catch (e) {
  console.warn("OpenAI bridge not available:", e.message);
}

const app = express();
const PORT = process.env.PORT || 3010;

// ============================================================================
// PATHS
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const GOALS_DATA_DIR = path.join(PROJECT_ROOT, 'data/goals');
const GOALS_JSON = path.join(GOALS_DATA_DIR, 'goals.json');
const DETAILS_DIR = path.join(GOALS_DATA_DIR, 'details');
const SVG_PATH = path.join(PROJECT_ROOT, 'docs/designs/PROJECT_GOALS_OVERVIEW.svg');

// Ensure directories exist
if (!fs.existsSync(GOALS_DATA_DIR)) fs.mkdirSync(GOALS_DATA_DIR, { recursive: true });
if (!fs.existsSync(DETAILS_DIR)) fs.mkdirSync(DETAILS_DIR, { recursive: true });

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// GOALS DATA
// ============================================================================

function loadGoals() {
  if (fs.existsSync(GOALS_JSON)) {
    return JSON.parse(fs.readFileSync(GOALS_JSON, 'utf8'));
  }
  
  // Default goals structure (would be populated from SVG generator)
  return {
    categories: [],
    lastUpdated: null,
  };
}

function saveGoals(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(GOALS_JSON, JSON.stringify(data, null, 2));
}

function getGoalDetail(goalId) {
  const detailPath = path.join(DETAILS_DIR, `${goalId}.md`);
  if (fs.existsSync(detailPath)) {
    return {
      exists: true,
      content: fs.readFileSync(detailPath, 'utf8'),
      generatedAt: fs.statSync(detailPath).mtime,
    };
  }
  return { exists: false };
}

function saveGoalDetail(goalId, content) {
  const detailPath = path.join(DETAILS_DIR, `${goalId}.md`);
  fs.writeFileSync(detailPath, content);
  return detailPath;
}

// ============================================================================
// API ROUTES
// ============================================================================

// Get all goals
app.get('/api/goals', (req, res) => {
  const goals = loadGoals();
  res.json(goals);
});

// Get goals SVG
app.get('/api/goals/svg', (req, res) => {
  if (fs.existsSync(SVG_PATH)) {
    res.sendFile(SVG_PATH);
  } else {
    res.status(404).json({ error: 'SVG not found' });
  }
});

// Get goal detail
app.get('/api/goals/:id', (req, res) => {
  const goalId = req.params.id;
  const detail = getGoalDetail(goalId);
  
  if (detail.exists) {
    res.json({
      goalId,
      ...detail,
      source: 'cache',
    });
  } else {
    res.json({
      goalId,
      exists: false,
      message: 'Detail page not generated yet. Use POST to generate.',
    });
  }
});

// Generate goal detail via OpenAI
app.post('/api/goals/:id/generate', async (req, res) => {
  const goalId = req.params.id;
  const { force = false, goalData } = req.body;
  
  // Check if already exists
  const existing = getGoalDetail(goalId);
  if (existing.exists && !force) {
    return res.json({
      goalId,
      ...existing,
      source: 'cache',
      message: 'Detail already exists. Use force=true to regenerate.',
    });
  }
  
  // Check if OpenAI is available
  if (!OpenAIAgentBridge) {
    return res.status(503).json({
      error: 'OpenAI bridge not available',
      message: 'Install openai package and set OPENAI_API_KEY',
    });
  }
  
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'OPENAI_API_KEY not set',
      message: 'Set OPENAI_API_KEY environment variable',
    });
  }
  
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: ${JSON.stringify({ status: 'starting', goalId })}\n\n`);
    
    const agent = new OpenAIAgentBridge();
    
    res.write(`data: ${JSON.stringify({ status: 'analyzing', message: 'Searching codebase...' })}\n\n`);
    
    const result = await agent.generateGoalDetail(goalId, goalData || {
      title: goalId,
      status: 'active',
      progress: 50,
      lines: [],
    });
    
    if (result.success) {
      saveGoalDetail(goalId, result.response);
      
      res.write(`data: ${JSON.stringify({ 
        status: 'complete',
        goalId,
        iterations: result.iterations,
        toolsUsed: result.toolsUsed,
      })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ status: 'error', message: 'Generation failed' })}\n\n`);
    }
    
    res.end();
  } catch (error) {
    console.error('Generation error:', error);
    res.write(`data: ${JSON.stringify({ status: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Verify goal detail
app.post('/api/goals/:id/verify', async (req, res) => {
  const goalId = req.params.id;
  const detail = getGoalDetail(goalId);
  
  if (!detail.exists) {
    return res.status(404).json({ error: 'Detail page does not exist' });
  }
  
  if (!OpenAIAgentBridge || !process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OpenAI not available' });
  }
  
  try {
    const agent = new OpenAIAgentBridge();
    const result = await agent.verifyDetailPage(goalId, detail.content);
    
    res.json({
      goalId,
      verification: result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync goals from SVG generator
app.post('/api/goals/sync', async (req, res) => {
  try {
    // Run the SVG generator to get latest goals
    const generatorPath = path.join(PROJECT_ROOT, 'tmp/generate-goals-svg.js');
    
    if (fs.existsSync(generatorPath)) {
      // Extract categories from the generator
      const generator = require(generatorPath);
      // Note: Would need to export categories from the generator
      
      res.json({ message: 'Sync would happen here', todo: true });
    } else {
      res.status(404).json({ error: 'SVG generator not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// JSGUI3 RENDERING
// ============================================================================

const StringControl = jsgui.String_Control;

/**
 * Create the Industrial Luxury Obsidian CSS
 * This is the same CSS used in the GoalsExplorerControl but injected via style tag
 */
function buildGoalsExplorerCss() {
  return `
    :root {
      --bg-darkest: #050508;
      --bg-dark: #0a0d14;
      --bg-medium: #141824;
      --bg-light: #1a1f2e;
      --bg-lighter: #252b3d;
      --gold: #c9a227;
      --gold-dim: #8b7500;
      --emerald: #10b981;
      --sapphire: #3b82f6;
      --amethyst: #8b5cf6;
      --ruby: #ef4444;
      --text-bright: #f0f4f8;
      --text-medium: #94a3b8;
      --text-muted: #64748b;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg-dark);
      color: var(--text-bright);
      min-height: 100vh;
    }
    
    .goals-explorer {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    
    .goals-header {
      background: var(--bg-medium);
      border-bottom: 1px solid rgba(201, 162, 39, 0.3);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .goals-header h1 {
      font-family: Georgia, serif;
      color: var(--gold);
      font-size: 1.5rem;
      letter-spacing: 1px;
    }
    
    .status-indicator {
      font-size: 0.875rem;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
    }
    
    .status-indicator.ready {
      color: var(--emerald);
      background: rgba(16, 185, 129, 0.1);
    }
    
    .status-indicator.unavailable {
      color: var(--text-muted);
      background: rgba(100, 116, 139, 0.1);
    }
    
    .goals-main {
      display: grid;
      grid-template-columns: 1fr 420px;
      flex: 1;
      overflow: hidden;
    }
    
    @media (max-width: 900px) {
      .goals-main {
        grid-template-columns: 1fr;
      }
      .goals-right-panel {
        display: none;
      }
    }
    
    .goals-left-panel {
      overflow: auto;
      padding: 1rem;
      background: var(--bg-darkest);
    }
    
    .svg-wrapper {
      min-height: 100%;
    }
    
    .svg-wrapper svg {
      max-width: 100%;
      height: auto;
    }
    
    .goals-right-panel {
      background: var(--bg-light);
      border-left: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
      padding: 1.5rem;
    }
    
    .detail-placeholder {
      text-align: center;
      padding: 3rem 1rem;
    }
    
    .detail-placeholder h2 {
      font-family: Georgia, serif;
      color: var(--gold);
      font-size: 1.25rem;
      margin-bottom: 1rem;
    }
    
    .detail-placeholder p {
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    
    .detail-placeholder .hint {
      font-size: 0.8rem;
    }
    
    .goal-detail h2 {
      font-family: Georgia, serif;
      color: var(--gold);
      font-size: 1.25rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .detail-content {
      font-size: 0.9rem;
      line-height: 1.6;
      color: var(--text-medium);
    }
    
    .detail-content h3 {
      color: var(--text-bright);
      margin: 1.5rem 0 0.5rem;
    }
    
    .detail-content code {
      background: var(--bg-medium);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85em;
    }
    
    .detail-content pre {
      background: var(--bg-medium);
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1rem 0;
    }
    
    .btn-generate {
      background: linear-gradient(135deg, var(--gold-dim), var(--gold));
      color: var(--bg-darkest);
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    
    .btn-generate:hover {
      filter: brightness(1.1);
    }
    
    .btn-generate:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: var(--text-muted);
    }
    
    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--gold-dim);
      border-top-color: var(--gold);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .placeholder-text {
      color: var(--text-muted);
      text-align: center;
      padding: 2rem;
    }
    
    .error {
      color: var(--ruby);
      padding: 1rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 6px;
    }
  `;
}

/**
 * Render the Goals Explorer page using jsgui3 controls
 * @param {Object} options - Rendering options
 * @returns {string} HTML string
 */
function renderGoalsExplorerPage(options = {}) {
  const {
    title = "Goals Explorer",
    openaiAvailable = false,
    goals = { categories: [] },
    selectedGoalId = null,
    goalDetail = null,
    clientScriptPath = "/public/goals-explorer-client.js",
  } = options;

  // Create jsgui3 context and document
  const context = new jsgui.Page_Context();
  const document = new jsgui.Blank_HTML_Document({ context });

  // Set title
  document.title.add(new StringControl({ context, text: title }));

  // Build head
  const head = document.head;
  head.add(new jsgui.meta({ context, attrs: { charset: "utf-8" } }));
  head.add(new jsgui.meta({ context, attrs: { name: "viewport", content: "width=device-width, initial-scale=1" } }));

  // Google Fonts
  const preconnectFonts = new jsgui.link({ context });
  preconnectFonts.dom.attributes.rel = "preconnect";
  preconnectFonts.dom.attributes.href = "https://fonts.googleapis.com";
  head.add(preconnectFonts);

  const preconnectGstatic = new jsgui.link({ context });
  preconnectGstatic.dom.attributes.rel = "preconnect";
  preconnectGstatic.dom.attributes.href = "https://fonts.gstatic.com";
  preconnectGstatic.dom.attributes.crossorigin = "";
  head.add(preconnectGstatic);

  const fontsStylesheet = new jsgui.link({ context });
  fontsStylesheet.dom.attributes.rel = "stylesheet";
  fontsStylesheet.dom.attributes.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
  head.add(fontsStylesheet);

  // CSS styles
  const styleTag = new jsgui.Control({ context, tagName: "style" });
  styleTag.add(new StringControl({ context, text: buildGoalsExplorerCss() }));
  head.add(styleTag);

  // Build body using GoalsExplorerControl
  const body = document.body;

  // Main explorer control
  const explorerControl = new GoalsExplorerControl({
    context,
    goals,
    selectedGoalId,
    goalDetail,
    svgContent: null, // Will be loaded client-side
    openaiAvailable,
  });
  body.add(explorerControl);

  // Inject state for client-side hydration
  const stateScript = new jsgui.script({ context });
  const state = {
    openaiAvailable,
    goals,
    selectedGoalId,
    goalDetail,
  };
  const serialized = JSON.stringify(state).replace(/</g, "\\u003c");
  stateScript.add(new StringControl({ context, text: `window.__GOALS_EXPLORER_STATE__ = ${serialized};` }));
  body.add(stateScript);

  // Client script (if provided)
  if (clientScriptPath) {
    const clientScript = new jsgui.script({ context });
    clientScript.dom.attributes.src = clientScriptPath;
    clientScript.dom.attributes.defer = "defer";
    body.add(clientScript);
  }

  // Inline client script for basic interactivity
  const inlineScript = new jsgui.script({ context });
  inlineScript.add(new StringControl({ context, text: getClientScript() }));
  body.add(inlineScript);

  return document.all_html_render();
}

/**
 * Get the inline client JavaScript for basic interactivity
 * This runs before any bundled client script loads
 */
function getClientScript() {
  return `
(function() {
  'use strict';
  
  // Current selection state
  let selectedGoalId = null;
  let selectedElement = null;
  
  // Map of goal titles to goal IDs (built from state)
  let goalTitleToId = {};
  
  // Load SVG on page load
  document.addEventListener('DOMContentLoaded', function() {
    buildGoalTitleMap();
    loadSvg();
    checkApiStatus();
  });
  
  function buildGoalTitleMap() {
    const state = window.__GOALS_EXPLORER_STATE__;
    if (!state?.goals?.categories) return;
    
    for (const cat of state.goals.categories) {
      for (const goal of cat.goals || []) {
        // Normalize title for matching (lowercase, trim)
        const normalizedTitle = goal.title.toLowerCase().trim();
        goalTitleToId[normalizedTitle] = goal.id;
        // Also store the exact title
        goalTitleToId[goal.title] = goal.id;
      }
    }
    console.log('Built goal map with', Object.keys(goalTitleToId).length, 'entries');
  }
  
  async function checkApiStatus() {
    const statusEl = document.querySelector('.status-indicator');
    if (!statusEl) return;
    
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        statusEl.textContent = '✓ Ready';
        statusEl.className = 'status-indicator ready';
      }
    } catch (e) {
      statusEl.textContent = '○ Offline';
      statusEl.className = 'status-indicator unavailable';
    }
  }
  
  async function loadSvg() {
    const wrapper = document.querySelector('.svg-wrapper');
    if (!wrapper) return;
    
    try {
      const res = await fetch('/api/goals/svg');
      if (res.ok) {
        const svgText = await res.text();
        wrapper.innerHTML = svgText;
        makeSvgInteractive();
      } else {
        wrapper.innerHTML = '<p class="error">Failed to load goals overview</p>';
      }
    } catch (e) {
      wrapper.innerHTML = '<p class="error">Error: ' + e.message + '</p>';
    }
  }
  
  function makeSvgInteractive() {
    const svg = document.querySelector('.svg-wrapper svg');
    if (!svg) return;
    
    // Add selection styles to SVG
    addSvgStyles(svg);
    
    // Find all goal items by looking for specific patterns:
    // Goals have a rect, circle (status dot), and text with font-weight="600"
    const allGroups = svg.querySelectorAll('g');
    
    allGroups.forEach(function(group) {
      // Look for goal title text elements (font-weight 600, font-size 13)
      const titleText = group.querySelector('text[font-weight="600"][font-size="13"]');
      if (!titleText) return;
      
      const title = titleText.textContent?.trim();
      if (!title) return;
      
      // Check if this title matches a known goal
      const goalId = goalTitleToId[title] || goalTitleToId[title.toLowerCase().trim()];
      if (!goalId) return;
      
      // Found a goal! Make it interactive
      group.dataset.goalId = goalId;
      group.classList.add('goal-item');
      group.style.cursor = 'pointer';
      
      // Find the background rect for highlighting
      const bgRect = group.querySelector('rect');
      if (bgRect) {
        bgRect.classList.add('goal-bg');
        bgRect.dataset.originalFill = bgRect.getAttribute('fill') || 'rgba(26, 31, 46, 0.6)';
      }
      
      // Click handler
      group.addEventListener('click', function(e) {
        e.stopPropagation();
        selectGoal(goalId, group);
      });
      
      // Hover effects
      group.addEventListener('mouseenter', function() {
        if (group !== selectedElement) {
          if (bgRect) bgRect.setAttribute('fill', 'rgba(201, 162, 39, 0.15)');
        }
      });
      
      group.addEventListener('mouseleave', function() {
        if (group !== selectedElement) {
          if (bgRect) bgRect.setAttribute('fill', bgRect.dataset.originalFill);
        }
      });
    });
    
    console.log('Made', svg.querySelectorAll('.goal-item').length, 'goals interactive');
  }
  
  function addSvgStyles(svg) {
    // Add a style element for selection highlighting
    const defs = svg.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    if (!svg.querySelector('defs')) svg.insertBefore(defs, svg.firstChild);
    
    // Add gold glow filter for selection if not exists
    if (!svg.querySelector('#selectionGlow')) {
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.id = 'selectionGlow';
      filter.setAttribute('x', '-20%');
      filter.setAttribute('y', '-20%');
      filter.setAttribute('width', '140%');
      filter.setAttribute('height', '140%');
      filter.innerHTML = 
        '<feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#c9a227" flood-opacity="0.6"/>';
      defs.appendChild(filter);
    }
  }
  
  function selectGoal(goalId, element) {
    // Deselect previous
    if (selectedElement) {
      selectedElement.classList.remove('selected');
      const prevBg = selectedElement.querySelector('.goal-bg');
      if (prevBg) {
        prevBg.setAttribute('fill', prevBg.dataset.originalFill);
        prevBg.removeAttribute('filter');
        prevBg.setAttribute('stroke', 'none');
      }
    }
    
    // Select new
    selectedGoalId = goalId;
    selectedElement = element;
    
    if (element) {
      element.classList.add('selected');
      const bg = element.querySelector('.goal-bg');
      if (bg) {
        bg.setAttribute('fill', 'rgba(201, 162, 39, 0.25)');
        bg.setAttribute('filter', 'url(#selectionGlow)');
        bg.setAttribute('stroke', '#c9a227');
        bg.setAttribute('stroke-width', '1');
      }
    }
    
    // Show goal detail
    showGoalDetail(goalId);
  }
  
  window.showGoalDetail = async function(goalId) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;
    
    // Find goal info from state for better display
    const state = window.__GOALS_EXPLORER_STATE__;
    let goalInfo = null;
    if (state?.goals?.categories) {
      for (const cat of state.goals.categories) {
        const found = (cat.goals || []).find(g => g.id === goalId);
        if (found) {
          goalInfo = { ...found, category: cat.title, categoryEmoji: cat.emoji };
          break;
        }
      }
    }
    
    panel.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    
    try {
      const res = await fetch('/api/goals/' + encodeURIComponent(goalId));
      const data = await res.json();
      
      const title = goalInfo?.title || goalId;
      const categoryBadge = goalInfo ? 
        '<span class="category-badge">' + goalInfo.categoryEmoji + ' ' + goalInfo.category + '</span>' : '';
      const statusBadge = goalInfo ?
        '<span class="status-badge ' + goalInfo.status + '">' + goalInfo.status + '</span>' : '';
      
      if (data.exists) {
        panel.innerHTML = 
          '<div class="goal-detail">' +
          '<div class="goal-header">' + categoryBadge + statusBadge + '</div>' +
          '<h2>' + escapeHtml(title) + '</h2>' +
          '<div class="detail-content">' + markdownToHtml(data.content) + '</div>' +
          '<button class="btn-generate" onclick="generateGoal(\\'' + escapeHtml(goalId) + '\\', true)">🔄 Regenerate</button>' +
          '</div>';
      } else {
        const linesHtml = goalInfo?.lines?.length ? 
          '<ul class="goal-lines">' + goalInfo.lines.map(l => '<li>' + escapeHtml(l) + '</li>').join('') + '</ul>' : '';
        
        panel.innerHTML = 
          '<div class="goal-detail">' +
          '<div class="goal-header">' + categoryBadge + statusBadge + '</div>' +
          '<h2>' + escapeHtml(title) + '</h2>' +
          (goalInfo?.progress !== undefined ? '<div class="progress-bar"><div class="progress-fill" style="width:' + goalInfo.progress + '%"></div><span>' + goalInfo.progress + '%</span></div>' : '') +
          linesHtml +
          '<p class="no-detail">No detail page exists for this goal yet.</p>' +
          '<button class="btn-generate" onclick="generateGoal(\\'' + escapeHtml(goalId) + '\\')">✨ Generate with OpenAI</button>' +
          '</div>';
      }
    } catch (e) {
      panel.innerHTML = '<p class="error">Error: ' + e.message + '</p>';
    }
  };
  
  window.generateGoal = async function(goalId, force) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;
    
    panel.innerHTML = 
      '<div class="goal-detail">' +
      '<h2>Generating...</h2>' +
      '<div class="loading"><div class="spinner"></div><span id="genStatus">Starting generation...</span></div>' +
      '</div>';
    
    try {
      const res = await fetch('/api/goals/' + encodeURIComponent(goalId) + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: !!force }),
      });
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        
        var text = decoder.decode(result.value);
        var lines = text.split('\\n').filter(function(l) { return l.startsWith('data: '); });
        
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          try {
            var eventData = JSON.parse(line.slice(6));
            var statusEl = document.getElementById('genStatus');
            if (statusEl) statusEl.textContent = eventData.message || eventData.status;
            
            if (eventData.status === 'complete') {
              showGoalDetail(goalId);
              return;
            }
          } catch (parseErr) {
            console.warn('Failed to parse SSE:', parseErr);
          }
        }
      }
    } catch (e) {
      panel.innerHTML = '<p class="error">Error: ' + e.message + '</p>';
    }
  };
  
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function markdownToHtml(md) {
    if (!md) return '';
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\\n\\n/g, '</p><p>');
  }
})();
`;
}

// ============================================================================
// HTML ROUTES (using jsgui3)
// ============================================================================

app.get("/", (req, res) => {
  const goals = loadGoals();
  const openaiAvailable = !!OpenAIAgentBridge && !!process.env.OPENAI_API_KEY;
  
  const html = renderGoalsExplorerPage({
    title: "🎯 Goals Explorer",
    openaiAvailable,
    goals,
    selectedGoalId: null,
    goalDetail: null,
    clientScriptPath: null, // Using inline script for now
  });
  
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Goal detail page (SSR with goal pre-loaded)
app.get("/goal/:id", (req, res) => {
  const goalId = req.params.id;
  const goals = loadGoals();
  const openaiAvailable = !!OpenAIAgentBridge && !!process.env.OPENAI_API_KEY;
  const goalDetail = getGoalDetail(goalId);
  
  const html = renderGoalsExplorerPage({
    title: `Goal: ${goalId}`,
    openaiAvailable,
    goals,
    selectedGoalId: goalId,
    goalDetail: goalDetail.exists ? goalDetail : null,
    clientScriptPath: null,
  });
  
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(argv) {
  const args = { port: PORT, check: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      args.port = parseInt(argv[++i], 10) || PORT;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Goals Explorer Server

Usage: node server.js [options]

Options:
  --port, -p <port>   Port to listen on (default: ${PORT})
  --check             Start server, verify it responds, then exit (for CI/agents)
  --help, -h          Show this help message

Examples:
  node server.js                 # Start server on default port
  node server.js --port 4000     # Start on port 4000
  node server.js --check         # Verify server starts OK then exit

The --check flag is designed for AI agents and CI pipelines to verify
the server starts correctly without blocking on a long-running process.
`);
}

// ============================================================================
// START SERVER
// ============================================================================

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // Import startup check utility
  const { wrapServerForCheck } = require('../utils/serverStartupCheck");
  
  const port = args.port;
  const host = "127.0.0.1";
  
  // Use wrapper that handles --check mode automatically
  if (args.check) {
    process.env.SERVER_NAME = "Goals Explorer";
  }
  
  const server = wrapServerForCheck(app, port, host, () => {
    if (!args.check) {
      console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                     🎯 Goals Explorer Server                      ║
╠═══════════════════════════════════════════════════════════════════╣
║  URL:        http://localhost:${String(port).padEnd(4)}                              ║
║  OpenAI:     ${(process.env.OPENAI_API_KEY ? "✓ API key set" : "✗ OPENAI_API_KEY not set").padEnd(40)}  ║
║  Goals:      ${(fs.existsSync(GOALS_JSON) ? "✓ goals.json found" : "○ Will create goals.json").padEnd(40)}  ║
║  SVG:        ${(fs.existsSync(SVG_PATH) ? "✓ SVG found" : "✗ SVG not found").padEnd(40)}  ║
║  Pattern:    jsgui3 SSR + client hydration                        ║
╚═══════════════════════════════════════════════════════════════════╝
      `);
    }
  });
  
  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down Goals Explorer...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = app;

