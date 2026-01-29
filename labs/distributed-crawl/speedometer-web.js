#!/usr/bin/env node
/**
 * Distributed Crawl Speedometer - Web App
 * 
 * Real-time visualization of distributed crawl performance in the browser.
 * Shows speedometer gauge, stats, and history chart.
 * 
 * Usage:
 *   node speedometer-web.js [--port 3098]
 *   Open browser to http://localhost:3098
 */

const express = require('express');
const Database = require('better-sqlite3');

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3098', 10);
const REMOTE_WORKER = 'http://144.21.42.149:8081';
const db = new Database('data/news.db');

const app = express();
app.use(express.json());

// SSE clients
const clients = new Set();

// Crawl state
let crawlActive = false;
let crawlAbort = null;
let stats = {
  urlsProcessed: 0,
  ok: 0,
  errors: 0,
  bytesReceived: 0,
  startTime: null,
  currentSpeed: 0,
  peakSpeed: 0,
  history: [],
};

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => client.write(msg));
}

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
  
  // Send current state
  res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  res.write(`event: status\ndata: ${JSON.stringify({ active: crawlActive })}\n\n`);
});

// Get unfetched URLs
function getUnfetchedUrls(limit = 50) {
  return db.prepare(`
    SELECT u.id, u.url, u.host 
    FROM urls u 
    WHERE u.id NOT IN (SELECT url_id FROM http_responses WHERE url_id IS NOT NULL)
    ORDER BY RANDOM() LIMIT ?
  `).all(limit);
}

// Start crawl
app.post('/start', async (req, res) => {
  if (crawlActive) {
    return res.json({ error: 'Crawl already active' });
  }
  
  crawlActive = true;
  crawlAbort = new AbortController();
  stats = {
    urlsProcessed: 0,
    ok: 0,
    errors: 0,
    bytesReceived: 0,
    startTime: Date.now(),
    currentSpeed: 0,
    peakSpeed: 0,
    history: [],
  };
  
  broadcast('status', { active: true });
  res.json({ ok: true, message: 'Crawl started' });
  
  // Run crawl in background
  runCrawl().catch(err => {
    console.error('Crawl error:', err.message);
    crawlActive = false;
    broadcast('status', { active: false, error: err.message });
  });
});

