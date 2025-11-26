"use strict";

/**
 * DiagramAtlasAppControl - Main application control for Diagram Atlas
 * 
 * Composes the Diagram Atlas page using jsgui3 controls:
 * - Header with title, diagnostics, and toolbar
 * - Section containers for code, db, and features
 * 
 * This follows the same pattern as DocAppControl in the docs viewer.
 */

const jsgui = require("jsgui3-html");
const { BaseAppControl } = require("../../shared/BaseAppControl");
const { DiagramToolbarControl } = require("./DiagramToolbarControl");
const { DiagramDiagnosticsControl } = require("./DiagramDiagnosticsControl");

// Import existing diagram controls
const {
  buildCodeSection,
  buildDbSection,
  buildFeatureSection
} = require("../../../controls/DiagramAtlasControls");

const StringControl = jsgui.String_Control;

/**
 * Format a timestamp for display
 */
function formatTimestamp(value, fallback = "—") {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

/**
 * Main application control for the Diagram Atlas
 */
class DiagramAtlasAppControl extends BaseAppControl {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.diagramData - Full diagram data object
   * @param {Object} spec.diagramData.code - Code section data
   * @param {Object} spec.diagramData.db - Database section data
   * @param {Object} spec.diagramData.features - Features section data
   * @param {string} spec.diagramData.generatedAt - Generation timestamp
   * @param {Object} spec.state - Client state object for embedding
   */
  constructor(spec = {}) {
    super({
      ...spec,
      appName: "Diagram Atlas",
      appClass: "diagram-atlas",
      title: spec.title || "Code + DB Diagram Atlas"
    });
    
    // Diagram-specific state
    this.diagramData = spec.diagramData || null;
    this.subtitle = spec.subtitle || "Derived from js-scan/js-edit CLI outputs";
    this.state = spec.state || null;
    this.loadingLabel = spec.loadingLabel || "Preparing Diagram Atlas";
    this.loadingDetail = spec.loadingDetail || "Collecting sources and metrics...";
    
    // Extract summary data for diagnostics
    this.codeSummary = this.diagramData?.code?.summary || {};
    this.generatedAt = formatTimestamp(this.diagramData?.generatedAt);
    
    // Now compose after all properties are set
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Override header building to include diagnostics and toolbar
   */
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("diagram-atlas__header");
    header.add_class("diagram-hero");
    
    // Title and subtitle
    const heading = new jsgui.Control({ context: this.context, tagName: "div" });
    heading.add_class("diagram-hero__heading");
    
    const h1 = new jsgui.Control({ context: this.context, tagName: "h1" });
    h1.add(new StringControl({ context: this.context, text: this.title }));
    heading.add(h1);
    
    const sub = new jsgui.Control({ context: this.context, tagName: "p" });
    sub.add_class("diagram-atlas__subtitle");
    sub.add(new StringControl({ context: this.context, text: this.subtitle }));
    heading.add(sub);
    
    header.add(heading);
    
    // Toolbar
    const toolbar = this._buildToolbar();
    header.add(toolbar);
    
    // Diagnostics stats
    const statsWrap = new jsgui.Control({ context: this.context, tagName: "div" });
    statsWrap.add_class("diagram-hero__stats");
    const diagnostics = this._buildDiagnostics();
    statsWrap.add(diagnostics);
    header.add(statsWrap);
    
    return header;
  }

  /**
   * Build the toolbar using the dedicated DiagramToolbarControl
   */
  _buildToolbar() {
    return new DiagramToolbarControl({
      context: this.context,
      snapshotTime: this.generatedAt,
      status: this.diagramData ? "complete" : "loading",
      progressLabel: this.diagramData ? "Diagram Atlas ready" : this.loadingLabel,
      progressDetail: this.diagramData ? "Loaded from cached snapshot" : this.loadingDetail
    });
  }

  /**
   * Build the diagnostics stats panel using DiagramDiagnosticsControl
   */
  _buildDiagnostics() {
    return new DiagramDiagnosticsControl({
      context: this.context,
      diagramData: this.diagramData,
      generatedAt: this.generatedAt
    });
  }

  /**
   * Compose main content with diagram sections
   */
  composeMainContent() {
    // Sections container
    const sections = new jsgui.Control({ context: this.context, tagName: "div" });
    sections.add_class("diagram-atlas__sections");
    sections.dom.attributes["data-role"] = "diagram-atlas-sections";
    
    if (this.diagramData) {
      // Code section
      if (this.diagramData.code) {
        sections.add(buildCodeSection(this.context, this.diagramData.code));
      }
      
      // DB section
      if (this.diagramData.db) {
        sections.add(buildDbSection(this.context, this.diagramData.db));
      }
      
      // Features section
      if (this.diagramData.features) {
        sections.add(buildFeatureSection(this.context, this.diagramData.features));
      }
    } else {
      // Placeholder for shell mode
      const placeholder = new jsgui.Control({ context: this.context, tagName: "div" });
      placeholder.add_class("diagram-atlas__placeholder");
      placeholder.add(new StringControl({ 
        context: this.context, 
        text: "Diagram Atlas will populate once data loads." 
      }));
      sections.add(placeholder);
    }
    
    this.mainContainer.add(sections);
  }

  /**
   * Override footer building (diagram atlas has minimal footer)
   */
  _buildFooter() {
    const footer = new jsgui.Control({ context: this.context, tagName: "footer" });
    footer.add_class("diagram-atlas__footer");
    // Minimal footer - most info is in the header
    return footer;
  }
}

module.exports = { DiagramAtlasAppControl };
