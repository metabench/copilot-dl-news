/**
 * Demo server for jsgui3-idiomatic-progress lab
 * 
 * Demonstrates:
 * - SSR with idiomatic jsgui3 controls
 * - SSE endpoint for real-time progress
 * - Polling endpoint as fallback
 * - Simulated progress with warnings
 */
'use strict';

const express = require('express');
const jsgui = require('jsgui3-html');
const { 
  ProgressBarEl, 
  ProgressDisplayControl, 
  ProgressConnectorControl 
} = require('./controls');

const app = express();
const PORT = 3102;

// Simulation state
let simulationState = null;
let sseClients = [];

/**
 * Collect CSS from all controls
 */
function collectCSS() {
  return [
    ProgressBarEl.CSS,
    ProgressDisplayControl.CSS,
    ProgressConnectorControl.CSS
  ].filter(Boolean).join('\n\n');
}

/**
 * Create page context
 */
function createContext() {
  return new jsgui.Page_Context();
}

/**
 * Start a simulated progress run
 */
function startSimulation() {
  if (simulationState) return;  // Already running
  
  const total = 100;
  simulationState = {
    phase: 'running',
    processed: 0,
    total,
    currentUrl: 'Starting...',
    recordsPerSecond: 0,
    etaMs: null,
    warnings: [],
    startTime: Date.now()
  };

  const interval = setInterval(() => {
    simulationState.processed += 1;
    simulationState.currentUrl = `https://example.com/page/${simulationState.processed}`;
    
    const elapsed = Date.now() - simulationState.startTime;
    simulationState.recordsPerSecond = simulationState.processed / (elapsed / 1000);
    
    const remaining = total - simulationState.processed;
    simulationState.etaMs = remaining > 0 
      ? (remaining / simulationState.recordsPerSecond) * 1000 
      : 0;

    // Add/remove warnings to test smooth transitions
    // Warnings display for ~10 steps (2 seconds at 200ms/step) for readability
    if (simulationState.processed === 20) {
      simulationState.warnings = [{ message: 'Rate limited by example.com - backing off', level: 'warn' }];
    } else if (simulationState.processed === 35) {
      simulationState.warnings = [];  // Clear warning after ~15 steps (3 seconds)
    } else if (simulationState.processed === 55) {
      simulationState.warnings = [{ message: 'Slow response from server (>2s latency)', level: 'warn' }];
    } else if (simulationState.processed === 75) {
      simulationState.warnings = [];  // Clear warning after ~20 steps (4 seconds)
    }

    // Broadcast to SSE clients
    broadcastProgress();

    if (simulationState.processed >= total) {
      simulationState.phase = 'complete';
      broadcastComplete();
      clearInterval(interval);
      simulationState = null;
    }
  }, 200);  // Fast updates to test debouncing

  return simulationState;
}

/**
 * Broadcast progress to all SSE clients
 */
function broadcastProgress() {
  const msg = JSON.stringify({ type: 'next', value: simulationState });
  sseClients.forEach(client => {
    client.write(`data: ${msg}\n\n`);
  });
}

/**
 * Broadcast completion to all SSE clients
 */
function broadcastComplete() {
  const msg = JSON.stringify({ type: 'complete', value: { summary: 'Done!' } });
  sseClients.forEach(client => {
    client.write(`data: ${msg}\n\n`);
  });
}

// === Routes ===

/**
 * Main page - Full demo with connector control
 */
