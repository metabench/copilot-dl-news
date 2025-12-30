"use strict";

/**
 * DocNavigationControl - Client-side SPA Navigation
 * 
 * Intercepts doc link clicks and fetches content via AJAX instead of
 * full page reloads. This provides instant navigation between docs.
 * 
 * jsgui3 Pattern:
 * - Server renders the nav tree normally with links
 * - This control activates on the client and intercepts clicks
 * - Content is fetched via /api/doc and injected into the viewer
 * - URL is updated via history.pushState()
 * 
 * Key: Uses jsgui3's automatic DOM binding - content added via jsgui.Control
 * automatically renders when added to the DOM.
 */

const jsgui = require("../jsgui");

/**
 * Client-side navigation controller for SPA-style doc viewing
 */
class DocNavigationControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {HTMLElement} spec.el - The nav element to attach to
   * @param {HTMLElement} spec.contentTarget - The content area to update
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    
    // Element references (set during activate)
    this.navEl = spec.el || null;
    this.contentTarget = spec.contentTarget || null;
    
    // Current state
    this.currentPath = null;
    this.isNavigating = false;
    
    // Cache for loaded docs (path -> { html, title })
    this.docCache = new Map();
  }

  /**
   * Activate the control - bind event handlers
   * Called automatically by jsgui3-client when the page is hydrated
   */
  activate() {
    if (typeof document === "undefined") return;
    
    // Find the nav element if not provided
    this.navEl = this.navEl || document.querySelector("nav.doc-nav");
    if (!this.navEl) {
      console.warn("[DocNavigation] No nav element found");
      return;
    }
    
    // Find the main element - this always exists (contains welcome or doc content)
    this.mainEl = document.querySelector("main.doc-viewer");
    if (!this.mainEl) {
      console.warn("[DocNavigation] No main element found");
      return;
    }
    
    // Content target may or may not exist (doesn't exist on welcome page)
    // We'll find/create it dynamically during navigation
    this.contentTarget = document.querySelector("article.doc-viewer__content");
    
    // Get current path from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.currentPath = urlParams.get("doc");
    
    // Bind click handler for doc links (event delegation)
    this.navEl.addEventListener("click", this._handleNavClick.bind(this));
    
    // Handle browser back/forward
    window.addEventListener("popstate", this._handlePopState.bind(this));
    
    console.log("[DocNavigation] Activated - SPA navigation enabled", { 
      hasContentTarget: !!this.contentTarget,
      currentPath: this.currentPath 
    });
  }

  /**
   * Handle click events on navigation links
   */
  _handleNavClick(e) {
    // Find the closest link with data-doc-path
    const link = e.target.closest("a[data-doc-path]");
    if (!link) return;
    
    // Get the doc path
    const docPath = link.getAttribute("data-doc-path");
    if (!docPath) return;
    
    // Prevent default navigation
    e.preventDefault();
    
    // Navigate to the doc
    this.navigateTo(docPath, { pushState: true });
  }

  /**
   * Handle browser back/forward navigation
   */
  _handlePopState(e) {
    const state = e.state;
    if (state && state.docPath) {
      this.navigateTo(state.docPath, { pushState: false });
    } else {
      // No doc selected - show welcome
      this._showWelcome();
    }
  }

  /**
   * Navigate to a document
   * @param {string} docPath - Document path to navigate to
   * @param {Object} options - { pushState: boolean }
   */
  async navigateTo(docPath, options = {}) {
    const { pushState = true } = options;
    
    if (this.isNavigating) return;
    if (docPath === this.currentPath) return;
    
    this.isNavigating = true;
    
    // Update selected state in nav immediately for responsiveness
    this._updateSelectedLink(docPath);
    
    // Show loading indicator immediately (prevents cursor stuck on hand)
    this._showLoading();
    
    try {
      // Check cache first
      let content = this.docCache.get(docPath);
      
      if (!content) {
        // Fetch from API
        const basePath = typeof window !== 'undefined' && typeof window.__DOCS_VIEWER_BASE_PATH__ === 'string'
          ? window.__DOCS_VIEWER_BASE_PATH__
          : '';
        const response = await fetch(`${basePath}/api/doc?path=${encodeURIComponent(docPath)}`);
        if (!response.ok) {
          throw new Error(`Failed to load document: ${response.statusText}`);
        }
        content = await response.json();
        
        // Cache it (limit cache size)
        if (this.docCache.size > 50) {
          const firstKey = this.docCache.keys().next().value;
          this.docCache.delete(firstKey);
        }
        this.docCache.set(docPath, content);
      }
      
      // Render the content
      this._renderContent(content);
      
      // Update URL
      if (pushState) {
        const url = new URL(window.location);
        url.searchParams.set("doc", docPath);
        window.history.pushState({ docPath }, content.title || "Document", url.toString());
      }
      
      // Update document title
      document.title = content.title ? `${content.title} - Docs` : "Documentation";
      
      this.currentPath = docPath;
      
    } catch (err) {
      console.error("[DocNavigation] Error loading doc:", err);
      this._showError(err.message);
    } finally {
      this.isNavigating = false;
      // Remove loading cursor
      document.body.classList.remove("docs-loading");
    }
  }

  /**
   * Update the selected link styling
   */
  _updateSelectedLink(docPath) {
    // Remove current selection
    const current = this.navEl.querySelector(".doc-nav__link--selected");
    if (current) {
      current.classList.remove("doc-nav__link--selected");
      current.removeAttribute("aria-current");
    }
    
    // Add selection to new link
    const newLink = this.navEl.querySelector(`a[data-doc-path="${docPath}"]`);
    if (newLink) {
      newLink.classList.add("doc-nav__link--selected");
      newLink.setAttribute("aria-current", "page");
      
      // Ensure the link is visible (expand parent folders)
      this._expandParentFolders(newLink);
    }
  }

  /**
   * Expand all parent folder <details> elements
   */
  _expandParentFolders(element) {
    let parent = element.parentElement;
    while (parent && parent !== this.navEl) {
      if (parent.tagName === "DETAILS" && !parent.open) {
        parent.open = true;
      }
      parent = parent.parentElement;
    }
  }

  /**
   * Show loading state in content area
   */
  _showLoading() {
    // Set loading cursor on body immediately to provide feedback
    document.body.classList.add("docs-loading");
    
    // Ensure we have a content target (create if needed for welcome → doc transition)
    this._ensureContentTarget();
    if (!this.contentTarget) return;
    
    // Add loading class for opacity transition
    this.contentTarget.classList.add("doc-viewer__content--loading");
    
    // Create a simple loading indicator
    this.contentTarget.innerHTML = `
      <div class="doc-viewer__loading" style="display: flex; justify-content: center; align-items: center; padding: 2rem;">
        <div style="text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
          <div>Loading...</div>
        </div>
      </div>
    `;
  }

  /**
   * Ensure content target exists, creating it if needed (welcome → doc transition)
   */
  _ensureContentTarget() {
    // Already have it?
    if (this.contentTarget) return;
    
    // Try to find it
    this.contentTarget = document.querySelector("article.doc-viewer__content");
    if (this.contentTarget) return;
    
    // Need to create it - we're on the welcome page
    // Clear the welcome content and create proper doc structure
    if (this.mainEl) {
      // Clear welcome content
      this.mainEl.innerHTML = "";
      
      // Create article element for content
      const article = document.createElement("article");
      article.className = "doc-viewer__content";
      this.mainEl.appendChild(article);
      
      // Create footer
      const footer = document.createElement("footer");
      footer.className = "doc-viewer__footer";
      this.mainEl.appendChild(footer);
      
      this.contentTarget = article;
      console.log("[DocNavigation] Created content target for SPA navigation");
    }
  }

  /**
   * Render document content into the target
   * @param {Object} content - { path, title, html, isSvg? }
   */
  _renderContent(content) {
    this._ensureContentTarget();
    if (!this.contentTarget) return;
    
    // Remove loading class
    this.contentTarget.classList.remove("doc-viewer__content--loading");
    
    // Build the document HTML structure
    // This matches DocViewerControl's compose() output
    const breadcrumb = this._buildBreadcrumbHtml(content.path);
    
    // Determine if this is an SVG doc (needs different max-width handling)
    const isSvg = content.isSvg || content.path?.toLowerCase().endsWith('.svg');
    
    // Update the main element class to signal SVG content
    // This allows CSS to handle max-width differently for SVGs
    if (this.mainEl) {
      if (isSvg) {
        this.mainEl.classList.add('doc-viewer--svg');
      } else {
        this.mainEl.classList.remove('doc-viewer--svg');
      }
    }
    
    this.contentTarget.innerHTML = `
      <header class="doc-viewer__header">
        ${breadcrumb}
        <h1 class="doc-viewer__title">${this._escapeHtml(content.title || "Document")}</h1>
        <div class="doc-viewer__toolbar" role="toolbar">
          <button class="doc-viewer__toolbar-btn" type="button" title="Copy link" data-action="copy-link">🔗</button>
          <button class="doc-viewer__toolbar-btn" type="button" title="Print document" data-action="print">🖨️</button>
        </div>
      </header>
      <div class="doc-content">${content.html || ""}</div>
    `;
    
    // Update footer with path info
    const footer = this.mainEl?.querySelector("footer.doc-viewer__footer");
    if (footer && content.path) {
      footer.innerHTML = `<span class="doc-viewer__path-info">📁 ${this._escapeHtml(content.path)}</span>`;
    }
    
    // Scroll the content column to top (not just the article)
    const contentColumn = document.querySelector(".doc-app__content-column");
    if (contentColumn) {
      contentColumn.scrollTop = 0;
    }
    
    // Re-highlight code blocks if Prism is available
    if (typeof Prism !== "undefined") {
      Prism.highlightAllUnder(this.contentTarget);
    }
  }

  /**
   * Build breadcrumb HTML from path
   */
  _buildBreadcrumbHtml(docPath) {
    if (!docPath) return "";
    
    const parts = docPath.split("/").filter(Boolean);
    let items = `<li class="doc-viewer__breadcrumb-item"><a href="/">Home</a></li>`;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      
      if (isLast) {
        items += `<li class="doc-viewer__breadcrumb-item"><span aria-current="page">${this._escapeHtml(part.replace(/\.md$/i, ""))}</span></li>`;
      } else {
        items += `<li class="doc-viewer__breadcrumb-item"><span>${this._escapeHtml(part)}</span></li>`;
      }
    }
    
    return `
      <nav class="doc-viewer__breadcrumb" aria-label="Breadcrumb">
        <ol class="doc-viewer__breadcrumb-list">${items}</ol>
      </nav>
    `;
  }

  /**
   * Show welcome/empty state (when navigating back to home)
   */
  _showWelcome() {
    if (!this.mainEl) return;
    
    // Replace entire main content with welcome state
    this.mainEl.innerHTML = `
      <div class="doc-viewer__welcome">
        <div class="doc-viewer__welcome-icon">📚</div>
        <h1 class="doc-viewer__welcome-title">Documentation Viewer</h1>
        <p class="doc-viewer__welcome-message">Select a document from the navigation panel to view its contents.</p>
        <div class="doc-viewer__quick-links">
          <h3>Quick Links</h3>
          <ul>
            <li><a href="/?doc=INDEX.md">Documentation Index</a></li>
            <li><a href="/?doc=ROADMAP.md">Project Roadmap</a></li>
            <li><a href="/?doc=QUICK_REFERENCE.md">Quick Reference</a></li>
          </ul>
        </div>
      </div>
    `;
    
    // Clear content target reference (it no longer exists)
    this.contentTarget = null;
    
    // Clear selection
    const current = this.navEl?.querySelector(".doc-nav__link--selected");
    if (current) {
      current.classList.remove("doc-nav__link--selected");
      current.removeAttribute("aria-current");
    }
    
    this.currentPath = null;
    
    // Update document title
    document.title = "Documentation Viewer";
  }

  /**
   * Show error state
   */
  _showError(message) {
    this._ensureContentTarget();
    if (!this.contentTarget) return;
    
    this.contentTarget.innerHTML = `
      <div class="doc-viewer__error" style="padding: 2rem; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">❌</div>
        <h2>Error Loading Document</h2>
        <p>${this._escapeHtml(message)}</p>
        <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;">
          Reload Page
        </button>
      </div>
    `;
  }

  /**
   * Escape HTML special characters
   */
  _escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

module.exports = { DocNavigationControl };
