'use strict';

/**
 * Template Teaching Server
 * 
 * UI for teaching extraction rules from Teacher output.
 * Allows operators to:
 * 1. View Teacher's visual analysis
 * 2. Validate/adjust CSS selectors for title, body, date, author
 * 3. Save extraction configs to layout_templates
 * 4. Test extraction on sample pages
 * 
 * @module ui/server/templateTeacher
 */

const express = require('express');
const path = require('path');
const { JSDOM } = require('jsdom');

const { TemplateExtractor, TemplateExtractionService } = require('../../../extraction');
const { TeacherService } = require('../../../teacher/TeacherService');
const { createLayoutTemplatesQueries } = require('../../../db/sqlite/v1/queries/layoutTemplates');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');

const app = express();
const DEFAULT_PORT = Number(process.env.TEMPLATE_TEACHER_PORT) || 3022;

function resolvePortFromArgv(defaultPort) {
  const portIndex = process.argv.indexOf("--port");
  if (portIndex === -1) return defaultPort;

  const value = process.argv[portIndex + 1];
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultPort;
  return parsed;
}

const PORT = resolvePortFromArgv(DEFAULT_PORT);

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize DB and services
let db, templateService, templateExtractor, teacherService;
let closeDb = () => {};

function initServices(options = {}) {
  const defaultDbPath = path.resolve(__dirname, '../../../../data/news.db');
  const dbPath = options.dbPath || defaultDbPath;

  const resolved = resolveBetterSqliteHandle({
    dbPath,
    readonly: false,
    getDbHandle: options.getDbHandle,
    getDbRW: options.getDbRW
  });

  db = resolved.dbHandle;
  closeDb = resolved.close;
  
  const queries = createLayoutTemplatesQueries(db);
  templateExtractor = new TemplateExtractor();
  templateService = new TemplateExtractionService({
    db,
    layoutTemplateQueries: queries,
    templateExtractor
  });
  
  // Teacher is optional (requires Puppeteer)
  if (TeacherService.isAvailable()) {
    teacherService = new TeacherService({ pagePoolSize: 1 });
  }

  return {
    close: async () => {
      try {
        if (teacherService) await teacherService.shutdown();
      } catch {
        // ignore
      }
      try {
        closeDb();
      } catch {
        // ignore
      }
    }
  };
}

