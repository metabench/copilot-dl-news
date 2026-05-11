#!/usr/bin/env node
'use strict';

/**
 * downloads-bar-chart-server — live bar chart of stored downloads over the last N days
 *
 * Usage:
 *   node tools/dev/downloads-bar-chart-server.js [options]
 *
 * Options:
 *   --days N           Number of days to display (default: 30)
 *   --port N           HTTP port (default: 4321)
 *   --db <path>        SQLite DB path (default: data/news.db)
 *   --source <name>    Which source to chart (default: http-all). One of:
 *                        http-ok       — http_responses where status=200 and bytes>0
 *                        http-all      — http_responses (every recorded response)
 *                        fetches       — fetches table (legacy/streaming fetches)
 *                        urls          — urls table by created_at (every URL stored)
 *                        articles      — articles via urls.created_at joined to articles_fts
 *   --mode <name>      Aggregation mode (default: daily). One of:
 *                        daily        — count per day (bar = that day's downloads)
 *                        cumulative   — running total at end of each day (includes pre-window baseline)
 *   --baseline <spec>  Baseline for cumulative mode (default: auto). One of:
 *                        auto         — query the DB for the count strictly before the window
 *                        none         — start from 0 at the window start
 *                        <number>     — use this fixed integer as the starting count
 *   --config <path>    Load JSON defaults from this file (CLI args override). Keys:
 *                        days, port, db, source, mode, baseline
 *   --screenshot       Capture a debug screenshot to tmp/ and exit
 *   --screenshot-out <path>   Custom screenshot path (implies --screenshot)
 *   --screenshot-keep-running Capture a screenshot then keep serving
 *   --check            Validate config + DB query then exit 0 (no listen)
 *   --help             Show this help
 *
 * Endpoints:
 *   GET /                    HTML page with the live bar chart
 *   GET /api/data?days=N     JSON daily counts
 *   GET /screenshot.png      On-demand puppeteer-rendered PNG of the chart
 *   GET /chart.svg           Standalone SVG chart
 *   GET /healthz             Liveness probe
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const downloadEvidence = require('../../src/data/db/queries/downloadEvidence');
const VALID_SOURCES = [...downloadEvidence.DOWNLOAD_BAR_CHART_VALID_SOURCES];
const VALID_MODES = [...downloadEvidence.DOWNLOAD_BAR_CHART_VALID_MODES];
const SOURCE_QUERIES = Object.freeze(Object.fromEntries(
  VALID_SOURCES.map((name) => [name, { label: downloadEvidence.getDownloadBarChartSourceLabel(name) }])
));

function parseBaseline(v) {
  if (v == null) return 'auto';
  const s = String(v).toLowerCase().trim();
  if (s === 'auto' || s === 'none') return s;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`--baseline must be 'auto', 'none', or a non-negative number (got: ${v})`);
  }
  return Math.floor(n);
}

function parseArgs(argv) {
  const out = {
    days: 30,
    port: 4321,
    db: path.resolve(__dirname, '..', '..', 'data', 'news.db'),
    source: 'http-all',
    mode: 'daily',
    baseline: 'auto',
    configPath: null,
    screenshot: false,
    screenshotOut: null,
    screenshotKeepRunning: false,
    check: false,
    help: false,
  };
  // First pass: locate --config so file values become the new defaults
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config' && argv[i + 1]) {
      out.configPath = path.resolve(argv[i + 1]);
      break;
    }
  }
  if (out.configPath) {
    if (!fs.existsSync(out.configPath)) throw new Error(`--config file not found: ${out.configPath}`);
    const cfg = JSON.parse(fs.readFileSync(out.configPath, 'utf8'));
    if (cfg.days != null) out.days = Math.max(1, parseInt(cfg.days, 10) || 30);
    if (cfg.port != null) out.port = parseInt(cfg.port, 10) || 4321;
    if (cfg.db) out.db = path.resolve(cfg.db);
    if (cfg.source) {
      const v = String(cfg.source).toLowerCase();
      if (!VALID_SOURCES.includes(v)) throw new Error(`config.source must be one of ${VALID_SOURCES.join(', ')}`);
      out.source = v;
    }
    if (cfg.mode) {
      const v = String(cfg.mode).toLowerCase();
      if (!VALID_MODES.includes(v)) throw new Error(`config.mode must be one of ${VALID_MODES.join(', ')}`);
      out.mode = v;
    }
    if (cfg.baseline != null) out.baseline = parseBaseline(cfg.baseline);
  }
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--days' && argv[i + 1]) { out.days = Math.max(1, parseInt(argv[++i], 10) || 30); }
    else if (t === '--port' && argv[i + 1]) { out.port = parseInt(argv[++i], 10) || 4321; }
    else if (t === '--db' && argv[i + 1]) { out.db = path.resolve(argv[++i]); }
    else if (t === '--source' && argv[i + 1]) {
      const v = String(argv[++i]).toLowerCase();
      if (!VALID_SOURCES.includes(v)) {
        throw new Error(`--source must be one of ${VALID_SOURCES.join(', ')} (got: ${v})`);
      }
      out.source = v;
    }
    else if (t === '--mode' && argv[i + 1]) {
      const v = String(argv[++i]).toLowerCase();
      if (!VALID_MODES.includes(v)) throw new Error(`--mode must be one of ${VALID_MODES.join(', ')} (got: ${v})`);
      out.mode = v;
    }
    else if (t === '--baseline' && argv[i + 1]) { out.baseline = parseBaseline(argv[++i]); }
    else if (t === '--config' && argv[i + 1]) { i += 1; /* already consumed */ }
    else if (t === '--screenshot') { out.screenshot = true; }
    else if (t === '--screenshot-out' && argv[i + 1]) { out.screenshot = true; out.screenshotOut = path.resolve(argv[++i]); }
    else if (t === '--screenshot-keep-running') { out.screenshot = true; out.screenshotKeepRunning = true; }
    else if (t === '--check') { out.check = true; }
    else if (t === '--help' || t === '-h') { out.help = true; }
  }
  return out;
}

