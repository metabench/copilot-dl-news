#!/usr/bin/env node
'use strict';

/**
 * Visual Diff Tool Server
 * 
 * Side-by-side comparison of Readability extraction vs. Teacher (visual) extraction.
 * Helps identify extraction quality issues and build golden reference sets.
 * 
 * Usage:
 *   node src/ui/server/visualDiff/server.js [--port 3021]
 */

const express = require('express');
const path = require('path');
const { findProjectRoot } = require('../../../shared/utils/project-root');
const { openNewsCrawlerDb } = require('../../../db/openNewsCrawlerDb');
const { decompress } = require('../../../shared/utils/compression');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const DEFAULT_PORT = 3021;

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

function getDb() {
  const dbPath = path.join(findProjectRoot(), 'data', 'news.db');
  return openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
}

function getVisualDiffAccess(db) {
  if (!db || !db.visualDiff) {
    throw new Error('news-crawler-db visualDiff access surface is unavailable. Rebuild news-crawler-db.');
  }
  return db.visualDiff;
}

/**
 * Load content and analysis for a URL
 */
function loadPageData(db, urlOrId) {
  return getVisualDiffAccess(db).getVisualDiffPageDataByUrlOrAnalysisId(urlOrId);
}

/**
 * Get HTML content from stored blob
 */
function getHtmlContent(db, row) {
  if (!row || !row.content_blob) return null;
  
  try {
    const algorithm = row.compression_algorithm || 'none';
    const decompressed = decompress(row.content_blob, algorithm);
    return decompressed.toString('utf-8');
  } catch (err) {
    console.error('Decompression error:', err.message);
    return null;
  }
}

/**
 * Run Readability extraction on HTML
 */
function runReadability(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (!article) {
      return { error: 'Readability returned null', valid: false };
    }
    
    // Count words
    const text = article.textContent || '';
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    
    return {
      valid: true,
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      siteName: article.siteName,
      content: article.content,
      textContent: article.textContent,
      wordCount,
      length: article.length
    };
  } catch (err) {
    return { error: err.message, valid: false };
  }
}

/**
 * Extract metadata from HTML using common patterns
 */
function extractMetadata(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    
    // Title candidates
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.content;
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.content;
    const h1 = doc.querySelector('h1')?.textContent?.trim();
    const titleTag = doc.querySelector('title')?.textContent?.trim();
    
    // Date candidates
    const articleDate = doc.querySelector('time[datetime]')?.getAttribute('datetime');
    const metaDate = doc.querySelector('meta[property="article:published_time"]')?.content;
    const metaModified = doc.querySelector('meta[property="article:modified_time"]')?.content;
    
    // Author candidates
    const metaAuthor = doc.querySelector('meta[name="author"]')?.content;
    const articleAuthor = doc.querySelector('meta[property="article:author"]')?.content;
    const byline = doc.querySelector('[class*="byline"], [class*="author"]')?.textContent?.trim();
    
    // Section
    const metaSection = doc.querySelector('meta[property="article:section"]')?.content;
    
    return {
      valid: true,
      title: {
        og: ogTitle,
        twitter: twitterTitle,
        h1,
        tag: titleTag
      },
      date: {
        time: articleDate,
        published: metaDate,
        modified: metaModified
      },
      author: {
        meta: metaAuthor,
        article: articleAuthor,
        byline
      },
      section: metaSection
    };
  } catch (err) {
    return { error: err.message, valid: false };
  }
}

/**
 * Get list of recent pages with low confidence for review
 */
function getLowConfidencePages(db, limit = 50) {
  return getVisualDiffAccess(db).listVisualDiffLowConfidencePages({ limit });
}

/**
 * Get list of pages without confidence scores
 */
