/**
 * jsgui3 SSR Progress Lab - Demo Server
 * 
 * Demonstrates server-side rendering with client-side activation.
 * Shows progress UI with SSE updates and polling fallback.
 */
'use strict';

const express = require('express');
const path = require('path');
const jsgui = require('jsgui3-html');
const { ProgressBarControl, ProgressWrapperControl } = require('./controls');

const PORT = 3101;

/**
 * Create the demo server
 */
function createServer() {
  const app = express();
  
  // SSE clients
  const sseClients = new Set();
  
  // Demo state
  let demoState = {
    phase: 'idle',
    processed: 0,
    total: 100,
    updated: 0,
    recordsPerSecond: 0,
    etaMs: null,
    currentUrl: null
  };
  let demoInterval = null;

  // Serve static files
  app.use('/public', express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  /**
   * Main page - SSR with jsgui3
   */
  app.get('/', (req, res) => {
    const context = new jsgui.Page_Context();
    
    // Create the progress wrapper
    const wrapper = new ProgressWrapperControl({
      context,
      title: 'Demo Analysis',
      description: 'This demonstrates jsgui3 SSR with client-side activation for progress display.',
      progressSource: '/sse/progress',
      pollFallback: '/api/state',
      showEta: true,
      showThroughput: true,
      showCurrentItem: true,
      size: 'large'
    });

    const html = renderPage(context, wrapper, 'jsgui3 SSR Progress Demo');
    res.type('html').send(html);
  });

  /**
   * Minimal example - just progress bar
   */
  app.get('/minimal', (req, res) => {
    const context = new jsgui.Page_Context();
    
    const bar = new ProgressBarControl({
      context,
      current: 42,
      total: 100,
      label: 'Processing...',
      size: 'large',
      showCounts: true
    });

    const html = renderPage(context, bar, 'Minimal Progress Bar');
    res.type('html').send(html);
  });

  /**
   * SSE endpoint
   */
  app.get('/sse/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial state
    res.write(`data: ${JSON.stringify({ type: 'next', value: demoState })}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  /**
   * Polling endpoint
   */
  app.get('/api/state', (req, res) => {
    res.json({ state: demoState });
  });

  /**
   * Start demo
   */
  app.post('/api/start', (req, res) => {
    if (demoInterval) {
      return res.status(409).json({ error: 'Already running' });
    }

    const total = req.body?.total || 100;
    const intervalMs = req.body?.intervalMs || 100;

    demoState = {
      phase: 'running',
      processed: 0,
      total,
      updated: 0,
      recordsPerSecond: 0,
      etaMs: null,
      currentUrl: null
    };

    let lastTime = Date.now();
    let lastProcessed = 0;

    demoInterval = setInterval(() => {
      if (demoState.processed >= demoState.total) {
        clearInterval(demoInterval);
        demoInterval = null;
        demoState.phase = 'complete';
        broadcast({ type: 'complete', value: { processed: demoState.processed } });
        return;
      }

      // Simulate variable progress
      const increment = Math.floor(Math.random() * 3) + 1;
      demoState.processed = Math.min(demoState.processed + increment, demoState.total);
      demoState.updated = demoState.processed;

      // Calculate throughput
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 1) {
        demoState.recordsPerSecond = (demoState.processed - lastProcessed) / elapsed;
        lastProcessed = demoState.processed;
        lastTime = now;
      }

      // Calculate ETA
      if (demoState.recordsPerSecond > 0) {
        const remaining = demoState.total - demoState.processed;
        demoState.etaMs = (remaining / demoState.recordsPerSecond) * 1000;
      }

      // Simulate current URL
      demoState.currentUrl = `https://example.com/article/${demoState.processed}`;

      broadcast({ type: 'next', value: demoState });
    }, intervalMs);

    res.json({ status: 'started', total });
  });

  /**
   * Stop demo
   */
  app.post('/api/stop', (req, res) => {
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
    demoState.phase = 'idle';
    broadcast({ type: 'next', value: demoState });
    res.json({ status: 'stopped' });
  });

  /**
   * Reset demo
   */
  app.post('/api/reset', (req, res) => {
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
    demoState = {
      phase: 'idle',
      processed: 0,
      total: 100,
      updated: 0,
      recordsPerSecond: 0,
      etaMs: null,
      currentUrl: null
    };
    broadcast({ type: 'next', value: demoState });
    res.json({ status: 'reset' });
  });

  /**
   * Broadcast to SSE clients
   */
  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of sseClients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (e) {
        sseClients.delete(client);
      }
    }
  }

  /**
   * Render full HTML page
   */
  function renderPage(context, mainControl, title) {
    const css = `
      ${ProgressBarControl.CSS}
      ${ProgressWrapperControl.CSS}
      
      :root {
        --bg-primary: #1a1a2e;
        --bg-secondary: #16213e;
        --text-primary: #e8e8e8;
        --text-secondary: #a0a0a0;
        --accent-primary: #00d4ff;
      }
      
      * { box-sizing: border-box; margin: 0; padding: 0; }
      
      body {
        font-family: 'Segoe UI', system-ui, sans-serif;
        background: var(--bg-primary);
        color: var(--text-primary);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2rem;
      }
      
      h1 {
        font-size: 1.5rem;
        font-weight: 500;
        margin-bottom: 2rem;
        color: var(--accent-primary);
      }
      
      .container {
        width: 100%;
        max-width: 700px;
      }
      
      .controls {
        margin-top: 1.5rem;
        display: flex;
        gap: 1rem;
        justify-content: center;
      }
      
      button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
      }
      
      button:hover { transform: translateY(-1px); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      
      .btn-primary { background: var(--accent-primary); color: #1a1a2e; }
      .btn-danger { background: #ff4444; color: white; }
      .btn-secondary { background: #2a2a4a; color: var(--text-primary); }
    `;

    const clientScript = `
      (function() {
        // Activate jsgui3 controls
        const controls = {};
        
        // Find and activate progress wrapper
        const wrapperEl = document.querySelector('[data-jsgui-control="progress-wrapper"]');
        if (wrapperEl) {
          // Create mock context for client-side
          const context = { page: {} };
          
          // Import the control activation logic
          const progressSource = wrapperEl.getAttribute('data-progress-source');
          const pollFallback = wrapperEl.getAttribute('data-poll-fallback');
          const pollInterval = parseInt(wrapperEl.getAttribute('data-poll-interval') || '2000', 10);
          
          // Find child elements
          const statusEl = wrapperEl.querySelector('[data-status]');
          const throughputEl = wrapperEl.querySelector('[data-stat="throughput"]');
          const etaEl = wrapperEl.querySelector('[data-stat="eta"]');
          const currentItemEl = wrapperEl.querySelector('[data-current-item]');
          const warningEl = wrapperEl.querySelector('[data-warning]');
          const fillEl = wrapperEl.querySelector('[data-fill]');
          const textEl = wrapperEl.querySelector('[data-text]');
          
          let eventSource = null;
          let pollTimer = null;
          
          function formatDuration(ms) {
            const totalSeconds = Math.round(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return minutes + ':' + String(seconds).padStart(2, '0');
          }
          
          function updateUI(state) {
            // Update progress bar
            const pct = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;
            if (fillEl) fillEl.style.width = pct + '%';
            if (textEl) textEl.textContent = state.processed.toLocaleString() + ' / ' + state.total.toLocaleString();
            
            // Update status
            if (statusEl) {
              const statusMap = {
                idle: ['Idle', 'status--idle'],
                running: ['Running', 'status--running'],
                complete: ['Complete', 'status--complete'],
                error: ['Error', 'status--error']
              };
              const s = statusMap[state.phase] || statusMap.idle;
              statusEl.textContent = s[0];
              statusEl.className = 'progress-wrapper__status ' + s[1];
            }
            
            // Update stats
            if (throughputEl && state.recordsPerSecond !== undefined) {
              throughputEl.textContent = state.recordsPerSecond.toFixed(1) + ' rec/s';
            }
            if (etaEl) {
              etaEl.textContent = state.etaMs ? 'ETA: ' + formatDuration(state.etaMs) : 'ETA: --';
            }
            
            // Update current item
            if (currentItemEl && state.currentUrl) {
              currentItemEl.textContent = state.currentUrl;
            }
            
            // Update warnings
            if (warningEl) {
              if (state.warnings && state.warnings.length > 0) {
                warningEl.textContent = '⚠️ ' + state.warnings[0].message;
                warningEl.style.display = 'block';
              } else {
                warningEl.style.display = 'none';
              }
            }
          }
          
          function connectSSE() {
            eventSource = new EventSource(progressSource);
            
            eventSource.onmessage = function(event) {
              try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'next' && msg.value) {
                  updateUI(msg.value);
                } else if (msg.type === 'complete') {
                  updateUI({ phase: 'complete', processed: msg.value?.processed || 0, total: msg.value?.processed || 0 });
                }
              } catch (e) {
                console.warn('Failed to parse SSE:', e);
              }
            };
            
            eventSource.onerror = function() {
              if (pollFallback && !pollTimer) {
                eventSource.close();
                startPolling();
              }
            };
          }
          
          function startPolling() {
            async function poll() {
              try {
                const res = await fetch(pollFallback);
                if (res.ok) {
                  const data = await res.json();
                  if (data.state) updateUI(data.state);
                }
              } catch (e) {}
            }
            poll();
            pollTimer = setInterval(poll, pollInterval);
          }
          
          // Connect
          if (progressSource) {
            connectSSE();
          } else if (pollFallback) {
            startPolling();
          }
        }
        
        // Control buttons
        document.getElementById('btn-start')?.addEventListener('click', async function() {
          await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ total: 100, intervalMs: 50 }) });
        });
        
        document.getElementById('btn-stop')?.addEventListener('click', async function() {
          await fetch('/api/stop', { method: 'POST' });
        });
        
        document.getElementById('btn-reset')?.addEventListener('click', async function() {
          await fetch('/api/reset', { method: 'POST' });
        });
      })();
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="container">
    ${mainControl.all_html_render()}
    
    <div class="controls">
      <button class="btn-primary" id="btn-start">Start Demo</button>
      <button class="btn-danger" id="btn-stop">Stop</button>
      <button class="btn-secondary" id="btn-reset">Reset</button>
    </div>
  </div>
  <script>${clientScript}</script>
</body>
</html>`;
  }

  return app;
}

// Run standalone
if (require.main === module) {
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[jsgui3-ssr-progress] Server running at http://localhost:${PORT}`);
    console.log('  /         - Full progress wrapper demo');
    console.log('  /minimal  - Minimal progress bar');
  });
}

module.exports = { createServer };