function printHelp() {
  console.log(`downloads-bar-chart-server

Usage: node tools/dev/downloads-bar-chart-server.js [options]

Options:
  --days N                    Number of days to display (default: 30)
  --port N                    HTTP port (default: 4321)
  --db <path>                 SQLite DB path (default: data/news.db)
  --source <name>             Source: http-all|http-ok|fetches|urls|articles (default: http-all)
  --mode <name>               Aggregation: daily|cumulative (default: daily)
  --baseline <spec>           Cumulative baseline: auto|none|<integer> (default: auto)
  --config <path>             Load JSON defaults (keys: days, port, db, source, mode, baseline)
  --screenshot                Capture a debug screenshot to tmp/ and exit
  --screenshot-out <path>     Custom screenshot path (implies --screenshot)
  --screenshot-keep-running   Capture a screenshot then keep serving
  --check                     Validate config + DB query then exit 0
  --help                      Show this help

Endpoints when running:
  GET  /                      HTML chart page
  GET  /api/data?days=N       JSON daily counts
  GET  /screenshot.png        On-demand PNG via puppeteer
  GET  /chart.svg             Standalone SVG chart
  GET  /healthz               Liveness probe
`);
}

function getDailyDownloads(dbPath, days, source = 'http-all', opts = {}) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    return downloadEvidence.getDailyDownloadBars(db, days, source, opts);
  } finally {
    db.close();
  }
}

