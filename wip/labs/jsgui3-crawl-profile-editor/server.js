/**
 * Crawl Profile Editor - Express + jsgui3-html SSR Lab
 * 
 * This lab demonstrates:
 * - SSR with jsgui3-html controls
 * - Inline client JS for interactivity
 * - Form validation and state handling
 * 
 * Since jsgui3-server bundling has issues with symlinked packages,
 * we use a simpler Express + SSR approach that works reliably.
 */
'use strict';

const express = require('express');
const jsgui = require('jsgui3-html');
const { Control, controls, html, makeEl, makeDocument, text } = jsgui;

// ─────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────

const OPERATIONS = [
  {
    name: 'siteExplorer',
    label: 'Site Explorer',
    icon: '🔍',
    description: 'Explore entire site structure',
    optionSchema: {
      maxDepth: { type: 'integer', description: 'Maximum crawl depth', minimum: 1, maximum: 10, default: 3 },
      maxPages: { type: 'integer', description: 'Maximum pages to crawl', minimum: 1, maximum: 10000, default: 100 },
      followExternalLinks: { type: 'boolean', description: 'Follow links to external domains', default: false }
    }
  },
  {
    name: 'articleCrawl',
    label: 'Article Crawler',
    icon: '📰',
    description: 'Crawl news articles',
    optionSchema: {
      maxPages: { type: 'integer', description: 'Maximum articles to crawl', minimum: 1, maximum: 1000, default: 50 },
      filterByDate: { type: 'boolean', description: 'Only crawl recent articles', default: true },
      daysBack: { type: 'integer', description: 'Days to look back', minimum: 1, maximum: 365, default: 7 }
    }
  }
];

let PROFILES = [
  { id: 'guardian-articles', label: 'The Guardian Articles', startUrl: 'https://www.theguardian.com', operationName: 'articleCrawl', options: { maxPages: 100 } },
  { id: 'bbc-news', label: 'BBC News', startUrl: 'https://www.bbc.com/news', operationName: 'siteExplorer', options: { maxDepth: 2 } }
];

// ─────────────────────────────────────────────────────────────
// Controls
// ─────────────────────────────────────────────────────────────

class Profile_Editor_Page extends Control {
  constructor(spec = {}) {
    super(spec);
    this.profile = spec.profile || null;
    this.operations = spec.operations || [];
    
    if (!spec.el) {
      this._composeDocument();
    }
  }
  
  _composeDocument() {
    const { context } = this;
    const ctx = context;
    const isNew = !this.profile;
    
    // Build HTML document
    const doc = makeDocument(ctx);
    doc.head.add(makeEl(ctx, 'title').add(text(ctx, isNew ? 'New Profile' : `Edit: ${this.profile?.label}`)));
    doc.head.add(this._composeStyles());
    doc.head.add(this._composeClientScript());
    
    // Header
    const header = makeEl(ctx, 'header', { class: 'app-header' });
    header.add(makeEl(ctx, 'h1').add(text(ctx, isNew ? '🆕 New Profile' : `✏️ Edit: ${this.profile?.label}`)));
    header.add(makeEl(ctx, 'a', { href: '/', class: 'back-link' }).add(text(ctx, '← Back to Profiles')));
    doc.body.add(header);
    
    // Form
    const form = makeEl(ctx, 'form', { 
      method: 'post', 
      action: isNew ? '/api/profiles' : `/api/profiles/${this.profile?.id}`,
      class: 'profile-form',
      id: 'profileForm'
    });
    
    // Status bar
    form.add(makeEl(ctx, 'div', { class: 'status-bar', id: 'statusBar' }));
    
    // Basic info section
    form.add(this._composeBasicSection());
    
    // Operation options section  
    form.add(this._composeOptionsSection());
    
    // Advanced section (collapsible!)
    form.add(this._composeAdvancedSection());
    
    // Actions
    const actions = makeEl(ctx, 'div', { class: 'form-actions' });
    actions.add(makeEl(ctx, 'button', { type: 'submit', class: 'btn btn--primary' }).add(text(ctx, isNew ? '✨ Create Profile' : '💾 Save Changes')));
    actions.add(makeEl(ctx, 'a', { href: '/', class: 'btn btn--secondary' }).add(text(ctx, 'Cancel')));
    if (!isNew) {
      actions.add(makeEl(ctx, 'button', { type: 'button', class: 'btn btn--danger', onclick: 'deleteProfile()' }).add(text(ctx, '🗑️ Delete')));
    }
    form.add(actions);
    
    doc.body.add(form);
    this.add(doc);
  }
  
