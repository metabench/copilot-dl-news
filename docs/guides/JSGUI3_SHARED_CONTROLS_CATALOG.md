# jsgui3 Shared Controls Catalog

**Purpose**: Comprehensive reference for all shared jsgui3 controls in this repository  
**Target Audience**: AI agents and developers building UIs  
**Last Updated**: December 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Control Architecture Patterns](#control-architecture-patterns)
3. [Main App Controls](#main-app-controls)
4. [Data Display Controls](#data-display-controls)
5. [Input & Interaction Controls](#input--interaction-controls)
6. [Visual Feedback Controls](#visual-feedback-controls)
7. [Layout & Container Controls](#layout--container-controls)
8. [Creating New Controls](#creating-new-controls)
9. [Control Registration](#control-registration)
10. [Check Scripts](#check-scripts)
11. [Quick Reference](#quick-reference)

---

## Overview

This repository contains two main control families:

| Location | Purpose | Environment |
|----------|---------|-------------|
| `src/ui/controls/` | Data Explorer & Dashboard UI | Node SSR + Browser |
| `z-server/ui/controls/` | Electron app (z-server) | Electron main + renderer |

All controls follow the **isomorphic jsgui3 pattern**: they can render on the server and activate on the client.

### Key Principles

1. **Composition over inheritance**: Build complex UIs from simple control building blocks
2. **Factory pattern for DI**: Use `createXxxControl(jsgui, deps)` to enable dependency injection
3. **Type name registration**: Every control has a `__type_name` for client-side activation
4. **Check scripts**: Every control should have a `checks/XxxControl.check.js` verification script
5. **JSDoc documentation**: All public methods documented with parameters, returns, and examples

---

## Control Architecture Patterns

### Pattern 1: Direct Class Export

Used when the control doesn't need external dependencies:

```javascript
// src/ui/controls/Sparkline.js
class SparklineControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "svg" });
    // ... compose inline since no dynamic deps
  }
}
module.exports = SparklineControl;
```

**When to use**: Simple, self-contained controls with no external dependencies.

### Pattern 2: Factory Function for DI

Used when the control needs injected dependencies (for testability):

```javascript
// z-server/ui/controls/scanningIndicatorControl.js
function createScanningIndicatorControl(jsgui, { StringControl }) {
  class ScanningIndicatorControl extends jsgui.Control {
    // ... uses StringControl from deps
  }
  return ScanningIndicatorControl;
}
module.exports = { createScanningIndicatorControl };
```

**When to use**: Controls that need to be testable with mocked jsgui, or that need shared dependencies.

### Pattern 3: Registered Control Type

Used for controls that need client-side activation from SSR markup:

```javascript
// src/ui/controls/UrlFilterToggle.js
const CONTROL_TYPE = "url_filter_toggle";

class UrlFilterToggleControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: CONTROL_TYPE });
    // ...
  }
}

registerControlType(CONTROL_TYPE, UrlFilterToggleControl);
module.exports = { UrlFilterToggleControl };
```

**When to use**: Controls that render on the server and need activation on the client.

---

## Main App Controls

### DiagramAtlasControls

**Path**: `src/ui/controls/DiagramAtlasControls.js`  
**Purpose**: Interactive SVG diagram viewer with pan/zoom  
**Check**: `src/ui/server/checks/diagramAtlas.check.js`

```javascript
const { DiagramAtlasControls } = require("./DiagramAtlasControls");
const atlas = new DiagramAtlasControls({
  context,
  diagrams: [{ id: "arch", title: "Architecture", svgPath: "/diagrams/arch.svg" }]
});
```

**Key Features**:
- Tab-based diagram navigation
- Pan and zoom with mouse wheel
- Thumbnail navigation
- Factory function available: `diagramAtlasControlsFactory.js`

### GeoImportDashboard

**Path**: `src/ui/controls/GeoImportDashboard.js`  
**Purpose**: Geographic data import monitoring dashboard  
**Check**: `src/ui/server/checks/geoImportDashboard.check.js`

```javascript
const dashboard = new GeoImportDashboard({
  context,
  sources: ["geonames", "wikidata"],
  stats: { processed: 1000, pending: 500 }
});
```

### CrawlConfigWorkspaceControl

**Path**: `src/ui/controls/CrawlConfigWorkspaceControl.js`  
**Purpose**: Crawler configuration editing workspace  
**Check**: `src/ui/controls/checks/CrawlConfigWorkspaceControl.check.js`

---

## Data Display Controls

### MetricCardControl

**Path**: `src/ui/controls/MetricCardControl.js`  \
**Purpose**: Themeable “metric card” primitive for dashboards and home tiles  \
**Type**: `metric_card`

```javascript
const { MetricCardControl, CARD_VARIANTS } = require("./MetricCardControl");

const card = new MetricCardControl({
  context,
  title: "Domains",
  value: 123,
  subtitle: "Total",
  variant: CARD_VARIANTS.PRIMARY,
  href: "/domains"
});
```

**Variants**:
- `CARD_VARIANTS.DEFAULT | PRIMARY | SUCCESS | WARNING | DANGER`

**Notes**:
- Designed for SSR output with optional link title (`href`).
- Styling is driven by class names: `metric-card` + `metric-card--<variant>`.

### TableControl

**Path**: `src/ui/controls/Table.js`  
**Purpose**: Generic data table with headers, rows, links, and custom cell content

```javascript
const { TableControl, TableRowControl, TableCellControl } = require("./Table");

const table = new TableControl({
  context,
  columns: [
    { key: "url", label: "URL", align: "left" },
    { key: "status", label: "Status", align: "center" },
    { key: "fetched", label: "Fetched", align: "right" }
  ],
  rows: [
    { url: { text: "example.com", href: "/url/1" }, status: "200", fetched: "5" }
  ]
});
```

**Cell Value Types**:
- `string | number`: Plain text
- `{ text, href, title, target }`: Link cell
- `{ control: jsgui.Control }`: Custom control cell
- `{ html: "<span>..." }`: Raw HTML (use sparingly)
- `{ text, classNames, align }`: Styled text

### UrlListingTable

**Path**: `src/ui/controls/UrlListingTable.js`  
**Purpose**: Specialized table for URL listings with filtering  
**Check**: `src/ui/controls/checks/UrlListingTable.check.js`

### DomainSummaryTable

**Path**: `src/ui/controls/DomainSummaryTable.js`  
**Purpose**: Domain statistics table with sparklines  
**Check**: `src/ui/controls/checks/DomainSummaryTable.check.js`

### CrawlJobsTable

**Path**: `src/ui/controls/CrawlJobsTable.js`  
**Purpose**: Active/completed crawl jobs display  
**Check**: `src/ui/controls/checks/CrawlJobsTable.check.js`

### ErrorLogTable

**Path**: `src/ui/controls/ErrorLogTable.js`  
**Purpose**: Error log viewer with severity levels

---

## Input & Interaction Controls

### SearchFormControl

**Path**: `src/ui/controls/SearchFormControl.js`  \
**Purpose**: Shared, themeable search form for SSR pages  \
**Type**: `search_form`

```javascript
const { SearchFormControl } = require("./SearchFormControl");

const form = new SearchFormControl({
  context,
  action: "/urls",
  method: "get",
  home: { text: "Home", href: "/" },
  input: { name: "q", value: "example", placeholder: "Search..." },
  selects: [
    {
      name: "status",
      value: "200",
      options: [
        { value: "", label: "Any" },
        { value: "200", label: "200" },
        { value: "404", label: "404" }
      ]
    }
  ],
  button: { text: "\uD83D\uDD0D", ariaLabel: "Search" }
});
```

**Notes**:
- Uses class names (not inline styles): `search-form__input`, `search-form__select`, etc.
- Prefer `--search b16:/b64:` workflows when searching for the emoji button label in docs/tools.

### UrlFilterToggle

**Path**: `src/ui/controls/UrlFilterToggle.js`  
**Purpose**: Toggle switch for URL filtering (hasFetches, etc.)  
**Type**: `url_filter_toggle`

```javascript
const toggle = new UrlFilterToggleControl({
  context,
  apiPath: "/api/urls",
  basePath: "/urls",
  query: { host: "example.com" },
  label: "Show fetched URLs only",
  hasFetches: true
});
```

**Key Features**:
- Isomorphic: SSR renders HTML, client activates and binds events
- History state synchronization
- Store subscription pattern for coordinated state
- Data attributes for client-side configuration

### PagerButton

**Path**: `src/ui/controls/PagerButton.js`  
**Purpose**: Pagination buttons (first, prev, next, last)  
**Check**: `src/ui/controls/checks/PagerButton.check.js`

```javascript
const btn = new PagerButtonControl({
  context,
  text: "Next →",
  kind: "next",
  href: "/urls?page=3",
  disabled: false
});
```

### DatabaseSelector

**Path**: `src/ui/controls/DatabaseSelector.js`  
**Purpose**: Database selection dropdown with CSS

### ConfigMatrixControl

**Path**: `src/ui/controls/ConfigMatrixControl.js`  
**Purpose**: Configuration matrix editor  
**Check**: `src/ui/controls/checks/ConfigMatrixControl.check.js`

---

## Visual Feedback Controls

### ProgressBar

**Path**: `src/ui/controls/ProgressBar.js`  
**Purpose**: Animated progress bar with variants and themes

```javascript
const { createProgressBarControl, PROGRESS_BAR_STYLES } = require("./ProgressBar");
const ProgressBarControl = createProgressBarControl(jsgui);

const bar = new ProgressBarControl({
  context,
  value: 0.65,          // 0-1
  label: "65%",
  variant: "standard",  // 'standard', 'compact', 'striped'
  color: "emerald"      // 'emerald', 'gold', 'ruby', 'sapphire', 'amethyst'
});

// Update dynamically
bar.setValue(0.85);
```

**Variants**:
- `standard`: 8px height with optional label overlay
- `compact`: 4px height, no label
- `striped`: Animated diagonal stripes

### Sparkline

**Path**: `src/ui/controls/Sparkline.js`  
**Purpose**: Inline SVG sparkline charts

```javascript
const SparklineControl = require("./Sparkline");
const spark = new SparklineControl({
  context,
  series: [10, 25, 15, 30, 20, 35],
  width: 160,
  height: 32,
  stroke: "#4338ca",
  strokeWidth: 2
});
```

### ScanningIndicatorControl (z-server)

**Path**: `z-server/ui/controls/scanningIndicatorControl.js`  
**Purpose**: Animated scanning progress indicator with SVG radar effect

```javascript
const { createScanningIndicatorControl } = require("./scanningIndicatorControl");
const ScanningIndicatorControl = createScanningIndicatorControl(jsgui, { StringControl });

const indicator = new ScanningIndicatorControl({ context });
indicator.startCounting();
indicator.setProgress(45, 100, "src/example.js");
indicator.reset();
```

**Key Methods**:
- `startCounting()`: Begin indeterminate counting animation
- `setCountingProgress(current, file)`: Update during file enumeration
- `setProgress(current, total, file)`: Determinate progress mode
- `setTotal(total)`: Set total and switch to determinate mode
- `reset()`: Reset to initial state

---

## Layout & Container Controls

### CrawlBehaviorPanel

**Path**: `src/ui/controls/CrawlBehaviorPanel.js`  
**Purpose**: Behavior configuration panel  
**Check**: `src/ui/controls/checks/CrawlBehaviorPanel.check.js`

### FactsUrlList

**Path**: `src/ui/controls/FactsUrlList.js`  
**Purpose**: URL list with associated facts display

### UrlFactsPopup

**Path**: `src/ui/controls/UrlFactsPopup.js`  
**Purpose**: Popup for displaying URL facts on hover/click

---

## z-server Controls

Located in `z-server/ui/controls/`:

### zServerAppControl

**Purpose**: Root application shell  
**Factory**: `zServerControlsFactory.js`

### ServerListControl

**Purpose**: List of detected/running servers with selection

### ServerItemControl

**Purpose**: Individual server item with status, selection, and URL display

```javascript
const item = new ServerItemControl({
  context,
  server: { relativeFile: "src/server.js", score: 85, running: false },
  selected: false,
  onSelect: (server) => selectServer(server),
  onOpenUrl: (url) => shell.openExternal(url)
});
```

### ServerLogWindowControl

**Purpose**: Log output display with filtering and scroll

### TitleBarControl / SidebarControl / ControlPanelControl

**Purpose**: Layout components for the z-server UI

---

## Creating New Controls

### Step 1: Choose the Right Pattern

| Scenario | Pattern |
|----------|---------|
| Simple, no deps | Direct class export |
| Needs testability | Factory function |
| SSR + client activation | Registered type |

### Step 2: Create the Control File

```javascript
"use strict";

const jsgui = require("jsgui3-html");

/**
 * MyNewControl - Brief description of purpose
 * 
 * Features:
 * - Feature 1
 * - Feature 2
 * 
 * Usage:
 *   const control = new MyNewControl({
 *     context: this.context,
 *     someOption: "value"
 *   });
 */
class MyNewControl extends jsgui.Control {
  /**
   * @param {object} spec
   * @param {object} spec.context - jsgui context
   * @param {string} [spec.someOption="default"] - Description
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "my_new_control" });
    
    // Store configuration
    this._config = {
      someOption: spec.someOption || "default"
    };
    
    // Initialize state
    this._state = {
      active: false
    };
    
    // Add base class
    this.add_class("my-new-control");
    
    // Only compose if not activating existing DOM
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    // Build child controls
    const inner = new jsgui.div({ context: this.context, class: "my-new-control__inner" });
    this.add(inner);
    this._innerEl = inner;
  }

  /**
   * Activate on existing DOM element
   * @param {HTMLElement} [el] - DOM element to activate
   */
  activate(el) {
    if (this.__activated) return;
    this.__activated = true;
    
    this._rootEl = el || this.dom.el;
    
    // Bind event handlers
    this._rootEl.addEventListener("click", () => this._handleClick());
  }

  /**
   * Public method for external use
   * @param {string} value - The value to set
   */
  setValue(value) {
    this._state.value = value;
    this._updateDom();
  }

  /**
   * @private
   */
  _handleClick() {
    this._state.active = !this._state.active;
    this._updateDom();
  }

  /**
   * @private
   */
  _updateDom() {
    if (!this._rootEl) return;
    // DOM updates here
  }
}

module.exports = { MyNewControl };
```

### Step 3: Create Check Script

Create `src/ui/controls/checks/MyNewControl.check.js`:

```javascript
#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { MyNewControl } = require("../MyNewControl");

function main() {
  const context = new jsgui.Page_Context();
  
  const control = new MyNewControl({
    context,
    someOption: "test-value"
  });
  
  const html = control.all_html_render();
  
  // Assertions
  if (!html.includes("my-new-control")) {
    throw new Error("Missing base class");
  }
  if (!html.includes("my-new-control__inner")) {
    throw new Error("Missing inner element");
  }
  
  console.log(html);
  console.log("✓ MyNewControl check passed");
}

if (require.main === module) {
  main();
}

module.exports = { main };
```

### Step 4: Add to Manifest (if applicable)

If the control needs client-side activation, add to `controlManifest.js`:

```javascript
{
  type: "my_new_control",
  loader: () => require("./MyNewControl").MyNewControl
}
```

---

## Control Registration

### How Registration Works

```javascript
// controlRegistry.js
function registerControlType(typeName, ControlClass, { jsguiInstance = jsgui } = {}) {
  const key = typeName.toLowerCase();
  
  // Set prototype type name for activation
  ControlClass.prototype.__type_name = key;
  
  // Add to controls collection
  jsguiInstance.controls[key] = ControlClass;
  
  // Add to map_Controls for client-side parsing
  jsguiInstance.map_Controls[key] = ControlClass;
}
```

### Client-Side Activation

When the client activates SSR markup:

1. jsgui3-client parses the DOM
2. Looks up `__type_name` from element's data attributes
3. Finds constructor in `jsgui.map_Controls`
4. Creates control instance with `{ el: existingElement }`
5. Calls `activate()` to bind events

---

## Check Scripts

Every control should have a check script for verification.

### Running Check Scripts

```bash
# Individual check
node src/ui/controls/checks/PagerButton.check.js

# Pattern: all checks in a directory
Get-ChildItem src/ui/controls/checks/*.check.js | ForEach-Object { node $_.FullName }
```

### Check Script Template

```javascript
#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { MyControl } = require("../MyControl");

// Test fixtures
const FIXTURES = {
  basic: { option: "value" },
  empty: {},
  complex: { option: "complex", nested: { data: true } }
};

function testCase(name, spec, assertions) {
  const context = new jsgui.Page_Context();
  const control = new MyControl({ context, ...spec });
  const html = control.all_html_render();
  
  for (const [check, expected] of Object.entries(assertions)) {
    if (!html.includes(expected)) {
      throw new Error(`${name}: Expected ${check} to include "${expected}"`);
    }
  }
  console.log(`✓ ${name}`);
}

function main() {
  testCase("basic", FIXTURES.basic, { "class": "my-control" });
  testCase("empty", FIXTURES.empty, { "class": "my-control" });
  console.log("All checks passed");
}

if (require.main === module) {
  main();
}
```

---

## Quick Reference

### Control File Locations

| Type | Path |
|------|------|
| Data Explorer | `src/ui/controls/` |
| z-server | `z-server/ui/controls/` |
| Lab experiments | `src/ui/lab/` |
| Art Playground | `src/ui/server/artPlayground/controls/` |
| Gazetteer | `src/ui/server/gazetteer/controls/` |

### Common Imports

```javascript
const jsgui = require("jsgui3-html");
const { registerControlType } = require("./controlRegistry");
const { installBindingPlugin } = require("../jsgui/bindingPlugin");
```

### Control Lifecycle

```
constructor(spec)
  ↓
compose()          [if !spec.el]
  ↓
all_html_render()  [server-side]
  ↓
(HTML sent to browser)
  ↓
activate(el)       [client-side, once]
  ↓
(event handlers bound)
```

### State Management Pattern

```javascript
// Configuration (immutable after construction)
this._config = { option: spec.option || "default" };

// State (mutable at runtime)
this._state = { active: false, value: null };

// DOM references (set during compose or activate)
this._innerEl = null;
this._rootEl = null;
```

### CSS Class Naming (BEM-ish)

```
.control-name             Base class
.control-name__element    Child element
.control-name--modifier   State or variant
.control-name--active     Active state
.control-name--disabled   Disabled state
```

---

## See Also

- [JSGUI3_UI_ARCHITECTURE_GUIDE.md](./JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Full architecture guide
- [JSGUI3_COGNITIVE_TOOLKIT.md](./JSGUI3_COGNITIVE_TOOLKIT.md) - Agent cognitive patterns
- [controlManifest.js](../../src/ui/controls/controlManifest.js) - Control registration
- [controlRegistry.js](../../src/ui/controls/controlRegistry.js) - Registration utilities