async function runCrawl() {
  const batchSize = 50;
  const concurrency = 20;
  
  while (crawlActive && !crawlAbort?.signal.aborted) {
    const urls = getUnfetchedUrls(batchSize);
    if (urls.length === 0) {
      console.log('No more unfetched URLs');
      break;
    }
    
    const batchStart = Date.now();
    
    try {
      const payload = {
        requests: urls.map(u => ({ url: u.url, method: 'HEAD', urlId: u.id })),
        maxConcurrency: concurrency,
        batchSize,
        timeoutMs: 30000,
      };
      
      const resp = await fetch(`${REMOTE_WORKER}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: crawlAbort?.signal,
      });
      
      const result = await resp.json();
      const batchTime = Date.now() - batchStart;
      
      // Update stats
      stats.urlsProcessed += urls.length;
      stats.ok += result.summary?.ok || 0;
      stats.errors += result.summary?.errors || 0;
      stats.currentSpeed = urls.length / (batchTime / 1000);
      stats.peakSpeed = Math.max(stats.peakSpeed, stats.currentSpeed);
      
      // Track history (last 60 points)
      const elapsed = (Date.now() - stats.startTime) / 1000;
      stats.history.push({
        time: elapsed,
        speed: stats.currentSpeed,
        total: stats.urlsProcessed,
      });
      if (stats.history.length > 60) stats.history.shift();
      
      broadcast('stats', stats);
      console.log(`Batch: ${urls.length} URLs in ${batchTime}ms (${stats.currentSpeed.toFixed(1)} URLs/sec)`);
      
    } catch (err) {
      if (err.name === 'AbortError') break;
      console.error('Batch error:', err.message);
      stats.errors += urls.length;
      broadcast('stats', stats);
    }
  }
  
  crawlActive = false;
  broadcast('status', { active: false });
  console.log(`Crawl complete: ${stats.urlsProcessed} URLs, ${stats.ok} OK, ${stats.errors} errors`);
}

// Stop crawl
app.post('/stop', (req, res) => {
  if (crawlAbort) {
    crawlAbort.abort();
    crawlAbort = null;
  }
  crawlActive = false;
  broadcast('status', { active: false });
  res.json({ ok: true });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  res.json(stats);
});

// Queue info
app.get('/queue', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM urls').get().count;
  const fetched = db.prepare('SELECT COUNT(*) as count FROM http_responses').get().count;
  res.json({ total, fetched, unfetched: total - fetched });
});

// Serve dashboard HTML
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Distributed Crawl Speedometer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: system-ui, -apple-system, sans-serif; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      text-align: center; 
      margin-bottom: 30px;
      font-size: 2em;
      background: linear-gradient(90deg, #00d9ff, #00ff88);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    /* Speedometer */
    .speedometer {
      width: 300px;
      height: 200px;
      margin: 0 auto 30px;
      position: relative;
    }
    .gauge-bg {
      stroke: #333;
      fill: none;
      stroke-width: 20;
    }
    .gauge-fill {
      fill: none;
      stroke-width: 20;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s ease;
    }
    .gauge-value {
      font-size: 48px;
      font-weight: bold;
      fill: #00ff88;
    }
    .gauge-label {
      font-size: 14px;
      fill: #888;
    }
    
    /* Stats cards */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #00ff88;
    }
    .stat-label {
      font-size: 0.9em;
      color: #888;
      margin-top: 5px;
    }
    .stat-card.errors .stat-value { color: #ff6b6b; }
    .stat-card.speed .stat-value { color: #00d9ff; }
    
    /* Controls */
    .controls {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-bottom: 30px;
    }
    button {
      padding: 12px 30px;
      font-size: 1.1em;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: bold;
    }
    .btn-start {
      background: linear-gradient(135deg, #00ff88, #00d9ff);
      color: #000;
    }
    .btn-start:hover { transform: scale(1.05); }
    .btn-start:disabled { 
      background: #444; 
      color: #888;
      cursor: not-allowed;
      transform: none;
    }
    .btn-stop {
      background: linear-gradient(135deg, #ff6b6b, #ff8e53);
      color: #fff;
    }
    .btn-stop:disabled { 
      background: #444; 
      color: #888;
      cursor: not-allowed;
    }
    
    /* Chart */
    .chart-container {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px;
    }
    .chart-title {
      text-align: center;
      margin-bottom: 15px;
      color: #888;
    }
    #chart {
      width: 100%;
      height: 200px;
    }
    
    /* Status indicator */
    .status {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.9em;
    }
    .status.active {
      background: rgba(0,255,136,0.2);
      color: #00ff88;
      animation: pulse 2s infinite;
    }
    .status.idle {
      background: rgba(136,136,136,0.2);
      color: #888;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    
    /* Queue info */
    .queue-info {
      text-align: center;
      color: #888;
      font-size: 0.9em;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Distributed Crawl Speedometer</h1>
    
    <div class="status idle" id="status">● Idle</div>
    
    <div class="speedometer">
      <svg viewBox="0 0 200 120" width="100%">
        <path class="gauge-bg" d="M 20 100 A 80 80 0 0 1 180 100"></path>
        <path class="gauge-fill" id="gaugeFill" d="M 20 100 A 80 80 0 0 1 180 100" 
              stroke="url(#gradient)" stroke-dasharray="251" stroke-dashoffset="251"></path>
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#00ff88"/>
            <stop offset="100%" stop-color="#00d9ff"/>
          </linearGradient>
        </defs>
        <text x="100" y="85" class="gauge-value" text-anchor="middle" id="speedValue">0</text>
        <text x="100" y="105" class="gauge-label" text-anchor="middle">URLs/sec</text>
      </svg>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value" id="urlsProcessed">0</div>
        <div class="stat-label">URLs Processed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="okCount">0</div>
        <div class="stat-label">Success</div>
      </div>
      <div class="stat-card errors">
        <div class="stat-value" id="errorCount">0</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card speed">
        <div class="stat-value" id="peakSpeed">0</div>
        <div class="stat-label">Peak URLs/sec</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="elapsed">0:00</div>
        <div class="stat-label">Elapsed</div>
      </div>
    </div>
    
    <div class="controls">
      <button class="btn-start" id="startBtn" onclick="startCrawl()">▶ Start Crawl</button>
      <button class="btn-stop" id="stopBtn" onclick="stopCrawl()" disabled>◼ Stop</button>
    </div>
    
    <div class="chart-container">
      <div class="chart-title">Throughput History</div>
      <canvas id="chart"></canvas>
    </div>
    
    <div class="queue-info" id="queueInfo">Loading queue info...</div>
  </div>
  
  <script>
    const gaugeFill = document.getElementById('gaugeFill');
    const speedValue = document.getElementById('speedValue');
    const urlsProcessed = document.getElementById('urlsProcessed');
    const okCount = document.getElementById('okCount');
    const errorCount = document.getElementById('errorCount');
    const peakSpeed = document.getElementById('peakSpeed');
    const elapsed = document.getElementById('elapsed');
    const status = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const queueInfo = document.getElementById('queueInfo');
    const chart = document.getElementById('chart');
    const ctx = chart.getContext('2d');
    
    let history = [];
    const maxSpeed = 50; // Max for gauge
    const arcLength = 251; // Path length
    
    function updateGauge(speed) {
      const pct = Math.min(speed / maxSpeed, 1);
      const offset = arcLength * (1 - pct);
      gaugeFill.style.strokeDashoffset = offset;
      speedValue.textContent = speed.toFixed(1);
    }
    
    function formatTime(ms) {
      const secs = Math.floor(ms / 1000);
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      return mins + ':' + s.toString().padStart(2, '0');
    }
    
    function updateStats(stats) {
      updateGauge(stats.currentSpeed || 0);
      urlsProcessed.textContent = stats.urlsProcessed || 0;
      okCount.textContent = stats.ok || 0;
      errorCount.textContent = stats.errors || 0;
      peakSpeed.textContent = (stats.peakSpeed || 0).toFixed(1);
      if (stats.startTime) {
        elapsed.textContent = formatTime(Date.now() - stats.startTime);
      }
      if (stats.history) {
        history = stats.history;
        drawChart();
      }
    }
    
    function updateStatus(active) {
      status.className = 'status ' + (active ? 'active' : 'idle');
      status.textContent = active ? '● Crawling...' : '● Idle';
      startBtn.disabled = active;
      stopBtn.disabled = !active;
    }
    
    function drawChart() {
      const w = chart.width = chart.offsetWidth * 2;
      const h = chart.height = chart.offsetHeight * 2;
      ctx.scale(2, 2);
      
      ctx.clearRect(0, 0, w/2, h/2);
      
      if (history.length < 2) return;
      
      const maxY = Math.max(...history.map(h => h.speed), 10);
      const minX = history[0].time;
      const maxX = history[history.length - 1].time;
      const rangeX = maxX - minX || 1;
      
      // Draw grid
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = (h/2) * (i / 5);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w/2, y);
        ctx.stroke();
      }
      
      // Draw line
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((pt, i) => {
        const x = ((pt.time - minX) / rangeX) * (w/2);
        const y = (h/2) - (pt.speed / maxY) * (h/2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      
      // Fill area
      ctx.fillStyle = 'rgba(0,255,136,0.1)';
      ctx.lineTo((w/2), (h/2));
      ctx.lineTo(0, (h/2));
      ctx.fill();
    }
    
    async function startCrawl() {
      await fetch('/start', { method: 'POST' });
    }
    
    async function stopCrawl() {
      await fetch('/stop', { method: 'POST' });
    }
    
    async function loadQueueInfo() {
      const resp = await fetch('/queue');
      const q = await resp.json();
      queueInfo.textContent = 
        'Queue: ' + q.unfetched.toLocaleString() + ' unfetched / ' + 
        q.total.toLocaleString() + ' total';
    }
    
    // SSE connection
    const eventSource = new EventSource('/events');
    eventSource.addEventListener('stats', (e) => updateStats(JSON.parse(e.data)));
    eventSource.addEventListener('status', (e) => updateStatus(JSON.parse(e.data).active));
    eventSource.onerror = () => console.log('SSE connection lost');
    
    loadQueueInfo();
    setInterval(loadQueueInfo, 30000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Distributed Crawl Speedometer`);
  console.log(`   Open in browser: http://localhost:${PORT}\n`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  db.close();
  process.exit(0);
});
