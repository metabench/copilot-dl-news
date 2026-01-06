# jsgui3 UI Architecture Guide for AI Agents

**Target Audience**: AI coding agents working on jsgui3 UIs  
**Scope**: Component-based architecture, control composition, isomorphic patterns, and SSR  
**Last Updated**: November 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Isomorphic Architecture](#isomorphic-architecture)
3. [Core Concepts](#core-concepts)
4. [Control Architecture](#control-architecture)
5. [Creating Controls](#creating-controls)
6. [Composition Patterns](#composition-patterns)
7. [Project Structure](#project-structure)
8. [Verification Scripts](#verification-scripts)
9. [Development Server & Detached Mode](#development-server--detached-mode)
10. [Common Patterns](#common-patterns)
11. [**Extending jsgui3 (Plugins, Mixins, Extensions)**](#extending-jsgui3-plugins-mixins-extensions)
12. [Dashboard Server Performance Patterns](#dashboard-server-performance-patterns)
13. [**Control Count Performance (CRITICAL)**](#control-count-performance-critical)
14. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
15. [Quick Reference](#quick-reference)
16. [**Client-Side Activation Flow (CRITICAL)**](#client-side-activation-flow-critical)
17. [Troubleshooting](#troubleshooting)
18. [**jsgui3-server Patterns & Experiments**](#jsgui3-server-patterns--experiments)

---

## Workflow Discovery Quickstart

1. Before touching any jsgui3 surface, run `node tools/dev/md-scan.js --dir docs --search "jsgui3 workflow" --json` (tweak the search term: `activation`, `control registration`, `dashboard wiring`, etc.).
2. Record which sections you rely on inside your session notes (`WORKING_NOTES.md`) so the next agent can pick up the same trail.
3. If the workflow you find is incomplete, expand this guide (or the relevant workflow doc) and mention the new section in your summary so md-scan keeps surfacing it.

> **Tip:** Use `--find-sections "Client-Side Activation"` when you already know the section title you need.

## Overview

> **Visual Guide**: See [`jsgui3-architecture-diagram.svg`](../diagrams/jsgui3-architecture-diagram.svg) for an illustrated overview of the isomorphic architecture.

**jsgui3-html** is an **isomorphic** component library that works on both server and client. Controls are JavaScript classes that build DOM structures programmatically. On the server, they render to HTML strings; on the client, they can activate existing DOM and bind events (called "hydration" in other frameworks).

### When to Use jsgui3

- Server-rendered pages with structured, reusable components
- Admin dashboards, data explorers, documentation viewers
- Pages where SEO and initial load performance matter
- UIs that need consistent structure across multiple views

### Key Characteristics

```javascript
// Server: controls render to HTML strings
const control = new MyControl({ context, data });
const html = control.all_html_render();  // → "<div class=\"my-control\">...</div>"

// Client: controls activate existing DOM and bind events
const control = new MyControl({ context, el: existingElement });
control.activate();  // Binds click handlers, etc.
```

---

## Isomorphic Architecture

### Library Relationship

```
jsgui3-html (core isomorphic library)
    │
    ├── Used directly on server for SSR
    │
    └── jsgui3-client (extends jsgui3-html)
            │
            └── Adds browser-specific features:
                • Client_Page_Context
                • activate() lifecycle
                • Event binding
                • DOM activation
```

**Key insight**: `jsgui3-client` **requires** `jsgui3-html` internally. The core Control API is identical on both server and client.

### Same Code, Different Environments

Controls using `require("jsgui3-html")` work in both environments:

```javascript
// This control works on BOTH server and client
const jsgui = require("jsgui3-html");

class MyButtonControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "button", __type_name: "my_button" });
    this.label = spec.label || "Click me";
    if (!spec.el) this.compose();
  }
  
  compose() {
    this.add(new jsgui.String_Control({ context: this.context, text: this.label }));
  }
}
```

- **Server**: `node` resolves `jsgui3-html` → renders HTML
- **Client**: Bundler (esbuild) includes `jsgui3-html` → control works in browser

### When to Use jsgui3-client

Use `require("jsgui3-client")` only when you need **client-specific features**:

```javascript
// Client-only control with activation lifecycle
const jsgui = require("jsgui3-client");

class DocsThemeToggleControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "button" });
    this.__type_name = "docs_theme_toggle";
    if (!spec.el) this.compose();
  }
  
  // Client-side activation - binds events to existing DOM
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    el.addEventListener("click", (e) => {
      e.preventDefault();
      this.toggleTheme();
    });
  }
  
  toggleTheme() {
    // Client-side theme switching logic
  }
}
```

### Bundling for Browser

The build script (`scripts/build-docs-viewer-client.js`) uses esbuild to bundle controls:

```javascript
await esbuild.build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: "browser",
  format: "iife",
  // jsgui3-client from npm (v0.0.121+) has browser compatibility fixes
  // No special aliasing needed - just require("jsgui3-client")
});
```

The bundler resolves all `require()` statements and produces a single browser-ready file.

### Activation Pattern

Server renders HTML with data attributes, client activates:

> **Terminology note**: jsgui3 calls this process "activation". Other frameworks (React, Vue, Svelte) call the equivalent process "hydration".

```javascript
// Server-side: render with marker attribute
class MyControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this.dom.attributes["data-jsgui-control"] = "my_control";
    // ...
  }
}

// Client-side: find and activate marked elements
const elements = document.querySelectorAll("[data-jsgui-control]");
elements.forEach(el => {
  const controlType = el.getAttribute("data-jsgui-control");
  const ControlClass = CONTROL_TYPES[controlType];
  
  // Create control with existing DOM element (skips compose)
  const control = new ControlClass({ context, el });
  control.activate();  // Bind events
});
```

### Project Structure for Isomorphic Apps

```
src/ui/server/myApp/
├── controls/              # Server-side controls (use jsgui3-html)
│   ├── MyAppControl.js
│   └── index.js
├── client/                # Client-side entry + controls
│   ├── index.js           # Bundle entry point
│   ├── controls/          # Client controls (use jsgui3-client)
│   │   └── MyInteractiveControl.js
│   └── shims/             # Browser shims for Node modules
└── public/                # Built assets
    └── my-app-client.js   # Bundled client code
```

---

## Core Concepts

### 1. Context

Every control requires a **context** object that manages rendering state. Create it once per page render:

```javascript
const jsgui = require("jsgui3-html");

// Create context for a page render
const context = new jsgui.Page_Context();

// Pass context to all controls
const app = new MyAppControl({ context, ...props });
```

**Critical Rule**: Context flows down through composition. Parent controls pass their `this.context` to child controls.

### 2. Controls

Controls are classes that extend `jsgui.Control`. They:
- Accept a `spec` object in the constructor
- Store state as instance properties
- Build their DOM structure in a `compose()` method
- Render to HTML via `all_html_render()`

```javascript
class MyControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",           // Root element tag
      __type_name: "my_control" // Internal type identifier
    });
    
    // Store state from spec
    this.title = spec.title || "Default";
    
    // Compose after state is set
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    // Build child elements here
  }
}
```

### 3. Adding Text Content

jsgui3 **automatically wraps raw strings** when you call `.add()`. Both approaches work:

```javascript
// ✅ Simple - jsgui3 auto-wraps strings
element.add("Hello World");

// ✅ Explicit - useful when you need the control reference
const StringControl = jsgui.String_Control;
element.add(new StringControl({ context: this.context, text: "Hello World" }));
```

**When to use explicit `String_Control`**:
- When you need a reference to the text node for later manipulation
- When building reusable components where explicitness aids clarity
- Legacy code compatibility (older jsgui patterns)
- **When rendering raw HTML/SVG content** (see below)

For most cases, just use `.add("text")` directly.

### Raw HTML and SVG Content

jsgui3-html doesn't support setting `dom.innerHTML` for server-side rendering. To include raw HTML (like SVG), use `String_Control`:

```javascript
// ❌ WRONG - innerHTML doesn't work for server rendering
this._wrapper.dom.innerHTML = '<svg>...</svg>';

// ✅ CORRECT - String_Control outputs raw HTML
const svgContent = new jsgui.String_Control({
  context: this.context,
  text: `<svg class="my-svg" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="100" height="50" fill="blue"/>
  </svg>`
});
this._wrapper.add(svgContent);
```

**Key points**:
- `String_Control.text` is rendered as-is (no escaping)
- Works for any raw HTML: SVG, iframes, embedded content
- Client-side activation can then query these elements normally
- See Art Playground (`src/ui/server/artPlayground/`) for a working example

---

## Control Architecture

### Inheritance Hierarchy

```
jsgui.Control (base)
    └── BaseAppControl (shared app-level features)
            ├── DocAppControl (docs viewer)
            ├── ExplorerAppControl (data explorer)
            ├── DiagramAtlasAppControl (diagram atlas)
            └── GazetteerAppControl (gazetteer)
```

### BaseAppControl Pattern

Create a shared base class for app-level controls that provides:
- Common header/footer structure
- Navigation building
- Section creation helpers

```javascript
class BaseAppControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "base_app"
    });
    
    this.appName = spec.appName || "App";
    this.appClass = spec.appClass || "app";
    this.title = spec.title || this.appName;
    
    this.add_class(this.appClass);
    
    // DO NOT call compose() here - subclasses must call it
    // after setting their own properties
  }
  
  compose() {
    this.headerContainer = this._buildHeader();
    this.add(this.headerContainer);
    
    this.mainContainer = new jsgui.Control({ 
      context: this.context, 
      tagName: "main" 
    });
    this.mainContainer.add_class(`${this.appClass}__main`);
    this.add(this.mainContainer);
    
    // Hook for subclasses
    this.composeMainContent();
    
    this.footerContainer = this._buildFooter();
    this.add(this.footerContainer);
  }
  
  // Override in subclasses
  composeMainContent() {}
  
  _buildHeader() { /* ... */ }
  _buildFooter() { /* ... */ }
}
```

### Critical: Constructor Timing

**JavaScript class inheritance runs the parent constructor before the child constructor.**

This means properties set in a child constructor are NOT available when the parent constructor runs.

```javascript
// ❌ WRONG - compose() called before child properties exist
class BaseControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this.compose();  // Child's this.data is undefined here!
  }
}

class ChildControl extends BaseControl {
  constructor(spec) {
    super(spec);     // Parent's constructor runs FIRST
    this.data = spec.data;  // This runs AFTER parent's compose()
  }
}
```

```javascript
// ✅ CORRECT - child calls compose() after setting properties
class BaseControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    // DO NOT call compose() here
  }
}

class ChildControl extends BaseControl {
  constructor(spec) {
    super(spec);
    this.data = spec.data;  // Set properties first
    
    if (!spec.el) {
      this.compose();  // Now compose with all properties available
    }
  }
}
```

---

## Creating Controls

### Step 1: Define the Control Class

```javascript
"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * PlaceBadgeControl - Reusable badge for place metadata
 * 
 * @example
 * const badge = new PlaceBadgeControl({
 *   context,
 *   text: "city",
 *   variant: "kind"
 * });
 */
class PlaceBadgeControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context (required)
   * @param {string} spec.text - Badge text content
   * @param {string} [spec.variant] - Visual variant: "kind", "country", "default"
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "span",
      __type_name: "place_badge"
    });
    
    this.add_class("gazetteer__badge");
    
    this.text = spec.text || "";
    this.variant = spec.variant || "default";
    
    if (this.variant !== "default") {
      this.add_class(`gazetteer__badge--${this.variant}`);
    }
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    this.add(new StringControl({ context: this.context, text: this.text }));
  }
}

module.exports = { PlaceBadgeControl };
```

### Step 2: Key Patterns

#### Adding CSS Classes

```javascript
// Single class
control.add_class("my-class");

// BEM naming convention
control.add_class("block__element");
control.add_class("block__element--modifier");
```

#### Setting Attributes

```javascript
// Standard attributes
control.dom.attributes.href = "/path";
control.dom.attributes.type = "submit";
control.dom.attributes.value = "Search";

// Data attributes
control.dom.attributes["data-role"] = "toolbar";
control.dom.attributes["data-metric"] = "count";

// Boolean attributes
control.dom.attributes.disabled = "disabled";
control.dom.attributes.selected = "selected";
```

#### Creating Child Elements

```javascript
compose() {
  // Create a child element
  const header = new jsgui.Control({ 
    context: this.context, 
    tagName: "header" 
  });
  header.add_class("my-control__header");
  
  // Add text content
  const title = new jsgui.Control({ context: this.context, tagName: "h1" });
  title.add(new StringControl({ context: this.context, text: this.title }));
  header.add(title);
  
  // Add to parent
  this.add(header);
}
```

#### Building Methods Pattern

For complex controls, break composition into private builder methods:

```javascript
compose() {
  const header = this._buildHeader();
  this.add(header);
  
  const content = this._buildContent();
  this.add(content);
  
  const footer = this._buildFooter();
  this.add(footer);
}

_buildHeader() {
  const header = new jsgui.Control({ context: this.context, tagName: "header" });
  // ... build header structure
  return header;
}

_buildContent() {
  const content = new jsgui.Control({ context: this.context, tagName: "main" });
  // ... build content structure
  return content;
}

_buildFooter() {
  const footer = new jsgui.Control({ context: this.context, tagName: "footer" });
  // ... build footer structure
  return footer;
}
```

---

## Composition Patterns

### Pattern 1: Direct Instantiation

When a component is simple and self-contained:

```javascript
_buildHeader() {
  const header = new jsgui.Control({ context: this.context, tagName: "header" });
  
  // Use a dedicated control
  const toolbar = new DiagramToolbarControl({
    context: this.context,
    snapshotTime: this.generatedAt,
    status: "complete"
  });
  header.add(toolbar);
  
  return header;
}
```

### Pattern 2: Iterative Composition

When rendering lists of similar items:

```javascript
_buildResultsList() {
  const list = new jsgui.Control({ context: this.context, tagName: "div" });
  list.add_class("results-list");
  
  for (const item of this.results) {
    const itemControl = new ResultItemControl({
      context: this.context,
      data: item
    });
    list.add(itemControl);
  }
  
  return list;
}
```

### Pattern 3: Conditional Composition

When structure depends on state:

```javascript
composeMainContent() {
  if (!this.data) {
    // Empty state
    const placeholder = new jsgui.Control({ context: this.context, tagName: "div" });
    placeholder.add_class("placeholder");
    placeholder.add(new StringControl({ context: this.context, text: "No data available" }));
    this.mainContainer.add(placeholder);
    return;
  }
  
  // Normal state with data
  const content = this._buildDataContent();
  this.mainContainer.add(content);
}
```

### Pattern 4: View Type Switching

When a single control handles multiple view types:

```javascript
const VIEW_TYPES = Object.freeze({
  SEARCH: "search",
  DETAIL: "detail",
  DASHBOARD: "dashboard"
});

class MyAppControl extends BaseAppControl {
  constructor(spec) {
    super(spec);
    this.viewType = spec.viewType || VIEW_TYPES.SEARCH;
    // ...
  }
  
  composeMainContent() {
    switch (this.viewType) {
      case VIEW_TYPES.SEARCH:
        this._composeSearchView();
        break;
      case VIEW_TYPES.DETAIL:
        this._composeDetailView();
        break;
      case VIEW_TYPES.DASHBOARD:
        this._composeDashboardView();
        break;
    }
  }
}

MyAppControl.VIEW_TYPES = VIEW_TYPES;
```

---

## Project Structure

### Recommended Directory Layout

```
src/ui/
├── controls/                      # Shared/generic controls
│   ├── Table.js
│   ├── PagerButton.js
│   └── checks/                    # Check scripts for shared controls
│       └── Table.check.js
│
├── server/
│   ├── shared/                    # Shared app-level infrastructure
│   │   ├── BaseAppControl.js
│   │   └── index.js
│   │
│   ├── dataExplorer/              # Data Explorer app
│   │   ├── controls/
│   │   │   ├── ExplorerAppControl.js
│   │   │   ├── ExplorerHomeCardControl.js
│   │   │   ├── ExplorerPaginationControl.js
│   │   │   └── index.js
│   │   ├── checks/
│   │   │   └── ExplorerAppControl.check.js
│   │   └── dataExplorerServer.js
│   │
│   ├── gazetteer/                 # Gazetteer app
│   │   ├── controls/
│   │   │   ├── GazetteerAppControl.js
│   │   │   ├── GazetteerSearchFormControl.js
│   │   │   ├── GazetteerBreadcrumbControl.js
│   │   │   ├── GazetteerResultItemControl.js
│   │   │   ├── PlaceBadgeControl.js
│   │   │   └── index.js
│   │   └── checks/
│   │       └── GazetteerAppControl.check.js
│   │
│   └── diagramAtlas/              # Diagram Atlas app
│       ├── controls/
│       │   ├── DiagramAtlasAppControl.js
│       │   ├── DiagramToolbarControl.js
│       │   ├── DiagramDiagnosticsControl.js
│       │   └── index.js
│       └── checks/
│           ├── DiagramAtlasAppControl.check.js
│           └── DiagramToolbarControl.check.js
```

### Index Files

Each controls directory should have an `index.js` that exports all controls:

```javascript
"use strict";

const { GazetteerAppControl, VIEW_TYPES } = require("./GazetteerAppControl");
const { GazetteerSearchFormControl, KIND_OPTIONS } = require("./GazetteerSearchFormControl");
const { GazetteerBreadcrumbControl } = require("./GazetteerBreadcrumbControl");
const { GazetteerResultItemControl } = require("./GazetteerResultItemControl");
const { PlaceBadgeControl, BADGE_VARIANTS } = require("./PlaceBadgeControl");

module.exports = {
  GazetteerAppControl,
  GazetteerSearchFormControl,
  GazetteerBreadcrumbControl,
  GazetteerResultItemControl,
  PlaceBadgeControl,
  VIEW_TYPES,
  KIND_OPTIONS,
  BADGE_VARIANTS
};
```

---

## Verification Scripts

### Purpose

Check scripts verify that controls render correctly without running the full application. They:
- Instantiate controls with sample data
- Render to HTML
- Assert expected content/structure exists
- Provide quick feedback during development

### Check Script Template

```javascript
"use strict";

/**
 * MyControl Check Script
 * 
 * Run with: node src/ui/server/myApp/checks/MyControl.check.js
 */

const jsgui = require("jsgui3-html");
const { MyControl } = require("../controls/MyControl");

// Create context for rendering
function createContext() {
  return new jsgui.Page_Context();
}

// Sample data
const SAMPLE_DATA = {
  title: "Test Title",
  items: [
    { id: 1, name: "Item 1" },
    { id: 2, name: "Item 2" }
  ]
};

console.log("MyControl Verification");
console.log("========================================\n");

let totalPassed = 0;
let totalFailed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    totalPassed++;
  } else {
    console.log(`  ❌ ${name}`);
    totalFailed++;
  }
}

// Test 1: Basic rendering
console.log("📋 Testing basic rendering...");
{
  const ctx = createContext();
  const control = new MyControl({
    context: ctx,
    title: SAMPLE_DATA.title,
    items: SAMPLE_DATA.items
  });
  
  const html = control.all_html_render();
  
  check(html.includes("my-control"), "has my-control class");
  check(html.includes("Test Title"), "contains title");
  check(html.includes("Item 1"), "contains first item");
  check(html.includes("Item 2"), "contains second item");
}

// Test 2: Empty state
console.log("\n📋 Testing empty state...");
{
  const ctx = createContext();
  const control = new MyControl({
    context: ctx,
    title: "Empty",
    items: []
  });
  
  const html = control.all_html_render();
  
  check(html.includes("my-control"), "has my-control class");
  check(html.includes("no-items") || html.includes("No items"), "shows empty state");
}

// Summary
console.log("\n========================================");
if (totalFailed === 0) {
  console.log(`✅ All checks passed! (${totalPassed}/${totalPassed})`);
  process.exit(0);
} else {
  console.log(`❌ ${totalFailed} checks failed`);
  process.exit(1);
}
```

### Running Check Scripts

```bash
# Single control
node src/ui/server/gazetteer/checks/GazetteerAppControl.check.js

# Multiple controls (PowerShell)
node src/ui/server/diagramAtlas/checks/DiagramAtlasAppControl.check.js; `
node src/ui/server/dataExplorer/checks/ExplorerAppControl.check.js
```

---

## Development Server & Detached Mode

### Server Overview

jsgui3 UI applications run on Express servers that serve SSR pages and API endpoints. The primary server for the Data Explorer is `dataExplorerServer.js`.

General server lifecycle rules for agents (how to avoid hanging on long-running servers, `--check`, and safe background processes) are canonical in:

- `docs/COMMAND_EXECUTION_GUIDE.md` → "🚨 Server Verification - CRITICAL FOR AGENTS 🚨"

### Data Explorer Detached Mode

The Data Explorer server (`src/ui/server/dataExplorerServer.js`) supports **detached mode** for running independently of the terminal:

```bash
# Start server in detached mode (runs in background)
node src/ui/server/dataExplorerServer.js --detached --port 4600

# Check if server is running
node src/ui/server/dataExplorerServer.js --status

# Stop detached server
node src/ui/server/dataExplorerServer.js --stop
```

**Output examples**:
```
# --detached
🔍 Data Explorer started in background (PID: 12345)
   URL: http://127.0.0.1:4600/domains
   Stop with: node src\ui\server\dataExplorerServer.js --stop

# --status (running)
🔍 Data Explorer: running (PID: 12345)

# --status (not running)
🔍 Data Explorer: not running

# --stop
🔍 Data Explorer stopped (was PID: 12345)
```

### Agent Workflow: Server Management

**Before starting a server**:
```bash
# Always stop any existing detached server first
node src/ui/server/dataExplorerServer.js --stop 2>$null

# Then start fresh in detached mode
node src/ui/server/dataExplorerServer.js --detached --port 4600
```

**When debugging server issues**:
```bash
# Check if server is actually running
node src/ui/server/dataExplorerServer.js --status

# If not running, start it
node src/ui/server/dataExplorerServer.js --detached --port 4600
```

**After making server-side changes**:
```bash
# Restart to pick up code changes
node src/ui/server/dataExplorerServer.js --stop
node src/ui/server/dataExplorerServer.js --detached --port 4600
```

### PID File Location

Detached mode uses a PID file to track the running process:
- **Location**: `tmp/.data-explorer.pid`
- **Contents**: Process ID of the detached server
- **Cleanup**: Automatically deleted when `--stop` succeeds

### When NOT to Use Detached Mode

- **Debugging with console.log**: Use foreground mode to see output
- **Watching for errors**: Foreground mode shows stack traces immediately
- **Development iteration**: Sometimes easier to Ctrl+C and restart

For debugging, run in foreground in a dedicated terminal:
```bash
node src/ui/server/dataExplorerServer.js --port 4600
```

### Quick Reference

| Command | Purpose |
|---------|---------|
| `--detached` | Start server in background, survives terminal commands |
| `--status` | Check if detached server is running |
| `--stop` | Stop detached server |
| `--port <n>` | Specify port (default: 4600) |

---

## Common Patterns

### 1. Form Controls

```javascript
class SearchFormControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "form", __type_name: "search_form" });
    
    this.add_class("search-form");
    this.dom.attributes.action = spec.action || "/search";
    this.dom.attributes.method = "get";
    
    this.query = spec.query || "";
    this.placeholder = spec.placeholder || "Search...";
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    // Text input
    const input = new jsgui.Control({ context: this.context, tagName: "input" });
    input.dom.attributes.type = "text";
    input.dom.attributes.name = "q";
    input.dom.attributes.placeholder = this.placeholder;
    if (this.query) {
      input.dom.attributes.value = this.query;
    }
    input.add_class("search-form__input");
    this.add(input);
    
    // Submit button
    const button = new jsgui.Control({ context: this.context, tagName: "button" });
    button.dom.attributes.type = "submit";
    button.add_class("search-form__button");
    button.add(new StringControl({ context: this.context, text: "Search" }));
    this.add(button);
  }
}
```

### 2. Select/Dropdown Controls

```javascript
const OPTIONS = [
  { value: "", label: "All" },
  { value: "type1", label: "Type 1" },
  { value: "type2", label: "Type 2" }
];

class FilterSelectControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "select", __type_name: "filter_select" });
    
    this.add_class("filter-select");
    this.dom.attributes.name = spec.name || "filter";
    
    this.options = spec.options || OPTIONS;
    this.selectedValue = spec.selectedValue || "";
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    for (const opt of this.options) {
      const option = new jsgui.Control({ context: this.context, tagName: "option" });
      option.dom.attributes.value = opt.value;
      
      if (opt.value === this.selectedValue) {
        option.dom.attributes.selected = "selected";
      }
      
      option.add(new StringControl({ context: this.context, text: opt.label }));
      this.add(option);
    }
  }
}
```

### 3. Breadcrumb Navigation

```javascript
class BreadcrumbControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "nav", __type_name: "breadcrumb" });
    
    this.add_class("breadcrumb");
    
    this.items = spec.items || [];  // [{ label, href }, ...]
    this.separator = spec.separator || " › ";
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    this.items.forEach((item, index) => {
      // Add separator (except before first item)
      if (index > 0) {
        this.add(new StringControl({ context: this.context, text: this.separator }));
      }
      
      if (item.href) {
        // Linked item
        const link = new jsgui.Control({ context: this.context, tagName: "a" });
        link.dom.attributes.href = item.href;
        link.add(new StringControl({ context: this.context, text: item.label }));
        this.add(link);
      } else {
        // Current page (no link)
        const span = new jsgui.Control({ context: this.context, tagName: "span" });
        span.add_class("breadcrumb__current");
        span.add(new StringControl({ context: this.context, text: item.label }));
        this.add(span);
      }
    });
  }
}
```

### 4. Card/Tile Components

```javascript
class StatCardControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "stat_card" });
    
    this.add_class("stat-card");
    if (spec.variant) {
      this.add_class(`stat-card--${spec.variant}`);
    }
    
    this.label = spec.label || "Stat";
    this.value = spec.value;
    this.detail = spec.detail || null;
    this.icon = spec.icon || null;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    // Icon (optional)
    if (this.icon) {
      const iconEl = new jsgui.Control({ context: this.context, tagName: "span" });
      iconEl.add_class("stat-card__icon");
      iconEl.add(new StringControl({ context: this.context, text: this.icon }));
      this.add(iconEl);
    }
    
    // Label
    const labelEl = new jsgui.Control({ context: this.context, tagName: "div" });
    labelEl.add_class("stat-card__label");
    labelEl.add(new StringControl({ context: this.context, text: this.label }));
    this.add(labelEl);
    
    // Value
    const valueEl = new jsgui.Control({ context: this.context, tagName: "div" });
    valueEl.add_class("stat-card__value");
    valueEl.add(new StringControl({ context: this.context, text: String(this.value ?? "—") }));
    this.add(valueEl);
    
    // Detail (optional)
    if (this.detail) {
      const detailEl = new jsgui.Control({ context: this.context, tagName: "div" });
      detailEl.add_class("stat-card__detail");
      detailEl.add(new StringControl({ context: this.context, text: this.detail }));
      this.add(detailEl);
    }
  }
}
```

### 5. Table Components

```javascript
class SimpleTableControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "table", __type_name: "simple_table" });
    
    this.add_class("ui-table");
    
    this.columns = spec.columns || [];  // [{ key, label, width? }, ...]
    this.rows = spec.rows || [];        // [{ key1: val1, key2: val2 }, ...]
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    // Header
    const thead = new jsgui.Control({ context: this.context, tagName: "thead" });
    const headerRow = new jsgui.Control({ context: this.context, tagName: "tr" });
    
    for (const col of this.columns) {
      const th = new jsgui.Control({ context: this.context, tagName: "th" });
      if (col.width) {
        th.dom.attributes.style = `width: ${col.width}`;
      }
      th.add(new StringControl({ context: this.context, text: col.label }));
      headerRow.add(th);
    }
    
    thead.add(headerRow);
    this.add(thead);
    
    // Body
    const tbody = new jsgui.Control({ context: this.context, tagName: "tbody" });
    
    for (const row of this.rows) {
      const tr = new jsgui.Control({ context: this.context, tagName: "tr" });
      
      for (const col of this.columns) {
        const td = new jsgui.Control({ context: this.context, tagName: "td" });
        const value = row[col.key];
        td.add(new StringControl({ 
          context: this.context, 
          text: value != null ? String(value) : "" 
        }));
        tr.add(td);
      }
      
      tbody.add(tr);
    }
    
    this.add(tbody);
  }
}
```

### 6. Pagination

```javascript
class PaginationControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "pagination" });
    
    this.add_class("pagination");
    
    this.currentPage = spec.currentPage || 1;
    this.totalPages = spec.totalPages || 1;
    this.basePath = spec.basePath || "";
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    // Previous button
    if (this.currentPage > 1) {
      const prev = new jsgui.Control({ context: this.context, tagName: "a" });
      prev.dom.attributes.href = `${this.basePath}?page=${this.currentPage - 1}`;
      prev.add_class("pagination__btn");
      prev.add(new StringControl({ context: this.context, text: "← Previous" }));
      this.add(prev);
    }
    
    // Page info
    const info = new jsgui.Control({ context: this.context, tagName: "span" });
    info.add_class("pagination__info");
    info.add(new StringControl({ 
      context: this.context, 
      text: `Page ${this.currentPage} of ${this.totalPages}` 
    }));
    this.add(info);
    
    // Next button
    if (this.currentPage < this.totalPages) {
      const next = new jsgui.Control({ context: this.context, tagName: "a" });
      next.dom.attributes.href = `${this.basePath}?page=${this.currentPage + 1}`;
      next.add_class("pagination__btn");
      next.add(new StringControl({ context: this.context, text: "Next →" }));
      this.add(next);
    }
  }
}
```

---

## Extending jsgui3 (Plugins, Mixins, Extensions)

When jsgui3 doesn't provide functionality you need, you have options. The key principle: **write extensions that could be merged back into jsgui3** without major refactoring.

### Philosophy: jsgui3 Abstracts the DOM

jsgui3's job is to abstract over the DOM. If you find yourself writing direct DOM manipulation code repeatedly, that's a signal that:

1. **jsgui3 should handle it** - Consider writing an extension
2. **It's a jsgui3 bug** - Report it and document a temporary workaround
3. **It's genuinely client-specific** - Put it in `activate()` with clear comments

### Extension Location

Place extensions in a dedicated directory that mirrors jsgui3's structure:

```
src/ui/
├── jsgui-extensions/           # Extensions designed for upstream contribution
│   ├── controls/               # New control types
│   │   └── ContextMenuControl.js
│   ├── mixins/                 # Behavior mixins (drag, resize, etc.)
│   │   └── DraggableMixin.js
│   ├── plugins/                # Context-level plugins
│   │   └── TooltipPlugin.js
│   └── index.js                # Exports all extensions
```

### Pattern 1: Control Extensions

Extend `jsgui.Control` for new component types:

```javascript
// src/ui/jsgui-extensions/controls/ContextMenuControl.js
"use strict";

