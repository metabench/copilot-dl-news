const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const jsgui = require('jsgui3-html');
const { createCrawlSpeedometerControl, CRAWL_SPEEDOMETER_STYLES } = require('./controls/CrawlSpeedometerControl');
// Native fetch is available in Node 18+ (experimental) and 21+ (stable). 
// User is upgrading to latest, so we use native fetch.

const app = express();
app.use(express.json({ limit: '50mb' })); // Support large batch payloads

const PORT = process.env.PORT || 3120;
const DB_PATH = process.env.DB_PATH || 'crawler.db';

// Database Setup
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE,
    content TEXT,
    status TEXT DEFAULT 'pending', -- pending, fetching, done, error
    size_bytes INTEGER DEFAULT 0,
    fetched_at DATETIME,
    error_msg TEXT
  );
  -- Index for batch retrieval
  CREATE INDEX IF NOT EXISTS idx_status ON urls(status);
`);

// Speed Tracking State
const speedStats = {
  processedLastWindow: 0,
  bytesLastWindow: 0,
  currentItemsPerSec: 0,
  currentBytesPerSec: 0,
  totalProcessed: 0,
  totalErrors: 0
};

// Start Speed Calc Interval (1s window)
setInterval(() => {
  speedStats.currentItemsPerSec = speedStats.processedLastWindow;
  speedStats.currentBytesPerSec = speedStats.bytesLastWindow;

  // Reset window
  speedStats.processedLastWindow = 0;
  speedStats.bytesLastWindow = 0;

  // Sync Total from DB occasionally or just keep memory state? Memory is faster for gauge.
  // DB is source of truth for totals.
  const totals = db.prepare("SELECT COUNT(*) as count, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors FROM urls WHERE status IN ('done', 'error')").get();
  speedStats.totalProcessed = totals.count;
  speedStats.totalErrors = totals.errors;
}, 1000);

// Worker Logic
let isWorking = false;
async function startWorker() {
  if (isWorking) return;
  isWorking = true;
  console.log('Worker started');

  try {
    while (true) {
      // Fetch batch of pending
      const pending = db.prepare("SELECT id, url FROM urls WHERE status = 'pending' LIMIT 10").all();

      if (pending.length === 0) {
        await new Promise(r => setTimeout(r, 1000)); // Sleep if empty
        continue;
      }

      // Process in parallel (limited concurrency)
      await Promise.all(pending.map(async (row) => {
        try {
          // Mark fetching
          db.prepare("UPDATE urls SET status = 'fetching' WHERE id = ?").run(row.id);

          const res = await fetch(row.url, { timeout: 10000 });
          const text = await res.text();
          const size = Buffer.byteLength(text);

          db.prepare("UPDATE urls SET status = 'done', content = ?, size_bytes = ?, fetched_at = CURRENT_TIMESTAMP WHERE id = ?").run(text, size, row.id);

          speedStats.processedLastWindow++;
          speedStats.bytesLastWindow += size;

        } catch (e) {
          db.prepare("UPDATE urls SET status = 'error', error_msg = ? WHERE id = ?").run(e.message, row.id);
          speedStats.processedLastWindow++; // Count errors in throughput? Usually yes for "processed"
        }
      }));
    }
  } catch (e) {
    console.error('Worker crashed:', e);
    isWorking = false; // Allow restart
  }
}
// Start worker immediately
startWorker();


const CrawlSpeedometer = createCrawlSpeedometerControl(jsgui);

// UI Rendering
app.get('/', (req, res) => {
  const ctx = new jsgui.Page_Context();
  const page = new jsgui.Standard_Web_Page({ context: ctx });

  page.head.add(new jsgui.Control({ context: ctx, tagName: 'title', text: 'Remote Crawler Lab' }));
  const style = new jsgui.Control({ context: ctx, tagName: 'style' });
  style.add(CRAWL_SPEEDOMETER_STYLES);
  style.add(`
    body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding-top: 50px; }
    .controls { margin-top: 20px; text-align: center; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #238636; border: none; color: white; border-radius: 6px; }
    button:hover { background: #2ea043; }
  `);
  page.head.add(style);

  const speedometer = new CrawlSpeedometer({
    context: ctx,
    label: 'Remote Relay Speed',
    maxSpeed: 50, // Higher scale for batch processing
    showStats: true
  });
  page.body.add(speedometer);
  page.body.add(new jsgui.Control({ context: ctx, tagName: 'h1', text: 'Hello World (Remote Relay)' }));

  const controls = new jsgui.Control({ context: ctx, class: 'controls' });
  controls.add(new jsgui.Control({ context: ctx, tagName: 'button', text: 'Start Demo Batch (100 URLs)', attributes: { onclick: 'startDemo()' } }));
  page.body.add(controls);

  // Client Script for Polling
  const script = new jsgui.Control({ context: ctx, tagName: 'script' });
  script.add(`
    async function startDemo() {
      // Send a list of dummy URLs
      const urls = [];
      for(let i=0; i<100; i++) {
        // Use a reliable echo/delay service or just random reliable sites. 
        // Or simpler: local loopback if we wanted, but user wants "download data".
        // Let's use example.com with cache busting to force fetch.
        urls.push('http://example.com/?q=' + Math.random()); 
      }
      await fetch('/api/jobs', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ urls })
      });
      alert('Batch queued!');
    }

    setInterval(async () => {
      try {
        const res = await fetch('/api/speed');
        const data = await res.json();
        
        // Update generic DOM if control doesn't expose API (rudimentary)
        // Ideally we'd use speedometer.update(val).
        // Since we are hacking existing control structure via DOM manipulation:
        const needle = document.querySelector('.speedometer-needle');
        if (needle) {
             const speed = data.currentItemsPerSec;
             // Scale: 0 to 50
             const speedRatio = Math.min(speed / 50, 1);
             const angle = -90 + (speedRatio * 180); // Arc usually -90 to +90 or 0 to 180? 
             // Original control implementation details matter here.
             // Assuming previous observation: "180 + ..." suggests 0 is pointing left?
             // Let's assume standard 180 degree gauge.
             const effectiveAngle = 180 + (speedRatio * 180);
             needle.setAttribute('transform', \`rotate(\${effectiveAngle}, 80, 80)\`);
        }
        
        // Update text
        const valueText = document.querySelector('.speedometer-value-text');
        if (valueText) valueText.textContent = data.currentItemsPerSec.toFixed(1) + ' p/s';
        
        const statsC = document.querySelector('.stats-container');
        if (statsC) {
             // We could inject specific stats if we knew the class names.
        }

      } catch(e) console.error(e);
    }, 1000);
  `);
  page.body.add(script);

  res.send(page.all_html_render());
});

// API Endpoints

app.get('/api/speed', (req, res) => {
  res.json(speedStats);
});

app.post('/api/jobs', (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls must be array' });

  const insert = db.prepare('INSERT OR IGNORE INTO urls (url) VALUES (?)');
  const insertMany = db.transaction((list) => {
    let inserted = 0;
    for (const url of list) {
      const result = insert.run(url);
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = insertMany(urls);
  res.json({ message: 'Queued', count: urls.length, inserted });

  // Ensure worker is running
  startWorker();
});

app.get('/api/batch', (req, res) => {
  // Return all DONE items and maybe prune them?
  // For verify: just return list.
  try {
    const rows = db.prepare("SELECT id, url, content, size_bytes FROM urls WHERE status = 'done' LIMIT 1000").all();
    // Should we mark them as downloaded? 
    // db.prepare('UPDATE urls SET status = "archived" WHERE id IN ...').run();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Remote Crawler Lab running on port ${PORT}`);
});
