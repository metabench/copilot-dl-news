'use strict';

/**
 * Dashboard Stress Test Lab - Server
 * 
 * Tests UI performance under rapid update conditions:
 * - Single item: 60 updates/sec (verify 60fps)
 * - Many items: 50 items × 10 updates/sec each = 500 updates/sec total
 * - Large list: 1000 items with random updates
 * 
 * Uses SSE to flood the UI with updates and measures:
 * - Frame rate stability
 * - Layout jitter (via CSS containment)
 * - Memory usage
 * 
 * @example
 * node labs/dashboard-stress-test/server.js
 * # Opens http://localhost:3105
 */

const express = require('express');
const path = require('path');
const jsgui = require('jsgui3-html');
const { createDashboardControls, STYLES } = require('../../src/ui/controls/dashboard');

const app = express();
const PORT = 3105;

// Create controls
const { ProgressBar, ProgressCard, StatsGrid, StatusBadge } = createDashboardControls(jsgui);

// Active SSE clients
let sseClients = [];

// Test state
let testState = {
  mode: 'idle',  // 'idle' | 'single' | 'many' | 'large-list'
  running: false,
  intervalId: null,
  items: [],  // For many/large-list modes
  updateCount: 0,
  startTime: null
};

// === Test Generators ===

/**
 * Single item test: One progress bar updating at 60fps
 */
function startSingleItemTest() {
  if (testState.running) return;
  
  testState.mode = 'single';
  testState.running = true;
  testState.updateCount = 0;
  testState.startTime = Date.now();
  
  let progress = 0;
  const total = 1000;  // Will cycle
  
  testState.intervalId = setInterval(() => {
    progress = (progress + 1) % (total + 1);
    
    broadcast({
      type: 'single',
      value: {
        current: progress,
        total,
        status: 'running',
        message: `Processing item ${progress} of ${total}`,
        throughput: { value: 60, unit: 'updates/sec' }
      }
    });
    
    testState.updateCount++;
  }, 1000 / 60);  // 60fps
}

/**
 * Many items test: 50 items each updating at 10 updates/sec
 */
function startManyItemsTest() {
  if (testState.running) return;
  
  const itemCount = 50;
  const updatesPerSecPerItem = 10;
  
  testState.mode = 'many';
  testState.running = true;
  testState.updateCount = 0;
  testState.startTime = Date.now();
  testState.items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    current: 0,
    total: 100 + Math.floor(Math.random() * 100)  // 100-200 each
  }));
  
  // Broadcast all items initially
  broadcast({
    type: 'many-init',
    value: { items: testState.items }
  });
  
  // Update items in round-robin fashion
  let itemIndex = 0;
  testState.intervalId = setInterval(() => {
    // Update next item
    const item = testState.items[itemIndex];
    item.current = (item.current + 1) % (item.total + 1);
    
    broadcast({
      type: 'many-update',
      value: {
        id: item.id,
        current: item.current,
        total: item.total
      }
    });
    
    itemIndex = (itemIndex + 1) % itemCount;
    testState.updateCount++;
  }, 1000 / (itemCount * updatesPerSecPerItem));  // Distribute updates
}

/**
 * Large list test: 1000 items with random updates
 * Tests virtual scrolling / windowing
 */
function startLargeListTest() {
  if (testState.running) return;
  
  const itemCount = 1000;
  const updatesPerSec = 100;  // Random items
  
  testState.mode = 'large-list';
  testState.running = true;
  testState.updateCount = 0;
  testState.startTime = Date.now();
  testState.items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    status: 'pending',
    value: 0
  }));
  
  // Broadcast item count (client creates virtual list)
  broadcast({
    type: 'large-init',
    value: { itemCount, viewport: 20 }  // Only render 20 visible
  });
  
  // Random updates
  testState.intervalId = setInterval(() => {
    const randomIndex = Math.floor(Math.random() * itemCount);
    const item = testState.items[randomIndex];
    
    // Cycle through statuses
    const statuses = ['pending', 'running', 'complete', 'error'];
    const currentIdx = statuses.indexOf(item.status);
    item.status = statuses[(currentIdx + 1) % statuses.length];
    item.value = (item.value + 1) % 100;
    
    broadcast({
      type: 'large-update',
      value: {
        index: randomIndex,
        id: item.id,
        status: item.status,
        value: item.value
      }
    });
    
    testState.updateCount++;
  }, 1000 / updatesPerSec);
}