/**
 * ContextMenuControl - Reusable context menu component
 * 
 * Designed for upstream contribution to jsgui3.
 * 
 * @example
 * const menu = new ContextMenuControl({
 *   context,
 *   items: [
 *     { label: "Edit", icon: "✏️", value: "edit" },
 *     { label: "Delete", icon: "🗑️", value: "delete" }
 *   ],
 *   onSelect: (value) => handleAction(value)
 * });
 */
class ContextMenuControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "context_menu"
    });
    
    this.add_class("jsgui-context-menu");
    
    this._items = spec.items || [];
    this._onSelect = spec.onSelect || null;
    this._visible = false;
    this._position = { x: 0, y: 0 };
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    for (const item of this._items) {
      const menuItem = new ContextMenuItemControl({
        context: this.context,
        ...item,
        onSelect: (value) => this._handleSelect(value)
      });
      this.add(menuItem);
    }
  }
  
  // Public API - these methods should work pre and post render
  show(x, y) {
    this._visible = true;
    this._position = { x, y };
    this.remove_class("jsgui-context-menu--hidden");
    // Position is applied in activate() or via CSS custom properties
    this._applyPosition();
  }
  
  hide() {
    this._visible = false;
    this.add_class("jsgui-context-menu--hidden");
  }
  
  _applyPosition() {
    // Use CSS custom properties for positioning (works with jsgui3 abstraction)
    this.dom.attributes.style = `--menu-x: ${this._position.x}px; --menu-y: ${this._position.y}px;`;
  }
  
  _handleSelect(value) {
    this.hide();
    if (this._onSelect) {
      this._onSelect(value);
    }
  }
  
  activate() {
    if (this.__activated) return;
    this.__activated = true;
    
    // Client-side: bind keyboard navigation, click-outside-to-close
    this._bindKeyboardNav();
    this._bindClickOutside();
  }
  
  _bindKeyboardNav() {
    // Keyboard handling is inherently client-side
    if (!this.dom.el) return;
    this.dom.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
      // ... arrow key navigation
    });
  }
  
  _bindClickOutside() {
    // Click-outside is inherently client-side
    document.addEventListener("click", (e) => {
      if (this._visible && this.dom.el && !this.dom.el.contains(e.target)) {
        this.hide();
      }
    });
  }
}