function getUnratedPages(db, limit = 50) {
  return getVisualDiffAccess(db).listVisualDiffUnratedPages({ limit });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Rendering
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderDiffPage(data) {
  const { url, stored, readability, metadata, confidence } = data;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Diff - ${escapeHtml(stored?.title || url)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    .header {
      background: #16213e;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 1.5rem;
    }
    .url {
      font-size: 0.9rem;
      color: #888;
      word-break: break-all;
    }
    .confidence-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.85rem;
      margin-left: 10px;
    }
    .confidence-high { background: #2d5a27; color: #9f9; }
    .confidence-good { background: #4a5a27; color: #cf9; }
    .confidence-medium { background: #5a4a27; color: #fc9; }
    .confidence-low { background: #5a2727; color: #f99; }
    
    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 1200px) {
      .comparison { grid-template-columns: 1fr; }
    }
    
    .panel {
      background: #16213e;
      border-radius: 8px;
      padding: 20px;
    }
    .panel h2 {
      margin: 0 0 15px 0;
      font-size: 1.2rem;
      color: #7ec8e3;
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
    }
    
    .field {
      margin-bottom: 15px;
    }
    .field-label {
      font-size: 0.8rem;
      color: #888;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .field-value {
      background: #0f3460;
      padding: 10px;
      border-radius: 4px;
      font-size: 0.95rem;
      min-height: 24px;
    }
    .field-value.empty {
      color: #666;
      font-style: italic;
    }
    .field-value.match { border-left: 3px solid #4a9; }
    .field-value.diff { border-left: 3px solid #a54; }
    
    .content-preview {
      max-height: 400px;
      overflow-y: auto;
      font-size: 0.9rem;
      line-height: 1.6;
    }
    
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary {
      background: #4a9;
      color: #fff;
    }
    .btn-primary:hover { background: #3a8; }
    .btn-secondary {
      background: #333;
      color: #ccc;
    }
    .btn-secondary:hover { background: #444; }
    
    .nav {
      margin-bottom: 20px;
      padding: 10px;
      background: #16213e;
      border-radius: 6px;
    }
    .nav a {
      color: #7ec8e3;
      text-decoration: none;
      margin-right: 20px;
    }
    .nav a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/">📊 Dashboard</a>
    <a href="/review/low-confidence">⚠️ Low Confidence Queue</a>
    <a href="/review/unrated">📋 Unrated Queue</a>
  </nav>

  <div class="header">
    <h1>
      ${escapeHtml(stored?.title || 'Untitled')}
      ${confidence !== null ? `<span class="confidence-badge confidence-${getConfidenceLevel(confidence)}">${(confidence * 100).toFixed(0)}%</span>` : ''}
    </h1>
    <div class="url">${escapeHtml(url)}</div>
  </div>

  <div class="comparison">
    <!-- Stored Extraction -->
    <div class="panel">
      <h2>📄 Stored Extraction</h2>
      
      <div class="field">
        <div class="field-label">Title</div>
        <div class="field-value ${stored?.title ? '' : 'empty'}">${escapeHtml(stored?.title) || '(none)'}</div>
      </div>
      
      <div class="field">
        <div class="field-label">Date</div>
        <div class="field-value ${stored?.date ? '' : 'empty'}">${escapeHtml(stored?.date) || '(none)'}</div>
      </div>
      
      <div class="field">
        <div class="field-label">Section</div>
        <div class="field-value ${stored?.section ? '' : 'empty'}">${escapeHtml(stored?.section) || '(none)'}</div>
      </div>
      
      <div class="field">
        <div class="field-label">Word Count</div>
        <div class="field-value">${stored?.word_count || 0}</div>
      </div>
    </div>

    <!-- Readability Re-extraction -->
    <div class="panel">
      <h2>🔄 Readability (Fresh)</h2>
      
      <div class="field">
        <div class="field-label">Title</div>
        <div class="field-value ${readability?.title ? (readability.title === stored?.title ? 'match' : 'diff') : 'empty'}">
          ${escapeHtml(readability?.title) || '(none)'}
        </div>
      </div>
      
      <div class="field">
        <div class="field-label">Byline</div>
        <div class="field-value ${readability?.byline ? '' : 'empty'}">${escapeHtml(readability?.byline) || '(none)'}</div>
      </div>
      
      <div class="field">
        <div class="field-label">Excerpt</div>
        <div class="field-value ${readability?.excerpt ? '' : 'empty'}">${escapeHtml(readability?.excerpt?.slice(0, 200)) || '(none)'}${readability?.excerpt?.length > 200 ? '...' : ''}</div>
      </div>
      
      <div class="field">
        <div class="field-label">Word Count</div>
        <div class="field-value ${readability?.wordCount ? (Math.abs(readability.wordCount - (stored?.word_count || 0)) < 50 ? 'match' : 'diff') : ''}">
          ${readability?.wordCount || 0}
        </div>
      </div>
    </div>
  </div>

  <!-- Metadata Panel -->
  <div class="panel" style="margin-top: 20px;">
    <h2>📋 HTML Metadata Sources</h2>
    <div class="comparison" style="gap: 10px;">
      <div class="field">
        <div class="field-label">Title Sources</div>
        <div class="field-value">
          <strong>og:title:</strong> ${escapeHtml(metadata?.title?.og) || '—'}<br>
          <strong>twitter:title:</strong> ${escapeHtml(metadata?.title?.twitter) || '—'}<br>
          <strong>h1:</strong> ${escapeHtml(metadata?.title?.h1?.slice(0, 100)) || '—'}<br>
          <strong>title tag:</strong> ${escapeHtml(metadata?.title?.tag) || '—'}
        </div>
      </div>
      
      <div class="field">
        <div class="field-label">Date Sources</div>
        <div class="field-value">
          <strong>time[datetime]:</strong> ${escapeHtml(metadata?.date?.time) || '—'}<br>
          <strong>article:published_time:</strong> ${escapeHtml(metadata?.date?.published) || '—'}<br>
          <strong>article:modified_time:</strong> ${escapeHtml(metadata?.date?.modified) || '—'}
        </div>
      </div>
      
      <div class="field">
        <div class="field-label">Author Sources</div>
        <div class="field-value">
          <strong>meta[author]:</strong> ${escapeHtml(metadata?.author?.meta) || '—'}<br>
          <strong>article:author:</strong> ${escapeHtml(metadata?.author?.article) || '—'}<br>
          <strong>byline element:</strong> ${escapeHtml(metadata?.author?.byline?.slice(0, 100)) || '—'}
        </div>
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-primary" onclick="markGolden()">✅ Mark as Golden</button>
    <button class="btn btn-secondary" onclick="skipPage()">⏭️ Skip</button>
    <button class="btn btn-secondary" onclick="flagIssue()">🚩 Flag Issue</button>
  </div>

  <script>
    function markGolden() {
      alert('Golden marking not yet implemented. Would save to golden_extractions table.');
    }
    function skipPage() {
      window.location.href = '/review/low-confidence';
    }
    function flagIssue() {
      alert('Issue flagging not yet implemented.');
    }
  </script>
</body>
</html>`;
}

function getConfidenceLevel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'good';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function renderDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Diff Tool - Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #7ec8e3; }
    .search-box {
      display: flex;
      gap: 10px;
      margin: 20px 0;
    }
    .search-box input {
      flex: 1;
      padding: 12px;
      font-size: 1rem;
      border: 2px solid #333;
      border-radius: 6px;
      background: #16213e;
      color: #eee;
    }
    .search-box button {
      padding: 12px 24px;
      background: #4a9;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .queues {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }
    .queue-card {
      background: #16213e;
      border-radius: 8px;
      padding: 20px;
    }
    .queue-card h2 {
      margin: 0 0 15px 0;
      font-size: 1.2rem;
    }
    .queue-card a {
      display: block;
      padding: 10px;
      margin: 5px 0;
      background: #0f3460;
      border-radius: 4px;
      color: #7ec8e3;
      text-decoration: none;
    }
    .queue-card a:hover { background: #1a4a7a; }
  </style>
</head>
<body>
  <h1>🔄 Visual Diff Tool</h1>
  <p>Compare Readability extraction vs. stored analysis. Identify quality issues and build golden reference sets.</p>
  
  <div class="search-box">
    <input type="text" id="urlInput" placeholder="Enter URL or analysis ID..." />
    <button onclick="goToPage()">Compare</button>
  </div>
  
  <div class="queues">
    <div class="queue-card">
      <h2>⚠️ Low Confidence Queue</h2>
      <p>Pages with confidence < 60% that may need review.</p>
      <a href="/review/low-confidence">View Queue →</a>
    </div>
    
    <div class="queue-card">
      <h2>📋 Unrated Queue</h2>
      <p>Pages without confidence scores (need backfill).</p>
      <a href="/review/unrated">View Queue →</a>
    </div>
    
    <div class="queue-card">
      <h2>✅ Golden Set</h2>
      <p>Reference extractions marked as ground truth.</p>
      <a href="/golden">View Golden Set →</a>
    </div>
  </div>
  
  <script>
    function goToPage() {
      const input = document.getElementById('urlInput').value.trim();
      if (input) {
        window.location.href = '/compare?q=' + encodeURIComponent(input);
      }
    }
    document.getElementById('urlInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') goToPage();
    });
  </script>
</body>
</html>`;
}

function renderQueue(pages, title, emptyMessage) {
  const rows = pages.map(p => `
    <tr>
      <td><a href="/compare?q=${p.analysis_id}">${p.analysis_id}</a></td>
      <td class="url-cell">${escapeHtml(p.url?.slice(0, 60) || '—')}${p.url?.length > 60 ? '...' : ''}</td>
      <td>${escapeHtml(p.title?.slice(0, 40) || '—')}${p.title?.length > 40 ? '...' : ''}</td>
      <td>${p.confidence_score !== undefined ? (p.confidence_score * 100).toFixed(0) + '%' : '—'}</td>
      <td>${p.word_count || 0}</td>
    </tr>
  `).join('');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #7ec8e3; }
    .nav { margin-bottom: 20px; }
    .nav a { color: #7ec8e3; margin-right: 20px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #16213e;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #0f3460; }
    tr:hover { background: #1a3a5a; }
    a { color: #7ec8e3; }
    .url-cell { font-size: 0.85rem; color: #888; }
    .empty { text-align: center; padding: 40px; color: #666; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/">← Dashboard</a>
  </nav>
  <h1>${escapeHtml(title)}</h1>
  ${pages.length === 0 
    ? `<div class="empty">${escapeHtml(emptyMessage)}</div>`
    : `<table>
        <thead>
          <tr>
            <th>ID</th>
            <th>URL</th>
            <th>Title</th>
            <th>Confidence</th>
            <th>Words</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  
  app.get('/', (req, res) => {
    res.send(renderDashboard());
  });
  
  app.get('/compare', (req, res) => {
    const query = req.query.q;
    if (!query) {
      return res.redirect('/');
    }
    
    const db = getDb();
    try {
      const row = loadPageData(db, query);
      if (!row) {
        return res.status(404).send('Page not found');
      }
      
      const html = getHtmlContent(db, row);
      const readability = html ? runReadability(html, row.url) : { error: 'No HTML content' };
      const metadata = html ? extractMetadata(html, row.url) : { error: 'No HTML content' };
      
      res.send(renderDiffPage({
        url: row.url,
        stored: row,
        readability,
        metadata,
        confidence: row.confidence_score
      }));
    } finally {
      db.close();
    }
  });
  
  app.get('/review/low-confidence', (req, res) => {
    const db = getDb();
    try {
      const pages = getLowConfidencePages(db, 100);
      res.send(renderQueue(pages, '⚠️ Low Confidence Queue', 'No low-confidence pages found. Great job!'));
    } finally {
      db.close();
    }
  });
  
  app.get('/review/unrated', (req, res) => {
    const db = getDb();
    try {
      const pages = getUnratedPages(db, 100);
      res.send(renderQueue(pages, '📋 Unrated Queue', 'All pages have been rated. Run confidence-backfill to score more.'));
    } finally {
      db.close();
    }
  });
  
  app.get('/golden', (req, res) => {
    res.send(renderQueue([], '✅ Golden Reference Set', 'No golden extractions yet. Mark pages as golden during review.'));
  });
  
  // API endpoints
  app.get('/api/compare/:id', (req, res) => {
    const db = getDb();
    try {
      const row = loadPageData(db, req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const html = getHtmlContent(db, row);
      const readability = html ? runReadability(html, row.url) : { error: 'No HTML' };
      const metadata = html ? extractMetadata(html, row.url) : { error: 'No HTML' };
      
      res.json({
        url: row.url,
        stored: {
          title: row.title,
          date: row.date,
          section: row.section,
          word_count: row.word_count,
          confidence_score: row.confidence_score
        },
        readability,
        metadata
      });
    } finally {
      db.close();
    }
  });
  
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : DEFAULT_PORT;
  
  const app = createApp();
  app.listen(port, () => {
    console.log(`\n🔄 Visual Diff Tool running at http://localhost:${port}\n`);
    console.log('  Dashboard:         http://localhost:' + port);
    console.log('  Low confidence:    http://localhost:' + port + '/review/low-confidence');
    console.log('  Unrated:           http://localhost:' + port + '/review/unrated');
    console.log('  Compare by ID:     http://localhost:' + port + '/compare?q=<analysis_id>');
    console.log('  Compare by URL:    http://localhost:' + port + '/compare?q=<url>\n');
  });
}

module.exports = { createApp };
