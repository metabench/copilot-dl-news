'use strict';

const jsgui = require('jsgui3-html');

const { BaseAppControl } = require('../../shared');

const StringControl = jsgui.String_Control;

function text(ctx, value) {
  return new StringControl({ context: ctx, text: String(value ?? '') });
}

function makeEl(ctx, tagName, className = null, attrs = null) {
  const el = new jsgui.Control({ context: ctx, tagName });
  if (className) el.add_class(className);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) continue;
      el.dom.attributes[key] = String(value);
    }
  }
  return el;
}

/**
 * CrawlStrategyExplorerControl - Browse crawl operations and their options
 * 
 * Displays:
 * - Operations grouped by category
 * - Option schemas with types, defaults, descriptions
 * - Sequence presets with step breakdowns
 */
class CrawlStrategyExplorerControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Crawl Strategies',
      appClass: 'crawl-strategies',
      title: '🕷️ Crawl Strategy Explorer',
      subtitle: 'Browse crawl operations, sequences, and configuration options'
    });

    this.basePath = spec.basePath || '';
    this.operations = spec.operations || [];
    this.sequences = spec.sequences || [];
    this.profiles = spec.profiles || [];
    this.activeProfileId = spec.activeProfileId || null;
    this.selectedOperation = spec.selectedOperation || null;
    this.selectedSequence = spec.selectedSequence || null;
    this.viewMode = spec.viewMode || 'operations'; // 'operations' | 'sequences' | 'profiles' | 'detail'

    if (!spec.el) {
      this.compose();
    }
  }

  composeMainContent() {
    const ctx = this.context;
    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'crawl-strategies',
      'data-view': this.viewMode
    });

    // Add styles
    root.add(this._composeStyles());

    // Navigation tabs
    root.add(this._composeTabs());

    // Main content based on viewMode
    if (this.viewMode === 'sequences') {
      root.add(this._composeSequencesList());
    } else if (this.viewMode === 'profiles') {
      root.add(this._composeProfilesList());
    } else if (this.viewMode === 'detail' && this.selectedOperation) {
      root.add(this._composeOperationDetail());
    } else {
      root.add(this._composeOperationsList());
    }

    // Add to main container (required by BaseAppControl)
    this.mainContainer.add(root);
  }

  _composeStyles() {
    const ctx = this.context;
    const styleEl = makeEl(ctx, 'style');
    styleEl.add(text(ctx, `
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}
.tab {
  padding: 8px 16px;
  border-radius: 6px 6px 0 0;
  background: rgba(0,0,0,0.2);
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
  transition: background 0.2s, color 0.2s;
}
.tab:hover { background: rgba(0,0,0,0.3); color: var(--text); }
.tab.active { background: var(--accent-bg); color: var(--accent); }

.category-section {
  margin-bottom: 32px;
}
.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text);
}
.category-icon { font-size: 1.3em; }

.operations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.operation-card {
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.2s, transform 0.1s;
}
.operation-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.operation-card a {
  text-decoration: none;
  color: inherit;
  display: block;
}
.op-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.op-icon { font-size: 1.4em; }
.op-name { font-weight: 600; color: var(--accent); }
.op-label { font-size: 0.85em; color: var(--text-muted); margin-left: auto; }
.op-desc { color: var(--text-muted); font-size: 0.9em; line-height: 1.4; }
.op-meta {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  font-size: 0.8em;
  color: var(--text-muted);
}
.op-meta-item { display: flex; align-items: center; gap: 4px; }

/* Detail view */
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.detail-icon { font-size: 2.5em; }
.detail-title { font-size: 1.5em; font-weight: 600; }
.detail-category { color: var(--text-muted); font-size: 0.9em; }
.detail-desc { color: var(--text-muted); line-height: 1.5; margin-top: 8px; }

.options-section { margin-top: 24px; }
.options-header {
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.options-category {
  margin-bottom: 24px;
}
.options-category-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.option-row {
  display: grid;
  grid-template-columns: 180px 80px 1fr 120px;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0,0,0,0.15);
  margin-bottom: 6px;
  align-items: center;
}
.option-row:hover { background: rgba(0,0,0,0.25); }
.option-name { font-family: ui-monospace, monospace; font-weight: 500; color: var(--text); }
.option-type { font-size: 0.8em; color: var(--accent); background: rgba(212,165,116,0.1); padding: 2px 6px; border-radius: 4px; }
.option-desc { color: var(--text-muted); font-size: 0.9em; }
.option-default { font-family: ui-monospace, monospace; font-size: 0.85em; color: var(--text-muted); text-align: right; }
.option-advanced { opacity: 0.6; }

/* Sequences */
.sequence-card {
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.seq-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.seq-name { font-weight: 600; color: var(--accent); font-size: 1.1em; }
.seq-badge { font-size: 0.75em; padding: 2px 8px; border-radius: 4px; background: rgba(212,165,116,0.15); }
.seq-desc { color: var(--text-muted); font-size: 0.9em; margin-bottom: 16px; }
.seq-steps { display: flex; flex-wrap: wrap; gap: 8px; }
.seq-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
  font-size: 0.85em;
}
.seq-step-num { color: var(--text-muted); }
.seq-step-name { color: var(--text); }
.seq-arrow { color: var(--text-muted); }

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  text-decoration: none;
  margin-bottom: 16px;
  font-size: 0.9em;
}
.back-link:hover { text-decoration: underline; }

/* Profiles styles */
.profiles-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.profiles-title {
  font-size: 1.2em;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}
.new-profile-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--accent-bg);
  color: var(--accent);
  border-radius: 6px;
  text-decoration: none;
  font-weight: 500;
  transition: background 0.2s;
}
.new-profile-btn:hover { background: rgba(212,165,116,0.25); }

.profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.profile-card {
  display: block;
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  text-decoration: none;
  transition: border-color 0.2s, transform 0.1s;
}
.profile-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.profile-card.active {
  border-color: var(--accent);
  background: rgba(212,165,116,0.08);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.active-badge {
  font-size: 0.7em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent);
  color: #1a1a1a;
  font-weight: 600;
}
.profile-name {
  font-weight: 600;
  color: var(--accent);
  font-size: 1.05em;
}
.profile-desc {
  color: var(--text-muted);
  font-size: 0.85em;
  margin-bottom: 12px;
}
.profile-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.8em;
  color: var(--text-muted);
}
.profile-operation {
  padding: 2px 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
}
.profile-url {
  padding: 2px 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
}
.profile-tags {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.tag {
  font-size: 0.7em;
  padding: 2px 6px;
  background: rgba(100,100,255,0.15);
  border-radius: 4px;
  color: var(--text-muted);
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-muted);
}
.empty-icon { font-size: 3em; margin-bottom: 16px; opacity: 0.5; }
.empty-text { font-size: 1.1em; margin-bottom: 8px; }
.empty-hint { font-size: 0.85em; opacity: 0.7; }
    `));
    return styleEl;
  }

  _composeTabs() {
    const ctx = this.context;
    const tabs = makeEl(ctx, 'nav', 'tabs');

    const opTab = makeEl(ctx, 'a', `tab${this.viewMode === 'operations' || this.viewMode === 'detail' ? ' active' : ''}`, {
      href: `${this.basePath}/`
    });
    opTab.add(text(ctx, '🕷️ Operations'));
    tabs.add(opTab);

    const seqTab = makeEl(ctx, 'a', `tab${this.viewMode === 'sequences' ? ' active' : ''}`, {
      href: `${this.basePath}/sequences`
    });
    seqTab.add(text(ctx, '📋 Sequences'));
    tabs.add(seqTab);

    const profTab = makeEl(ctx, 'a', `tab${this.viewMode === 'profiles' ? ' active' : ''}`, {
      href: `${this.basePath}/profiles`
    });
    profTab.add(text(ctx, '🗃️ Profiles'));
    tabs.add(profTab);

    return tabs;
  }

  _composeOperationsList() {
    const ctx = this.context;
    const container = makeEl(ctx, 'div', 'operations-list');

    // Group by category
    const byCategory = {};
    for (const op of this.operations) {
      const cat = op.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(op);
    }

    // Category order and labels
    const categoryMeta = {
      'article-crawl': { label: 'Article Crawling', icon: '📰', order: 1 },
      'discovery': { label: 'Site Discovery', icon: '🗺️', order: 2 },
      'hub-management': { label: 'Hub Management', icon: '🌍', order: 3 },
      'hub-discovery': { label: 'Hub Discovery', icon: '🎯', order: 4 },
      'content-refresh': { label: 'Content Refresh', icon: '📜', order: 5 }
    };

    const sortedCategories = Object.keys(byCategory).sort((a, b) => {
      return (categoryMeta[a]?.order || 99) - (categoryMeta[b]?.order || 99);
    });

    for (const cat of sortedCategories) {
      const ops = byCategory[cat];
      const meta = categoryMeta[cat] || { label: cat, icon: '❓' };

      const section = makeEl(ctx, 'section', 'category-section');

      const header = makeEl(ctx, 'h2', 'category-header');
      header.add(makeEl(ctx, 'span', 'category-icon').add(text(ctx, meta.icon)));
      header.add(text(ctx, meta.label));
      section.add(header);

      const grid = makeEl(ctx, 'div', 'operations-grid');
      for (const op of ops) {
        grid.add(this._composeOperationCard(op));
      }
      section.add(grid);

      container.add(section);
    }

    return container;
  }

  _composeOperationCard(op) {
    const ctx = this.context;
    const card = makeEl(ctx, 'div', 'operation-card');

    const link = makeEl(ctx, 'a', null, { href: `${this.basePath}/operation/${op.name}` });

    const header = makeEl(ctx, 'div', 'op-header');
    header.add(makeEl(ctx, 'span', 'op-icon').add(text(ctx, op.icon || '❓')));
    header.add(makeEl(ctx, 'span', 'op-name').add(text(ctx, op.name)));
    header.add(makeEl(ctx, 'span', 'op-label').add(text(ctx, op.label || '')));
    link.add(header);

    const desc = makeEl(ctx, 'div', 'op-desc');
    desc.add(text(ctx, op.description || op.summary || 'No description'));
    link.add(desc);

    const optionCount = op.optionSchema ? Object.keys(op.optionSchema).length : 0;
    const meta = makeEl(ctx, 'div', 'op-meta');
    meta.add(makeEl(ctx, 'span', 'op-meta-item').add(text(ctx, `⚙️ ${optionCount} options`)));
    link.add(meta);

    card.add(link);
    return card;
  }

  _composeOperationDetail() {
    const ctx = this.context;
    const op = this.selectedOperation;
    const container = makeEl(ctx, 'div', 'operation-detail');

    // Back link
    const back = makeEl(ctx, 'a', 'back-link', { href: `${this.basePath}/` });
    back.add(text(ctx, '← Back to operations'));
    container.add(back);

    // Header
    const header = makeEl(ctx, 'div', 'detail-header');
    header.add(makeEl(ctx, 'span', 'detail-icon').add(text(ctx, op.icon || '❓')));

    const titleBlock = makeEl(ctx, 'div');
    titleBlock.add(makeEl(ctx, 'div', 'detail-title').add(text(ctx, op.label || op.name)));
    titleBlock.add(makeEl(ctx, 'div', 'detail-category').add(text(ctx, `${op.category || 'uncategorized'} • ${op.name}`)));
    header.add(titleBlock);
    container.add(header);

    // Description
    const desc = makeEl(ctx, 'div', 'detail-desc');
    desc.add(text(ctx, op.description || op.summary || 'No description available.'));
    container.add(desc);

    // Options
    if (op.optionSchema) {
      container.add(this._composeOptionsSection(op.optionSchema));
    }

    return container;
  }

  _composeOptionsSection(optionSchema) {
    const ctx = this.context;
    const section = makeEl(ctx, 'div', 'options-section');

    const header = makeEl(ctx, 'h3', 'options-header');
    header.add(text(ctx, '⚙️ Configuration Options'));
    section.add(header);

    // Group by category
    const byCategory = {};
    for (const [name, schema] of Object.entries(optionSchema)) {
      const cat = schema.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ name, ...schema });
    }

    const categoryOrder = ['behavior', 'limits', 'targeting', 'performance', 'discovery', 'storage', 'freshness', 'logging', 'network', 'advanced', 'other'];

    for (const cat of categoryOrder) {
      const options = byCategory[cat];
      if (!options || options.length === 0) continue;

      const catSection = makeEl(ctx, 'div', 'options-category');
      catSection.add(makeEl(ctx, 'div', 'options-category-title').add(text(ctx, cat)));

      for (const opt of options) {
        catSection.add(this._composeOptionRow(opt));
      }

      section.add(catSection);
    }

    return section;
  }

  _composeOptionRow(opt) {
    const ctx = this.context;
    const row = makeEl(ctx, 'div', `option-row${opt.advanced ? ' option-advanced' : ''}`);

    row.add(makeEl(ctx, 'span', 'option-name').add(text(ctx, opt.name)));
    row.add(makeEl(ctx, 'span', 'option-type').add(text(ctx, opt.type)));
    row.add(makeEl(ctx, 'span', 'option-desc').add(text(ctx, opt.description || '')));

    let defaultStr = '';
    if (opt.default !== undefined) {
      if (Array.isArray(opt.default)) {
        defaultStr = JSON.stringify(opt.default);
      } else if (typeof opt.default === 'boolean') {
        defaultStr = opt.default ? 'true' : 'false';
      } else {
        defaultStr = String(opt.default);
      }
    }
    row.add(makeEl(ctx, 'span', 'option-default').add(text(ctx, defaultStr)));

    return row;
  }

  _composeSequencesList() {
    const ctx = this.context;
    const container = makeEl(ctx, 'div', 'sequences-list');

    for (const seq of this.sequences) {
      container.add(this._composeSequenceCard(seq));
    }

    return container;
  }

  _composeSequenceCard(seq) {
    const ctx = this.context;
    const card = makeEl(ctx, 'div', 'sequence-card');

    const header = makeEl(ctx, 'div', 'seq-header');
    header.add(makeEl(ctx, 'span', 'seq-name').add(text(ctx, seq.label || seq.name)));
    header.add(makeEl(ctx, 'span', 'seq-badge').add(text(ctx, `${seq.stepCount} steps`)));
    if (seq.continueOnError) {
      header.add(makeEl(ctx, 'span', 'seq-badge').add(text(ctx, '🛡️ resilient')));
    }
    card.add(header);

    if (seq.description) {
      card.add(makeEl(ctx, 'div', 'seq-desc').add(text(ctx, seq.description)));
    }

    // Steps
    const stepsEl = makeEl(ctx, 'div', 'seq-steps');
    for (let i = 0; i < seq.steps.length; i++) {
      const step = seq.steps[i];
      if (i > 0) {
        stepsEl.add(makeEl(ctx, 'span', 'seq-arrow').add(text(ctx, '→')));
      }
      const stepEl = makeEl(ctx, 'div', 'seq-step');
      stepEl.add(makeEl(ctx, 'span', 'seq-step-num').add(text(ctx, `${i + 1}.`)));
      stepEl.add(makeEl(ctx, 'span', 'seq-step-name').add(text(ctx, step.label || step.operation)));
      stepsEl.add(stepEl);
    }
    card.add(stepsEl);

    return card;
  }

  _composeProfilesList() {
    const ctx = this.context;
    const container = makeEl(ctx, 'div', 'profiles-list');

    // Header with new profile button
    const header = makeEl(ctx, 'div', 'profiles-header');
    header.add(makeEl(ctx, 'h3', 'profiles-title').add(text(ctx, 'Saved Profiles')));

    const newBtn = makeEl(ctx, 'a', 'new-profile-btn', {
      href: `${this.basePath}/profiles/new`
    });
    newBtn.add(text(ctx, '➕ New Profile'));
    header.add(newBtn);

    container.add(header);

    // Profiles grid
    if (this.profiles.length === 0) {
      const empty = makeEl(ctx, 'div', 'empty-state');
      empty.add(makeEl(ctx, 'div', 'empty-icon').add(text(ctx, '🗃️')));
      empty.add(makeEl(ctx, 'div', 'empty-text').add(text(ctx, 'No profiles saved yet')));
      empty.add(makeEl(ctx, 'div', 'empty-hint').add(text(ctx, 'Create a new profile to save your crawl configuration')));
      container.add(empty);
    } else {
      const grid = makeEl(ctx, 'div', 'profiles-grid');
      for (const profile of this.profiles) {
        grid.add(this._composeProfileCard(profile));
      }
      container.add(grid);
    }

    return container;
  }

  _composeProfileCard(profile) {
    const ctx = this.context;
    const isActive = profile.id === this.activeProfileId;

    const card = makeEl(ctx, 'a', `profile-card${isActive ? ' active' : ''}`, {
      href: `${this.basePath}/profiles/${encodeURIComponent(profile.id)}`
    });

    const header = makeEl(ctx, 'div', 'profile-header');
    if (isActive) {
      header.add(makeEl(ctx, 'span', 'active-badge').add(text(ctx, '★ Active')));
    }
    header.add(makeEl(ctx, 'span', 'profile-name').add(text(ctx, profile.label)));
    card.add(header);

    if (profile.description) {
      card.add(makeEl(ctx, 'div', 'profile-desc').add(text(ctx, profile.description)));
    }

    const meta = makeEl(ctx, 'div', 'profile-meta');

    if (profile.operationName) {
      const op = this.operations.find(o => o.name === profile.operationName);
      const opLabel = op ? `${op.icon || '❓'} ${op.label}` : profile.operationName;
      meta.add(makeEl(ctx, 'span', 'profile-operation').add(text(ctx, opLabel)));
    }

    if (profile.startUrl) {
      try {
        const url = new URL(profile.startUrl);
        meta.add(makeEl(ctx, 'span', 'profile-url').add(text(ctx, url.hostname)));
      } catch {
        meta.add(makeEl(ctx, 'span', 'profile-url').add(text(ctx, profile.startUrl)));
      }
    }

    card.add(meta);

    // Tags
    if (profile.tags && profile.tags.length > 0) {
      const tags = makeEl(ctx, 'div', 'profile-tags');
      for (const tag of profile.tags.slice(0, 4)) {
        tags.add(makeEl(ctx, 'span', 'tag').add(text(ctx, tag)));
      }
      card.add(tags);
    }

    return card;
  }
}

module.exports = { CrawlStrategyExplorerControl };