module.exports = { ContextMenuControl };
```

### Pattern 2: Behavior Mixins

For behaviors that can apply to multiple controls (drag, resize, sortable):

```javascript
// src/ui/jsgui-extensions/mixins/DraggableMixin.js
"use strict";

/**
 * DraggableMixin - Adds drag behavior to any control
 * 
 * Designed for upstream contribution to jsgui3.
 * Apply via: Object.assign(MyControl.prototype, DraggableMixin);
 * 
 * Requirements:
 * - Control must have this.dom.el after activation
 * - Control should have a drag handle element (or uses whole control)
 */
const DraggableMixin = {
  /**
   * Initialize draggable behavior
   * Call this in your control's activate() method
   * 
   * @param {Object} options
   * @param {string} [options.handleSelector] - CSS selector for drag handle
   * @param {Function} [options.onDragStart] - Called when drag starts
   * @param {Function} [options.onDragEnd] - Called when drag ends
   */
  initDraggable(options = {}) {
    if (!this.dom.el) return;
    
    this._dragOptions = options;
    this._isDragging = false;
    this._dragStart = { x: 0, y: 0 };
    this._posStart = { x: 0, y: 0 };
    
    const handle = options.handleSelector 
      ? this.dom.el.querySelector(options.handleSelector)
      : this.dom.el;
    
    if (handle) {
      handle.addEventListener("mousedown", (e) => this._onDragMouseDown(e));
    }
    
    // These must be on document to track mouse outside element
    document.addEventListener("mousemove", (e) => this._onDragMouseMove(e));
    document.addEventListener("mouseup", (e) => this._onDragMouseUp(e));
  },
  
  _onDragMouseDown(e) {
    if (e.button !== 0) return; // Left click only
    
    this._isDragging = true;
    this._dragStart = { x: e.clientX, y: e.clientY };
    
    // Get current position from control state (not DOM)
    this._posStart = { 
      x: this._position?.x || 0, 
      y: this._position?.y || 0 
    };
    
    this.add_class("jsgui-dragging");
    
    if (this._dragOptions.onDragStart) {
      this._dragOptions.onDragStart();
    }
    
    e.preventDefault();
  },
  
  _onDragMouseMove(e) {
    if (!this._isDragging) return;
    
    const dx = e.clientX - this._dragStart.x;
    const dy = e.clientY - this._dragStart.y;
    
    // Update control state
    this._position = {
      x: Math.max(0, this._posStart.x + dx),
      y: Math.max(0, this._posStart.y + dy)
    };
    
    // Apply via style attribute (jsgui3 compatible)
    this._applyDragPosition();
  },
  
  _onDragMouseUp(e) {
    if (!this._isDragging) return;
    
    this._isDragging = false;
    this.remove_class("jsgui-dragging");
    
    if (this._dragOptions.onDragEnd) {
      this._dragOptions.onDragEnd(this._position);
    }
  },
  
  _applyDragPosition() {
    // Use style attribute which jsgui3 handles
    this.dom.attributes.style = `left: ${this._position.x}px; top: ${this._position.y}px;`;
    // Sync to DOM if rendered
    if (this.dom.el) {
      this.dom.el.style.left = `${this._position.x}px`;
      this.dom.el.style.top = `${this._position.y}px`;
    }
  }
};