  _composeBasicSection() {
    const { context } = this;
    const ctx = context;
    
    const section = makeEl(ctx, 'section', { class: 'form-section' });
    section.add(makeEl(ctx, 'h2', { class: 'section-title' }).add(text(ctx, '📋 Basic Information')));
    
    const grid = makeEl(ctx, 'div', { class: 'form-grid' });
    
    // ID field
    grid.add(this._composeTextField('id', 'Profile ID', this.profile?.id || '', 'my-crawl-profile', 'Unique identifier (lowercase, hyphens)'));
    
    // Label field
    grid.add(this._composeTextField('label', 'Display Label', this.profile?.label || '', 'My Crawl Profile'));
    
    // Start URL
    grid.add(this._composeTextField('startUrl', 'Start URL', this.profile?.startUrl || '', 'https://example.com', 'Initial URL to begin crawling', true));
    
    // Operation select
    const opField = makeEl(ctx, 'div', { class: 'form-field form-field--full' });
    opField.add(makeEl(ctx, 'label', { for: 'operationName' }).add(text(ctx, 'Crawl Operation')));
    const select = makeEl(ctx, 'select', { name: 'operationName', id: 'operationName' });
    for (const op of this.operations) {
      const attrs = { value: op.name };
      if (op.name === this.profile?.operationName) attrs.selected = 'selected';
      select.add(makeEl(ctx, 'option', attrs).add(text(ctx, `${op.icon} ${op.label}`)));
    }
    opField.add(select);
    grid.add(opField);
    
    section.add(grid);
    return section;
  }
  
  _composeTextField(name, label, value, placeholder, hint, fullWidth) {
    const { context } = this;
    const ctx = context;
    
    const field = makeEl(ctx, 'div', { class: fullWidth ? 'form-field form-field--full' : 'form-field' });
    field.add(makeEl(ctx, 'label', { for: name }).add(text(ctx, label)));
    if (hint) {
      field.add(makeEl(ctx, 'span', { class: 'field-hint' }).add(text(ctx, hint)));
    }
    field.add(makeEl(ctx, 'input', { type: 'text', name, id: name, value, placeholder }));
    return field;
  }
  
  _composeOptionsSection() {
    const { context } = this;
    const ctx = context;
    
    const section = makeEl(ctx, 'section', { class: 'form-section' });
    section.add(makeEl(ctx, 'h2', { class: 'section-title' }).add(text(ctx, '⚙️ Operation Options')));
    
    const grid = makeEl(ctx, 'div', { class: 'form-grid' });
    
    // Get current operation's schema
    const currentOp = this.operations.find(op => op.name === (this.profile?.operationName || this.operations[0]?.name));
    if (currentOp?.optionSchema) {
      for (const [key, def] of Object.entries(currentOp.optionSchema)) {
        const value = this.profile?.options?.[key] ?? def.default;
        
        if (def.type === 'boolean') {
          grid.add(this._composeCheckbox(`options.${key}`, def.description || key, value));
        } else if (def.type === 'integer' || def.type === 'number') {
          grid.add(this._composeNumberField(`options.${key}`, def.description || key, value, def.minimum, def.maximum));
        } else {
          grid.add(this._composeTextField(`options.${key}`, def.description || key, value || '', def.example || ''));
        }
      }
    } else {
      grid.add(makeEl(ctx, 'p', { class: 'placeholder-text' }).add(text(ctx, 'Select an operation to see options')));
    }
    
    section.add(grid);
    return section;
  }
  
  _composeCheckbox(name, label, checked) {
    const { context } = this;
    const ctx = context;
    
    const field = makeEl(ctx, 'div', { class: 'form-field form-field--checkbox' });
    const attrs = { type: 'checkbox', name, id: name };
    if (checked) attrs.checked = 'checked';
    field.add(makeEl(ctx, 'input', attrs));
    field.add(makeEl(ctx, 'label', { for: name }).add(text(ctx, label)));
    return field;
  }
  