function sourceLabel(source) {
  return downloadEvidence.getDownloadBarChartSourceLabel(source);
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function buildSvgBarChart(data, opts = {}) {
  const width = opts.width || 1200;
  const height = opts.height || 520;
  const sourceLabelText = opts.sourceLabel || '';
  const mode = opts.mode === 'cumulative' ? 'cumulative' : 'daily';
  const margin = { top: 60, right: 32, bottom: 90, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const maxValue = Math.max(1, ...data.map((d) => d.count));
  const totalCount = mode === 'cumulative'
    ? (data.length ? data[data.length - 1].count : 0)
    : data.reduce((acc, d) => acc + d.count, 0);
  const barSlot = chartWidth / data.length;
  const barWidth = Math.max(2, barSlot * 0.72);
  const yTicks = 5;

  const todayStr = new Date().toISOString().slice(0, 10);

  // X-label cadence: aim for ~12 labels max
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  const bars = data.map((d, i) => {
    const value = d.count;
    const barHeight = (value / maxValue) * chartHeight;
    const x = margin.left + i * barSlot + (barSlot - barWidth) / 2;
    const y = margin.top + chartHeight - barHeight;
    const isToday = d.day === todayStr;
    const fill = isToday ? 'url(#todayGrad)' : 'url(#barGrad)';
    const tooltip = mode === 'cumulative'
      ? `${d.day}: ${value.toLocaleString()} total (+${(d.delta || 0).toLocaleString()} that day)`
      : `${d.day}: ${value.toLocaleString()} downloads`;
    return `<g><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, barHeight).toFixed(2)}" fill="${fill}" rx="2"><title>${tooltip}</title></rect>${value > 0 && barHeight > 14 ? `<text x="${(x + barWidth / 2).toFixed(2)}" y="${(y - 4).toFixed(2)}" text-anchor="middle" class="bar-label">${formatNumber(value)}</text>` : ''}</g>`;
  }).join('\n  ');

  let yAxis = '';
  for (let i = 0; i <= yTicks; i += 1) {
    const frac = i / yTicks;
    const y = margin.top + chartHeight - frac * chartHeight;
    const value = Math.round(frac * maxValue);
    yAxis += `<line x1="${margin.left}" y1="${y.toFixed(2)}" x2="${(margin.left + chartWidth).toFixed(2)}" y2="${y.toFixed(2)}" class="grid"/>`;
    yAxis += `<text x="${(margin.left - 10).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis-label">${formatNumber(value)}</text>`;
  }

  let xAxis = '';
  for (let i = 0; i < data.length; i += 1) {
    if (i % labelEvery !== 0 && i !== data.length - 1) continue;
    const x = margin.left + i * barSlot + barSlot / 2;
    const label = data[i].day.slice(5); // MM-DD
    xAxis += `<text x="${x.toFixed(2)}" y="${(margin.top + chartHeight + 18).toFixed(2)}" text-anchor="middle" class="axis-label">${label}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Stored downloads per day for the last ${data.length} days">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="todayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <style>
    .title { font: 600 18px 'Segoe UI', system-ui, sans-serif; fill: #f8fafc; }
    .subtitle { font: 400 12px 'Segoe UI', system-ui, sans-serif; fill: #94a3b8; }
    .axis-label { font: 400 10px 'Segoe UI', system-ui, sans-serif; fill: #cbd5e1; }
    .bar-label { font: 600 9px 'Segoe UI', system-ui, sans-serif; fill: #f1f5f9; }
    .grid { stroke: rgba(148,163,184,0.18); stroke-width: 0.5; }
    .legend-text { font: 400 11px 'Segoe UI', system-ui, sans-serif; fill: #cbd5e1; }
  </style>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  <text x="${margin.left}" y="30" class="title">Stored downloads — ${mode === 'cumulative' ? 'cumulative total at end of each day' : 'last ' + data.length + ' day' + (data.length === 1 ? '' : 's')}</text>
  <text x="${margin.left}" y="48" class="subtitle">${mode === 'cumulative' ? 'ending total ' : 'total '}${totalCount.toLocaleString()} · ${mode === 'cumulative' ? 'peak day +' + Math.max(0, ...data.map((d) => d.delta || 0)).toLocaleString() : 'peak ' + maxValue.toLocaleString() + '/day'}${sourceLabelText ? ` · source: ${sourceLabelText}` : ''} · mode: ${mode} · generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)}Z</text>
  <!-- Legend -->
  <g transform="translate(${(width - margin.right - 260).toFixed(2)},${(margin.top - 20).toFixed(2)})">
    <rect x="0" y="0" width="14" height="10" fill="url(#barGrad)" rx="2"/>
    <text x="20" y="9" class="legend-text">${mode === 'cumulative' ? 'Running total' : 'Daily count'}</text>
    <rect x="130" y="0" width="14" height="10" fill="url(#todayGrad)" rx="2"/>
    <text x="150" y="9" class="legend-text">Today</text>
  </g>
  ${yAxis}
  <line x1="${margin.left}" y1="${(margin.top + chartHeight).toFixed(2)}" x2="${(margin.left + chartWidth).toFixed(2)}" y2="${(margin.top + chartHeight).toFixed(2)}" stroke="#475569" stroke-width="1"/>
  ${bars}
  ${xAxis}
</svg>`;
}

function buildHtmlPage({ days, port, source, mode, baseline }) {
  const sources = ['http-all', 'http-ok', 'fetches', 'urls', 'articles'];
  const sourceOptions = sources.map((s) => `<option value="${s}"${s === source ? ' selected' : ''}>${s}</option>`).join('');
  const modeOptions = VALID_MODES.map((m) => `<option value="${m}"${m === mode ? ' selected' : ''}>${m}</option>`).join('');
  const baselineStr = (baseline == null ? 'auto' : String(baseline));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=1280"/>
<title>Stored Downloads — last ${days} days (${source}, ${mode})</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; background: #0b1220; color: #e2e8f0; padding: 24px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .meta { font-size: 12px; color: #94a3b8; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .controls label { font-size: 12px; color: #94a3b8; }
  .controls input, .controls select { padding: 4px 8px; background: #1e293b; color: #f1f5f9; border: 1px solid #334155; border-radius: 4px; font-size: 13px; }
  .controls input { width: 80px; }
  .controls button { padding: 5px 12px; background: #2563eb; color: white; border: 0; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .controls button:hover { background: #3b82f6; }
  .chart-wrap { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; }
  .chart-wrap svg { width: 100%; height: auto; display: block; }
  .footer { margin-top: 16px; font-size: 11px; color: #64748b; display: flex; gap: 16px; flex-wrap: wrap; }
  .footer a { color: #60a5fa; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }
  .auto-refresh { display: inline-flex; align-items: center; gap: 6px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>Stored Downloads</h1>
    <div class="meta" id="meta">Loading…</div>
  </div>
  <form class="controls" onsubmit="event.preventDefault(); reload();">
    <label>Source <select id="source">${sourceOptions}</select></label>
    <label>Mode <select id="mode">${modeOptions}</select></label>
    <label>Baseline <input type="text" id="baseline" value="${baselineStr}" title="auto | none | <integer> (cumulative only)" style="width:90px"/></label>
    <label>Days <input type="number" id="days" min="1" max="365" value="${days}"/></label>
    <label class="auto-refresh"><input type="checkbox" id="auto"/> auto-refresh 30s</label>
    <button type="submit">Refresh</button>
  </form>
</header>
<div class="chart-wrap" id="chart"></div>
<div class="footer">
  <span data-debug-marker="downloads-bar-chart-ready">Server: localhost:${port}</span>
  <a href="/screenshot.png" target="_blank">/screenshot.png</a>
  <a href="/chart.svg" target="_blank">/chart.svg</a>
  <a href="/api/data" target="_blank">/api/data</a>
  <a href="/api/sources" target="_blank">/api/sources</a>
  <a href="/healthz" target="_blank">/healthz</a>
</div>
<script>
let timer = null;
function qs() {
  const days = Math.max(1, parseInt(document.getElementById('days').value, 10) || ${days});
  const source = document.getElementById('source').value || ${JSON.stringify(source)};
  const mode = document.getElementById('mode').value || ${JSON.stringify(mode)};
  const baseline = (document.getElementById('baseline').value || 'auto').trim();
  return 'days=' + days + '&source=' + encodeURIComponent(source) + '&mode=' + encodeURIComponent(mode) + '&baseline=' + encodeURIComponent(baseline);
}
async function reload() {
  const q = qs();
  const res = await fetch('/chart.svg?' + q, { cache: 'no-store' });
  const svg = await res.text();
  document.getElementById('chart').innerHTML = svg;
  const meta = await fetch('/api/data?' + q, { cache: 'no-store' }).then(r => r.json());
  let total, peak, peakLabel;
  if (meta.mode === 'cumulative') {
    total = meta.data.length ? meta.data[meta.data.length - 1].count : 0;
    peak = Math.max(0, ...meta.data.map(d => d.delta || 0));
    peakLabel = 'peak +' + peak.toLocaleString() + '/day';
  } else {
    total = meta.data.reduce((a, b) => a + b.count, 0);
    peak = Math.max(0, ...meta.data.map(d => d.count));
    peakLabel = 'peak ' + peak.toLocaleString() + '/day';
  }
  document.getElementById('meta').textContent =
    'Source: ' + meta.source + ' (' + meta.sourceLabel + ') · mode: ' + meta.mode +
    (meta.mode === 'cumulative' ? ' (baseline ' + (meta.baselineUsed != null ? meta.baselineUsed.toLocaleString() : 'n/a') + ')' : '') +
    ' · window: ' + meta.data[0].day + ' → ' + meta.data[meta.data.length - 1].day +
    ' · ' + (meta.mode === 'cumulative' ? 'ending total ' : 'total ') + total.toLocaleString() + ' · ' + peakLabel;
}
function setupAuto() {
  document.getElementById('auto').addEventListener('change', (e) => {
    if (timer) { clearInterval(timer); timer = null; }
    if (e.target.checked) { timer = setInterval(reload, 30000); }
  });
}
reload();
setupAuto();
</script>
</body>
</html>`;
}

async function captureScreenshot({ url, outPath, viewport, waitMs = 600 }) {
  const puppeteer = require('puppeteer');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    // Wait for the ready marker the page emits when the SVG is drawn
    await page.waitForSelector('[data-debug-marker="downloads-bar-chart-ready"]', { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('#chart svg') != null, { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, waitMs));
    await page.screenshot({ path: outPath, fullPage: true });
    return outPath;
  } finally {
    await browser.close().catch(() => {});
  }
}

function buildApp({ db, days, source, mode, baseline }) {
  const app = express();
  const defaultMode = mode === 'cumulative' ? 'cumulative' : 'daily';
  const defaultBaseline = baseline == null ? 'auto' : baseline;

  app.get('/healthz', (_req, res) => res.json({ ok: true, db, defaultDays: days, defaultSource: source, defaultMode, defaultBaseline, sources: VALID_SOURCES, modes: VALID_MODES }));

  app.get('/api/sources', (_req, res) => {
    res.json(VALID_SOURCES.map((s) => ({ name: s, label: sourceLabel(s) })));
  });

  function resolveSource(req) {
    const raw = String(req.query.source || source).toLowerCase();
    return VALID_SOURCES.includes(raw) ? raw : source;
  }
  function resolveMode(req) {
    const raw = String(req.query.mode || defaultMode).toLowerCase();
    return VALID_MODES.includes(raw) ? raw : defaultMode;
  }
  function resolveBaseline(req) {
    if (req.query.baseline == null) return defaultBaseline;
    try { return parseBaseline(req.query.baseline); }
    catch { return defaultBaseline; }
  }

  app.get('/api/data', (req, res) => {
    const requested = Math.max(1, parseInt(req.query.days, 10) || days);
    const src = resolveSource(req);
    const md = resolveMode(req);
    const bl = resolveBaseline(req);
    try {
      const data = getDailyDownloads(db, requested, src, { mode: md, baseline: bl });
      let baselineUsed = null;
      if (md === 'cumulative' && data.length) {
        baselineUsed = (data[0].count || 0) - (data[0].delta || 0);
      }
      res.json({ days: requested, source: src, sourceLabel: sourceLabel(src), mode: md, baseline: bl, baselineUsed, data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/chart.svg', (req, res) => {
    const requested = Math.max(1, parseInt(req.query.days, 10) || days);
    const src = resolveSource(req);
    const md = resolveMode(req);
    const bl = resolveBaseline(req);
    try {
      const data = getDailyDownloads(db, requested, src, { mode: md, baseline: bl });
      const svg = buildSvgBarChart(data, { sourceLabel: sourceLabel(src), mode: md });
      res.set('Content-Type', 'image/svg+xml; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.send(svg);
    } catch (e) {
      res.status(500).type('text/plain').send(`Error: ${e.message}`);
    }
  });

  app.get('/screenshot.png', async (req, res) => {
    const requested = Math.max(1, parseInt(req.query.days, 10) || days);
    const src = resolveSource(req);
    const md = resolveMode(req);
    const bl = resolveBaseline(req);
    const port = req.socket.localPort;
    const outPath = path.join(require('os').tmpdir(), `downloads-bar-chart-${Date.now()}.png`);
    try {
      await captureScreenshot({
        url: `http://127.0.0.1:${port}/?days=${requested}&source=${encodeURIComponent(src)}&mode=${encodeURIComponent(md)}&baseline=${encodeURIComponent(bl)}`,
        outPath,
        viewport: { width: 1320, height: 720, deviceScaleFactor: 1 },
      });
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store');
      res.send(fs.readFileSync(outPath));
    } catch (e) {
      res.status(500).type('text/plain').send(`Screenshot failed: ${e.message}`);
    } finally {
      try { fs.unlinkSync(outPath); } catch {}
    }
  });

  app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const src = resolveSource(req);
    const md = resolveMode(req);
    const bl = resolveBaseline(req);
    const reqDays = Math.max(1, parseInt(req.query.days, 10) || days);
    res.type('html').send(buildHtmlPage({ days: reqDays, port: req.socket.localPort || 0, source: src, mode: md, baseline: bl }));
  });

  return app;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }

  // --check: validate query then exit 0
  if (opts.check) {
    const data = getDailyDownloads(opts.db, opts.days, opts.source, { mode: opts.mode, baseline: opts.baseline });
    const total = opts.mode === 'cumulative'
      ? (data.length ? data[data.length - 1].count : 0)
      : data.reduce((a, b) => a + b.count, 0);
    const baselineUsed = opts.mode === 'cumulative' && data.length
      ? (data[0].count || 0) - (data[0].delta || 0)
      : null;
    console.log(JSON.stringify({ ok: true, db: opts.db, days: opts.days, source: opts.source, sourceLabel: sourceLabel(opts.source), mode: opts.mode, baseline: opts.baseline, baselineUsed, points: data.length, total }));
    process.exit(0);
  }

  const app = buildApp({ db: opts.db, days: opts.days, source: opts.source, mode: opts.mode, baseline: opts.baseline });
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[downloads-bar-chart] listening on ${url}`);
  console.log(`[downloads-bar-chart] db=${opts.db} days=${opts.days} source=${opts.source} (${sourceLabel(opts.source)}) mode=${opts.mode} baseline=${opts.baseline}`);

  if (opts.screenshot) {
    const outPath = opts.screenshotOut
      || path.resolve(__dirname, '..', '..', 'tmp', `downloads-bar-chart-${opts.days}d-${opts.mode}.png`);
    try {
      await captureScreenshot({
        url: `${url}?days=${opts.days}&source=${encodeURIComponent(opts.source)}&mode=${encodeURIComponent(opts.mode)}&baseline=${encodeURIComponent(opts.baseline)}`,
        outPath,
        viewport: { width: 1320, height: 720, deviceScaleFactor: 1 },
      });
      console.log(`[downloads-bar-chart] screenshot: ${outPath}`);
    } catch (e) {
      console.error(`[downloads-bar-chart] screenshot failed: ${e.message}`);
    }
    if (!opts.screenshotKeepRunning) {
      server.close(() => process.exit(0));
      return;
    }
  }

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`[downloads-bar-chart] received ${signal}, closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildSvgBarChart, getDailyDownloads, buildApp, parseArgs, parseBaseline, SOURCE_QUERIES, VALID_SOURCES, VALID_MODES };