module.exports = { DraggableMixin };
```

### Pattern 3: Context Plugins

For features that need access to all controls (tooltips, focus management):

```javascript
// src/ui/jsgui-extensions/plugins/TooltipPlugin.js
"use strict";

/**
 * TooltipPlugin - Automatic tooltip management for jsgui3 contexts
 * 
 * Designed for upstream contribution to jsgui3.
 * 
 * @example
 * const context = new jsgui.Page_Context();
 * TooltipPlugin.install(context);
 * 
 * // Then in any control:
 * myControl.dom.attributes["data-tooltip"] = "Helpful text";
 */
const TooltipPlugin = {
  install(context) {
    // Store plugin state on context
    context._tooltipPlugin = {
      activeTooltip: null,
      tooltipEl: null
    };
    
    // Hook into context's activation lifecycle
    const originalActivate = context.activate?.bind(context) || (() => {});
    context.activate = function() {
      originalActivate();
      TooltipPlugin._initTooltips(context);
    };
  },
  
  _initTooltips(context) {
    // Create tooltip element once
    if (!context._tooltipPlugin.tooltipEl) {
      const tooltip = document.createElement("div");
      tooltip.className = "jsgui-tooltip jsgui-tooltip--hidden";
      document.body.appendChild(tooltip);
      context._tooltipPlugin.tooltipEl = tooltip;
    }
    
    // Use event delegation on document
    document.addEventListener("mouseenter", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        TooltipPlugin._showTooltip(context, target);
      }
    }, true);
    
    document.addEventListener("mouseleave", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        TooltipPlugin._hideTooltip(context);
      }
    }, true);
  },
  
  _showTooltip(context, target) {
    const text = target.getAttribute("data-tooltip");
    const tooltip = context._tooltipPlugin.tooltipEl;
    
    tooltip.textContent = text;
    tooltip.classList.remove("jsgui-tooltip--hidden");
    
    // Position near target
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.bottom + 8}px`;
  },
  
  _hideTooltip(context) {
    const tooltip = context._tooltipPlugin.tooltipEl;
    tooltip.classList.add("jsgui-tooltip--hidden");
  }
};

module.exports = { TooltipPlugin };
```

### Guidelines for Upstream-Ready Extensions

1. **Use jsgui3 APIs wherever possible**
   - `add_class()` / `remove_class()` instead of `classList`
   - `this.dom.attributes` instead of `setAttribute()`
   - `this.add()` for child controls

2. **Keep DOM access in `activate()`**
   - Event listeners: always in `activate()`
   - Document-level listeners: in `activate()`
   - Element measurements: only when needed, in methods called post-activation

3. **Document the contract**
   - JSDoc with `@example`
   - Note any requirements (must call `initX()` in `activate()`)
   - Explain what's client-only vs isomorphic

4. **Use consistent naming**
   - Classes: `jsgui-*` prefix for CSS
   - Types: `__type_name` follows existing patterns
   - Methods: match jsgui3 conventions (`add_class`, not `addClass`)

5. **Test isomorphically**
   - Check script should work (server-side render)
   - Manual test should work (client-side activation)
   - Document any client-only features

6. **Keep dependencies minimal**
   - No external libraries in extensions
   - If you need a utility, write it or reference jsgui3's internals

### Filing Upstream

When an extension is stable and useful:

1. Open issue in jsgui3 repo describing the use case
2. Reference this repo's implementation
3. Propose API changes if the extension reveals jsgui3 gaps
4. Be prepared to adapt to jsgui3's code style

---

## Dashboard Server Performance Patterns

Dashboards often need to query databases or aggregate data. Poor patterns here cause "waiting for ages" load times.

### ✅ 1. Cache Expensive Queries

**Problem**: Listing databases requires scanning directories and opening each DB to check tables - slow for many DBs.

**Solution**: Cache the result with a TTL (Time To Live).

```javascript
// Server-side caching pattern
let databaseListCache = { data: null, timestamp: 0 };
const DATABASE_CACHE_TTL_MS = 30000;  // 30 seconds

async function listDatabases() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (databaseListCache.data && (now - databaseListCache.timestamp) < DATABASE_CACHE_TTL_MS) {
    return databaseListCache.data;
  }
  
  // Expensive operation: scan directory, check each DB
  const dataDir = path.resolve(__dirname, "../../../data");
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".db"));
  
  const databases = [];
  for (const file of files) {
    const info = await getBasicDbInfo(path.join(dataDir, file));
    databases.push(info);
  }
  
  // Update cache
  databaseListCache = { data: databases, timestamp: now };
  return databases;
}
```

**API Enhancement**: Add `?refresh=true` to force cache refresh:

```javascript
app.get("/api/databases", async (req, res) => {
  if (req.query.refresh === "true") {
    databaseListCache = { data: null, timestamp: 0 };  // Invalidate
  }
  const databases = await listDatabases();
  res.json(databases);
});
```

### ✅ 2. Optimize Database Info Queries

**Problem**: Counting all rows in large tables (millions of rows) is slow.

**Solution**: Use existence checks (`LIMIT 1`) and approximate counts for large DBs.

```javascript
async function getBasicDbInfo(dbPath) {
  const stats = fs.statSync(dbPath);
  const sizeBytes = stats.size;
  
  // For large DBs (>100MB), use approximate count
  const isLarge = sizeBytes > 100 * 1024 * 1024;
  
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  
  try {
    // Quick existence check - faster than COUNT(*)
    const hasGazetteerTables = await new Promise((resolve) => {
      db.get(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='places' LIMIT 1",
        (err, row) => resolve(!err && !!row)
      );
    });
    
    let placeCount = 0;
    if (hasGazetteerTables) {
      if (isLarge) {
        // Approximate count for large DBs - instant
        const approx = await dbGet(db, 
          "SELECT MAX(rowid) as approx FROM places");
        placeCount = approx?.approx || 0;
      } else {
        // Exact count for small DBs
        const exact = await dbGet(db, "SELECT COUNT(*) as cnt FROM places");
        placeCount = exact?.cnt || 0;
      }
    }
    
    return {
      name: path.basename(dbPath),
      path: dbPath,
      sizeBytes,
      hasGazetteerTables,
      placeCount,
      isApproximate: isLarge
    };
  } finally {
    db.close();
  }
}
```

### ✅ 3. Timeout Guards for DB Operations

**Problem**: Corrupt or locked DBs can hang queries indefinitely.

**Solution**: Wrap in Promise.race with timeout.

```javascript
async function safeDbQuery(db, sql, timeout = 5000) {
  return Promise.race([
    new Promise((resolve, reject) => {
      db.get(sql, (err, row) => err ? reject(err) : resolve(row));
    }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Query timeout")), timeout)
    )
  ]);
}

// Usage
try {
  const result = await safeDbQuery(db, "SELECT COUNT(*) FROM large_table", 3000);
} catch (err) {
  if (err.message === "Query timeout") {
    return { count: "unknown", timedOut: true };
  }
  throw err;
}
```

### ✅ 4. Invalidate Cache on Mutations

When creating/deleting databases, invalidate the cache:

```javascript
app.post("/api/databases", async (req, res) => {
  // ... create database logic ...
  
  // Invalidate cache so next list reflects new DB
  databaseListCache = { data: null, timestamp: 0 };
  
  res.json({ success: true, database: newDb });
});
```

### ✅ 5. Show All Items, Style Differently

**Problem**: Users may want to add features to items that don't have them yet (e.g., add gazetteer tables to a non-gazetteer database).

**Solution**: Show all items, but style non-applicable ones differently.

```javascript
// In DatabaseItem control
compose() {
  const hasGazetteer = this.database.hasGazetteerTables;
  
  if (!hasGazetteer) {
    this.add_class("non-gazetteer");  // Grayed out
    
    // Add badge
    const badge = new jsgui.Control({ context: this.context, tagName: "span" });
    badge.add_class("init-gazetteer-badge");
    badge.add("📦 No Gazetteer");
    this.add(badge);
    
    // Add action button
    const initBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    initBtn.add_class("init-gazetteer-btn");
    initBtn.add("Init Gazetteer");
    this.add(initBtn);
  }
}
```

**CSS**:
```css
.non-gazetteer {
  opacity: 0.7;
  filter: grayscale(30%);
}

.init-gazetteer-badge {
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.init-gazetteer-btn {
  background: var(--theme-surface, #2d2d2d);
  color: var(--theme-text-secondary, #888);
  border: 1px solid var(--theme-border, #3d3d3d);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
}
```

---

## Control Count Performance (CRITICAL)

**The #1 cause of slow jsgui3 renders is too many controls.** This section documents a validated pattern that achieved **55% faster load times** in the docs viewer.

### Understanding the Problem

Each jsgui3 Control creates:
- A JavaScript object with prototype chain
- A `dom` descriptor object with attributes
- Internal state (`__ctrl_chain`, `_id`, registration in context)
- String concatenation during `all_html_render()`

