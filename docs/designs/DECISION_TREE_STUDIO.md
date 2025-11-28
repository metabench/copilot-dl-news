# Decision Tree Studio

## Overview

Decision Tree Studio is a dedicated server application for creating, editing, testing, and validating decision trees. It provides a WYSIWYG editing experience with live preview capabilities using representative sample URLs.

## Architecture

### Server Structure

```
src/ui/server/decisionTreeStudio/
├── server.js              # Express server entry point
├── routes/
│   ├── api.js             # REST API for tree operations
│   ├── samples.js         # Sample URL/page management
│   └── render.js          # Page content rendering
├── services/
│   ├── treeManager.js     # Load/save/validate trees
│   ├── sampleManager.js   # Manage representative samples
│   └── pageRenderer.js    # Simplified page rendering
└── views/
    └── studio.html        # Main SPA entry point
```

### Port Allocation

- **Port 4700** (following existing pattern: 4500 docs, 4600 data explorer)

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Decision Tree Studio                              [Save] [Export]  │
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  NAVIGATION  │              WORKSPACE                               │
│              │                                                      │
│  Categories  │  ┌─────────────────────┐  ┌───────────────────────┐ │
│  ─────────── │  │    TREE EDITOR      │  │   PAGE PREVIEW        │ │
│  ▼ in-depth  │  │                     │  │                       │ │
│    opinion   │  │   (visual canvas)   │  │   (rendered sample)   │ │
│    news      │  │                     │  │                       │ │
│    listicle  │  └─────────────────────┘  └───────────────────────┘ │
│    sponsored │                                                      │
│              │  ┌─────────────────────────────────────────────────┐ │
│  TOOLBOX     │  │                 PROPERTIES                      │ │
│  ─────────── │  │                                                 │ │
│  [url_match] │  │   Node configuration panel                      │ │
│  [text_cont] │  └─────────────────────────────────────────────────┘ │
│  [compare  ] │                                                      │
│  [compound ] │  ┌─────────────────────────────────────────────────┐ │
│  [flag     ] │  │              TEST RESULTS                       │ │
│              │  │                                                 │ │
│  SAMPLES     │  │   Evaluation audit trail                        │ │
│  ─────────── │  └─────────────────────────────────────────────────┘ │
│  sample-01   │                                                      │
│  sample-02   │                                                      │
│  ...         │                                                      │
│              │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

## Core Features

### 1. Navigation Panel (Left)

#### Category Browser
- List all decision tree categories from `config/decision-trees/`
- Expand/collapse tree structure
- Visual indicators for tree health (valid/invalid/warnings)
- Quick stats (node count, depth, coverage)

#### Toolbox
Drag-and-drop node creation:

| Tool | Description |
|------|-------------|
| **url_matches** | Pattern matching on URL path/query |
| **text_contains** | Search text fields (title, description, body) |
| **compare** | Numeric comparisons (>, <, =, ≥, ≤) |
| **compound** | Combine with AND/OR/NOT logic |
| **flag** | Boolean field checks |
| **leaf: match** | Terminal success node |
| **leaf: no_match** | Terminal failure node |

#### Sample Browser
- List of representative sample URLs
- Grouped by expected classification
- Quick-select for testing
- Import new samples from database

### 2. Workspace (Right)

#### Tree Editor (Top-Left)
- Visual node graph canvas
- Drag-and-drop node positioning
- Click to select, double-click to edit
- Connection lines with YES/NO labels
- Zoom/pan controls
- Mini-map for large trees

#### Page Preview (Top-Right)
- Simplified rendering of selected sample page
- Highlights features referenced by conditions:
  - **URL** - shown in address bar
  - **Title** - large heading
  - **Description** - meta excerpt
  - **Word count** - displayed badge
  - **Author/Date** - byline area
  - **Link density** - visual indicator
- Toggle between "Feature View" and "Raw HTML"

#### Properties Panel (Middle)
- Node ID and type
- Condition configuration
- Pattern/value inputs
- Confidence score (for leaves)
- Description/notes field

#### Test Results (Bottom)
- Run selected sample through tree
- Show evaluation path (audit trail)
- Highlight matched/failed conditions
- Display confidence and latency
- Batch test all samples

## Representative Samples System

### Sample Structure

```javascript
// data/samples/decision-tree-samples.json
{
  "samples": [
    {
      "id": "sample-001",
      "url": "https://example.com/news/series/climate-deep-dive",
      "expectedCategory": "in-depth",
      "features": {
        "title": "Climate Crisis: A Deep Dive Analysis",
        "description": "Comprehensive multi-part investigation...",
        "word_count": 4500,
        "has_author": true,
        "has_date": true,
        "link_density": 0.02,
        "body_excerpt": "In the first part of our series..."
      },
      "html_snapshot": "data/samples/snapshots/sample-001.html",
      "tags": ["series", "longform", "analysis"]
    }
  ]
}
```

### Sample Categories

| Category | Sample Count | Description |
|----------|--------------|-------------|
| in-depth | 10 | Long-form analysis, series, investigations |
| opinion | 10 | Op-eds, columns, commentary |
| news | 15 | Breaking news, updates, reports |
| listicle | 8 | List articles, rankings, roundups |
| sponsored | 5 | Branded content, advertorials |
| edge-cases | 10 | Ambiguous, boundary cases |

### Simplified Page Renderer

The page preview renders a simplified version of the page that highlights decision-relevant features:

