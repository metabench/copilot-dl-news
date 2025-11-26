# Documentation Viewer

A jsgui3 + Express web application for browsing and viewing markdown documentation with a clean two-column layout.

## Features

- **Two-Column Layout**: Navigation tree on the left, document content on the right
- **Markdown Rendering**: Full markdown support with syntax highlighting for code blocks
- **Dark/Light Theme**: Toggle between themes with system preference detection
- **Responsive Design**: Works on desktop and mobile devices
- **Table of Contents**: Auto-generated from document headings
- **Breadcrumb Navigation**: Easy path tracking through folder hierarchy
- **Search/Filter**: Quick filter for navigation items
- **Copy Link**: Easy sharing of document URLs

## Architecture

This viewer follows jsgui3 patterns with server-side rendering (SSR) and client-side hydration:

```
docsViewer/
├── server.js                    # Express server with jsgui3 SSR
├── controls/                    # Server-side jsgui3 controls
│   ├── index.js                 # Control exports
│   ├── DocAppControl.js         # Main 2-column layout
│   ├── DocNavControl.js         # Left navigation tree
│   └── DocViewerControl.js      # Right document viewer
├── client/                      # Client-side jsgui3 controls
│   ├── index.js                 # Client bundle entry point
│   └── controls/
│       ├── DocsThemeToggleControl.js  # Theme toggle (jsgui3)
│       ├── DocsNavToggleControl.js    # Mobile nav toggle (jsgui3)
│       └── DocsSearchControl.js       # Search filter (jsgui3)
├── utils/
│   ├── index.js                 # Utility exports
│   ├── docTree.js               # Directory scanning
│   └── markdownRenderer.js      # Markdown to HTML (uses markdown-it)
└── public/
    ├── docs-viewer.css          # Styles (dark/light themes)
    ├── docs-viewer.js           # Fallback vanilla JS
    └── docs-viewer-client.js    # Bundled jsgui3 client (built)
```

### Build Process

The client bundle is built with esbuild:

```bash
# Build the jsgui3 client bundle
npm run ui:docs:build

# Build and run the server
npm run ui:docs:dev
```

### Client-Side Hydration

Server-rendered controls include `data-jsgui-control` attributes that the client 
bundle uses to find and "hydrate" (activate) controls:

```html
<!-- Server renders -->
<button data-jsgui-control="docs_theme_toggle">🌙</button>

<!-- Client activates -->
<script>
const el = document.querySelector('[data-jsgui-control="docs_theme_toggle"]');
const control = new DocsThemeToggleControl({ context, el });
control.activate();  // Binds click handlers, loads saved theme, etc.
</script>
```

## Controls

All controls extend `jsgui.Control` and follow the jsgui3 composition pattern:

### DocAppControl

Main application control with two-column layout:
- Sidebar with DocNavControl
- Main area with DocViewerControl
- Theme toggle button

### DocNavControl

Navigation tree control:
- Hierarchical folder/file structure
- Expandable/collapsible folders
- Active document highlighting
- Search filter input

### DocViewerControl

Document content viewer:
- Breadcrumb navigation
- Rendered markdown content
- Auto-generated table of contents
- Empty state for no selection

## Usage

### Standalone Server

```javascript
const { createDocsViewerServer } = require('./src/ui/server/docsViewer/server');

const { app, server } = createDocsViewerServer({
  port: 3500,
  docsPath: './docs',  // Path to documentation folder
  title: 'My Documentation'
});
```

### As Express Middleware

```javascript
const express = require('express');
const { createDocsViewerMiddleware } = require('./src/ui/server/docsViewer/server');

const app = express();

// Mount at /docs
app.use('/docs', createDocsViewerMiddleware({
  docsPath: './docs',
  title: 'Project Documentation'
}));

app.listen(3000);
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3500 | Server port (standalone mode) |
| `docsPath` | string | `'./docs'` | Path to documentation folder |
| `title` | string | `'Documentation'` | Page title |

## Dependencies

- `express` - Web server framework
- `jsgui3-html` - Isomorphic UI controls
- `marked` - Markdown parser
- `highlight.js` - Syntax highlighting

## jsgui3 Patterns Used

### Server-Side Rendering

```javascript
const jsgui = require('jsgui3-html');
const context = new jsgui.Context();

const app = new DocAppControl({
  context,
  docTree: tree,
  currentDoc: doc
});

const html = app.all_html_render();
```

### Control Composition

```javascript
class DocAppControl extends jsgui.Control {
  constructor(spec) {
    super({ tagName: 'div', ...spec });
    this.add_class('doc-app');
    this.compose();
  }

  compose() {
    // Add child controls
    this.sidebar = new DocNavControl({ context: this.context, ... });
    this.add(this.sidebar);
  }
}
```

### Client-Side Activation

The documentation viewer uses two scripts:

1. **`docs-viewer-client.js`** - Bundled jsgui3 client controls that handle:
   - Theme toggle with localStorage persistence
   - Mobile navigation toggle
   - Search/filter functionality

2. **`docs-viewer.js`** - Fallback vanilla JS for non-jsgui features:
   - Copy link to clipboard
   - Print document
   - Keyboard navigation (/ to focus search, Escape to close nav)
   - Smooth scroll for anchor links

The jsgui3 controls are activated via the `data-jsgui-control` attribute pattern,
which allows server-rendered HTML to be "hydrated" with client-side interactivity.

## Development

To run the documentation viewer locally:

```bash
# First, build the client bundle
npm run ui:docs:build

# Then start the server
npm run ui:docs

# Or do both at once
npm run ui:docs:dev
```

Then open http://localhost:4700 in your browser.

## License

Part of the copilot-dl-news project.