**The compounding math:**
```
Items × Controls/Item = Total Controls = Render Time

Example (Docs Viewer):
850 files × ~10 controls each = 8,500 controls
  → 883ms control tree build time (70% of total!)
  → 1,489KB HTML output
  → Slow initial paint
```

### The Decision Matrix

| Dataset Size | Recommended Pattern | Expected Improvement |
|--------------|---------------------|---------------------|
| <50 items | Render all | None needed |
| 50-200 items | Conditional complexity | 20-40% faster |
| 200-1000 items | **Lazy rendering** | 50-80% faster |
| 1000+ items | Virtual scrolling | 90%+ faster |

### Pattern: Lazy Rendering

**Only instantiate controls for visible/expanded content.**

**Server-side (during compose):**

```javascript
class FolderListControl extends jsgui.Control {
  compose() {
    const { folders, selectedPath } = this;
    
    folders.forEach(folder => {
      // Determine if this folder's children should be rendered
      const containsSelected = selectedPath?.startsWith(folder.path);
      
      if (containsSelected) {
        // Full render - user needs to see this content
        const folderCtrl = new FolderControl({
          context: this.context,
          folder,
          renderChildren: true  // Children will be visible
        });
        this.add(folderCtrl);
      } else {
        // Lazy placeholder - will load on demand
        const folderCtrl = new FolderControl({
          context: this.context,
          folder,
          renderChildren: false  // Just show folder name + count badge
        });
        folderCtrl.dom.attributes['data-lazy-children'] = 'true';
        this.add(folderCtrl);
      }
    });
  }
}
```

**Server-side API endpoint for lazy loading:**

```javascript
// Add endpoint that returns rendered HTML for a folder's children
app.get('/api/folder', (req, res) => {
  const { path: folderPath } = req.query;
  const context = jsgui.Page_Context({ document: null });
  
  // Find the folder node
  const folderNode = docTree.findNodeByPath(folderPath);
  if (!folderNode) {
    return res.status(404).send('Folder not found');
  }
  
  // Render just the children
  const container = new jsgui.Control({ context, tagName: 'div' });
  folderNode.children.forEach(child => {
    container.add(new DocNavItemControl({ context, node: child }));
  });
  
  res.send(container.all_html_render());
});
```

**Client-side lazy loading:**

```javascript
// Listen for folder expansion
document.addEventListener('toggle', async (event) => {
  const details = event.target;
  if (!details.open) return;  // Only on open
  
  const lazyContainer = details.querySelector('[data-lazy-children="true"]');
  if (!lazyContainer) return;
  
  // Show loading state
  lazyContainer.innerHTML = '<div class="loading">Loading...</div>';
  
  // Fetch the rendered children
  const folderPath = details.dataset.folderPath;
  const response = await fetch(`/api/folder?path=${encodeURIComponent(folderPath)}`);
  const html = await response.text();
  
  // Replace placeholder with real content
  lazyContainer.outerHTML = html;
  lazyContainer.removeAttribute('data-lazy-children');
}, true);
```

### Validation Results

Tested on docs viewer with 850 markdown files:

| Metric | Before (Eager) | After (Lazy) | Improvement |
|--------|----------------|--------------|-------------|
| Total render | 1256ms | 565ms | **55% faster** |
| Control tree | 883ms | 286ms | **68% faster** |
| HTML size | 1489KB | 382KB | **74% smaller** |
| Controls created | ~8500 | ~100 | **99% fewer** |

### Diagnostic Script Template

**Always measure before optimizing.** Use this template:

```javascript
// tmp/perf-diagnostic.js
const { performance } = require('perf_hooks');

async function diagnose() {
  const start = performance.now();
  
  // 1. Measure control tree building
  const treeStart = performance.now();
  const page = buildYourPage(testData);
  const treeBuild = performance.now() - treeStart;
  
  // 2. Measure HTML rendering
  const renderStart = performance.now();
  const html = page.all_html_render();
  const renderTime = performance.now() - renderStart;
  
  // 3. Count controls
  const controlCount = countControls(page);
  
  console.log('=== PERFORMANCE DIAGNOSTIC ===');
  console.log(`Control tree build: ${treeBuild.toFixed(0)}ms`);
  console.log(`HTML render: ${renderTime.toFixed(0)}ms`);
  console.log(`Total: ${(performance.now() - start).toFixed(0)}ms`);
  console.log(`HTML size: ${(html.length / 1024).toFixed(0)}KB`);
  console.log(`Control count: ${controlCount}`);
  console.log('==============================');
}

function countControls(ctrl, count = { total: 0 }) {
  count.total++;
  (ctrl.__ctrl_chain || []).forEach(child => {
    if (child.constructor?.name !== 'String_Control') {
      countControls(child, count);
    }
  });
  return count.total;
}

diagnose().catch(console.error);
```

### Key Insights

1. **Bottleneck is often NOT where you expect.** Measure first. I expected file I/O to be slow - it was control tree building (70% of total).

2. **Control count is non-linear.** 10× more controls ≠ 10× slower. The overhead compounds as the tree deepens.

3. **Lazy loading adds complexity.** Only use for >200 items. The API endpoint + client code adds maintenance burden.

4. **User experience matters.** Show loading states. Don't leave blank spaces while fetching.

---

## Anti-Patterns to Avoid

### ❌ 1. Inline Compositions in App Controls

**Bad**: Building complex structures inline in `_build*` methods.

```javascript
// ❌ Avoid: 50+ line inline composition
_buildToolbar() {
  const toolbar = new jsgui.Control({ context: this.context, tagName: "div" });
  toolbar.add_class("toolbar");
  
  const statusCard = new jsgui.Control({ context: this.context, tagName: "div" });
  statusCard.add_class("toolbar__status");
  // ... 40 more lines of inline building
  
  return toolbar;
}
```

**Good**: Extract to a dedicated control.

```javascript
// ✅ Better: Use a dedicated control
_buildToolbar() {
  return new ToolbarControl({
    context: this.context,
    status: this.status,
    timestamp: this.timestamp
  });
}
```

### ❌ 2. Calling compose() in Base Class Constructor

**Bad**: Base class calls `compose()`, breaking child property initialization.

```javascript
// ❌ Avoid
class BaseControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this.compose();  // Child properties not set yet!
  }
}
```

**Good**: Let child classes call `compose()` after setting their properties.

```javascript
// ✅ Better
class BaseControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    // Don't compose here
  }
}

class ChildControl extends BaseControl {
  constructor(spec) {
    super(spec);
    this.myProp = spec.myProp;  // Set first
    if (!spec.el) this.compose();  // Then compose
  }
}
```

### ✅ 3. Raw Strings Work Fine

jsgui3 automatically handles raw strings - you don't need to wrap them:

```javascript
// ✅ This works - jsgui3 auto-wraps strings
element.add("Hello World");  // Renders correctly!

// ✅ Also fine - explicit StringControl
element.add(new StringControl({ context: this.context, text: "Hello World" }));
```

**Note**: Some older code in this repo uses explicit `String_Control` everywhere. That's fine but not required.

### ❌ 4. Forgetting to Pass Context

**Bad**: Creating child controls without context.

```javascript
// ❌ Avoid
const child = new MyChildControl({ data: this.data });  // Missing context!
```

**Good**: Always pass `this.context` to child controls.

```javascript
// ✅ Better
const child = new MyChildControl({ context: this.context, data: this.data });
```

### ❌ 5. God Controls

**Bad**: One massive control that handles everything.

```javascript
// ❌ Avoid: 500+ line control with 15 different view types
class EverythingControl extends jsgui.Control {
  compose() {
    // Hundreds of lines mixing unrelated concerns
  }
}
```

**Good**: Small, focused controls composed together.

```javascript
// ✅ Better: Focused controls
// - HeaderControl (~50 lines)
// - SearchFormControl (~40 lines)
// - ResultsListControl (~60 lines)
// - PaginationControl (~40 lines)
// - AppControl composes them all (~80 lines)
```

### ❌ 6. Missing Check Scripts

**Bad**: No verification for new controls.

**Good**: Every control has a check script that verifies rendering.

### ❌ 7. Interactive Components as Plain JS/CSS (Context Menu Case Study)

> **See also**: [docs/agi/skills/jsgui3-context-menu-patterns/SKILL.md](../../agi/skills/jsgui3-context-menu-patterns/SKILL.md) for the complete, validated pattern.

**Bad**: Building interactive components (context menus, tooltips, modals) as plain JavaScript functions with CSS.

```javascript
// ❌ Avoid: Context menu as plain JS
function showColumnContextMenu(x, y) {
  const menu = document.querySelector("[data-context-menu='columns']");
  menu.style.display = "block";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  
  // 40 more lines of positioning, event handling, keyboard nav...
  document.addEventListener("click", closeOnClickOutside);
  document.addEventListener("keydown", closeOnEscape);
}

function hideColumnContextMenu() {
  const menu = document.querySelector("[data-context-menu='columns']");
  menu.style.display = "none";
}
```

**Why this is wrong**:
- Not testable with check scripts
- Event handlers scattered across global scope
- Can't reuse for other context menus (row actions, toolbar options)
- No clear ownership of state (open/closed)
- `js-scan` can't track dependencies

**Good**: Extract to a dedicated `ContextMenuControl`.

```javascript
// ✅ Better: Dedicated control class
// src/ui/controls/ContextMenuControl.js

class ContextMenuControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "context_menu" });
    this.add_class("context-menu");
    this.items = spec.items || [];
    this.onSelect = spec.onSelect || (() => {});
    if (!spec.el) this.compose();
  }
  
  compose() {
    for (const item of this.items) {
      const menuItem = new ContextMenuItemControl({
        context: this.context,
        label: item.label,
        icon: item.icon,      // 🔍 for search, ⚙️ for settings, etc.
        checked: item.checked,
        value: item.value
      });
      this.add(menuItem);
    }
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    this._bindClickOutside();
    this._bindKeyboardNav();
    this._bindItemSelection();
  }
  
  show(x, y) {
    const el = this.dom?.el;
    if (!el) return;
    el.style.display = "block";
    this._positionAt(x, y);
  }
  
  hide() {
    const el = this.dom?.el;
    if (el) el.style.display = "none";
  }
}
```

**Benefits of extraction**:
- ✅ Testable: Check script verifies menu renders with correct items
- ✅ Reusable: Same control for column options, row actions, any dropdown
- ✅ Maintainable: Event handlers live with the component
- ✅ Discoverable: `js-scan --what-imports ContextMenuControl.js` shows all usages
- ✅ Type-safe: Props documented in JSDoc

### ❌ 8. Missing Visual Affordances (No Icons)

**Bad**: Interactive elements with text-only labels that users can't quickly scan.

```javascript
// ❌ Avoid: No visual cue for action type
const button = new jsgui.Control({ context: this.context, tagName: "button" });
button.add("Options");  // User must read to understand
```

**Good**: Use emoji icons for instant visual recognition.

```javascript
// ✅ Better: Emoji provides instant recognition
const button = new jsgui.Control({ context: this.context, tagName: "button" });
button.add("⚙️ Options");  // Gear = settings, instantly clear

// Or with dedicated icon element
const icon = new jsgui.Control({ context: this.context, tagName: "span" });
icon.add_class("btn__icon");
icon.add("🔍");
button.add(icon);
button.add(" Search");
```