```html
<!-- Simplified render template -->
<div class="sample-preview">
  <div class="url-bar">{url}</div>
  
  <article class="content">
    <h1 class="title">{title}</h1>
    
    <div class="byline">
      <span class="author" data-present="{has_author}">{author}</span>
      <span class="date" data-present="{has_date}">{date}</span>
    </div>
    
    <p class="description">{description}</p>
    
    <div class="body-preview">
      {body_excerpt}
      <span class="word-count">{word_count} words</span>
    </div>
    
    <div class="metrics">
      <span class="link-density">Link density: {link_density}</span>
    </div>
  </article>
</div>
```

### Feature Highlighting

When a condition is selected in the tree editor, the corresponding feature is highlighted in the page preview:

- **url_matches** → URL bar highlights matching segment
- **text_contains** → Matching text highlighted in yellow
- **compare (word_count)** → Word count badge pulses
- **flag (has_author)** → Author field highlighted green/red

## API Endpoints

### Tree Management

```
GET    /api/trees                    # List all categories
GET    /api/trees/:category          # Get tree for category
PUT    /api/trees/:category          # Save tree
POST   /api/trees/:category/validate # Validate tree structure
DELETE /api/trees/:category          # Delete tree
```

### Sample Management

```
GET    /api/samples                  # List all samples
GET    /api/samples/:id              # Get sample details
GET    /api/samples/:id/render       # Get rendered preview HTML
POST   /api/samples                  # Add new sample
DELETE /api/samples/:id              # Remove sample
POST   /api/samples/import           # Import from database
```

### Evaluation

```
POST   /api/evaluate                 # Evaluate single sample
POST   /api/evaluate/batch           # Evaluate all samples
GET    /api/evaluate/coverage        # Get coverage report
```

## Workflow Examples

### 1. Creating a New Condition

1. Select category from navigation
2. Drag `url_matches` from toolbox onto canvas
3. Connect to parent node (YES or NO branch)
4. Configure pattern in properties panel
5. Select sample from browser
6. Click "Test" to verify behavior
7. Adjust and iterate

### 2. Testing Coverage

1. Click "Batch Test" in test results panel
2. System runs all samples through current tree
3. Results show:
   - ✅ Correctly classified
   - ❌ Misclassified (expected vs actual)
   - ⚠️ Low confidence matches
4. Click any result to load sample in preview

### 3. Debugging a Misclassification

1. Load problematic sample
2. Click "Trace" to step through evaluation
3. Each node highlights in sequence
4. Failing condition shows why it failed
5. Page preview highlights relevant feature
6. Adjust condition and re-test

## Technical Implementation

### Client-Side (jsgui3)

```javascript
// Main studio control
class DecisionTreeStudioControl extends jsgui.Control {
  constructor(context, spec) {
    super(context, spec);
    this._navigation = new NavigationPanelControl(context);
    this._treeEditor = new TreeEditorCanvasControl(context);
    this._pagePreview = new PagePreviewControl(context);
    this._properties = new PropertiesControl(context);
    this._testResults = new TestResultsControl(context);
  }
}
```

### Server-Side Services

```javascript
// Tree validation service
class TreeValidator {
  validate(tree) {
    const errors = [];
    // Check node ID uniqueness
    // Check for orphan nodes
    // Validate condition configurations
    // Check leaf reachability
    return { valid: errors.length === 0, errors };
  }
}

// Sample manager
class SampleManager {
  async getSamples() { /* Load from JSON */ }
  async renderSample(id) { /* Generate preview HTML */ }
  async importFromDatabase(criteria) { /* Pull real URLs */ }
}
```

## File Structure

```
src/ui/server/decisionTreeStudio/
├── server.js
├── routes/
│   ├── api.js
│   ├── samples.js
│   └── render.js
├── services/
│   ├── treeManager.js
│   ├── treeValidator.js
│   ├── sampleManager.js
│   └── pageRenderer.js
├── public/
│   └── studio.bundle.js
└── views/
    └── studio.html

src/ui/controls/decisionTreeStudio/
├── DecisionTreeStudioControl.js
├── NavigationPanelControl.js
├── ToolboxControl.js
├── TreeEditorCanvasControl.js
├── TreeNodeControl.js
├── PagePreviewControl.js
├── PropertiesControl.js
├── TestResultsControl.js
└── SampleBrowserControl.js

data/samples/
├── decision-tree-samples.json
└── snapshots/
    ├── sample-001.html
    ├── sample-002.html
    └── ...

config/decision-trees/
├── page-categories.json
└── schema/
    └── decision-tree.schema.json
```

## Development Phases

### Phase 1: Foundation (Week 1)
- [ ] Server setup with basic routes
- [ ] Sample data structure and loader
- [ ] Basic navigation panel
- [ ] Tree loading and display

### Phase 2: Core Editor (Week 2)
- [ ] Tree editor canvas
- [ ] Drag-and-drop from toolbox
- [ ] Node selection and properties
- [ ] Save/load functionality

### Phase 3: Testing Features (Week 3)
- [ ] Sample browser
- [ ] Page preview renderer
- [ ] Single sample evaluation
- [ ] Audit trail display

### Phase 4: Polish (Week 4)
- [ ] Batch testing
- [ ] Coverage reports
- [ ] Feature highlighting
- [ ] Validation warnings
- [ ] Export/import

## Success Metrics

| Metric | Target |
|--------|--------|
| Tree edit latency | < 100ms |
| Sample render time | < 200ms |
| Evaluation time | < 10ms |
| Coverage display | > 95% samples |
| Validation accuracy | 100% |

## Future Enhancements

- **Version history** - Track tree changes over time
- **A/B testing** - Compare two tree versions
- **Suggestions** - AI-powered condition recommendations
- **Bulk import** - Import samples from crawl database
- **Collaboration** - Multi-user editing with conflict resolution
