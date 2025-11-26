# Working Notes - UI Architecture Refactor

## Session Started: 2025-11-26

---

## Discovery Phase

### Current Architecture Analysis

#### Docs Viewer (Reference)
- **Server:** `src/ui/server/docsViewer/server.js` (~400 lines)
- **Controls:** 3 dedicated controls in `controls/` folder
- **Pattern:** `DocAppControl.compose()` → `DocNavControl` + `DocViewerControl`
- **Client:** Dedicated client controls with `data-jsgui-control` markers

#### Data Explorer (Target)
- **Server:** `src/ui/server/dataExplorerServer.js` (~1160 lines)
- **Helpers:** `src/ui/render-url-table.js` (~1363 lines)
- **Pattern:** Procedural `renderHtml()` with data arrays
- **Views:** URLs, Domains, Crawls, Errors, Configuration

Key functions to extract:
- `renderUrlListView()` → `UrlListingControl`
- `renderDomainSummaryView()` → `DomainSummaryControl`
- `renderCrawlJobsView()` → `CrawlJobsControl`
- `renderErrorLogView()` → `ErrorLogControl`

#### Diagram Atlas (Target)
- **Server:** `src/ui/server/diagramAtlasServer.js` (~484 lines)
- **Controls:** `src/ui/controls/DiagramAtlasControls.js`
- **Pattern:** `renderDiagramAtlasHtml()` builds full page
- **Sections:** Code, DB, Features

#### Gazetteer (Target)
- **Server:** `src/ui/server/gazetteerInfoServer.js` + `gazetteer/views/placeView.js`
- **Pattern:** Class-based `PlaceView._render()` with callback
- **Views:** Search, Place Detail, Hierarchy

---

## Key Patterns from Docs Viewer

### Control Structure
```javascript
class DocAppControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    // Store props
    this.docTree = spec.docTree || [];
    // Add classes and IDs
    this.add_class("doc-app");
    this.dom.attributes["data-jsgui-id"] = "doc-app";
    // Compose if not hydrating
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    // Build header
    const header = this._buildHeader();
    this.add(header);
    // Build layout with child controls
    const layout = new jsgui.Control({ context: this.context, tagName: "div" });
    layout.add(new DocNavControl({ context: this.context, ...props }));
    layout.add(new DocViewerControl({ context: this.context, ...props }));
    this.add(layout);
  }

  _buildHeader() {
    // Private method to build header section
  }
}
```

### Server Pattern
```javascript
function renderPage(context, data) {
  const app = new DocAppControl({
    context,
    docTree: data.tree,
    selectedPath: data.path,
    docContent: data.content
  });
  return `<!DOCTYPE html>${document.all_html_render()}`;
}

app.get('/', (req, res) => {
  const context = new jsgui.Page_Context();
  const html = renderPage(context, loadData(req));
  res.type('html').send(html);
});
```

---

## Refactoring Approach

### Step 1: Create Shared Base
- `BaseAppControl` with common shell pattern
- CSS variables and BEM conventions

### Step 2: Extract Controls Incrementally
1. Start with Data Explorer (most complex)
2. Create `ExplorerAppControl` first
3. Extract one view at a time
4. Verify each extraction before proceeding

### Step 3: Maintain Backwards Compatibility
- Keep old entry points working during migration
- Use feature flags if needed
- Deprecate old patterns gradually

---

## Commands Used

```bash
# Discovery
wc -l src/ui/server/dataExplorerServer.js  # ~1160 lines
wc -l src/ui/server/diagramAtlasServer.js  # ~484 lines
wc -l src/ui/server/gazetteer/views/placeView.js  # ~479 lines

# Reference
wc -l src/ui/server/docsViewer/server.js  # ~400 lines
```

---

## Notes

- Data Explorer is the highest priority - most complex and most used
- Can reuse existing controls like `TableControl`, `SparklineControl`
- Need to preserve API endpoints (they're separate from HTML rendering)
- Client bundle build process should stay the same
