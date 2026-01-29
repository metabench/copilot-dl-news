# jsgui3 SSR, Isomorphic Controls, and Client-Side Activation

> **The Definitive Guide to Server-Side Rendering with jsgui3**
>
> A comprehensive manual covering how jsgui3 controls work on the server,
> how they become interactive on the client, and the patterns that make
> isomorphic JavaScript UI development elegant and maintainable.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [The Composition Model](#2-the-composition-model)
3. [Server-Side Rendering (SSR)](#3-server-side-rendering-ssr)
4. [Client-Side Activation (Hydration)](#4-client-side-activation-hydration)
5. [Isomorphic Control Patterns](#5-isomorphic-control-patterns)
6. [Express Integration](#6-express-integration)
7. [Common Patterns & Recipes](#7-common-patterns--recipes)
8. [Troubleshooting](#8-troubleshooting)
9. [Migration Guide](#9-migration-guide)
10. [API Reference](#10-api-reference)
11. [Express + SSR Workaround for Linked Packages](#11-express--ssr-workaround-for-linked-packages)

---

## 1. Core Concepts

### 1.1 What is jsgui3?

jsgui3 is a JavaScript UI framework that treats the DOM as a tree of **Control** objects. Unlike React or Vue, which use virtual DOM diffing, jsgui3 creates actual DOM elements through a hierarchical control structure that can be:

1. **Composed** on the server to generate HTML strings
2. **Activated** on the client to add interactivity
3. **Used isomorphically** with the same code paths on both sides

### 1.2 Terminology: Composition vs Rendering

**Critical distinction:**

| Term | Meaning | Who Does It |
|------|---------|-------------|
| **Composition** | Building the control tree structure—adding child controls, setting properties, wiring up event handlers | Your code (the developer) |
| **Rendering** | Converting the control tree to HTML strings or DOM elements | jsgui3 (automatic) |

You **compose** controls. jsgui3 **renders** them.

```javascript
// ❌ Wrong terminology (confusing)
_renderHeader(container) { ... }  // You're not rendering, you're composing!

// ✅ Correct terminology
_composeHeader(container) { ... } // Clear: you're building the structure
```

### 1.3 The Control Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                     JSGUI3 CONTROL LIFECYCLE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   SERVER SIDE                          CLIENT SIDE                  │
│   ───────────                          ───────────                  │
│                                                                     │
│   ┌─────────────┐                                                   │
│   │ new Control │                                                   │
│   │   (spec)    │                                                   │
│   └──────┬──────┘                                                   │
│          │                                                          │
│          ▼                                                          │
│   ┌─────────────┐                                                   │
│   │  compose()  │ ◄─── You call this in constructor                 │
│   │ Build tree  │                                                   │
│   └──────┬──────┘                                                   │
│          │                                                          │
│          ▼                                                          │
│   ┌─────────────┐                                                   │
│   │ .all.html() │ ◄─── jsgui3 serializes to HTML string            │
│   │  (render)   │                                                   │
│   └──────┬──────┘                                                   │
│          │                                                          │
│          ▼                                                          │
│   ┌─────────────┐     HTTP      ┌─────────────┐                     │
│   │  res.send() │ ───────────▶  │   Browser   │                     │
│   │   (HTML)    │               │   parses    │                     │
│   └─────────────┘               └──────┬──────┘                     │
│                                        │                            │
│                                        ▼                            │
│                                 ┌─────────────┐                     │
│                                 │  activate() │ ◄─── Client script  │
│                                 │  (hydrate)  │                     │
│                                 └──────┬──────┘                     │
│                                        │                            │
│                                        ▼                            │
│                                 ┌─────────────┐                     │
│                                 │ Interactive │                     │
│                                 │   Control   │                     │
│                                 └─────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Composition Model

### 2.1 Basic Control Structure

Every jsgui3 control is a JavaScript class that extends `jsgui.Control`:

```javascript
const jsgui = require('jsgui3-html');

class MyControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    
    // Store any custom properties from spec
    this._title = spec.title || 'Default Title';
    
    // SSR: Call compose() immediately in constructor
    this.compose();
  }
  
  compose() {
    // Build your control structure here
    // This is where you ADD child controls
  }
}
```

### 2.2 The Golden Rule: Call `compose()` in Constructor

**For SSR to work, you MUST call `this.compose()` at the end of your constructor.**

```javascript
// ❌ BROKEN: compose() not called
class BrokenControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._data = spec.data;
    // Forgot to call compose()! SSR outputs empty HTML
  }
  
  compose() {
    this.add(makeTextEl(this.context, 'h1', this._data.title));
  }
}

// ✅ WORKS: compose() called in constructor
class WorkingControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._data = spec.data;
    this.compose();  // <-- SSR works!
  }
  
  compose() {
    this.add(makeTextEl(this.context, 'h1', this._data.title));
  }
}
```

### 2.3 Adding Child Controls

Use `this.add()` or `parent.add()` to build the control tree:

```javascript
compose() {
  // Create a container div
  const container = this.add(new jsgui.Control({
    context: this.context,
    tagName: 'div',
    attr: { class: 'my-container' }
  }));
  
  // Add children to the container
  const header = container.add(new jsgui.Control({
    context: this.context,
    tagName: 'header'
  }));
  
  // Add text content
  header.add(makeTextEl(this.context, 'h1', 'Hello World'));
  
  // Add a nested custom control
  container.add(new MyOtherControl({
    context: this.context,
    data: this._data
  }));
}
```

### 2.4 Setting Attributes Correctly

**CRITICAL: Use `dom.attributes` not `attr:`**

```javascript
// ❌ WRONG: attr: for href doesn't work on links
const link = new jsgui.Control({
  context: this.context,
  tagName: 'a',
  attr: { href: '/path' }  // Won't work!
});

// ✅ CORRECT: Set href via dom.attributes
const link = new jsgui.Control({
  context: this.context,
  tagName: 'a'
});
link.dom.attributes.href = '/path';  // Works!
link.dom.attributes.class = 'my-link';  // Also works
```

Why? The `attr:` in spec is processed differently than `dom.attributes`. For dynamic or runtime attributes, always use `dom.attributes`.

### 2.5 Helper Functions

Create utility functions to reduce boilerplate:

```javascript
// From src/ui/server/utils/jsgui3Helpers.js

/**
 * Add text content to a control
 */
function addText(context, parent, text) {
  const textNode = new jsgui.textNode({ context, text: String(text) });
  parent.add(textNode);
  return textNode;
}

/**
 * Create a text element (span, p, h1, etc.) with content
 */
function makeTextEl(context, tagName, text, options = {}) {
  const el = new jsgui.Control({
    context,
    tagName,
    ...options
  });
  addText(context, el, text);
  return el;
}

/**
 * Create a link element
 */
function makeLink(context, text, href, style = {}) {
  const link = new jsgui.Control({
    context,
    tagName: 'a',
    style
  });
  link.dom.attributes.href = href;
  addText(context, link, text);
  return link;
}
```

---

## 3. Server-Side Rendering (SSR)

### 3.1 How SSR Works

jsgui3 SSR converts your control tree to an HTML string:

```javascript
const jsgui = require('jsgui3-html');

// 1. Create a context (required for all controls)
const context = new jsgui.Context();

// 2. Create your control
const myControl = new MyControl({
  context,
  data: { title: 'Hello' }
});

// 3. Render to HTML string
const html = myControl.all.html();

// 4. Send to browser
res.type('html').send(html);
```

### 3.2 Full Page Rendering

For complete HTML documents, jsgui3 provides a page structure:

```javascript
function renderFullPage(mainControl, options = {}) {
  const page = new jsgui.Control({
    context: mainControl.context,
    tagName: 'html'
  });
  
  // Head
  const head = page.add(new jsgui.Control({
    context: mainControl.context,
    tagName: 'head'
  }));
  head.add(makeTextEl(mainControl.context, 'title', options.title || 'Page'));
  
  // Body
  const body = page.add(new jsgui.Control({
    context: mainControl.context,
    tagName: 'body'
  }));
  body.add(mainControl);
  
  // Client script for activation
  if (options.clientScriptPath) {
    const script = body.add(new jsgui.Control({
      context: mainControl.context,
      tagName: 'script'
    }));
    script.dom.attributes.src = options.clientScriptPath;
    script.dom.attributes.defer = 'defer';
  }
  
  return '<!DOCTYPE html>' + page.all.html();
}
```

### 3.3 The `renderHtml` Helper

Most projects have a centralized render function:

```javascript
// src/ui/server/utils/renderHtml.js

function renderHtml(data, options = {}) {
  const context = new jsgui.Context();
  
  // Create page shell with navigation, breadcrumbs, etc.
  const page = new PageShellControl({
    context,
    title: data.title,
    navLinks: options.navLinks,
    breadcrumbs: options.breadcrumbs
  });
  
  // Add the main content control
  if (options.mainControlFactory) {
    const mainControl = options.mainControlFactory(context);
    page.setContent(mainControl);
  }
  
  return '<!DOCTYPE html>' + page.all.html();
}
```

### 3.4 SSR with Express

```javascript
const express = require('express');
const app = express();

app.get('/articles/:id', async (req, res) => {
  // 1. Fetch data
  const article = await getArticle(req.params.id);
  
  // 2. Render HTML
  const html = renderHtml(
    { title: article.title },
    {
      mainControlFactory: (context) => new ArticleViewerControl({
        context,
        article
      })
    }
  );
  
  // 3. Send response
  res.type('html').send(html);
});
```

---

## 4. Client-Side Activation (Hydration)

### 4.1 What is Activation?

Activation (sometimes called hydration) is the process of:

1. Finding existing DOM elements rendered by SSR
2. Creating corresponding jsgui3 Control objects
3. Attaching event handlers and restoring interactivity

### 4.2 The Activation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT-SIDE ACTIVATION FLOW                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Browser receives HTML                                             │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │  <div data-jsgui-id="control_1"                         │      │
│   │       data-jsgui-type="control"                         │      │
│   │       data-jsgui-data-model-id="data_object_1">         │      │
│   │    ...content...                                        │      │
│   │  </div>                                                 │      │
│   └─────────────────────────────────────────────────────────┘      │
│         │                                                           │
│         ▼                                                           │
│   Client script loads (ui-client.js)                                │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │  context.map_Controls.get('control_1')                  │      │
│   │  ↓                                                      │      │
│   │  Control instance with this.dom.el = <div>              │      │
│   │  ↓                                                      │      │
│   │  Event handlers attached                                │      │
│   │  ↓                                                      │      │
│   │  Control is now interactive!                            │      │
│   └─────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 The `data-jsgui-*` Attributes

SSR outputs special attributes that the client uses for activation:

| Attribute | Purpose |
|-----------|---------|
| `data-jsgui-id` | Unique ID linking DOM element to Control instance |
| `data-jsgui-type` | Control type (control, span, div, etc.) |
| `data-jsgui-data-model-id` | Data model binding ID |
| `data-jsgui-data-model` | Data model reference |

### 4.4 Client Bundle Structure

```javascript
// src/ui/client/ui-client.js

const jsgui = require('jsgui3-html');

// Import controls that need client-side activation
const { UrlFilterToggle } = require('../controls/UrlFilterToggle');
const { ThemeEditor } = require('../controls/ThemeEditor');
const { PagerButton } = require('../controls/PagerButton');

// Register control types for activation
const controlTypes = {
  url_filter_toggle: UrlFilterToggle,
  theme_editor: ThemeEditor,
  pager_button: PagerButton
};

// Activation function
function activate() {
  const context = new jsgui.Context();
  
  // Find all elements with data-jsgui-id
  const elements = document.querySelectorAll('[data-jsgui-id]');
  
  elements.forEach(el => {
    const type = el.dataset.jsguiType;
    const ControlClass = controlTypes[type];
    
    if (ControlClass) {
      // Create control and attach to existing DOM
      const control = new ControlClass({
        context,
        el  // Pass existing element
      });
      
      // Store in context map
      context.map_Controls.set(el.dataset.jsguiId, control);
    }
  });
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', activate);
} else {
  activate();
}
```

### 4.5 Making a Control Activatable

For a control to work on the client:

1. **Set a control type name** in the spec
2. **Register it** in the client bundle
3. **Handle the `el` parameter** in the constructor

```javascript
class UrlFilterToggle extends jsgui.Control {
  constructor(spec) {
    super(spec);
    
    // If el is passed, we're activating on client
    if (spec.el) {
      this._activateFromDom(spec.el);
    } else {
      // Server-side: compose the structure
      this.compose();
    }
  }
  
  _activateFromDom(el) {
    // Find child elements and attach handlers
    const button = el.querySelector('.toggle-button');
    if (button) {
      button.addEventListener('click', () => this._onToggle());
    }
  }
  
  _onToggle() {
    // Interactive behavior
    this._expanded = !this._expanded;
    this._updateDisplay();
  }
}
```

### 4.6 When Activation Fails

**Symptom**: Clicks don't work, `this.dom.el` is null

**Common causes**:

1. **Missing `compose()` call** in constructor
2. **Control not registered** in client bundle
3. **`data-jsgui-*` attributes stripped** (minifier issue)
4. **Client script not loading** (check network tab)
5. **Context map not initialized** (script order issue)

---

## 5. Isomorphic Control Patterns

### 5.1 What is Isomorphic?

An **isomorphic control** works identically on both server and client:

- On server: Composes to HTML for fast initial page load
- On client: Activates for interactivity without full re-render

### 5.2 Pattern: Compose/Activate Split

```javascript
class IsomorphicControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._data = spec.data;
    
    if (typeof window === 'undefined') {
      // SERVER: Compose structure
      this.compose();
    } else if (spec.el) {
      // CLIENT: Activate from existing DOM
      this._activate(spec.el);
    } else {
      // CLIENT: Fresh render (rare)
      this.compose();
    }
  }
  
  compose() {
    // Same structure on server and client
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      attr: { class: 'my-control' }
    }));
    
    // ... build structure
  }
  
  _activate(el) {
    // Bind to existing DOM
    this.dom.el = el;
    this._bindEvents();
  }
  
  _bindEvents() {
    // Attach event listeners
    const btn = this.dom.el.querySelector('.action-btn');
    btn?.addEventListener('click', () => this._handleClick());
  }
  
  _handleClick() {
    // Interactive behavior
  }
}
```

### 5.3 Pattern: Static SSR + Client Enhancement

Some controls are static on server but gain features on client:

```javascript
class EnhancedTable extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._rows = spec.rows;
    this._sortable = spec.sortable;
    
    // Always compose (static content)
    this.compose();
    
    // On client, add interactivity
    if (typeof window !== 'undefined') {
      this._enhanceWithSorting();
    }
  }
  
  compose() {
    // Basic table structure
    const table = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'table'
    }));
    // ... rows and cells
  }
  
  _enhanceWithSorting() {
    // Add click handlers to headers for sorting
    // This only runs on client
  }
}
```

### 5.4 Pattern: Data Embedding

Embed data in the HTML for client-side use:

```javascript
compose() {
  // Hidden data for client activation
  const dataScript = this.add(new jsgui.Control({
    context: this.context,
    tagName: 'script',
    attr: { type: 'application/json', class: 'control-data' }
  }));
  addText(this.context, dataScript, JSON.stringify(this._data));
  
  // ... rest of structure
}

_activate(el) {
  // Read embedded data
  const dataEl = el.querySelector('.control-data');
  if (dataEl) {
    this._data = JSON.parse(dataEl.textContent);
  }
  this._bindEvents();
}
```

---

## 6. Express Integration

### 6.1 Route Handler Pattern

```javascript
const express = require('express');
const { renderHtml } = require('./utils/renderHtml');
const { ArticleListControl } = require('../controls/ArticleListControl');

const app = express();

// List route with pagination
app.get('/articles', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    
    // 1. Fetch data
    const { rows, total } = await getArticles({ limit, offset });
    
    // 2. Build page data
    const data = {
      title: 'Articles',
      meta: { rowCount: total, page, limit }
    };
    
    // 3. Render with control factory
    const html = renderHtml(data, {
      mainControlFactory: (context) => new ArticleListControl({
        context,
        articles: rows,
        pagination: { page, limit, total }
      })
    });
    
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
});
```

### 6.2 Detail Route Pattern

```javascript
// Detail route with data loading
app.get('/articles/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).send('Invalid ID');
    }
    
    const article = await getArticle(id);
    if (!article) {
      return res.status(404).send('Not found');
    }
    
    const html = renderHtml(
      { title: article.title },
      {
        mainControlFactory: (context) => new ArticleViewerControl({
          context,
          article
        })
      }
    );
    
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
});
```

### 6.3 Static Assets

```javascript
// Serve client bundle
app.use('/assets', express.static('dist'));

// Serve control CSS
app.use('/assets/controls.css', express.static('src/ui/styles/controls.css'));
```

---

## 7. Common Patterns & Recipes

### 7.1 Composing a List

```javascript
_composeList(container, items) {
  const list = container.add(new jsgui.Control({
    context: this.context,
    tagName: 'ul',
    attr: { class: 'item-list' }
  }));
  
  for (const item of items) {
    const li = list.add(new jsgui.Control({
      context: this.context,
      tagName: 'li'
    }));
    
    li.add(makeLink(this.context, item.title, `/items/${item.id}`));
  }
}
```

### 7.2 Composing a Table

```javascript
_composeTable(container, columns, rows) {
  const table = container.add(new jsgui.Control({
    context: this.context,
    tagName: 'table',
    attr: { class: 'data-table' }
  }));
  
  // Header
  const thead = table.add(new jsgui.Control({
    context: this.context,
    tagName: 'thead'
  }));
  const headerRow = thead.add(new jsgui.Control({
    context: this.context,
    tagName: 'tr'
  }));
  
  for (const col of columns) {
    headerRow.add(makeTextEl(this.context, 'th', col.label));
  }
  
  // Body
  const tbody = table.add(new jsgui.Control({
    context: this.context,
    tagName: 'tbody'
  }));
  
  for (const row of rows) {
    const tr = tbody.add(new jsgui.Control({
      context: this.context,
      tagName: 'tr'
    }));
    
    for (const col of columns) {
      tr.add(makeTextEl(this.context, 'td', row[col.key]));
    }
  }
}
```

### 7.3 Conditional Composition

```javascript
compose() {
  const container = this.add(new jsgui.Control({
    context: this.context,
    tagName: 'div'
  }));
  
  if (this._showHeader) {
    this._composeHeader(container);
  }
  
  if (this._data.error) {
    this._composeError(container);
  } else if (this._data.items.length === 0) {
    this._composeEmpty(container);
  } else {
    this._composeContent(container);
  }
  
  if (this._showFooter) {
    this._composeFooter(container);
  }
}
```

### 7.4 Nested Custom Controls

```javascript
compose() {
  const container = this.add(new jsgui.Control({
    context: this.context,
    tagName: 'div'
  }));
  
  // Add a pagination control
  container.add(new PaginationControl({
    context: this.context,
    currentPage: this._page,
    totalPages: this._totalPages,
    baseUrl: '/articles'
  }));
  
  // Add a table control
  container.add(new DataTableControl({
    context: this.context,
    columns: this._columns,
    rows: this._rows
  }));
}
```

### 7.5 Styling Inline vs CSS Class

```javascript
// Inline styles (good for dynamic values)
const badge = container.add(new jsgui.Control({
  context: this.context,
  tagName: 'span',
  style: {
    backgroundColor: item.color,  // Dynamic
    padding: '4px 8px',
    borderRadius: '4px'
  }
}));

// CSS classes (good for static styles)
const card = container.add(new jsgui.Control({
  context: this.context,
  tagName: 'div',
  attr: { class: 'card card--highlighted' }
}));
```

---

## 8. Troubleshooting

### 8.1 Empty HTML Output

**Symptom**: `control.all.html()` returns empty or minimal HTML

**Check**:
1. Did you call `this.compose()` in the constructor?
2. Are you passing `context` to child controls?
3. Is your `compose()` method actually adding controls?

```javascript
// ❌ Missing compose call
constructor(spec) {
  super(spec);
  // No compose()!
}

// ✅ Fixed
constructor(spec) {
  super(spec);
  this.compose();
}
```

### 8.2 Links Not Working

**Symptom**: `<a>` tags render without `href` attribute

**Check**: Use `dom.attributes.href`, not `attr: { href }`

```javascript
// ❌ Wrong
const link = new jsgui.Control({
  context: this.context,
  tagName: 'a',
  attr: { href: '/path' }  // Doesn't work!
});

// ✅ Correct
const link = new jsgui.Control({
  context: this.context,
  tagName: 'a'
});
link.dom.attributes.href = '/path';
```

### 8.3 Client Activation Not Working

**Symptom**: Page renders but interactive features don't work

**Debug steps**:

1. **Check console for errors** - Network or JS errors?
2. **Verify script loading** - Is `ui-client.js` in network tab?
3. **Check data attributes** - Are `data-jsgui-*` present in HTML?
4. **Verify registration** - Is control type registered in client bundle?

```javascript
// In browser console
document.querySelectorAll('[data-jsgui-id]').length
// Should be > 0 for activatable controls
```

### 8.4 Context Errors

**Symptom**: "Cannot read property 'map_Controls' of undefined"

**Check**: You're passing `context` to all child controls:

```javascript
// ❌ Missing context
const child = new jsgui.Control({
  tagName: 'div'  // No context!
});

// ✅ Correct
const child = new jsgui.Control({
  context: this.context,  // Always pass context
  tagName: 'div'
});
```

### 8.5 Property Name Mismatches

**Symptom**: Data not appearing in control

**Check**: Match property names between server and control:

```javascript
// Server sends:
mainControlFactory: (context) => new MyControl({
  context,
  articleData  // Passing as 'articleData'
})

// Control expects:
constructor(spec) {
  this._article = spec.article;  // Looking for 'article'!
}

// ✅ Fix: Match the names
mainControlFactory: (context) => new MyControl({
  context,
  article: articleData  // Now matches
})
```

---

## 9. Migration Guide

### 9.1 From Vanilla HTML Templates

If migrating from template engines (EJS, Handlebars, Pug):

**Before (EJS)**:
```html
<div class="article">
  <h1><%= article.title %></h1>
  <% if (article.byline) { %>
    <p class="byline"><%= article.byline %></p>
  <% } %>
</div>
```

**After (jsgui3)**:
```javascript
compose() {
  const container = this.add(new jsgui.Control({
    context: this.context,
    tagName: 'div',
    attr: { class: 'article' }
  }));
  
  container.add(makeTextEl(this.context, 'h1', this._article.title));
  
  if (this._article.byline) {
    container.add(makeTextEl(this.context, 'p', this._article.byline, {
      attr: { class: 'byline' }
    }));
  }
}
```

### 9.2 From React

**React**:
```jsx
function Article({ article }) {
  return (
    <div className="article">
      <h1>{article.title}</h1>
      {article.byline && <p className="byline">{article.byline}</p>}
    </div>
  );
}
```

**jsgui3**:
```javascript
class Article extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._article = spec.article;
    this.compose();
  }
  
  compose() {
    const div = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      attr: { class: 'article' }
    }));
    
    div.add(makeTextEl(this.context, 'h1', this._article.title));
    
    if (this._article.byline) {
      div.add(makeTextEl(this.context, 'p', this._article.byline, {
        attr: { class: 'byline' }
      }));
    }
  }
}
```

---

## 10. API Reference

### 10.1 jsgui.Control

The base class for all controls.

```javascript
class Control {
  constructor(spec) {
    // spec.context - Required: jsgui.Context instance
    // spec.tagName - HTML tag (default: 'div')
    // spec.attr - Static attributes
    // spec.style - Inline styles object
    // spec.el - Existing DOM element (for activation)
  }
  
  // Add a child control
  add(child: Control): Control
  
  // DOM interface
  dom: {
    el: HTMLElement | null,  // Actual DOM element (client only)
    attributes: Object       // Attribute setters
  }
  
  // Context reference
  context: jsgui.Context
  
  // Render to HTML string (SSR)
  all: {
    html(): string
  }
}
```

### 10.2 jsgui.Context

Shared context for a control tree.

```javascript
class Context {
  constructor()
  
  // Map of control IDs to Control instances
  map_Controls: Map<string, Control>
}
```

### 10.3 jsgui.textNode

For adding text content.

```javascript
class textNode {
  constructor(spec) {
    // spec.context - Required
    // spec.text - Text content
  }
}
```

### 10.4 Helper Functions

```javascript
// Add text to a control
function addText(context, parent, text): textNode

// Create element with text content
function makeTextEl(context, tagName, text, options?): Control

// Create a link
function makeLink(context, text, href, style?): Control
```

---

## Appendix A: Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────────┐
│                    JSGUI3 SSR QUICK REFERENCE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  GOLDEN RULES                                                       │
│  ────────────                                                       │
│  1. Call this.compose() in constructor                              │
│  2. Pass context to ALL child controls                              │
│  3. Use dom.attributes.href for links, not attr:                    │
│  4. Use _compose* method names, not _render*                        │
│                                                                     │
│  BASIC STRUCTURE                                                    │
│  ───────────────                                                    │
│  class MyControl extends jsgui.Control {                            │
│    constructor(spec) {                                              │
│      super(spec);                                                   │
│      this._data = spec.data;                                        │
│      this.compose();  // <-- Required for SSR!                      │
│    }                                                                │
│                                                                     │
│    compose() {                                                      │
│      const div = this.add(new jsgui.Control({                       │
│        context: this.context,  // <-- Always pass context           │
│        tagName: 'div'                                               │
│      }));                                                           │
│    }                                                                │
│  }                                                                  │
│                                                                     │
│  SETTING ATTRIBUTES                                                 │
│  ──────────────────                                                 │
│  ❌ attr: { href: '/path' }     // Doesn't work for links           │
│  ✅ el.dom.attributes.href = '/path'  // Works!                     │
│                                                                     │
│  TERMINOLOGY                                                        │
│  ───────────                                                        │
│  Composition = You building the control tree                        │
│  Rendering = jsgui3 converting to HTML (automatic)                  │
│  Activation = Client attaching to existing DOM                      │
│                                                                     │
│  RENDER TO HTML                                                     │
│  ──────────────                                                     │
│  const html = control.all.html();                                   │
│  res.type('html').send('<!DOCTYPE html>' + html);                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Express + SSR Workaround for Linked Packages

This section documents a critical workaround for when jsgui3-server's bundler fails due to symlinked packages. This is a common scenario during development when packages like `jsgui3-html` or `jsgui3-client` are npm-linked.

### 11.1 The Problem: esbuild and Symlinks

jsgui3-server uses **esbuild** internally for JavaScript bundling. While esbuild is extremely fast, it has known issues with symlinked packages, especially in nested configurations:

```
ERROR: Cannot read directory ".../jsgui3-client/node_modules/jsgui3-html": 
The file cannot be accessed by the system.
```

#### When This Happens

The bundler fails when:
1. **jsgui3-client is globally linked** (e.g., lives in `nvm/v25.x/node_modules/`)
2. **jsgui3-html is locally linked** (e.g., lives in `../jsgui3-html`)
3. These packages **reference each other** through nested `node_modules/jsgui3-html` symlinks

#### Root Cause: esbuild Symlink Limitations

esbuild's symlink handling has documented issues:

| Issue | Description |
|-------|-------------|
| **Nested symlinks** | esbuild doesn't properly traverse `symlink → symlink` chains |
| **Glob ignoring** | Directory globs may skip symlinked directories entirely |
| **Eager rebuilds** | Watch mode can over-trigger on symlinked file changes |
| **Workspace issues** | npm/pnpm workspaces with symlinks cause resolution failures |

The `--preserve-symlinks` esbuild flag mirrors Node.js's flag but doesn't fully resolve nested symlink issues.

#### Known esbuild GitHub Issues

- [#4228](https://github.com/evanw/esbuild/issues/4228) — Glob patterns ignore symlinked directories
- [#3579](https://github.com/evanw/esbuild/issues/3579) — Over-eager rebuilds with symlinked files
- [#2773](https://github.com/evanw/esbuild/issues/2773) — **Nested symlinked directories** (this is the main issue)
- [#2758](https://github.com/evanw/esbuild/issues/2758) — Symlinked imports not resolved correctly
- [#2483](https://github.com/evanw/esbuild/issues/2483) — npm workspaces with symlinks

### 11.2 The Solution: Express + jsgui3-html SSR

Instead of using jsgui3-server's full bundling pipeline, use a simpler approach:

```
┌─────────────────────────────────────────────────────────────────────┐
│              EXPRESS + JSGUI3-HTML SSR PATTERN                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   jsgui3-server (bundler)              Express + jsgui3-html (SSR)  │
│   ─────────────────────                ─────────────────────────    │
│                                                                     │
│   ┌─────────────────────┐              ┌─────────────────────┐      │
│   │  Server.serve(Ctrl) │              │  Express app.get()  │      │
│   └──────────┬──────────┘              └──────────┬──────────┘      │
│              │                                    │                 │
│              ▼                                    ▼                 │
│   ┌─────────────────────┐              ┌─────────────────────┐      │
│   │  esbuild bundler    │ ❌ FAILS!    │  jsgui3-html SSR    │      │
│   │  (symlink issues)   │              │  (no bundler)       │      │
│   └─────────────────────┘              └──────────┬──────────┘      │
│                                                   │                 │
│                                                   ▼                 │
│                                        ┌─────────────────────┐      │
│                                        │  Inline <script>    │      │
│                                        │  for interactivity  │      │
│                                        └─────────────────────┘      │
│                                                                     │
│   ❌ Broken with linked packages       ✅ Works reliably            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Key Differences

| Feature | jsgui3-server | Express + SSR Workaround |
|---------|--------------|--------------------------|
| Bundling | esbuild (can fail with symlinks) | None (SSR only) |
| CSS extraction | Automatic from `.css` static property | Inline `<style>` or static files |
| Client JS | Bundled from client.js entry | Inline `<script>` blocks |
| Activation | Full hydration with control bindings | Manual DOM manipulation |
| Setup complexity | Lower (when it works) | Slightly higher |
| Reliability | Depends on symlink configuration | **Always works** |

### 11.3 Complete Implementation Pattern

Here's a complete example of the Express + SSR workaround pattern:

#### Server Setup

```javascript
/**
 * Express + jsgui3-html SSR Server
 * 
 * This pattern avoids jsgui3-server's bundler entirely,
 * using jsgui3-html for SSR and inline scripts for interactivity.
 */
'use strict';

const express = require('express');
const jsgui = require('jsgui3-html');
const { Control, controls, html, makeEl, makeDocument, text } = jsgui;

const app = express();
app.use(express.json());
```

#### Control with Inline Client Script

```javascript
class MyInteractiveControl extends Control {
  constructor(spec = {}) {
    super(spec);
    this.data = spec.data || {};
    
    if (!spec.el) {
      this._composeDocument();
    }
  }
  
  _composeDocument() {
    const ctx = this.context;
    
    // Build the HTML document
    const doc = makeDocument(ctx);
    doc.head.add(makeEl(ctx, 'title').add(text(ctx, 'My Page')));
    doc.head.add(this._composeStyles());
    doc.head.add(this._composeClientScript());
    
    // Body content
    doc.body.add(this._composeHeader());
    doc.body.add(this._composeMainContent());
    
    this.add(doc);
  }
  
  _composeStyles() {
    const ctx = this.context;
    const styleEl = makeEl(ctx, 'style');
    styleEl.add(text(ctx, `
      /* Your CSS here - inlined to avoid bundler */
      .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
      .section { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .section--collapsible .section-header { cursor: pointer; }
      .section--collapsible .section-content { display: none; }
      .section--collapsible.open .section-content { display: block; }
      .toggle-btn { padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; }
    `));
    return styleEl;
  }
  
  _composeClientScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(text(ctx, `
      // ====================================================
      // INLINE CLIENT JAVASCRIPT
      // This replaces bundled client code when using SSR-only
      // ====================================================
      
      // Toggle collapsible section
      function toggleSection(sectionId) {
        const section = document.getElementById(sectionId);
        const content = section.querySelector('.section-content');
        const btn = section.querySelector('.toggle-btn');
        const isOpen = section.classList.contains('open');
        
        if (isOpen) {
          section.classList.remove('open');
          btn.textContent = '▼ Show';
        } else {
          section.classList.add('open');
          btn.textContent = '▲ Hide';
        }
      }
      
      // Form submission handler
      document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('myForm');
        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            try {
              const res = await fetch(form.action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              if (!res.ok) throw new Error('Request failed');
              
              showMessage('✅ Saved successfully!', 'success');
            } catch (err) {
              showMessage('❌ ' + err.message, 'error');
            }
          });
        }
      });
      
      function showMessage(text, type) {
        const bar = document.getElementById('statusBar');
        if (bar) {
          bar.textContent = text;
          bar.className = 'status-bar status-bar--' + type;
        }
      }
    `));
    return scriptEl;
  }
  
  _composeHeader() { /* ... */ }
  _composeMainContent() { /* ... */ }
}
```

#### Route Handler

```javascript
// SSR route - no bundling involved
app.get('/my-page', (req, res) => {
  // Create the jsgui3 context
  const ctx = { map_Controls: controls, make_context: () => ctx };
  
  // Fetch any data needed
  const data = { title: 'My Page', items: [1, 2, 3] };
  
  // Create and render the control
  const page = new MyInteractiveControl({ context: ctx, data });
  res.send(html(page));
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

### 11.4 Collapsible Sections Pattern

One of the most common interactive patterns is collapsible sections. Here's the complete implementation:

#### SSR Composition

```javascript
_composeCollapsibleSection(container, title, id) {
  const ctx = this.context;
  
  // Section wrapper
  const section = makeEl(ctx, 'section', { 
    class: 'section section--collapsible', 
    id 
  });
  
  // Clickable header
  const header = makeEl(ctx, 'div', { 
    class: 'section-header', 
    onclick: `toggleSection('${id}')` 
  });
  header.add(makeEl(ctx, 'h2', { class: 'section-title' }).add(text(ctx, title)));
  header.add(makeEl(ctx, 'button', { 
    type: 'button', 
    class: 'toggle-btn' 
  }).add(text(ctx, '▼ Show')));
  section.add(header);
  
  // Collapsible content (hidden by default)
  const content = makeEl(ctx, 'div', { class: 'section-content' });
  // Add content children here...
  section.add(content);
  
  container.add(section);
  return content; // Return content so caller can add children
}
```

#### Client JavaScript

```javascript
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  
  const content = section.querySelector('.section-content');
  const btn = section.querySelector('.toggle-btn');
  const isOpen = section.classList.contains('open');
  
  // Toggle state
  if (isOpen) {
    section.classList.remove('open');
    content.style.display = 'none';
    btn.textContent = '▼ Show';
  } else {
    section.classList.add('open');
    content.style.display = 'block';
    btn.textContent = '▲ Hide';
  }
}
```

#### CSS

```css
.section--collapsible .section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.section--collapsible .section-content {
  display: none;
  margin-top: 16px;
}

.section--collapsible.open .section-content {
  display: block;
}

.toggle-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: background 0.15s;
}

.toggle-btn:hover {
  background: #f5f5f5;
}
```

### 11.5 Form Handling Pattern

Forms require special handling since the full jsgui3 form binding isn't available:

#### SSR Form Composition

```javascript
_composeForm(container) {
  const ctx = this.context;
  
  const form = makeEl(ctx, 'form', { 
    method: 'post', 
    action: '/api/save',
    id: 'myForm'
  });
  
  // Status bar for messages
  form.add(makeEl(ctx, 'div', { class: 'status-bar', id: 'statusBar' }));
  
  // Text input
  const field = makeEl(ctx, 'div', { class: 'form-field' });
  field.add(makeEl(ctx, 'label', { for: 'name' }).add(text(ctx, 'Name')));
  field.add(makeEl(ctx, 'input', { 
    type: 'text', 
    name: 'name', 
    id: 'name', 
    value: this.data.name || '',
    placeholder: 'Enter name'
  }));
  form.add(field);
  
  // Submit button
  form.add(makeEl(ctx, 'button', { 
    type: 'submit', 
    class: 'btn btn--primary' 
  }).add(text(ctx, 'Save')));
  
  container.add(form);
}
```

#### Client Form Handler

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('myForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    showStatus('Saving...', 'info');
    
    // Collect form data
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    // Handle checkboxes (unchecked ones aren't in FormData)
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      data[cb.name] = cb.checked;
    });
    
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      
      showStatus('✅ Saved!', 'success');
    } catch (err) {
      showStatus('❌ ' + err.message, 'error');
    }
  });
});

function showStatus(message, type) {
  const bar = document.getElementById('statusBar');
  if (bar) {
    bar.textContent = message;
    bar.className = 'status-bar status-bar--' + type;
    bar.style.display = 'block';
  }
}
```

### 11.6 Range Slider with Live Update

Range sliders with live value display are a common pattern:

#### SSR Composition

```javascript
_composeRangeField(container, name, label, value, min, max) {
  const ctx = this.context;
  
  const field = makeEl(ctx, 'div', { class: 'form-field' });
  field.add(makeEl(ctx, 'label', { for: name }).add(text(ctx, label)));
  
  const row = makeEl(ctx, 'div', { class: 'range-row' });
  row.add(makeEl(ctx, 'input', { 
    type: 'range', 
    name, 
    id: name, 
    value: value,
    min: min,
    max: max,
    // Inline event handler for live update
    oninput: `document.getElementById('${name}_val').textContent = this.value`
  }));
  row.add(makeEl(ctx, 'span', { 
    class: 'range-value', 
    id: `${name}_val` 
  }).add(text(ctx, String(value))));
  
  field.add(row);
  container.add(field);
}
```

#### CSS

```css
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-row input[type="range"] {
  flex: 1;
}

.range-value {
  min-width: 60px;
  text-align: right;
  font-family: monospace;
  font-size: 13px;
  color: #666;
}
```

### 11.7 When to Use This Pattern

#### Use Express + SSR When:

- ✅ **Linked packages** cause bundler failures
- ✅ **Simple interactivity** (toggles, forms, range sliders)
- ✅ **Development speed** is priority over client bundle optimization
- ✅ **Rapid prototyping** in labs or experimental features
- ✅ **Admin/internal tools** where bundle size isn't critical

#### Use Full jsgui3-server When:

- ✅ **No linked packages** (installed normally via npm)
- ✅ **Complex client interactions** requiring full control lifecycle
- ✅ **CSS extraction** from static `.css` properties is needed
- ✅ **Watch mode** and hot reloading are important
- ✅ **Bundle optimization** (minification, tree-shaking) is required

### 11.8 Migration Path

When packages are no longer linked (e.g., published to npm), you can migrate back to jsgui3-server:

1. **Keep the control class** — it's the same jsgui3 Control
2. **Move styles** to the static `.css` property
3. **Move client scripts** to a separate `client.js` entry point
4. **Update server** from Express to `Server.serve()`

```javascript
// BEFORE: Express + SSR (inline styles and scripts)
class MyControl extends Control {
  _composeStyles() { /* inline */ }
  _composeClientScript() { /* inline */ }
}

// AFTER: jsgui3-server (external styles and client bundle)
class MyControl extends Control {
  // Styles moved to static property
  static css = `
    .my-control { ... }
  `;
  
  // Client logic moved to client.js
  // No _composeClientScript needed
}

// Server changes from Express to:
const Server = require('jsgui3-server');
Server.serve(MyControl, { port: 3000 });
```

### 11.9 Full Working Example

See `labs/jsgui3-crawl-profile-editor/server.js` for a complete implementation featuring:

- Profile list page with table rendering
- Profile editor with collapsible advanced options
- Form submission with async validation
- Range sliders with live value display
- Delete confirmation
- Status messages
- Full CRUD API endpoints

Run it with:
```bash
node labs/jsgui3-crawl-profile-editor/server.js
# Open http://localhost:3105
```

### 11.10 Troubleshooting

#### Problem: Styles Not Applying

**Cause**: The style element isn't being added to `<head>`.

**Fix**: Ensure `_composeStyles()` is added to `doc.head`:
```javascript
doc.head.add(this._composeStyles());
```

#### Problem: Event Handlers Not Firing

**Cause**: The inline script runs before the DOM is ready.

**Fix**: Wrap initialization in `DOMContentLoaded`:
```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Your initialization code here
});
```

#### Problem: Form Checkboxes Not Included

**Cause**: Unchecked checkboxes aren't included in `FormData`.

**Fix**: Manually query checkboxes:
```javascript
form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  data[cb.name] = cb.checked;
});
```

#### Problem: Unicode/Emoji Breaking in Script

**Cause**: Text isn't properly escaped in the script block.

**Fix**: Use the `text()` helper which handles escaping:
```javascript
scriptEl.add(text(ctx, `your script content`));
```

---

## Appendix B: Database Adapter Pattern

When building UI controls that need database access, **NEVER** put SQL directly in the control. Instead, use query adapters.

### The Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│              DATABASE ADAPTER PATTERN                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   UI Control                  Query Adapter                DB       │
│   ──────────                  ─────────────                ──       │
│                                                                     │
│   ┌─────────────────┐        ┌─────────────────┐                   │
│   │ PlaceHubMatrix  │───────▶│ placeHubGuessing│──────▶ SQLite     │
│   │ Control.js      │        │ UiQueries.js    │                   │
│   └─────────────────┘        └─────────────────┘                   │
│                                                                     │
│   ❌ Control has SQL          ✅ Adapter has SQL                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

1. **Testability**: Mock the adapter, not the database
2. **Single source of truth**: One place for each query
3. **Separation of concerns**: UI doesn't know about SQL
4. **Reusability**: Multiple controls can share adapters

### Example

```javascript
// ✅ CORRECT: Query in adapter file
// src/db/sqlite/v1/queries/articleUiQueries.js
function getArticlesByHost(db, host, limit = 50) {
  return db.prepare(`
    SELECT id, title, published_at
    FROM articles
    WHERE host = ?
    ORDER BY published_at DESC
    LIMIT ?
  `).all(host, limit);
}

// ✅ CORRECT: Control uses adapter
// src/ui/server/articles/controls/ArticleListControl.js
const { getArticlesByHost } = require('../../../db/sqlite/v1/queries/articleUiQueries');

class ArticleListControl extends jsgui.Control {
  _loadData() {
    this._articles = getArticlesByHost(this.db, this._host, 50);
  }
}
```

See [Query Adapter Catalog](./QUERY_ADAPTER_CATALOG.md) for the complete list of adapters.

---

## Appendix C: File Organization

```
src/ui/
├── controls/                    # jsgui3 control classes
│   ├── ArticleViewerControl.js
│   ├── ArticleListControl.js
│   ├── PaginationControl.js
│   └── ...
├── server/
│   ├── dataExplorerServer.js   # Express routes
│   └── utils/
│       ├── renderHtml.js       # Page rendering utility
│       └── jsgui3Helpers.js    # Helper functions
├── client/
│   └── ui-client.js            # Client bundle entry
└── styles/
    └── controls.css            # Shared control styles
```

---

*This guide is part of the copilot-dl-news documentation. For updates and corrections, see the project repository.*