**Standard emoji vocabulary for UI**:

| Action | Emoji | Notes |
|--------|-------|-------|
| Search | 🔍 | Magnifying glass - universal |
| Settings/Options | ⚙️ | Gear - configuration |
| Add/Create | ➕ | Plus sign |
| Delete | 🗑️ | Trash can |
| Edit | ✏️ | Pencil |
| Refresh | 🔄 | Circular arrows |
| Sort asc | ▲ | Triangle up |
| Sort desc | ▼ | Triangle down |
| Menu | ☰ | Hamburger |
| More options | ⋮ | Kebab (vertical dots) |
| Close | ✕ | X mark |
| Success | ✅ | Check mark |
| Error | ❌ | X in circle |
| Warning | ⚠️ | Triangle alert |
| Info | ℹ️ | Information |
| Folder | 📁 | Directory |
| File | 📄 | Document |

### ❌ 9. Shadowing Reserved Property Names (CRITICAL: `this.content`)

**⚠️ CRITICAL BUG**: Never use `this.content` as a property name in jsgui3 controls!

**Bad**: Using `content` as a property name shadows the base class Collection.

```javascript
// ❌ CRITICAL BUG - DO NOT DO THIS
class TwoColumnLayout extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this.sidebar = null;
    this.content = null;  // 💥 SHADOWS jsgui.Control.content (a Collection)!
    if (!spec.el) this.compose();
  }
  
  compose() {
    // This will CRASH because this.add() tries to use this.content
    // which is now null instead of the Collection!
    const container = new jsgui.Control({ ... });
    this.add(container);  // 💥 TypeError: Cannot read property 'push' of null
  }
}
```

**Why this breaks**: In jsgui3, `Control.content` is a **Collection** that holds child controls. When you call `this.add(child)`, it internally calls `this.content.push(child)`. If you shadow `this.content` with `null` or any non-Collection value, `this.add()` crashes.

**Good**: Use a different property name.

```javascript
// ✅ CORRECT - use a unique property name
class TwoColumnLayout extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this.sidebar = null;
    this.contentArea = null;  // ✅ Unique name, doesn't shadow base class
    if (!spec.el) this.compose();
  }
  
  compose() {
    const container = new jsgui.Control({ ... });
    this.add(container);  // ✅ Works - this.content is still the Collection
    
    this.contentArea = new jsgui.Control({ context: this.context, tagName: 'div' });
    this.contentArea.add_class('content-area');
    container.add(this.contentArea);
  }
  
  addContent(control) {
    if (this.contentArea) {
      this.contentArea.add(control);  // ✅ Uses our custom property
    }
  }
}
```

**Reserved property names to avoid**:
- `content` - The Collection holding child controls
- `context` - The jsgui context object
- `dom` - DOM element references
- `__type_name` - Internal type identifier

**How to spot this bug**: If you see errors like:
- `TypeError: Cannot read property 'push' of null`
- `TypeError: this.content.push is not a function`
- Controls don't render any children despite calling `this.add()`

Check if you've accidentally shadowed `this.content` in your constructor.

### ❌ 10. Direct DOM Manipulation Instead of jsgui3 Methods

**Bad**: Using `classList.add/remove` or `this.dom.el.style` directly when jsgui3 methods exist.

```javascript
// ❌ Avoid: Direct DOM manipulation
setVisible(visible) {
  if (this.dom.el) {
    if (visible) {
      this.dom.el.classList.remove("hidden");
    } else {
      this.dom.el.classList.add("hidden");
    }
  }
}
```

**Good**: Use jsgui3's `add_class` and `remove_class` methods - they work whether the control is in the DOM or not.

```javascript
// ✅ Correct: Use jsgui3 methods
setVisible(visible) {
  if (visible) {
    this.remove_class("hidden");
  } else {
    this.add_class("hidden");
  }
}
```

**Why jsgui3 methods are better**:
- **Work pre-render**: Classes are tracked internally and applied when HTML is generated
- **Work post-render**: If `this.dom.el` exists, jsgui3 syncs to the DOM automatically
- **Consistent API**: Same code works on server and client
- **Maintainable**: State stays in the control, not scattered in DOM