// HTML Templates
const pageTemplate = (title, content) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Template Teacher</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --primary: #0f3460;
      --accent: #e94560;
      --text: #eee;
      --text-muted: #888;
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      background: var(--surface);
      padding: 15px 20px;
      border-bottom: 2px solid var(--accent);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 { font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
    nav a {
      color: var(--text);
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 4px;
      margin-left: 10px;
    }
    nav a:hover { background: var(--primary); }
    nav a.active { background: var(--accent); }
    .card {
      background: var(--surface);
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .card h2 {
      font-size: 1.2rem;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--primary);
    }
    .form-group { margin-bottom: 15px; }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--primary);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text);
      font-family: 'Consolas', 'Monaco', monospace;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: #c73a52; }
    .btn-secondary { background: var(--primary); color: white; }
    .btn-secondary:hover { background: #0a2848; }
    .grid { display: grid; gap: 20px; }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 900px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: bold;
    }
    .badge-success { background: var(--success); color: white; }
    .badge-warning { background: var(--warning); color: black; }
    .badge-error { background: var(--error); color: white; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid var(--primary); }
    th { color: var(--text-muted); font-weight: 500; }
    tr:hover { background: rgba(255,255,255,0.05); }
    .preview-panel {
      background: white;
      color: black;
      border-radius: 4px;
      padding: 20px;
      max-height: 400px;
      overflow: auto;
    }
    .selector-highlight {
      background: rgba(233, 69, 96, 0.3);
      outline: 2px solid var(--accent);
    }
    .result-box {
      background: var(--bg);
      border: 1px solid var(--primary);
      border-radius: 4px;
      padding: 15px;
      margin-top: 10px;
      font-family: 'Consolas', monospace;
      font-size: 0.9rem;
      max-height: 300px;
      overflow: auto;
    }
    .stats { display: flex; gap: 20px; flex-wrap: wrap; }
    .stat-card {
      background: var(--primary);
      padding: 15px 25px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 2rem; font-weight: bold; color: var(--accent); }
    .stat-label { color: var(--text-muted); font-size: 0.9rem; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    .flex { display: flex; gap: 10px; align-items: center; }
    .flex-grow { flex: 1; }
  </style>
</head>
<body>
  <header>
    <h1>🎓 Template Teacher</h1>
    <nav>
      <a href="/" ${title === 'Dashboard' ? 'class="active"' : ''}>Dashboard</a>
      <a href="/teach" ${title === 'Teach' ? 'class="active"' : ''}>Teach New</a>
      <a href="/templates" ${title === 'Templates' ? 'class="active"' : ''}>Templates</a>
      <a href="/test" ${title === 'Test' ? 'class="active"' : ''}>Test</a>
    </nav>
  </header>
  <main class="container">
    ${content}
  </main>
  <script>
    // Shared JavaScript
    async function api(endpoint, options = {}) {
      const res = await fetch('/api' + endpoint, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      return res.json();
    }
  </script>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────

// Dashboard
app.get('/', (req, res) => {
  const stats = templateService.getStats();
  
  // Get recent templates
  const recentTemplates = db.prepare(`
    SELECT host, COUNT(*) as count, MAX(updated_at) as last_update
    FROM layout_templates
    WHERE extraction_config_json IS NOT NULL
    GROUP BY host
    ORDER BY last_update DESC
    LIMIT 10
  `).all();
  
  const content = `
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${stats.savedConfigs}</div>
        <div class="stat-label">Configs Saved</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.templateHits}</div>
        <div class="stat-label">Template Hits</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.templateMisses}</div>
        <div class="stat-label">Template Misses</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.cacheHits}</div>
        <div class="stat-label">Cache Hits</div>
      </div>
    </div>
    
    <div class="card">
      <h2>📊 Templates by Host</h2>
      <table>
        <thead>
          <tr>
            <th>Host</th>
            <th>Templates</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${recentTemplates.map(t => `
            <tr>
              <td>${t.host || '(no host)'}</td>
              <td>${t.count}</td>
              <td>${new Date(t.last_update).toLocaleDateString()}</td>
              <td>
                <a href="/templates?host=${encodeURIComponent(t.host || '')}" class="btn-secondary" style="padding: 4px 10px; text-decoration: none;">View</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <h2>🚀 Quick Actions</h2>
      <div class="flex">
        <a href="/teach" class="btn-primary" style="text-decoration: none;">Teach New Template</a>
        <a href="/test" class="btn-secondary" style="text-decoration: none;">Test Extraction</a>
      </div>
    </div>
  `;
  
  res.send(pageTemplate('Dashboard', content));
});

// Teach new template
app.get('/teach', (req, res) => {
  const teacherAvailable = TeacherService.isAvailable();
  
  const content = `
    <div class="card">
      <h2>🎓 Teach New Extraction Template</h2>
      <p style="color: var(--text-muted); margin-bottom: 20px;">
        Provide a URL and define CSS selectors to extract article content. The system will learn these patterns for future pages with the same layout.
      </p>
      
      <form id="teach-form">
        <div class="form-group">
          <label>URL to Analyze</label>
          <div class="flex">
            <input type="url" name="url" id="url" placeholder="https://example.com/article/123" required class="flex-grow">
            <button type="button" onclick="analyzeUrl()" class="btn-secondary">Analyze</button>
          </div>
        </div>
        
        <div id="analysis-result" style="display: none;">
          <div class="grid grid-2">
            <div class="card" style="margin: 10px 0;">
              <h2>📐 Selectors</h2>
              
              <div class="form-group">
                <label>Title Selector</label>
                <input type="text" name="titleSelector" id="titleSelector" placeholder="h1.article-headline">
              </div>
              
              <div class="form-group">
                <label>Body Selector</label>
                <input type="text" name="bodySelector" id="bodySelector" placeholder="article.content, .article-body">
              </div>
              
              <div class="form-group">
                <label>Date Selector</label>
                <input type="text" name="dateSelector" id="dateSelector" placeholder="time[datetime], .publish-date">
              </div>
              
              <div class="form-group">
                <label>Author Selector</label>
                <input type="text" name="authorSelector" id="authorSelector" placeholder=".byline a, .author">
              </div>
              
              <div class="form-group">
                <label>Exclude Selectors (comma-separated)</label>
                <input type="text" name="excludeSelectors" id="excludeSelectors" placeholder=".ad, .newsletter, .related-articles">
              </div>
              
              <button type="button" onclick="testSelectors()" class="btn-secondary">Test Selectors</button>
            </div>
            
            <div class="card" style="margin: 10px 0;">
              <h2>📄 Preview</h2>
              <div id="preview-panel" class="preview-panel">
                <p style="color: #888;">Analyze a URL to see the page content</p>
              </div>
            </div>
          </div>
          
          <div class="card" style="margin: 10px 0;">
            <h2>🧪 Extraction Result</h2>
            <div id="extraction-result" class="result-box">
              <p style="color: #888;">Test your selectors to see extraction results</p>
            </div>
          </div>
          
          <div class="card" style="margin: 10px 0;">
            <h2>💾 Save Template</h2>
            <div class="grid grid-3">
              <div class="form-group">
                <label>Signature Hash</label>
                <input type="text" name="signatureHash" id="signatureHash" readonly>
              </div>
              <div class="form-group">
                <label>Host</label>
                <input type="text" name="host" id="host" readonly>
              </div>
              <div class="form-group">
                <label>Label (optional)</label>
                <input type="text" name="label" id="label" placeholder="Article template">
              </div>
            </div>
            <div class="form-group">
              <label>Notes (optional)</label>
              <textarea name="notes" id="notes" rows="2" placeholder="Any notes about this template..."></textarea>
            </div>
            <button type="submit" class="btn-primary">Save Template</button>
          </div>
        </div>
      </form>
    </div>
    
    <script>
      let pageHtml = '';
      let signatureHash = '';
      
      async function analyzeUrl() {
        const url = document.getElementById('url').value;
        if (!url) return;
        
        const preview = document.getElementById('preview-panel');
        preview.innerHTML = '<p>Loading...</p>';
        
        try {
          const result = await api('/analyze?url=' + encodeURIComponent(url));
          
          if (result.error) {
            preview.innerHTML = '<p style="color: red;">' + result.error + '</p>';
            return;
          }
          
          pageHtml = result.html;
          signatureHash = result.signatureHash || 'unknown';
          
          // Show analysis result section
          document.getElementById('analysis-result').style.display = 'block';
          
          // Update signature and host
          document.getElementById('signatureHash').value = signatureHash;
          document.getElementById('host').value = result.host || new URL(url).hostname;
          
          // Show preview (sanitized)
          preview.innerHTML = result.previewHtml || '<p>No preview available</p>';
          
          // Pre-fill suggested selectors if available
          if (result.suggested) {
            if (result.suggested.title) document.getElementById('titleSelector').value = result.suggested.title;
            if (result.suggested.body) document.getElementById('bodySelector').value = result.suggested.body;
            if (result.suggested.date) document.getElementById('dateSelector').value = result.suggested.date;
            if (result.suggested.author) document.getElementById('authorSelector').value = result.suggested.author;
          }
          
        } catch (err) {
          preview.innerHTML = '<p style="color: red;">Error: ' + err.message + '</p>';
        }
      }
      
      async function testSelectors() {
        const resultBox = document.getElementById('extraction-result');
        
        const config = {
          titleSelector: document.getElementById('titleSelector').value || null,
          bodySelector: document.getElementById('bodySelector').value || null,
          dateSelector: document.getElementById('dateSelector').value || null,
          authorSelector: document.getElementById('authorSelector').value || null,
          excludeSelectors: document.getElementById('excludeSelectors').value.split(',').map(s => s.trim()).filter(s => s)
        };
        
        try {
          const result = await api('/test-extraction', {
            method: 'POST',
            body: JSON.stringify({ html: pageHtml, config, url: document.getElementById('url').value })
          });
          
          if (result.error) {
            resultBox.innerHTML = '<p style="color: #f44336;">Error: ' + result.error + '</p>';
            return;
          }
          
          resultBox.innerHTML = \`
            <p><strong>Success:</strong> <span class="badge \${result.success ? 'badge-success' : 'badge-error'}">\${result.success ? 'Yes' : 'No'}</span></p>
            <p><strong>Title:</strong> \${result.title || '(not found)'}</p>
            <p><strong>Author:</strong> \${result.author || '(not found)'}</p>
            <p><strong>Date:</strong> \${result.publicationDate || '(not found)'}</p>
            <p><strong>Word Count:</strong> \${result.wordCount}</p>
            <p><strong>Extraction Time:</strong> \${result.extractionTimeMs}ms</p>
            <p><strong>Selectors Used:</strong></p>
            <pre>\${JSON.stringify(result.selectors, null, 2)}</pre>
            <p><strong>Body Preview:</strong></p>
            <pre style="max-height: 150px; overflow: auto;">\${(result.text || '').substring(0, 500)}...</pre>
          \`;
        } catch (err) {
          resultBox.innerHTML = '<p style="color: #f44336;">Error: ' + err.message + '</p>';
        }
      }
      
      document.getElementById('teach-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const config = {
          version: 1,
          titleSelector: document.getElementById('titleSelector').value || null,
          bodySelector: document.getElementById('bodySelector').value || null,
          dateSelector: document.getElementById('dateSelector').value || null,
          authorSelector: document.getElementById('authorSelector').value || null,
          excludeSelectors: document.getElementById('excludeSelectors').value.split(',').map(s => s.trim()).filter(s => s),
          trainedAt: new Date().toISOString(),
          trainedFrom: document.getElementById('url').value
        };
        
        try {
          const result = await api('/save-template', {
            method: 'POST',
            body: JSON.stringify({
              signatureHash: document.getElementById('signatureHash').value,
              config,
              host: document.getElementById('host').value,
              label: document.getElementById('label').value,
              notes: document.getElementById('notes').value,
              exampleUrl: document.getElementById('url').value
            })
          });
          
          if (result.success) {
            alert('Template saved successfully!');
            window.location.href = '/templates?host=' + encodeURIComponent(document.getElementById('host').value);
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    </script>
  `;
  
  res.send(pageTemplate('Teach', content));
});

// List templates
app.get('/templates', (req, res) => {
  const hostFilter = req.query.host || null;
  
  let query = `
    SELECT id, signature_hash, host, label, example_url, extraction_config_json, updated_at
    FROM layout_templates
    WHERE extraction_config_json IS NOT NULL
  `;
  const params = [];
  
  if (hostFilter) {
    query += ' AND host = ?';
    params.push(hostFilter);
  }
  
  query += ' ORDER BY updated_at DESC LIMIT 50';
  
  const templates = db.prepare(query).all(...params);
  
  const content = `
    <div class="card">
      <h2>📋 Extraction Templates ${hostFilter ? `for ${hostFilter}` : ''}</h2>
      ${hostFilter ? `<a href="/templates" class="btn-secondary" style="margin-bottom: 15px; display: inline-block; text-decoration: none;">Show All</a>` : ''}
      
      <table>
        <thead>
          <tr>
            <th>Host</th>
            <th>Label</th>
            <th>Signature</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${templates.map(t => `
            <tr>
              <td>${t.host || '(no host)'}</td>
              <td>${t.label || '(no label)'}</td>
              <td><code>${t.signature_hash?.substring(0, 16) || '?'}...</code></td>
              <td>${new Date(t.updated_at).toLocaleDateString()}</td>
              <td>
                <a href="/template/${t.id}" class="btn-secondary" style="padding: 4px 10px; text-decoration: none;">View</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  res.send(pageTemplate('Templates', content));
});

// View single template
app.get('/template/:id', (req, res) => {
  const template = db.prepare(`
    SELECT * FROM layout_templates WHERE id = ?
  `).get(req.params.id);
  
  if (!template) {
    return res.status(404).send(pageTemplate('Not Found', '<p>Template not found</p>'));
  }
  
  let config = {};
  try {
    config = JSON.parse(template.extraction_config_json || '{}');
  } catch (e) {}
  
  const content = `
    <div class="card">
      <h2>📄 Template: ${template.label || template.signature_hash?.substring(0, 16)}</h2>
      
      <div class="grid grid-2">
        <div>
          <p><strong>Host:</strong> ${template.host || '(none)'}</p>
          <p><strong>Signature:</strong> <code>${template.signature_hash}</code></p>
          <p><strong>Producer:</strong> ${template.producer}</p>
          <p><strong>Updated:</strong> ${new Date(template.updated_at).toLocaleString()}</p>
          ${template.example_url ? `<p><strong>Example:</strong> <a href="${template.example_url}" target="_blank">${template.example_url}</a></p>` : ''}
          ${template.notes ? `<p><strong>Notes:</strong> ${template.notes}</p>` : ''}
        </div>
        <div>
          <p><strong>Config Confidence:</strong> ${(config.confidence ?? 0).toFixed(2)}</p>
          <p><strong>Trained At:</strong> ${config.trainedAt || '(unknown)'}</p>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>📐 Extraction Config</h2>
      <pre class="result-box">${JSON.stringify(config, null, 2)}</pre>
    </div>
    
    <div class="card">
      <h2>🧪 Test Template</h2>
      <form id="test-form">
        <div class="form-group">
          <label>Test URL</label>
          <div class="flex">
            <input type="url" name="testUrl" id="testUrl" placeholder="${template.example_url || 'https://example.com/article'}" class="flex-grow">
            <button type="submit" class="btn-primary">Test Extraction</button>
          </div>
        </div>
      </form>
      <div id="test-result" class="result-box" style="display: none;"></div>
    </div>
    
    <script>
      const config = ${JSON.stringify(config)};
      
      document.getElementById('test-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('testUrl').value;
        if (!url) return;
        
        const resultBox = document.getElementById('test-result');
        resultBox.style.display = 'block';
        resultBox.innerHTML = 'Loading...';
        
        try {
          // First fetch the HTML
          const fetchResult = await api('/fetch-html?url=' + encodeURIComponent(url));
          if (fetchResult.error) {
            resultBox.innerHTML = '<p style="color: red;">' + fetchResult.error + '</p>';
            return;
          }
          
          // Then test extraction
          const result = await api('/test-extraction', {
            method: 'POST',
            body: JSON.stringify({ html: fetchResult.html, config, url })
          });
          
          resultBox.innerHTML = \`
            <p><strong>Success:</strong> <span class="badge \${result.success ? 'badge-success' : 'badge-error'}">\${result.success ? 'Yes' : 'No'}</span></p>
            <p><strong>Title:</strong> \${result.title || '(not found)'}</p>
            <p><strong>Author:</strong> \${result.author || '(not found)'}</p>
            <p><strong>Date:</strong> \${result.publicationDate || '(not found)'}</p>
            <p><strong>Word Count:</strong> \${result.wordCount}</p>
            <p><strong>Body Preview:</strong></p>
            <pre style="max-height: 150px; overflow: auto;">\${(result.text || '').substring(0, 500)}...</pre>
          \`;
        } catch (err) {
          resultBox.innerHTML = '<p style="color: red;">Error: ' + err.message + '</p>';
        }
      });
    </script>
  `;
  
  res.send(pageTemplate('Template', content));
});

// Test page
app.get('/test', (req, res) => {
  const content = `
    <div class="card">
      <h2>🧪 Test Template Extraction</h2>
      <p style="color: var(--text-muted); margin-bottom: 20px;">
        Test if a URL matches a known template and how the extraction performs.
      </p>
      
      <form id="test-form">
        <div class="form-group">
          <label>URL to Test</label>
          <div class="flex">
            <input type="url" name="url" id="url" placeholder="https://example.com/article/123" required class="flex-grow">
            <button type="submit" class="btn-primary">Test</button>
          </div>
        </div>
      </form>
      
      <div id="result" class="card" style="display: none; margin-top: 20px;">
        <h2>Result</h2>
        <div id="result-content"></div>
      </div>
    </div>
    
    <script>
      document.getElementById('test-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('url').value;
        
        const resultDiv = document.getElementById('result');
        const resultContent = document.getElementById('result-content');
        resultDiv.style.display = 'block';
        resultContent.innerHTML = 'Testing...';
        
        try {
          const result = await api('/test-url?url=' + encodeURIComponent(url));
          
          if (result.error) {
            resultContent.innerHTML = '<p style="color: #f44336;">Error: ' + result.error + '</p>';
            return;
          }
          
          resultContent.innerHTML = \`
            <p><strong>Template Found:</strong> <span class="badge \${result.templateFound ? 'badge-success' : 'badge-warning'}">\${result.templateFound ? 'Yes' : 'No'}</span></p>
            \${result.signatureHash ? '<p><strong>Signature:</strong> <code>' + result.signatureHash + '</code></p>' : ''}
            \${result.templateFound ? \`
              <p><strong>Extraction Success:</strong> <span class="badge \${result.extraction?.success ? 'badge-success' : 'badge-error'}">\${result.extraction?.success ? 'Yes' : 'No'}</span></p>
              <p><strong>Title:</strong> \${result.extraction?.title || '(not found)'}</p>
              <p><strong>Word Count:</strong> \${result.extraction?.wordCount || 0}</p>
              <p><strong>Extraction Time:</strong> \${result.extraction?.extractionTimeMs || 0}ms</p>
              <p><strong>Body Preview:</strong></p>
              <pre class="result-box" style="max-height: 200px;">\${(result.extraction?.text || '').substring(0, 500)}...</pre>
            \` : \`
              <p style="color: var(--text-muted);">No template found for this page layout. <a href="/teach?url=\${encodeURIComponent(url)}">Teach a new template</a></p>
            \`}
          \`;
        } catch (err) {
          resultContent.innerHTML = '<p style="color: #f44336;">Error: ' + err.message + '</p>';
        }
      });
    </script>
  `;
  
  res.send(pageTemplate('Test', content));
});

// ─────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────

// Analyze URL (fetch and analyze structure)
app.get('/api/analyze', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.json({ error: 'URL required' });
  }
  
  try {
    let html, structure;
    
    // Try Teacher first if available
    if (teacherService) {
      await teacherService.initialize();
      const result = await teacherService.analyzeVisualStructure(url);
      html = result.html;
      structure = result.structure;
    } else {
      // Fallback to simple fetch
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
      });
      html = await response.text();
    }
    
    // Parse for preview
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Extract host
    const host = new URL(url).hostname;
    
    // Generate simple signature (placeholder - real system would use SkeletonHash)
    const signatureHash = `temp_${Date.now().toString(36)}`;
    
    // Create sanitized preview
    const article = document.querySelector('article') || document.querySelector('main') || document.body;
    const previewHtml = article ? article.innerHTML.substring(0, 5000) : '(no preview)';
    
    // Suggest selectors based on common patterns
    const suggested = {
      title: document.querySelector('h1') ? 'h1' : null,
      body: document.querySelector('article') ? 'article' : (document.querySelector('main') ? 'main' : null),
      date: document.querySelector('time[datetime]') ? 'time[datetime]' : null,
      author: document.querySelector('.byline') ? '.byline' : (document.querySelector('.author') ? '.author' : null)
    };
    
    res.json({
      success: true,
      html,
      host,
      signatureHash,
      previewHtml,
      suggested,
      structure
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Fetch HTML only
app.get('/api/fetch-html', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.json({ error: 'URL required' });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const html = await response.text();
    res.json({ success: true, html });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Test extraction with config
app.post('/api/test-extraction', (req, res) => {
  const { html, config, url } = req.body;
  
  if (!html) {
    return res.json({ error: 'HTML required' });
  }
  
  if (!config) {
    return res.json({ error: 'Config required' });
  }
  
  try {
    const result = templateExtractor.extract(html, config, { url });
    res.json(result);
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Save template
app.post('/api/save-template', (req, res) => {
  const { signatureHash, config, host, label, notes, exampleUrl } = req.body;
  
  if (!signatureHash) {
    return res.json({ success: false, error: 'Signature hash required' });
  }
  
  if (!config) {
    return res.json({ success: false, error: 'Config required' });
  }
  
  try {
    // Ensure signature exists in layout_signatures (create if needed for teaching)
    const sigExists = db.prepare('SELECT 1 FROM layout_signatures WHERE signature_hash = ?').get(signatureHash);
    if (!sigExists) {
      db.prepare(`
        INSERT INTO layout_signatures (signature_hash, level, signature, first_seen_url)
        VALUES (?, 2, ?, ?)
      `).run(signatureHash, JSON.stringify({ taught: true }), exampleUrl);
    }
    
    templateService.saveConfig(signatureHash, config, { host, label, notes, exampleUrl });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Test URL against existing templates
app.get('/api/test-url', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.json({ error: 'URL required' });
  }
  
  try {
    // Fetch HTML
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const html = await response.text();
    const host = new URL(url).hostname;
    
    // Try to find matching template by host
    const templates = templateService.listConfigsForHost(host);
    
    if (templates.length === 0) {
      return res.json({
        templateFound: false,
        host
      });
    }
    
    // Try first template
    const template = templates[0];
    const extraction = templateExtractor.extract(html, template.config, { url });
    
    res.json({
      templateFound: true,
      signatureHash: template.signatureHash,
      label: template.label,
      extraction
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

async function createTemplateTeacherRouter(options = {}) {
  const lifecycle = initServices(options);
  return { router: app, close: lifecycle.close };
}

// Start server
if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'TemplateTeacher';
  const lifecycle = initServices();

  const server = wrapServerForCheck(app, PORT, undefined, () => {
    console.log(`🎓 Template Teacher running at http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    try {
      server.close();
    } catch {
      // ignore
    }
    await lifecycle.close();
  };

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdown().finally(() => process.exit(0));
  });
}

module.exports = { app, initServices, createTemplateTeacherRouter };