  _composeNumberField(name, label, value, min, max) {
    const { context } = this;
    const ctx = context;
    
    const field = makeEl(ctx, 'div', { class: 'form-field' });
    field.add(makeEl(ctx, 'label', { for: name }).add(text(ctx, label)));
    if (min !== undefined || max !== undefined) {
      field.add(makeEl(ctx, 'span', { class: 'field-hint' }).add(text(ctx, `${min ?? 0} - ${max ?? '∞'}`)));
    }
    const row = makeEl(ctx, 'div', { class: 'number-row' });
    row.add(makeEl(ctx, 'input', { 
      type: 'range', 
      name, id: name, 
      value: value || min || 0,
      min: min ?? 0,
      max: max ?? 10000,
      oninput: `document.getElementById('${name}_val').textContent = this.value`
    }));
    row.add(makeEl(ctx, 'span', { class: 'number-value', id: `${name}_val` }).add(text(ctx, String(value ?? min ?? 0))));
    field.add(row);
    return field;
  }
  
  _composeAdvancedSection() {
    const { context } = this;
    const ctx = context;
    
    const section = makeEl(ctx, 'section', { class: 'form-section form-section--collapsible', id: 'advancedSection' });
    
    const header = makeEl(ctx, 'div', { class: 'section-header', onclick: 'toggleAdvanced()' });
    header.add(makeEl(ctx, 'h2', { class: 'section-title' }).add(text(ctx, '🔧 Advanced Options')));
    header.add(makeEl(ctx, 'button', { type: 'button', class: 'toggle-btn', id: 'advancedToggle' }).add(text(ctx, '▼ Show')));
    section.add(header);
    
    const content = makeEl(ctx, 'div', { class: 'section-content', id: 'advancedContent', style: 'display: none' });
    const grid = makeEl(ctx, 'div', { class: 'form-grid' });
    
    grid.add(this._composeNumberField('options.maxRetries', 'Max Retries', this.profile?.options?.maxRetries ?? 3, 0, 10));
    grid.add(this._composeNumberField('options.timeout', 'Request Timeout (ms)', this.profile?.options?.timeout ?? 30000, 1000, 60000));
    grid.add(this._composeCheckbox('options.respectRobotsTxt', 'Respect robots.txt', this.profile?.options?.respectRobotsTxt ?? true));
    
    content.add(grid);
    section.add(content);
    
    return section;
  }
  
  _composeStyles() {
    const { context } = this;
    const styleEl = makeEl(context, 'style');
    styleEl.add(text(context, `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f5f5f5;
        color: #1a1a1a;
        line-height: 1.5;
      }
      .app-header {
        background: white;
        padding: 24px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .app-header h1 { font-size: 1.5rem; }
      .back-link { color: #0066cc; text-decoration: none; }
      .back-link:hover { text-decoration: underline; }
      
      .profile-form {
        max-width: 800px;
        margin: 24px auto;
        padding: 0 24px;
      }
      
      .status-bar {
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 24px;
        display: none;
      }
      .status-bar.info { display: block; background: #e3f2fd; color: #1565c0; }
      .status-bar.success { display: block; background: #e8f5e9; color: #2e7d32; }
      .status-bar.error { display: block; background: #ffebee; color: #c62828; }
      
      .form-section {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
      }
      .section-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
      }
      .section-header .section-title { margin-bottom: 0; }
      .toggle-btn {
        padding: 6px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: white;
        cursor: pointer;
      }
      .toggle-btn:hover { background: #f5f5f5; }
      
      .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-field--full { grid-column: 1 / -1; }
      .form-field label {
        font-size: 13px;
        font-weight: 500;
      }
      .field-hint {
        font-size: 11px;
        color: #666;
      }
      .form-field input[type="text"],
      .form-field select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
      }
      .form-field input:focus,
      .form-field select:focus {
        outline: none;
        border-color: #0066cc;
        box-shadow: 0 0 0 3px rgba(0,102,204,0.1);
      }
      
      .form-field--checkbox {
        flex-direction: row;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
      }
      .form-field--checkbox input { width: 18px; height: 18px; }
      .form-field--checkbox label { font-size: 14px; font-weight: 400; }
      
      .number-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .number-row input[type="range"] { flex: 1; }
      .number-value {
        min-width: 60px;
        text-align: right;
        font-family: monospace;
        font-size: 13px;
        color: #666;
      }
      
      .placeholder-text {
        grid-column: 1 / -1;
        text-align: center;
        color: #666;
        padding: 24px;
      }
      
      .form-actions {
        display: flex;
        gap: 12px;
        padding-top: 12px;
      }
      .btn {
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: background 0.15s;
      }
      .btn--primary {
        background: #0066cc;
        color: white;
        border: none;
      }
      .btn--primary:hover { background: #0052a3; }
      .btn--secondary {
        background: white;
        color: #1a1a1a;
        border: 1px solid #ddd;
      }
      .btn--secondary:hover { background: #f5f5f5; }
      .btn--danger {
        background: #ffebee;
        color: #c62828;
        border: 1px solid #ef9a9a;
        margin-left: auto;
      }
      .btn--danger:hover { background: #ffcdd2; }
    `));
    return styleEl;
  }
  