/**
 * Stop current test
 */
function stopTest() {
  if (!testState.running) return;
  
  if (testState.intervalId) {
    clearInterval(testState.intervalId);
    testState.intervalId = null;
  }
  
  const elapsed = Date.now() - testState.startTime;
  const actualRate = testState.updateCount / (elapsed / 1000);
  
  broadcast({
    type: 'test-complete',
    value: {
      mode: testState.mode,
      updateCount: testState.updateCount,
      elapsedMs: elapsed,
      actualRate: actualRate.toFixed(1)
    }
  });
  
  testState.running = false;
  testState.mode = 'idle';
}

/**
 * Broadcast to all SSE clients
 */
function broadcast(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(data);
    } catch (e) {
      // Client disconnected
    }
  });
}

// === Routes ===

app.use(express.static(path.join(__dirname, 'public')));

/**
 * Main page
 */
app.get('/', (req, res) => {
  const context = new jsgui.Page_Context();
  
  // Create demo controls
  const singleCard = new ProgressCard({
    context,
    title: '🎯 Single Item Test',
    variant: 'analysis',
    current: 0,
    total: 100,
    stats: [
      { id: 'rate', label: 'Updates/sec', value: '--' },
      { id: 'frames', label: 'Frames', value: 0 }
    ]
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📊 Dashboard Stress Test</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --text-primary: #e8e8e8;
      --text-secondary: #a0a0a0;
      --accent-primary: #00d4ff;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      padding: 2rem;
    }
    
    .header {
      max-width: 1200px;
      margin: 0 auto 2rem;
    }
    
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-secondary); }
    
    .controls {
      display: flex;
      gap: 1rem;
      margin: 1.5rem 0;
      flex-wrap: wrap;
    }
    
    button {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.2s;
    }
    
    button:hover:not(:disabled) { transform: translateY(-2px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .btn-primary { background: var(--accent-primary); color: var(--bg-primary); }
    .btn-warning { background: #ffcc00; color: var(--bg-primary); }
    .btn-danger { background: #ff4444; color: white; }
    .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
    
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
      padding: 1rem;
      background: var(--bg-secondary);
      border-radius: 12px;
    }
    
    .metric {
      text-align: center;
    }
    
    .metric-value {
      font-size: 2rem;
      font-weight: 600;
      color: var(--accent-primary);
      font-variant-numeric: tabular-nums;
    }
    
    .metric-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    
    .test-section {
      max-width: 1200px;
      margin: 0 auto 2rem;
    }
    
    .test-section h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: var(--accent-primary);
    }
    
    /* Many items grid */
    .many-items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 0.5rem;
      max-height: 400px;
      overflow-y: auto;
      padding: 1rem;
      background: var(--bg-secondary);
      border-radius: 12px;
    }
    
    .mini-card {
      padding: 0.5rem;
      background: #0f3460;
      border-radius: 8px;
      text-align: center;
      /* ANTI-JITTER */
      contain: layout style;
    }
    
    .mini-card__value {
      font-size: 1.25rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--accent-primary);
    }
    
    .mini-card__bar {
      height: 4px;
      background: #2a2a4a;
      border-radius: 2px;
      margin-top: 0.5rem;
      overflow: hidden;
    }
    
    .mini-card__fill {
      height: 100%;
      background: linear-gradient(90deg, #00d4ff, #00ff88);
      transform-origin: left center;
      will-change: transform;
      transition: transform 0.1s ease-out;
    }
    
    /* Large list with virtual scrolling hint */
    .large-list {
      height: 500px;
      overflow-y: auto;
      padding: 1rem;
      background: var(--bg-secondary);
      border-radius: 12px;
    }
    
    .list-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      margin-bottom: 0.25rem;
      background: #0f3460;
      border-radius: 6px;
      contain: layout style;
    }
    
    .list-item__status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    
    .list-item__status.pending { background: #2a2a4a; }
    .list-item__status.running { background: #00d4ff; }
    .list-item__status.complete { background: #00ff88; }
    .list-item__status.error { background: #ff4444; }
    
    .list-item__id {
      flex: 1;
      font-family: monospace;
      font-size: 0.85rem;
    }
    
    .list-item__value {
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
    }
    
    .connection-status {
      position: fixed;
      top: 1rem;
      right: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff4444;
    }
    
    .connection-dot.connected { background: #00ff88; }
    
    /* Dashboard controls CSS */
    ${STYLES}
  </style>
</head>
<body>
  <div class="connection-status">
    <span class="connection-dot" id="connection-dot"></span>
    <span id="connection-text">Disconnected</span>
  </div>

  <div class="header">
    <h1>📊 Dashboard Stress Test</h1>
    <p class="subtitle">Testing anti-jitter patterns under rapid update conditions</p>
    
    <div class="controls">
      <button class="btn-primary" id="btn-single" onclick="startTest('single')">
        🎯 Single (60fps)
      </button>
      <button class="btn-warning" id="btn-many" onclick="startTest('many')">
        📦 Many Items (500/sec)
      </button>
      <button class="btn-secondary" id="btn-large" onclick="startTest('large')">
        📋 Large List (1000 items)
      </button>
      <button class="btn-danger" id="btn-stop" onclick="stopTest()" disabled>
        ⏹️ Stop
      </button>
    </div>
    
    <div class="metrics">
      <div class="metric">
        <div class="metric-value" id="metric-updates">0</div>
        <div class="metric-label">Updates</div>
      </div>
      <div class="metric">
        <div class="metric-value" id="metric-rate">0</div>
        <div class="metric-label">Updates/sec</div>
      </div>
      <div class="metric">
        <div class="metric-value" id="metric-fps">--</div>
        <div class="metric-label">FPS</div>
      </div>
      <div class="metric">
        <div class="metric-value" id="metric-elapsed">0:00</div>
        <div class="metric-label">Elapsed</div>
      </div>
    </div>
  </div>

  <!-- Single item test -->
  <div class="test-section" id="section-single" style="display: none;">
    <h2>🎯 Single Item Test (60 updates/sec)</h2>
    <div id="single-card-container">
      ${singleCard.all_html_render()}
    </div>
  </div>

  <!-- Many items test -->
  <div class="test-section" id="section-many" style="display: none;">
    <h2>📦 Many Items Test (50 items × 10 updates/sec each)</h2>
    <div class="many-items-grid" id="many-items-grid"></div>
  </div>

  <!-- Large list test -->
  <div class="test-section" id="section-large" style="display: none;">
    <h2>📋 Large List Test (1000 items, random updates)</h2>
    <div class="large-list" id="large-list"></div>
  </div>

  <script>
    // === State ===
    let eventSource = null;
    let frameCount = 0;
    let lastFrameTime = 0;
    let fpsUpdateInterval = null;
    let updateCount = 0;
    let startTime = null;
    let currentMode = null;
    
    // DOM refs
    const els = {
      connectionDot: document.getElementById('connection-dot'),
      connectionText: document.getElementById('connection-text'),
      metricUpdates: document.getElementById('metric-updates'),
      metricRate: document.getElementById('metric-rate'),
      metricFps: document.getElementById('metric-fps'),
      metricElapsed: document.getElementById('metric-elapsed'),
      btnStop: document.getElementById('btn-stop'),
      sectionSingle: document.getElementById('section-single'),
      sectionMany: document.getElementById('section-many'),
      sectionLarge: document.getElementById('section-large'),
      manyItemsGrid: document.getElementById('many-items-grid'),
      largeList: document.getElementById('large-list')
    };
    
    // === FPS Counter ===
    function measureFps() {
      frameCount++;
      requestAnimationFrame(measureFps);
    }
    
    function updateFpsDisplay() {
      const now = performance.now();
      if (lastFrameTime > 0) {
        const elapsed = (now - lastFrameTime) / 1000;
        const fps = Math.round(frameCount / elapsed);
        els.metricFps.textContent = fps;
        frameCount = 0;
      }
      lastFrameTime = now;
    }
    
    // Start FPS measurement
    requestAnimationFrame(measureFps);
    fpsUpdateInterval = setInterval(updateFpsDisplay, 1000);
    
    // === Connection ===
    function connect() {
      if (eventSource) eventSource.close();
      
      eventSource = new EventSource('/sse/test');
      
      eventSource.onopen = () => {
        els.connectionDot.classList.add('connected');
        els.connectionText.textContent = 'Connected';
      };
      
      eventSource.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleMessage(msg);
        } catch (err) {}
      };
      
      eventSource.onerror = () => {
        els.connectionDot.classList.remove('connected');
        els.connectionText.textContent = 'Reconnecting...';
        eventSource.close();
        eventSource = null;
        setTimeout(connect, 2000);
      };
    }
    
    // === Message Handling ===
    function handleMessage(msg) {
      const { type, value } = msg;
      
      // Track updates
      updateCount++;
      els.metricUpdates.textContent = updateCount.toLocaleString();
      
      if (startTime) {
        const elapsed = (Date.now() - startTime) / 1000;
        els.metricRate.textContent = (updateCount / elapsed).toFixed(1);
        
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        els.metricElapsed.textContent = mins + ':' + String(secs).padStart(2, '0');
      }
      
      switch (type) {
        case 'single':
          updateSingleCard(value);
          break;
        case 'many-init':
          initManyItems(value.items);
          break;
        case 'many-update':
          updateManyItem(value);
          break;
        case 'large-init':
          initLargeList(value);
          break;
        case 'large-update':
          updateLargeItem(value);
          break;
        case 'test-complete':
          handleTestComplete(value);
          break;
      }
    }
    
    // === Single Item ===
    function updateSingleCard(value) {
      const card = document.querySelector('.dcard');
      if (!card) return;
      
      // Update progress bar
      const fill = card.querySelector('.dprogress__fill');
      const text = card.querySelector('.dprogress__text');
      if (fill) {
        const pct = value.total > 0 ? (value.current / value.total) : 0;
        fill.style.transform = 'scaleX(' + pct + ')';
      }
      if (text) {
        const pct = value.total > 0 ? Math.round((value.current / value.total) * 100) : 0;
        text.textContent = pct + '%';
      }
      
      // Update message
      const msg = card.querySelector('.dcard__message');
      if (msg) msg.textContent = value.message || '';
      
      // Update stats
      const stats = card.querySelectorAll('.dstats__value');
      if (stats[0] && value.throughput) {
        stats[0].textContent = value.throughput.value + ' ' + value.throughput.unit;
      }
      if (stats[1]) {
        stats[1].textContent = updateCount;
      }
    }
    
    // === Many Items ===
    function initManyItems(items) {
      els.manyItemsGrid.innerHTML = items.map(item => 
        '<div class="mini-card" data-id="' + item.id + '">' +
          '<div class="mini-card__value">0%</div>' +
          '<div class="mini-card__bar"><div class="mini-card__fill" style="transform: scaleX(0)"></div></div>' +
        '</div>'
      ).join('');
    }
    
    function updateManyItem(value) {
      const card = els.manyItemsGrid.querySelector('[data-id="' + value.id + '"]');
      if (!card) return;
      
      const pct = value.total > 0 ? (value.current / value.total) : 0;
      const pctText = Math.round(pct * 100);
      
      card.querySelector('.mini-card__value').textContent = pctText + '%';
      card.querySelector('.mini-card__fill').style.transform = 'scaleX(' + pct + ')';
    }
    
    // === Large List ===
    let largeListItems = [];
    let viewport = 20;
    let scrollTop = 0;
    
    function initLargeList(value) {
      largeListItems = Array.from({ length: value.itemCount }, (_, i) => ({
        id: 'item-' + i,
        status: 'pending',
        value: 0
      }));
      viewport = value.viewport || 20;
      renderVisibleItems();
      
      // Listen for scroll to update visible items
      els.largeList.addEventListener('scroll', () => {
        scrollTop = els.largeList.scrollTop;
        renderVisibleItems();
      });
    }
    
    function updateLargeItem(value) {
      if (largeListItems[value.index]) {
        largeListItems[value.index].status = value.status;
        largeListItems[value.index].value = value.value;
        
        // Only re-render if visible
        const itemHeight = 40;
        const startIdx = Math.floor(scrollTop / itemHeight);
        const endIdx = Math.min(startIdx + viewport + 5, largeListItems.length);
        
        if (value.index >= startIdx && value.index < endIdx) {
          renderVisibleItems();
        }
      }
    }
    
    function renderVisibleItems() {
      const itemHeight = 40;
      const startIdx = Math.floor(scrollTop / itemHeight);
      const endIdx = Math.min(startIdx + viewport + 5, largeListItems.length);
      
      // Create spacer for virtual scrolling
      const topSpacer = startIdx * itemHeight;
      const bottomSpacer = (largeListItems.length - endIdx) * itemHeight;
      
      let html = '<div style="height: ' + topSpacer + 'px"></div>';
      
      for (let i = startIdx; i < endIdx; i++) {
        const item = largeListItems[i];
        html += '<div class="list-item">' +
          '<div class="list-item__status ' + item.status + '"></div>' +
          '<div class="list-item__id">' + item.id + '</div>' +
          '<div class="list-item__value">' + item.value + '%</div>' +
        '</div>';
      }
      
      html += '<div style="height: ' + bottomSpacer + 'px"></div>';
      
      els.largeList.innerHTML = html;
    }
    
    // === Test Control ===
    async function startTest(mode) {
      // Reset
      updateCount = 0;
      startTime = Date.now();
      currentMode = mode;
      
      // Hide all sections, show relevant one
      els.sectionSingle.style.display = mode === 'single' ? 'block' : 'none';
      els.sectionMany.style.display = mode === 'many' ? 'block' : 'none';
      els.sectionLarge.style.display = mode === 'large' ? 'block' : 'none';
      
      els.btnStop.disabled = false;
      
      await fetch('/api/start/' + mode, { method: 'POST' });
    }
    
    async function stopTest() {
      els.btnStop.disabled = true;
      await fetch('/api/stop', { method: 'POST' });
    }
    
    function handleTestComplete(value) {
      console.log('Test complete:', value);
      els.btnStop.disabled = true;
      startTime = null;
    }
    
    // === Init ===
    connect();
  </script>
</body>
</html>`;

  res.send(html);
});

/**
 * SSE endpoint
 */
app.get('/sse/test', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

/**
 * Start test endpoints
 */
app.post('/api/start/single', (req, res) => {
  stopTest();  // Stop any running test
  startSingleItemTest();
  res.json({ started: true, mode: 'single' });
});

app.post('/api/start/many', (req, res) => {
  stopTest();
  startManyItemsTest();
  res.json({ started: true, mode: 'many' });
});

app.post('/api/start/large', (req, res) => {
  stopTest();
  startLargeListTest();
  res.json({ started: true, mode: 'large-list' });
});

app.post('/api/stop', (req, res) => {
  stopTest();
  res.json({ stopped: true });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    testMode: testState.mode,
    running: testState.running,
    updateCount: testState.updateCount,
    clients: sseClients.length
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Dashboard Stress Test] Server running at http://localhost:${PORT}`);
  console.log(`\nTests available:`);
  console.log(`  🎯 Single Item - 60 updates/sec (verify 60fps)`);
  console.log(`  📦 Many Items  - 50 items × 10/sec = 500 updates/sec`);
  console.log(`  📋 Large List  - 1000 items with virtual scrolling`);
});
