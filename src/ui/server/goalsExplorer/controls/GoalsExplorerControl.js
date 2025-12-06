"use strict";

/**
 * GoalsExplorerControl
 * 
 * Main jsgui3 control for the Goals Explorer application.
 * Displays the SVG overview on the left and goal details on the right.
 * 
 * Uses Industrial Luxury Obsidian theme.
 */

const jsgui = require("jsgui3-html");

class GoalsExplorerControl extends jsgui.Control {
  constructor(spec) {
    spec = spec || {};
    spec.tagName = "div";
    super(spec);
    
    this._goals = spec.goals || { categories: [] };
    this._selectedGoalId = spec.selectedGoalId || null;
    this._goalDetail = spec.goalDetail || null;
    this._svgContent = spec.svgContent || null;
    this._openaiAvailable = spec.openaiAvailable || false;
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    const dom = this.dom;
    dom.attributes.class = "goals-explorer";
    
    // Header
    const header = this._createHeader();
    this.add(header);
    
    // Main content area (split view)
    const main = new jsgui.Control({
      context: this.context,
      tagName: "main"
    });
    main.dom.attributes.class = "goals-main";
    
    // Left panel - SVG overview
    const leftPanel = this._createLeftPanel();
    main.add(leftPanel);
    
    // Right panel - Goal details
    const rightPanel = this._createRightPanel();
    main.add(rightPanel);
    
    this.add(main);
    
    // Inject styles
    this._injectStyles();
  }
  
  _createHeader() {
    const header = new jsgui.Control({
      context: this.context,
      tagName: "header"
    });
    header.dom.attributes.class = "goals-header";
    
    // Title
    const title = new jsgui.Control({
      context: this.context,
      tagName: "h1"
    });
    title.add("🎯 Goals Explorer");
    header.add(title);
    
    // Status indicator
    const status = new jsgui.Control({
      context: this.context,
      tagName: "div"
    });
    status.dom.attributes.class = this._openaiAvailable 
      ? "status-indicator ready" 
      : "status-indicator unavailable";
    status.add(this._openaiAvailable ? "✓ OpenAI Ready" : "○ OpenAI Not Configured");
    header.add(status);
    
    return header;
  }
  
  _createLeftPanel() {
    const panel = new jsgui.Control({
      context: this.context,
      tagName: "div"
    });
    panel.dom.attributes.class = "goals-left-panel";
    panel.dom.attributes.id = "svgContainer";
    
    // Always render svg-wrapper div so client JS can load SVG into it
    const svgWrapper = new jsgui.Control({
      context: this.context,
      tagName: "div"
    });
    svgWrapper.dom.attributes.class = "svg-wrapper";
    svgWrapper.dom.attributes["data-svg-src"] = "/api/goals/svg";
    
    if (this._svgContent) {
      // If SVG content is pre-loaded, inject it directly (SSR)
      // Note: jsgui3 will escape HTML, so this is for future use
      svgWrapper.add(this._svgContent);
    } else {
      // Placeholder while SVG loads client-side
      const placeholder = new jsgui.Control({
        context: this.context,
        tagName: "p"
      });
      placeholder.dom.attributes.class = "placeholder-text";
      placeholder.add("Loading goals overview...");
      svgWrapper.add(placeholder);
    }
    
    panel.add(svgWrapper);
    return panel;
  }
  
  _createRightPanel() {
    const panel = new jsgui.Control({
      context: this.context,
      tagName: "aside"
    });
    panel.dom.attributes.class = "goals-right-panel";
    panel.dom.attributes.id = "detailPanel";
    
    if (this._selectedGoalId && this._goalDetail) {
      const detailControl = new GoalDetailControl({
        context: this.context,
        goalId: this._selectedGoalId,
        detail: this._goalDetail,
        openaiAvailable: this._openaiAvailable,
      });
      panel.add(detailControl);
    } else {
      // Placeholder
      const placeholder = new jsgui.Control({
        context: this.context,
        tagName: "div"
      });
      placeholder.dom.attributes.class = "detail-placeholder";
      
      const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
      h2.add("Goal Details");
      placeholder.add(h2);
      
      const p1 = new jsgui.Control({ context: this.context, tagName: "p" });
      p1.add("Click on a goal in the overview to view details.");
      placeholder.add(p1);
      
      const p2 = new jsgui.Control({ context: this.context, tagName: "p" });
      p2.dom.attributes.class = "hint";
      p2.add("If a detail page doesn't exist, you can generate one using OpenAI.");
      placeholder.add(p2);
      
      panel.add(placeholder);
    }
    
    return panel;
  }
  