  _composeClientScript() {
    const { context } = this;
    const scriptEl = makeEl(context, 'script');
    scriptEl.add(text(context, `
      // Toggle advanced section - THE FIX!
      function toggleAdvanced() {
        const content = document.getElementById('advancedContent');
        const btn = document.getElementById('advancedToggle');
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '▲ Hide' : '▼ Show';
      }
      
      // Show status message
      function showStatus(message, type) {
        const bar = document.getElementById('statusBar');
        bar.textContent = message;
        bar.className = 'status-bar ' + type;
      }
      
      // Form submission
      document.getElementById('profileForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        showStatus('Saving...', 'info');
        
        const formData = new FormData(this);
        const data = {};
        const options = {};
        
        for (const [key, value] of formData.entries()) {
          if (key.startsWith('options.')) {
            const optKey = key.replace('options.', '');
            options[optKey] = value;
          } else {
            data[key] = value;
          }
        }
        
        // Handle checkboxes (unchecked ones aren't in FormData)
        document.querySelectorAll('input[type="checkbox"][name^="options."]').forEach(cb => {
          const optKey = cb.name.replace('options.', '');
          options[optKey] = cb.checked;
        });
        
        data.options = options;
        
        try {
          const isNew = !window.location.pathname.match(/\\/profiles\\/[^/]+$/);
          const method = isNew ? 'POST' : 'PUT';
          const url = this.action;
          
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Save failed');
          }
          
          showStatus('✅ Saved successfully!', 'success');
          setTimeout(() => window.location.href = '/', 1500);
        } catch (err) {
          showStatus('❌ ' + err.message, 'error');
        }
      });
      
      // Delete profile
      async function deleteProfile() {
        if (!confirm('Delete this profile?')) return;
        
        showStatus('Deleting...', 'info');
        try {
          const id = window.location.pathname.split('/').pop();
          const res = await fetch('/api/profiles/' + id, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          window.location.href = '/';
        } catch (err) {
          showStatus('❌ ' + err.message, 'error');
        }
      }
    `));
    return scriptEl;
  }
}

