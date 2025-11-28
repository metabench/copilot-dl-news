"use strict";

/**
 * DocViewerControl - Document content viewer
 * 
 * Renders the markdown content in the right column of the docs viewer.
 * Supports table of contents, code highlighting, and navigation.
 */

const jsgui = require("../jsgui");

const StringControl = jsgui.String_Control;

/**
 * Content viewer control for displaying rendered markdown
 */
class DocViewerControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.docContent - Document content { title, html, path, svgControl? }
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "main" });
    
    this.docContent = spec.docContent || null;
    
    this.add_class("doc-viewer");
    this.dom.attributes["role"] = "main";
    
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    if (!this.docContent) {
      this._composeWelcome();
      return;
    }
    
    this._composeDocument();
  }

  /**
   * Compose welcome/empty state
   */
  _composeWelcome() {
    const welcome = new jsgui.Control({ context: this.context, tagName: "div" });
    welcome.add_class("doc-viewer__welcome");
    
    const icon = new jsgui.Control({ context: this.context, tagName: "div" });
    icon.add_class("doc-viewer__welcome-icon");
    icon.add(new StringControl({ context: this.context, text: "📚" }));
    welcome.add(icon);
    
    const title = new jsgui.Control({ context: this.context, tagName: "h1" });
    title.add_class("doc-viewer__welcome-title");
    title.add(new StringControl({ context: this.context, text: "Documentation Viewer" }));
    welcome.add(title);
    
    const message = new jsgui.Control({ context: this.context, tagName: "p" });
    message.add_class("doc-viewer__welcome-message");
    message.add(new StringControl({ context: this.context, text: "Select a document from the navigation panel to view its contents." }));
    welcome.add(message);
    
    // Quick links section
    const quickLinks = new jsgui.Control({ context: this.context, tagName: "div" });
    quickLinks.add_class("doc-viewer__quick-links");
    
    const quickTitle = new jsgui.Control({ context: this.context, tagName: "h3" });
    quickTitle.add(new StringControl({ context: this.context, text: "Quick Links" }));
    quickLinks.add(quickTitle);
    
    const linkList = new jsgui.Control({ context: this.context, tagName: "ul" });
    const defaultDocs = [
      { name: "INDEX.md", label: "Documentation Index" },
      { name: "ROADMAP.md", label: "Project Roadmap" },
      { name: "QUICK_REFERENCE.md", label: "Quick Reference" }
    ];
    
    for (const doc of defaultDocs) {
      const li = new jsgui.Control({ context: this.context, tagName: "li" });
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.dom.attributes.href = `/?doc=${encodeURIComponent(doc.name)}`;
      link.add(new StringControl({ context: this.context, text: doc.label }));
      li.add(link);
      linkList.add(li);
    }
    quickLinks.add(linkList);
    welcome.add(quickLinks);
    
    this.add(welcome);
  }

  /**
   * Compose document view with header, content, and footer
   */
  _composeDocument() {
    // Document header
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("doc-viewer__header");
    
    // Breadcrumb path
    if (this.docContent.path) {
      const breadcrumb = this._buildBreadcrumb(this.docContent.path);
      header.add(breadcrumb);
    }
    
    // Title
    const title = new jsgui.Control({ context: this.context, tagName: "h1" });
    title.add_class("doc-viewer__title");
    title.add(new StringControl({ context: this.context, text: this.docContent.title || "Document" }));
    header.add(title);
    
    // Toolbar
    const toolbar = this._buildToolbar();
    header.add(toolbar);
    
    this.add(header);
    
    // Document content area
    const article = new jsgui.Control({ context: this.context, tagName: "article" });
    article.add_class("doc-viewer__content");
    article.dom.attributes["data-doc-content"] = "";
    
    // Check if we have an SVG control (jsgui3 rendered) or HTML content
    if (this.docContent.svgControl) {
      // SVG content rendered via jsgui3 controls
      article.add(this.docContent.svgControl);
    } else {
      // HTML content (markdown rendered to HTML string)
      const contentWrapper = new DocContentControl({
        context: this.context,
        html: this.docContent.html || ""
      });
      article.add(contentWrapper);
    }
    
    this.add(article);
    
    // Document footer
    const footer = new jsgui.Control({ context: this.context, tagName: "footer" });
    footer.add_class("doc-viewer__footer");
    
    if (this.docContent.path) {
      const pathInfo = new jsgui.Control({ context: this.context, tagName: "span" });
      pathInfo.add_class("doc-viewer__path-info");
      pathInfo.add(new StringControl({ context: this.context, text: `📁 ${this.docContent.path}` }));
      footer.add(pathInfo);
    }
    
    this.add(footer);
  }

  /**
   * Build breadcrumb navigation from path
   */
  _buildBreadcrumb(docPath) {
    const nav = new jsgui.Control({ context: this.context, tagName: "nav" });
    nav.add_class("doc-viewer__breadcrumb");
    nav.dom.attributes["aria-label"] = "Breadcrumb";
    
    const ol = new jsgui.Control({ context: this.context, tagName: "ol" });
    ol.add_class("doc-viewer__breadcrumb-list");
    
    // Home
    const homeLi = new jsgui.Control({ context: this.context, tagName: "li" });
    homeLi.add_class("doc-viewer__breadcrumb-item");
    const homeLink = new jsgui.Control({ context: this.context, tagName: "a" });
    homeLink.dom.attributes.href = "/";
    homeLink.add(new StringControl({ context: this.context, text: "Home" }));
    homeLi.add(homeLink);
    ol.add(homeLi);
    
    // Path parts
    const parts = docPath.split("/").filter(Boolean);
    let accPath = "";
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accPath += (accPath ? "/" : "") + part;
      
      const li = new jsgui.Control({ context: this.context, tagName: "li" });
      li.add_class("doc-viewer__breadcrumb-item");
      
      if (i === parts.length - 1) {
        // Current page - no link
        const span = new jsgui.Control({ context: this.context, tagName: "span" });
        span.dom.attributes["aria-current"] = "page";
        span.add(new StringControl({ context: this.context, text: part.replace(/\.md$/i, "") }));
        li.add(span);
      } else {
        // Folder - could be a link to folder view
        const span = new jsgui.Control({ context: this.context, tagName: "span" });
        span.add(new StringControl({ context: this.context, text: part }));
        li.add(span);
      }
      
      ol.add(li);
    }
    
    nav.add(ol);
    return nav;
  }

  /**
   * Build toolbar with actions
   */
  _buildToolbar() {
    const toolbar = new jsgui.Control({ context: this.context, tagName: "div" });
    toolbar.add_class("doc-viewer__toolbar");
    toolbar.dom.attributes["role"] = "toolbar";
    
    // Copy link button
    const copyBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    copyBtn.add_class("doc-viewer__toolbar-btn");
    copyBtn.dom.attributes.type = "button";
    copyBtn.dom.attributes.title = "Copy link";
    copyBtn.dom.attributes["data-action"] = "copy-link";
    copyBtn.add(new StringControl({ context: this.context, text: "🔗" }));
    toolbar.add(copyBtn);
    
    // Print button
    const printBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    printBtn.add_class("doc-viewer__toolbar-btn");
    printBtn.dom.attributes.type = "button";
    printBtn.dom.attributes.title = "Print document";
    printBtn.dom.attributes["data-action"] = "print";
    printBtn.add(new StringControl({ context: this.context, text: "🖨️" }));
    toolbar.add(printBtn);
    
    return toolbar;
  }
}

/**
 * Special control for rendering raw HTML content
 * This is used to inject pre-rendered markdown HTML
 */
class DocContentControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.rawHtml = spec.html || "";
    this.add_class("doc-content");
  }

  /**
   * Override all_html_render to inject raw HTML
   */
  all_html_render() {
    const attributes = this.renderDomAttributes ? this.renderDomAttributes() : "";
    return `<div${attributes}>${this.rawHtml}</div>`;
  }
}

module.exports = { DocViewerControl, DocContentControl };