  _injectStyles() {
    const style = new jsgui.Control({
      context: this.context,
      tagName: "style"
    });
    style.add(GoalsExplorerControl.CSS);
    this.add(style);
  }
  
  // Client-side activation
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom.el;
    if (!el) return;
    
    // Load SVG
    this._loadSvg();
    
    // Setup event listeners
    this._setupEventListeners();
  }
  
  _loadSvg() {
    const container = document.getElementById("svgContainer");
    const wrapper = container?.querySelector(".svg-wrapper");
    if (!wrapper) return;
    
    const svgSrc = wrapper.dataset.svgSrc;
    if (!svgSrc) return;
    
    fetch(svgSrc)
      .then(res => res.text())
      .then(svg => {
        wrapper.innerHTML = svg;
        this._makeSvgInteractive();
      })
      .catch(err => {
        wrapper.innerHTML = `<p class="error">Failed to load SVG: ${err.message}</p>`;
      });
  }
  
  _makeSvgInteractive() {
    const svg = document.querySelector("#svgContainer svg");
    if (!svg) return;
    
    // Make the SVG respond to clicks
    svg.style.cursor = "pointer";
    
    // For a proper implementation, we'd need to add data attributes
    // to the SVG elements. For now, we'll use click coordinates.
    svg.addEventListener("click", (e) => {
      // This would identify which goal was clicked based on position
      // For now, show a demo goal
      this._showGoalDetail("ui-0");
    });
  }
  
  _setupEventListeners() {
    // Setup any additional client-side event listeners
  }
  
  _showGoalDetail(goalId) {
    const panel = document.getElementById("detailPanel");
    if (!panel) return;
    
    panel.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    
    fetch(`/api/goals/${goalId}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          panel.innerHTML = `
            <div class="goal-detail">
              <h2>${goalId}</h2>
              <div class="detail-content">${this._renderMarkdown(data.content)}</div>
              <button class="btn-generate" onclick="window.goalsExplorer.regenerate('${goalId}')">
                🔄 Regenerate
              </button>
            </div>
          `;
        } else {
          panel.innerHTML = `
            <div class="goal-detail">
              <h2>${goalId}</h2>
              <p>No detail page exists for this goal yet.</p>
              <button class="btn-generate" onclick="window.goalsExplorer.generate('${goalId}')">
                ✨ Generate with OpenAI
              </button>
            </div>
          `;
        }
      })
      .catch(err => {
        panel.innerHTML = `<p class="error">Error: ${err.message}</p>`;
      });
  }
  
  _renderMarkdown(md) {
    // Simple markdown to HTML
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>');
  }
}

// Static CSS - Industrial Luxury Obsidian Theme
GoalsExplorerControl.CSS = `
  :root {
    --bg-darkest: #050508;
    --bg-dark: #0a0d14;
    --bg-medium: #141824;
    --bg-light: #1a1f2e;
    --bg-lighter: #252b3d;
    --gold: #c9a227;
    --gold-dim: #8b7500;
    --emerald: #10b981;
    --sapphire: #3b82f6;
    --amethyst: #8b5cf6;
    --ruby: #ef4444;
    --text-bright: #f0f4f8;
    --text-medium: #94a3b8;
    --text-muted: #64748b;
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg-dark);
    color: var(--text-bright);
  }
  
  .goals-explorer {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .goals-header {
    background: var(--bg-medium);
    border-bottom: 1px solid rgba(201, 162, 39, 0.3);
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .goals-header h1 {
    font-family: Georgia, serif;
    color: var(--gold);
    font-size: 1.5rem;
    letter-spacing: 1px;
  }
  
  .status-indicator {
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
  }
  
  .status-indicator.ready {
    color: var(--emerald);
    background: rgba(16, 185, 129, 0.1);
  }
  
  .status-indicator.unavailable {
    color: var(--text-muted);
    background: rgba(100, 116, 139, 0.1);
  }
  
  .goals-main {
    display: grid;
    grid-template-columns: 1fr 420px;
    flex: 1;
    overflow: hidden;
  }
  
  .goals-left-panel {
    overflow: auto;
    padding: 1rem;
    background: var(--bg-darkest);
  }
  
  .svg-wrapper {
    min-height: 100%;
  }
  
  .svg-wrapper svg {
    max-width: 100%;
    height: auto;
  }
  
  .goals-right-panel {
    background: var(--bg-light);
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    overflow: auto;
    padding: 1.5rem;
  }
  
  .detail-placeholder {
    text-align: center;
    padding: 3rem 1rem;
  }
  
  .detail-placeholder h2 {
    font-family: Georgia, serif;
    color: var(--gold);
    font-size: 1.25rem;
    margin-bottom: 1rem;
  }
  
  .detail-placeholder p {
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  
  .detail-placeholder .hint {
    font-size: 0.8rem;
  }
  
  .goal-detail h2 {
    font-family: Georgia, serif;
    color: var(--gold);
    font-size: 1.25rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .detail-content {
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--text-medium);
  }
  
  .detail-content h3 {
    color: var(--text-bright);
    margin: 1.5rem 0 0.5rem;
  }
  
  .detail-content code {
    background: var(--bg-medium);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85em;
  }
  
  .detail-content pre {
    background: var(--bg-medium);
    padding: 1rem;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1rem 0;
  }
  
  .btn-generate {
    background: linear-gradient(135deg, var(--gold-dim), var(--gold));
    color: var(--bg-darkest);
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  
  .btn-generate:hover {
    filter: brightness(1.1);
  }
  
  .btn-generate:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    color: var(--text-muted);
  }
  
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--gold-dim);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .placeholder-text {
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
  }
  
  .error {
    color: var(--ruby);
    padding: 1rem;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 6px;
  }
  
  /* Goals list sidebar (for quick navigation) */
  .goals-list {
    list-style: none;
  }
  
  .goals-list-item {
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-medium);
    transition: background 0.15s;
  }
  
  .goals-list-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .goals-list-item.active {
    background: rgba(201, 162, 39, 0.1);
    color: var(--gold);
  }
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  
  .status-dot.active { background: var(--emerald); }
  .status-dot.planned { background: var(--sapphire); }
  .status-dot.research { background: var(--amethyst); }
  
  /* Goal detail enhancements */
  .goal-header {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  
  .category-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    color: var(--text-medium);
  }
  
  .status-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .status-badge.active {
    background: rgba(16, 185, 129, 0.15);
    color: var(--emerald);
  }
  
  .status-badge.planned {
    background: rgba(59, 130, 246, 0.15);
    color: var(--sapphire);
  }
  
  .status-badge.research {
    background: rgba(139, 92, 246, 0.15);
    color: var(--amethyst);
  }
  
  .status-badge.blocked {
    background: rgba(239, 68, 68, 0.15);
    color: var(--ruby);
  }
  
  .progress-bar {
    height: 8px;
    background: var(--bg-medium);
    border-radius: 4px;
    position: relative;
    margin: 0.75rem 0;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold-dim), var(--gold));
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  
  .progress-bar span {
    position: absolute;
    right: 8px;
    top: -18px;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  
  .goal-lines {
    list-style: none;
    margin: 0.75rem 0;
    padding: 0;
  }
  
  .goal-lines li {
    padding: 0.5rem 0;
    padding-left: 1.25rem;
    position: relative;
    color: var(--text-medium);
    font-size: 0.875rem;
  }
  
  .goal-lines li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: var(--gold);
  }
  
  .no-detail {
    color: var(--text-muted);
    font-style: italic;
    margin: 1rem 0;
  }
  
  /* SVG goal item cursor (client-side adds this) */
  .goal-item {
    cursor: pointer;
    transition: opacity 0.2s;
  }
  
  .goal-item:hover {
    opacity: 0.9;
  }
`;

/**
 * GoalDetailControl
 * 
 * Displays the detail content for a single goal.
 */
class GoalDetailControl extends jsgui.Control {
  constructor(spec) {
    spec = spec || {};
    spec.tagName = "div";
    super(spec);
    
    this._goalId = spec.goalId;
    this._detail = spec.detail || {};
    this._openaiAvailable = spec.openaiAvailable || false;
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    this.dom.attributes.class = "goal-detail";
    
    // Title
    const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
    h2.add(this._goalId);
    this.add(h2);
    
    if (this._detail.exists) {
      // Content
      const content = new jsgui.Control({ context: this.context, tagName: "div" });
      content.dom.attributes.class = "detail-content";
      // Markdown would be rendered here
      content.add(this._detail.content || "");
      this.add(content);
      
      // Regenerate button
      const btn = new jsgui.Control({ context: this.context, tagName: "button" });
      btn.dom.attributes.class = "btn-generate";
      btn.dom.attributes["data-action"] = "regenerate";
      btn.dom.attributes["data-goal-id"] = this._goalId;
      btn.add("🔄 Regenerate");
      this.add(btn);
    } else {
      // No content yet
      const msg = new jsgui.Control({ context: this.context, tagName: "p" });
      msg.add("No detail page exists for this goal yet.");
      this.add(msg);
      
      if (this._openaiAvailable) {
        const btn = new jsgui.Control({ context: this.context, tagName: "button" });
        btn.dom.attributes.class = "btn-generate";
        btn.dom.attributes["data-action"] = "generate";
        btn.dom.attributes["data-goal-id"] = this._goalId;
        btn.add("✨ Generate with OpenAI");
        this.add(btn);
      } else {
        const hint = new jsgui.Control({ context: this.context, tagName: "p" });
        hint.dom.attributes.class = "hint";
        hint.add("Configure OpenAI to enable auto-generation.");
        this.add(hint);
      }
    }
  }
}

/**
 * GoalsListControl
 * 
 * Quick navigation sidebar listing all goals.
 */
class GoalsListControl extends jsgui.Control {
  constructor(spec) {
    spec = spec || {};
    spec.tagName = "nav";
    super(spec);
    
    this._goals = spec.goals || { categories: [] };
    this._selectedId = spec.selectedId || null;
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    this.dom.attributes.class = "goals-nav";
    
    const list = new jsgui.Control({ context: this.context, tagName: "ul" });
    list.dom.attributes.class = "goals-list";
    
    for (const category of this._goals.categories || []) {
      // Category header
      const catHeader = new jsgui.Control({ context: this.context, tagName: "li" });
      catHeader.dom.attributes.class = "goals-list-category";
      catHeader.add(`${category.emoji} ${category.title}`);
      list.add(catHeader);
      
      // Goals in this category
      for (const goal of category.goals || []) {
        const item = new jsgui.Control({ context: this.context, tagName: "li" });
        item.dom.attributes.class = "goals-list-item" + 
          (goal.id === this._selectedId ? " active" : "");
        item.dom.attributes["data-goal-id"] = goal.id;
        
        // Status dot
        const dot = new jsgui.Control({ context: this.context, tagName: "span" });
        dot.dom.attributes.class = `status-dot ${goal.status}`;
        item.add(dot);
        
        // Title
        item.add(goal.title);
        
        list.add(item);
      }
    }
    
    this.add(list);
  }
}

module.exports = {
  GoalsExplorerControl,
  GoalDetailControl,
  GoalsListControl,
};