// ─────────────────────────────────────────────────────────────
// Express Server
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Profile list page
app.get('/', (req, res) => {
  const ctx = { map_Controls: controls, make_context: () => ctx };
  
  const doc = makeDocument(ctx);
  doc.head.add(makeEl(ctx, 'title').add(text(ctx, 'Crawl Profiles')));
  doc.head.add(makeEl(ctx, 'style').add(text(ctx, `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui; padding: 24px; background: #f5f5f5; }
    h1 { margin-bottom: 24px; }
    table { width: 100%; max-width: 1000px; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f9f9f9; font-weight: 600; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .actions { margin-top: 24px; }
    .btn { padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 8px; display: inline-block; }
    .btn:hover { background: #0052a3; text-decoration: none; }
  `)));
  
  const h1 = makeEl(ctx, 'h1');
  h1.add(text(ctx, '🕷️ Crawl Profiles'));
  doc.body.add(h1);
  
  const table = makeEl(ctx, 'table');
  const thead = makeEl(ctx, 'thead');
  const headerRow = makeEl(ctx, 'tr');
  ['Profile', 'Operation', 'Start URL', 'Actions'].forEach(h => {
    headerRow.add(makeEl(ctx, 'th').add(text(ctx, h)));
  });
  thead.add(headerRow);
  table.add(thead);
  
  const tbody = makeEl(ctx, 'tbody');
  for (const p of PROFILES) {
    const row = makeEl(ctx, 'tr');
    row.add(makeEl(ctx, 'td').add(makeEl(ctx, 'a', { href: `/profiles/${p.id}` }).add(text(ctx, p.label))));
    row.add(makeEl(ctx, 'td').add(text(ctx, p.operationName)));
    row.add(makeEl(ctx, 'td').add(text(ctx, p.startUrl)));
    row.add(makeEl(ctx, 'td').add(makeEl(ctx, 'a', { href: `/profiles/${p.id}` }).add(text(ctx, 'Edit'))));
    tbody.add(row);
  }
  table.add(tbody);
  doc.body.add(table);
  
  const actions = makeEl(ctx, 'div', { class: 'actions' });
  actions.add(makeEl(ctx, 'a', { href: '/profiles/new', class: 'btn' }).add(text(ctx, '+ New Profile')));
  doc.body.add(actions);
  
  res.send(html(doc));
});

// New profile page
app.get('/profiles/new', (req, res) => {
  const ctx = { map_Controls: controls, make_context: () => ctx };
  const page = new Profile_Editor_Page({ context: ctx, profile: null, operations: OPERATIONS });
  res.send(html(page));
});

// Edit profile page
app.get('/profiles/:id', (req, res) => {
  const profile = PROFILES.find(p => p.id === req.params.id);
  if (!profile) {
    return res.status(404).send('Profile not found');
  }
  const ctx = { map_Controls: controls, make_context: () => ctx };
  const page = new Profile_Editor_Page({ context: ctx, profile, operations: OPERATIONS });
  res.send(html(page));
});

// API: List profiles
app.get('/api/profiles', (req, res) => {
  res.json({ profiles: PROFILES });
});

// API: Create profile
app.post('/api/profiles', (req, res) => {
  const { id, label, startUrl, operationName, options } = req.body;
  if (!id || !operationName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (PROFILES.some(p => p.id === id)) {
    return res.status(409).json({ error: 'Profile already exists' });
  }
  const newProfile = { id, label: label || id, startUrl: startUrl || '', operationName, options: options || {} };
  PROFILES.push(newProfile);
  res.status(201).json(newProfile);
});

// API: Update profile
app.put('/api/profiles/:id', (req, res) => {
  const idx = PROFILES.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  const { label, startUrl, operationName, options } = req.body;
  PROFILES[idx] = { ...PROFILES[idx], label: label ?? PROFILES[idx].label, startUrl: startUrl ?? PROFILES[idx].startUrl, operationName: operationName ?? PROFILES[idx].operationName, options: options ?? PROFILES[idx].options };
  res.json(PROFILES[idx]);
});

// API: Delete profile
app.delete('/api/profiles/:id', (req, res) => {
  const idx = PROFILES.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  PROFILES.splice(idx, 1);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3105;
app.listen(PORT, () => {
  console.log(`
┌──────────────────────────────────────────────────────────────┐
│  🕷️ Crawl Profile Editor Lab                                 │
├──────────────────────────────────────────────────────────────┤
│  Server running at: http://localhost:${PORT}                    │
│                                                              │
│  Pages:                                                      │
│    /               - Profile list                            │
│    /profiles/new   - Create new profile                      │
│    /profiles/:id   - Edit existing profile                   │
│                                                              │
│  Features demonstrated:                                      │
│    ✓ jsgui3-html SSR controls                                │
│    ✓ Collapsible Advanced Options (click to toggle!)         │
│    ✓ Form submission with fetch API                          │
│    ✓ Range sliders with live value display                   │
└──────────────────────────────────────────────────────────────┘
  `);
});