app.get('/', (req, res) => {
  const context = createContext();
  
  // Create connector with SSE source
  const connector = new ProgressConnectorControl({
    context,
    sseUrl: '/sse/progress',
    pollUrl: '/api/state',
    autoConnect: true,
    title: 'Idiomatic Progress Demo',
    description: 'Demonstrates smooth CSS transitions and RAF debouncing'
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>jsgui3 Idiomatic Progress Lab</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem;
      min-height: 100vh;
      background: #1a1a2e;
      color: #e8e8e8;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .page-header {
      max-width: 800px;
      margin: 0 auto 2rem;
    }
    h1 { margin: 0 0 0.5rem; }
    .subtitle { color: #a0a0a0; margin: 0; }
    .demo-container {
      max-width: 800px;
      margin: 0 auto;
    }
    .controls {
      margin-top: 1rem;
      display: flex;
      gap: 1rem;
    }
    button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      background: #00d4ff;
      color: #1a1a2e;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #00b8e0; }
    button:disabled { background: #2a2a4a; color: #666; cursor: not-allowed; }
    
    /* Lab CSS */
    ${collectCSS()}
  </style>
</head>
<body>
  <div class="page-header">
    <h1>🧪 jsgui3 Idiomatic Progress Lab</h1>
    <p class="subtitle">Testing smooth transitions, RAF debouncing, and state-driven updates</p>
  </div>
  
  <div class="demo-container">
    ${connector.all_html_render()}
    
    <div class="controls">
      <button id="start-btn" onclick="startDemo()">Start Simulation</button>
      <button id="reset-btn" onclick="resetDemo()">Reset</button>
    </div>
  </div>
  
  <script>
    // Client-side activation
    (function() {
      const controlEl = document.querySelector('[data-jsgui-control="progress-connector"]');
      if (!controlEl) return;
      
      // Simple activation - just connect SSE
      const sseUrl = controlEl.getAttribute('data-sse-url');
      const pollUrl = controlEl.getAttribute('data-poll-url');
      
      // DOM references
      const displayEl = controlEl.querySelector('.pdisplay');
      const barFill = controlEl.querySelector('.pbar__fill');
      const barText = controlEl.querySelector('.pbar__text');
      const statusEl = controlEl.querySelector('.pdisplay__status');
      const statsEls = controlEl.querySelectorAll('.pdisplay__stat');
      const messageEl = controlEl.querySelector('.pdisplay__message');
      const warningEl = controlEl.querySelector('.pdisplay__warning');
      
      let eventSource = null;
      let pollTimer = null;
      let pendingFrame = null;
      
      // Debounced update
      function scheduleUpdate(state) {
        if (pendingFrame) return;
        pendingFrame = requestAnimationFrame(() => {
          pendingFrame = null;
          updateDisplay(state);
        });
      }
      
      // Update display from state
      function updateDisplay(state) {
        const current = state.processed ?? state.current ?? 0;
        const total = state.total ?? 100;
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        
        // Update bar (CSS transition handles animation)
        if (barFill) barFill.style.width = pct + '%';
        if (barText) barText.textContent = pct + '%';
        
        // Update status
        if (statusEl) {
          const phase = state.phase || 'running';
          statusEl.textContent = phase === 'running' ? 'Running' : 
                                  phase === 'complete' ? 'Complete' : 
                                  phase === 'error' ? 'Error' : 'Idle';
          statusEl.className = 'pdisplay__status pdisplay__status--' + phase;
        }
        
        // Update stats
        if (statsEls[0] && state.recordsPerSecond !== undefined) {
          statsEls[0].textContent = state.recordsPerSecond.toFixed(1) + ' rec/s';
        }
        if (statsEls[1]) {
          if (state.etaMs && state.etaMs > 0) {
            const secs = Math.round(state.etaMs / 1000);
            const mins = Math.floor(secs / 60);
            statsEls[1].textContent = 'ETA: ' + mins + ':' + String(secs % 60).padStart(2, '0');
          } else if (state.phase === 'complete') {
            statsEls[1].textContent = 'Complete';
          } else {
            statsEls[1].textContent = 'ETA: —';
          }
        }
        
        // Update message
        if (messageEl) {
          messageEl.textContent = state.currentUrl || state.message || 'Processing...';
        }
        
        // Update warnings (CSS class transition - no flashing!)
        if (warningEl) {
          const warnings = state.warnings || [];
          if (warnings.length > 0) {
            warningEl.textContent = '⚠️ ' + warnings[0].message;
            warningEl.classList.remove('pdisplay__warning--hidden');
          } else {
            warningEl.classList.add('pdisplay__warning--hidden');
          }
        }
      }
      
      // Connect SSE
      function connect() {
        if (eventSource) return;
        
        eventSource = new EventSource(sseUrl);
        
        eventSource.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'next' && msg.value) {
              scheduleUpdate(msg.value);
            } else if (msg.type === 'complete') {
              scheduleUpdate({ phase: 'complete', processed: 100, total: 100 });
            }
          } catch (e) {
            console.warn('Parse error:', e);
          }
        };
        
        eventSource.onerror = () => {
          eventSource.close();
          eventSource = null;
          startPolling();
        };
      }
      
      // Polling fallback
      function startPolling() {
        if (pollTimer) return;
        
        async function poll() {
          try {
            const res = await fetch(pollUrl);
            if (res.ok) {
              const data = await res.json();
              if (data.state) scheduleUpdate(data.state);
            }
          } catch (e) {}
        }
        
        poll();
        pollTimer = setInterval(poll, 500);
      }
      
      // Expose for buttons
      window.startDemo = async () => {
        const res = await fetch('/api/start', { method: 'POST' });
        const data = await res.json();
        if (data.started) connect();
      };
      
      window.resetDemo = async () => {
        await fetch('/api/reset', { method: 'POST' });
        updateDisplay({ phase: 'idle', processed: 0, total: 100, warnings: [] });
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
      
      // Auto-connect if simulation running
      fetch(pollUrl).then(r => r.json()).then(data => {
        if (data.running) connect();
      });
    })();
  </script>
</body>
</html>`;

  res.send(html);
});

/**
 * Minimal page - Just the progress bar
 */
app.get('/minimal', (req, res) => {
  const context = createContext();
  
  const bar = new ProgressBarEl({
    context,
    current: 42,
    total: 100,
    size: 'large'
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Minimal Progress Bar</title>
  <style>
    body {
      margin: 0;
      padding: 2rem;
      background: #1a1a2e;
    }
    .container { max-width: 600px; margin: 0 auto; }
    ${ProgressBarEl.CSS}
  </style>
</head>
<body>
  <div class="container">
    ${bar.all_html_render()}
  </div>
</body>
</html>`;

  res.send(html);
});

/**
 * SSE endpoint
 */
app.get('/sse/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // For nginx

  sseClients.push(res);

  // Send initial state if running
  if (simulationState) {
    res.write(`data: ${JSON.stringify({ type: 'next', value: simulationState })}\n\n`);
  }

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

/**
 * Polling endpoint
 */
app.get('/api/state', (req, res) => {
  res.json({
    running: !!simulationState,
    state: simulationState || { phase: 'idle', processed: 0, total: 100 }
  });
});

/**
 * Start simulation
 */
app.post('/api/start', (req, res) => {
  if (simulationState) {
    res.json({ started: false, message: 'Already running' });
    return;
  }
  startSimulation();
  res.json({ started: true });
});

/**
 * Reset simulation
 */
app.post('/api/reset', (req, res) => {
  simulationState = null;
  res.json({ reset: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`[jsgui3-idiomatic-progress] Server running at http://localhost:${PORT}`);
  console.log(`Routes:`);
  console.log(`  /          - Full demo with connector control`);
  console.log(`  /minimal   - Just the progress bar`);
});