**When direct DOM manipulation IS appropriate**:
- **Client-side activation**: Setting up event listeners in `activate()`
- **Dynamic innerHTML updates**: When replacing content after initial render (see [Dynamic Control Updates](#dynamic-control-updates))
- **Scroll position**: `this.dom.el.scrollTop = this.dom.el.scrollHeight`
- **Focus management**: `this.dom.el.focus()`
- **Measurements**: Reading `offsetWidth`, `getBoundingClientRect()`, etc.

**If jsgui3 methods don't work as expected** (e.g., `add_class` doesn't update the DOM), **report it as a bug** in jsgui3. Don't work around it with direct DOM manipulation unless absolutely necessary, and document the workaround with a `// WORKAROUND: jsgui3 bug - <description>` comment.

### ❌ 11. Using style.display for Show/Hide (Causes Flashing)

**Bad**: Directly setting `style.display` causes instant layout changes and visual flashing.

```javascript
// ❌ Avoid: Direct style manipulation
_updateWarnings(warnings) {
  if (warnings.length > 0) {
    this._warningEl.dom.el.style.display = 'block';
    this._warningEl.dom.el.textContent = warnings[0];
  } else {
    this._warningEl.dom.el.style.display = 'none';  // FLASH!
  }
}
```

**Good**: Use CSS classes with transitions for smooth visibility changes.

```javascript
// ✅ Correct: CSS class transitions
_updateWarnings(warnings) {
  if (warnings.length > 0) {
    this._warningEl.dom.el.textContent = warnings[0];
    this._warningEl.remove_class('hidden');
  } else {
    this._warningEl.add_class('hidden');
  }
}

// In CSS:
// .warning { transition: opacity 0.2s, max-height 0.2s; }
// .warning.hidden { opacity: 0; max-height: 0; overflow: hidden; }
```

**Why this matters**: With SSE or frequent polling updates (5-20+ per second), rapid show/hide cycles create jittery "flashing" effects that are distracting and unprofessional.

### ❌ 12. Immediate DOM Updates on Every Event (No Debouncing)

**Bad**: Updating DOM on every incoming event causes jitter with frequent updates.

```javascript
// ❌ Avoid: Sync update on every SSE message
eventSource.onmessage = (event) => {
  const state = JSON.parse(event.data);
  this._barEl.style.width = state.percent + '%';  // 20x/second = jitter!
  this._textEl.textContent = state.message;
};
```

**Good**: Debounce updates using `requestAnimationFrame`.

```javascript
// ✅ Correct: RAF debouncing coalesces rapid updates
_scheduleUpdate() {
  if (this._pendingFrame) return;
  this._pendingFrame = requestAnimationFrame(() => {
    this._pendingFrame = null;
    this._syncView();
  });
}

eventSource.onmessage = (event) => {
  this._state = JSON.parse(event.data);
  this._scheduleUpdate();  // Max 1 update per frame
};
```

**Rule**: For any control receiving updates faster than 5/second, use RAF debouncing.

### ❌ 13. Scattered State Updates (No Single Source of Truth)

**Bad**: State scattered across multiple properties with separate update methods.

```javascript
// ❌ Avoid: Scattered state
setCurrent(value) { this.current = value; this._updateBar(); }
setTotal(value) { this.total = value; this._updateBar(); }
setPhase(phase) { this.phase = phase; this._updateStatus(); }
showWarning(msg) { this.warning = msg; this._updateWarning(); }
```

**Good**: Single state object with centralized sync.

```javascript
// ✅ Correct: State object pattern
this._state = { current: 0, total: 0, phase: 'idle', warnings: [] };

setState(partial) {
  this._state = { ...this._state, ...partial };
  this._syncView();  // Single update point
}

_syncView() {
  // All DOM updates happen here - easy to debug
}
```

**Benefits**: Predictable updates, easy debugging (log `_state`), natural batching.

### ❌ 14. Overriding Reserved Method Names (Causes Construction Crashes)

**Bad**: Defining `on()`, `off()`, or other reserved method names that jsgui3 uses internally.

```javascript
// ❌ CRASH: jsgui3's Control_Core calls this.on('change', ...) during super()
class ProgressConnector extends jsgui.Control {
  constructor(spec) {
    super(spec);  // 💥 CRASH HERE - jsgui3 calls this.on() before we initialize!
    this._listeners = { progress: [], error: [] };
  }
  
  on(event, cb) {
    this._listeners[event].push(cb);  // TypeError: Cannot read 'push' of undefined
  }
}
```

**Why it crashes**: jsgui3's `Control_Core` base class calls `this.on('change', ...)` during the `super()` call. If your class defines its own `on()` method, it gets called before your constructor body runs, so `this._listeners` doesn't exist yet.

**Good**: Use different names for custom event methods.

```javascript
// ✅ Correct: Use unique method names
class ProgressConnector extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._listeners = { progress: [], error: [] };
  }
  
  // Use addListener/removeListener instead of on/off
  addListener(event, cb) {
    if (this._listeners[event]) {
      this._listeners[event].push(cb);
    }
    return () => this.removeListener(event, cb);
  }
  
  removeListener(event, cb) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(c => c !== cb);
    }
  }
}
```

**Reserved method names to avoid overriding**:
- `on`, `off`, `emit`, `trigger` - internal event system
- `set`, `get` - property accessors
- `add`, `remove` - child control management
- `content` - Collection of children (see Anti-Pattern #9)

**Error messages that indicate this bug**:
- `TypeError: Cannot read properties of undefined (reading 'change')`
- `TypeError: Cannot read properties of undefined (reading 'push')`
- Stack trace pointing to `Control_Core` constructor

---

## Quick Reference

### Creating a New Control

```javascript
"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

class MyControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "my_control"
    });
    
    this.add_class("my-control");
    
    // 1. Store state from spec
    this.title = spec.title || "Default";
    
    // 2. Compose after state is set
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    // 3. Build child elements
    const heading = new jsgui.Control({ context: this.context, tagName: "h2" });
    heading.add(new StringControl({ context: this.context, text: this.title }));
    this.add(heading);
  }
}

module.exports = { MyControl };
```

### Rendering to HTML

```javascript
const jsgui = require("jsgui3-html");
const { MyControl } = require("./MyControl");

const context = new jsgui.Page_Context();
const control = new MyControl({ context, title: "Hello" });
const html = control.all_html_render();
// → '<div class="my-control"><h2>Hello</h2></div>'
```

### Common Element Patterns

```javascript
// Link
const link = new jsgui.Control({ context: this.context, tagName: "a" });
link.dom.attributes.href = "/path";
link.add(new StringControl({ context: this.context, text: "Click me" }));

// Button
const btn = new jsgui.Control({ context: this.context, tagName: "button" });
btn.dom.attributes.type = "submit";
btn.add_class("btn");
btn.add(new StringControl({ context: this.context, text: "Submit" }));

// Input
const input = new jsgui.Control({ context: this.context, tagName: "input" });
input.dom.attributes.type = "text";
input.dom.attributes.name = "query";
input.dom.attributes.placeholder = "Search...";
input.dom.attributes.value = this.value;

// Image
const img = new jsgui.Control({ context: this.context, tagName: "img" });
img.dom.attributes.src = "/image.png";
img.dom.attributes.alt = "Description";
```

### BEM Naming Convention

```javascript
// Block
control.add_class("toolbar");

// Element
control.add_class("toolbar__button");
control.add_class("toolbar__status");

// Modifier
control.add_class("toolbar--compact");
control.add_class("toolbar__button--active");
```

---

## Summary

1. **jsgui3-html is isomorphic** - same code works on server (SSR) and client (bundled)
2. **jsgui3-client extends jsgui3-html** - use it only for client-specific features like `activate()`
3. **Controls are classes** that extend `jsgui.Control` and build DOM programmatically
4. **Context flows down** - always pass `context` to child controls
5. **Text auto-wraps** - `.add("text")` works directly, `String_Control` is optional
6. **Compose timing matters** - set properties before calling `compose()`
7. **Activation via `spec.el`** - pass existing DOM element to skip `compose()` and bind events (aka "hydration" in other frameworks)
8. **Extract reusable pieces** - prefer small, focused controls over inline compositions
9. **Verify with check scripts** - every control should have a verification script
10. **Use BEM naming** - consistent CSS class naming improves maintainability

---

## Client-Side Activation Flow (CRITICAL)

> ⚠️ **This section documents hard-won knowledge from debugging jsgui3 activation issues. Future agents: READ THIS BEFORE working on client-side jsgui3 code.**

### The Problem

When rendering jsgui3 controls on the client side (e.g., in Electron or browser), calling `app.activate()` after `innerHTML = html` often **fails silently**. Event handlers don't bind, and `this.dom.el` is `null` in controls.

### Root Cause

jsgui3 requires a specific activation sequence:

1. Control instances must be **registered** in `context.map_controls`
2. Control instances must be **linked** to their DOM elements (`this.dom.el`)
3. Only then will `activate()` reliably bind events

Separately, some flows (notably `pre_activate()` reconstruction from server-rendered markup) require control **constructors** to be registered in `context.map_Controls`.

The `all_html_render()` method generates HTML with `data-jsgui-id` attributes, but it does NOT automatically link controls to DOM elements.

### Two Registries You Must Not Confuse

These two names look similar but serve different purposes:

| Name | What it stores | Key type | When it matters |
|------|----------------|----------|-----------------|
| `context.map_controls` | **Control instances** | `data-jsgui-id` (instance ids) | Your existing controls need `activate()` to work reliably |
| `context.map_Controls` | **Control constructors** | `__type_name` (type ids, typically lowercased) | `pre_activate()` / “reconstruct from DOM” flows need this |

Rule of thumb:
- If you *already* constructed the control instances yourself, you mostly care about `map_controls` + `map_els` (DOM linkage).
- If you see logs like `Missing context.map_Controls for type X` and interactivity is broken, you likely have a **constructor registration** problem (your client bundle isn’t registering custom control types).

### The Solution: Proper Activation Sequence

```javascript
// ❌ WRONG - This will NOT work properly
const html = app.all_html_render();
rootEl.innerHTML = html;
app.activate();  // DOM refs are null!

// ✅ CORRECT - Proper activation sequence
const html = app.all_html_render();
rootEl.innerHTML = html;

// Step 1: Register ALL controls in context.map_controls
app.register_this_and_subcontrols();

// Step 2: Find and link the root control's DOM element
const appEl = rootEl.querySelector('[data-jsgui-id="' + app._id() + '"]');
app.dom.el = appEl;

// Step 3: Recursively link ALL child controls to their DOM elements
app.rec_desc_ensure_ctrl_el_refs(appEl);

// Step 4: NOW activate (event binding will work)
app.activate();
```

### Key Methods Explained

| Method | What it does | Why it's needed |
|--------|-------------|------------------|
| `register_this_and_subcontrols()` | Adds control + children to `context.map_controls` | Required for `activate()` to find controls |
| `rec_desc_ensure_ctrl_el_refs(el)` | Recursively links `ctrl.dom.el` to DOM elements by `data-jsgui-id` | Without this, `this.dom.el` is null |
| `_id()` | Returns the control's jsgui id (e.g., `"zserver_app_0"`) | Used to find DOM element |

### Platform helper shortcuts (verified via lab experiment 002)

- Style proxy: `new Control({ size: [20, 30], background: { color: '#ff0000' } })` writes `style.width/height` as `20px/30px` and applies `background-color` to `dom.attrs.style` even before activation.
- Compositional model: `new Control({ comp: [TitleControl, ['subtitle', TextSpan, { text: 'world' }]], __type_name: 'comp_host' })` creates children immediately, renders their HTML, and exposes named references under `_ctrl_fields` (e.g., `_ctrl_fields.subtitle`).
- Registration helper: `register_this_and_subcontrols()` populates `context.map_controls` for the control and all descendants so activation lookups succeed without manual bookkeeping.
- Persisted fields: when constructed with an `el` carrying `data-jsgui-fields` JSON, `Control` hydrates `_persisted_fields` (e.g., `{ foo: 'bar', count: 3 }`) alongside `data-jsgui-id/type` so client-side controls can pick up server-written state.

### Dynamic Control Updates

When creating new controls after initial render (e.g., populating a list):

```javascript
setItems(items) {
  this._items = items;
  
  if (this.dom.el) {
    // Already rendered - must update DOM properly
    this.dom.el.innerHTML = '';
    
    items.forEach(item => {
      const ctrl = new ItemControl({ context: this.context, item });
      
      // Step 1: Register new control
      ctrl.register_this_and_subcontrols();
      
      // Step 2: Render and insert HTML
      const itemHtml = ctrl.all_html_render();
      this.dom.el.insertAdjacentHTML('beforeend', itemHtml);
      
      // Step 3: Find and link DOM element
      const itemEl = this.dom.el.querySelector('[data-jsgui-id="' + ctrl._id() + '"]');
      ctrl.dom.el = itemEl;
      this.context.map_els[ctrl._id()] = itemEl;
      
      // Step 4: Link children
      if (ctrl.rec_desc_ensure_ctrl_el_refs) {
        ctrl.rec_desc_ensure_ctrl_el_refs(itemEl);
      }
      
      // Step 5: Activate
      ctrl.activate();
    });
  }
}
```

### How jsgui3 Finds DOM Elements (Internal Detail)

Inside `activate()` and `pre_activate()`, jsgui3 tries to find DOM elements via:

```javascript
let found_el = this.context.get_ctrl_el(this) 
  || this.context.map_els[this._id()] 
  || document.querySelectorAll('[data-jsgui-id="' + this._id() + '"]')[0];
```

The DOM query fallback exists but is unreliable for nested controls. Always use `rec_desc_ensure_ctrl_el_refs()` for proper initialization.

### Complete Working Example (Electron App)

```javascript
// renderer.src.js - Electron renderer process entry
"use strict";

// Fix for jsgui3-client bug
if (typeof window !== 'undefined') {
    window.page_context = null;
}

const jsgui = require("jsgui3-client");
const { MyAppControl } = require("./controls");

document.addEventListener("DOMContentLoaded", async () => {
  const context = new jsgui.Client_Page_Context();
  
  const app = new MyAppControl({
    context,
    api: window.electronAPI
  });
  
  const rootEl = document.getElementById("app-root");
  const html = app.all_html_render();
  rootEl.innerHTML = html;
  
  // CRITICAL: Proper activation sequence
  app.register_this_and_subcontrols();
  console.log("Controls registered:", Object.keys(context.map_controls).length);
  
  const appEl = rootEl.querySelector('[data-jsgui-id="' + app._id() + '"]');
  if (appEl) {
    app.dom.el = appEl;
    app.rec_desc_ensure_ctrl_el_refs(appEl);
    console.log("DOM elements linked:", Object.keys(context.map_els).length);
  }
  
  app.activate();
  await app.init();
});
```

### Debugging Checklist

If controls aren't working after render:

- [ ] Did you call `register_this_and_subcontrols()` before `activate()`?
- [ ] Did you link the root element: `app.dom.el = appEl`?
- [ ] Did you call `rec_desc_ensure_ctrl_el_refs(appEl)`?
- [ ] Check `console.log(Object.keys(context.map_controls).length)` - should match control count
- [ ] Check `console.log(Object.keys(context.map_els).length)` - should be close to control count
- [ ] In your control's method, check `console.log("DOM el:", this.dom.el)` - should NOT be null

### Test / Automation Readiness Signals (Recommended)

When you need a deterministic “client bundle noticed + registered controls” signal (e.g., Puppeteer E2E tests), prefer a simple global exported by the client entry:

- `window.__COPILOT_REGISTERED_CONTROLS__` — array of registered type names (lowercased)
- `window.__COPILOT_EXPECTED_CONTROLS__` — optional expected type list used to warn about missing controls

These are safer than waiting on “a click handler works”, because activation may fail silently when DOM linkage or constructor registration is incomplete.

---

## Troubleshooting

### Known Issues

#### Controls don't respond to clicks / `this.dom.el` is null

**Symptom**: Controls render visually but event handlers don't fire. `this.dom.el` is `null` or `undefined` inside control methods.

**Cause**: Missing activation sequence steps. The `all_html_render()` method generates HTML but does NOT link Control instances to DOM elements.

**Solution**: Follow the complete activation sequence in the [Client-Side Activation Flow](#client-side-activation-flow-critical) section above.

```javascript
// ALWAYS do all 4 steps:
app.register_this_and_subcontrols();  // 1. Register
app.dom.el = rootEl.querySelector('[data-jsgui-id="' + app._id() + '"]');  // 2. Link root
app.rec_desc_ensure_ctrl_el_refs(app.dom.el);  // 3. Link children
app.activate();  // 4. Activate
```

#### jsgui3-client: `page_context` ReferenceError

**Symptom**: `ReferenceError: page_context is not defined` during client-side activation.
**Cause**: A bug in `jsgui3-client` (v0.0.121+) where `page_context` is assigned without declaration in the `activate` function.
**Workaround**: Define `page_context` globally before loading `jsgui3-client`.

```javascript
// In your client entry point (e.g., renderer.src.js)
if (typeof window !== 'undefined') {
    window.page_context = null; // Fix for jsgui3-client bug
}
const jsgui = require("jsgui3-client");
```

#### "Missing context.map_Controls for type X"

**Symptom**: Console logs `"Missing context.map_Controls for type my_control, using generic Control"`

**Cause**: jsgui3's internal activation tried to reconstruct controls from DOM but couldn't find the custom control constructor in `context.map_Controls`.

**When it's harmless**: If you are **not** relying on reconstruction (you already instantiated the controls, registered them via `register_this_and_subcontrols()`, and linked DOM via `rec_desc_ensure_ctrl_el_refs()`), this warning can be informational.

**When it's a real bug**: If your UI depends on `pre_activate()` reconstruction (common for server-rendered markup + client activation) and constructors aren't registered, custom controls may be instantiated as generic `Control`, and event wiring can break.

**Fix**: Ensure your client bundle imports/registers custom control classes and remembering that `map_Controls` is keyed by **lowercased** `__type_name`. See session writeups for the constructor-registration pipeline:
- `docs/sessions/2025-11-15-control-map-registration/CONTROL_MAP.md`
- `docs/sessions/2025-11-19-client-control-hydration/`
- `docs/sessions/2025-11-20-client-activation/`

---

## jsgui3-server Patterns & Experiments

**jsgui3-server** is a full-featured Node.js server framework that handles bundling, SSR, and serving jsgui3 applications. This section documents patterns, potential uses, and experimental ideas.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    jsgui3-server Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Server.serve(MyControl)     ◀── Simple API (recommended)           │
│           │                                                         │
│           ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              JSGUI_Single_Process_Server                     │   │
│  │  • HTTP/HTTPS server management                              │   │
│  │  • Router (path → handler mapping)                           │   │
│  │  • Resource Pool (manages all server resources)              │   │
│  │  • Website/Webpage composition                               │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                           │                                         │
│           ┌───────────────┼───────────────┐                         │
│           ▼               ▼               ▼                         │
│  ┌────────────────┐ ┌────────────┐ ┌────────────────┐               │
│  │Webpage Publisher│ │Function   │ │Static Responder│               │
│  │(bundles JS/CSS)│ │Publisher  │ │(serves assets) │               │
│  └────────────────┘ └────────────┘ └────────────────┘               │
│           │               │               │                         │
│           └───────────────┼───────────────┘                         │
│                           ▼                                         │
│                    ┌────────────┐                                   │
│                    │  esbuild   │ (fast bundling)                   │
│                    └────────────┘                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Quick Start APIs

#### 1. Simplest: Single Control

```javascript
const Server = require('jsgui3-server');
const { MyControl } = require('./client').controls;

// Serves at http://localhost:8080
Server.serve(MyControl);

// With port
Server.serve(MyControl, { port: 3000 });
```

#### 2. Single Page with Metadata

```javascript
Server.serve({
    page: {
        content: MyControl,
        title: 'My Application',
        description: 'A jsgui3 application'
    },
    port: 3000
});
```

#### 3. Multi-Page Application

```javascript
Server.serve({
    pages: {
        '/': { content: HomeControl, title: 'Home' },
        '/dashboard': { content: DashboardControl, title: 'Dashboard' },
        '/settings': { content: SettingsControl, title: 'Settings' }
    },
    port: 3000
});
```

#### 4. With API Endpoints

```javascript
Server.serve({
    page: { content: DashboardControl, title: 'Dashboard' },
    api: {
        // GET/POST /api/metrics → returns JSON
        'metrics': () => ({ users: 1234, revenue: 56789 }),
        
        // Async functions supported
        'data': async ({ range, filter }) => {
            return await db.query({ range, filter });
        },
        
        // String return → text/plain
        'health': () => 'OK',
        
        // Object/array return → application/json
        'config': () => ({ theme: 'dark', lang: 'en' })
    },
    port: 3000
});
```

#### 5. Lower-Level API (More Control)

```javascript
const Server = require('jsgui3-server');
const { Demo_UI } = require('./client').controls;

const server = new Server({
    Ctrl: Demo_UI,
    src_path_client_js: require.resolve('./client.js'),
    debug: true  // Don't minify, include source maps
});

server.on('ready', () => {
    // Add custom API endpoints
    server.publish('custom-api', async (input) => {
        return { processed: true, input };
    });
    
    server.start(8080, (err) => {
        if (err) throw err;
        console.log('Server started at http://localhost:8080');
    });
});
```

### Key Classes

| Class | Purpose | When to Use |
|-------|---------|-------------|
| `Server` | Main server, manages HTTP/routing | Always - entry point |
| `Webpage` | Single page composition | Single-page apps |
| `Website` | Multi-page site composition | Multi-page apps |
| `HTTP_Webpage_Publisher` | Bundles & serves a page | Internal - automatic |
| `HTTP_Function_Publisher` | Exposes functions as /api/* | Adding API endpoints |
| `Server_Page_Context` | Server-side rendering context | SSR |

### CSS Handling

CSS is automatically extracted from control classes via the static `.css` property:

```javascript
class MyControl extends Active_HTML_Document {
    constructor(spec) {
        super(spec);
        // ... control code
    }
}

// CSS is collected and bundled automatically
MyControl.css = `
    .my-control {
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        color: #eee;
    }
    
    .my-control__header {
        padding: 1rem;
        border-bottom: 1px solid #333;
    }
`;

// Served automatically at /css/css.css
```

### Bundler Configuration

```javascript
Server.serve({
    page: { content: MyControl },
    bundler: {
        minify: {
            level: 'normal'  // 'conservative' | 'normal' | 'aggressive'
        },
        compression: {
            enabled: true,
            algorithms: ['gzip', 'br'],  // gzip and/or brotli
            threshold: 1024  // Only compress if > 1KB
        }
    }
});
```

### Port Utilities

```javascript
const { get_free_port, is_port_available } = require('jsgui3-server');

// Auto-select a free port
Server.serve(MyControl, { port: 'auto' });

// Or manually check
const available = await is_port_available(3000);
if (!available) {
    const freePort = await get_free_port();
    console.log('Using port:', freePort);
}
```

---

### Experimental Ideas & Patterns to Explore

These are ideas for experiments using jsgui3-server to discover optimal patterns:

#### Experiment 1: Hot Reload Development Server

**Goal**: Create a development server with automatic reloading when source files change.

```javascript
// src/ui/lab/experiments/hot-reload-server/server.js
const Server = require('jsgui3-server');
const chokidar = require('chokidar');

let server = null;

async function startServer() {
    const { MyControl } = require('./client').controls;
    server = await Server.serve({
        page: { content: MyControl },
        port: 3000
    });
}

// Watch for changes
chokidar.watch('./client.js').on('change', async () => {
    console.log('Reloading...');
    if (server) await server.close();
    
    // Clear require cache
    delete require.cache[require.resolve('./client.js')];
    
    await startServer();
    console.log('Reloaded!');
});

startServer();
```

**Questions to answer**:
- How fast is the rebuild with esbuild?
- Can we preserve client state across reloads?
- What's the best pattern for cache invalidation?

#### Experiment 2: Hybrid SSR + API Server

**Goal**: Single server that handles both SSR pages and JSON APIs with shared data models.

```javascript
// Explore: Can we share Data_Object instances between SSR and API?
const Server = require('jsgui3-server');
const { Data_Object } = require('lang-tools');

// Shared state (careful with concurrency!)
const appState = new Data_Object({});
field(appState, 'users');
field(appState, 'lastUpdated');
appState.users = [];
appState.lastUpdated = null;

Server.serve({
    page: {
        content: DashboardControl,
        // Pass shared state to SSR
        props: { initialState: appState }
    },
    api: {
        'users': async () => {
            appState.users = await db.getUsers();
            appState.lastUpdated = new Date();
            return appState.users;
        },
        'state': () => ({
            users: appState.users,
            lastUpdated: appState.lastUpdated
        })
    }
});
```

**Questions to answer**:
- Can MVVM Data_Object work across SSR boundary?
- How to handle concurrent API requests with shared state?
- Best patterns for server-side state management?

#### Experiment 3: WebSocket Integration

**Goal**: Add real-time updates via WebSocket alongside HTTP.

```javascript
// jsgui3-server has notes about WebSocket support being planned
// Experiment: Can we add it externally?

const Server = require('jsgui3-server');
const WebSocket = require('ws');

const httpServer = await Server.serve({
    page: { content: RealtimeControl },
    port: 3000
});

// Attach WebSocket to same server
const wss = new WebSocket.Server({ server: httpServer.http_servers[0] });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        // Broadcast to all clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });
});
```

**Questions to answer**:
- Can we integrate with jsgui3's event system?
- How to update controls when WebSocket messages arrive?
- Pattern for bidirectional state sync?

#### Experiment 4: Micro-Frontend Architecture

**Goal**: Serve different jsgui3 apps from different routes with shared shell.

```javascript
Server.serve({
    pages: {
        '/': { content: ShellControl },
        '/app1/*': { content: App1Control, clientPath: './app1/client.js' },
        '/app2/*': { content: App2Control, clientPath: './app2/client.js' }
    },
    // Shared header/footer?
    layout: LayoutControl
});
```

**Questions to answer**:
- How to share components between micro-apps?
- Can we lazy-load app bundles?
- Pattern for cross-app communication?

#### Experiment 5: Server-Side Control Caching

**Goal**: Cache rendered control HTML to avoid re-rendering unchanged content.

```javascript
const controlCache = new Map();

class CachedControl extends jsgui.Control {
    all_html_render() {
        const cacheKey = this._getCacheKey();
        
        if (controlCache.has(cacheKey)) {
            return controlCache.get(cacheKey);
        }
        
        const html = super.all_html_render();
        controlCache.set(cacheKey, html);
        return html;
    }
    
    _getCacheKey() {
        // Hash of props that affect rendering
        return JSON.stringify(this._props);
    }
}
```

**Questions to answer**:
- What's the render time savings?
- How to invalidate cache correctly?
- Memory vs CPU tradeoff?

#### Experiment 6: Control-Level Code Splitting

**Goal**: Only bundle controls that are actually used on each page.

```javascript
// Explore: Can we analyze which controls each page uses
// and create optimized bundles?

Server.serve({
    pages: {
        '/': {
            content: HomeControl,
            // Only bundle controls imported by HomeControl
            optimize: 'tree-shake'
        },
        '/admin': {
            content: AdminControl,
            // Admin might need more controls
            optimize: 'tree-shake'
        }
    }
});
```

**Questions to answer**:
- Can esbuild tree-shake jsgui3 controls?
- What's the bundle size reduction?
- Any runtime issues with split bundles?

---

### Comparison: Current Approach vs jsgui3-server

This repo currently uses **custom Express servers** (e.g., `dataExplorerServer.js`). Here's how they compare:

| Aspect | Current (Express) | jsgui3-server |
|--------|-------------------|---------------|
| **Setup** | Manual routing, bundling | Automatic bundling |
| **Bundling** | Manual esbuild config | Built-in esbuild |
| **CSS** | Manual collection | Auto-extracted from controls |
| **API endpoints** | Express routes | `server.publish()` |
| **Multi-page** | Manual route setup | `pages: {}` config |
| **SSR** | Manual `all_html_render()` | Automatic |
| **Flexibility** | Very high | Moderate |
| **Boilerplate** | More | Less |

**When to use jsgui3-server**:
- New standalone apps with standard requirements
- Quick prototypes and experiments
- Apps that fit the single/multi-page model

**When to use custom Express**:
- Complex routing requirements
- Integration with existing Express middleware
- Non-standard bundling needs
- When you need full control

---

### Lab Experiment Structure

When conducting jsgui3-server experiments, use this structure:

```
src/ui/lab/experiments/
└── XXX-experiment-name/
    ├── README.md           # Hypothesis, findings, conclusions
    ├── server.js           # Server setup
    ├── client.js           # Client controls
    ├── controls/           # Custom controls for experiment
    │   └── MyControl.js
    ├── check.js            # Verification script
    └── results/            # Performance data, screenshots
        └── benchmark.json
```

**README.md template**:

```markdown
# Experiment: [Name]

## Hypothesis
What we're testing and what we expect to find.

## Setup
How to run the experiment.

## Findings
- Finding 1
- Finding 2

## Conclusion
Should this pattern be adopted? Why/why not?

## Upstream Potential
Could improvements be contributed to jsgui3-server?
```

---

### Next Steps for Exploration

1. **Run existing examples** in `node_modules/jsgui3-server/examples/controls/`
2. **Create a lab experiment** comparing custom Express vs Server.serve()
3. **Profile bundling performance** with large control trees
4. **Test API endpoint patterns** with real database queries
5. **Explore WebSocket integration** for real-time features

See also:
- `node_modules/jsgui3-server/docs/` - Comprehensive server docs
- `node_modules/jsgui3-server/AGENTS.md` - AI agent guide
- `docs/designs/NPM_LINK_DEVELOPMENT_NEXUS.md` - Linked module development
