# HTML Composition Architecture

_Inspired by jsgui3-html and jsgui3-server patterns, adapted for server-side rendering_

## Overview

This document outlines the modular HTML generation system for the copilot-dl-news crawler UI. Drawing from jsgui3's Control-based architecture and compositional patterns, we've adapted these principles for pure server-side rendering (SSR) without client-side reactivity.

## Key Principles from jsgui3

### 1. **Component Composition Over Monoliths**
- **jsgui3 Pattern**: Controls compose other controls to build complex UIs
- **Our Adaptation**: View functions compose smaller HTML-generating functions
- **Benefit**: Reusable, testable, focused components

### 2. **Specification Objects**
- **jsgui3 Pattern**: Controls accept a `spec` parameter with configuration
- **Our Adaptation**: Component functions accept configuration objects
- **Benefit**: Consistent, predictable APIs

### 3. **Context Management**
- **jsgui3 Pattern**: Context provides runtime environment and shared services
- **Our Adaptation**: Render context carries shared dependencies (renderNav, escapeHtml, etc.)
- **Benefit**: Explicit dependency injection, easier testing

### 4. **Type Safety and Defensive Programming**
- **jsgui3 Pattern**: Extensive `typeof` checks and existence validation
- **Our Adaptation**: Input validation and safe defaults in component functions
- **Benefit**: Robust error handling, graceful degradation

## Architecture Layers

```
┌──────────────────────────────────────────────┐
│  Route Handlers (src/ui/express/routes/)    │
│  - Orchestrate data fetching and rendering  │
│  - Create render context                     │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│  View Functions (src/ui/express/views/)     │
│  - Compose components into pages            │
│  - Call data helpers if needed              │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│  Component Library (src/ui/express/comps/)  │
│  - Reusable HTML fragments                  │
│  - Pure functions: data → HTML string       │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│  HTML Utilities (src/ui/express/utils/)     │
│  - escapeHtml, formatBytes, etc.            │
│  - Tagged template system (optional)        │
└──────────────────────────────────────────────┘
```

## Component System

### Component Signature

Inspired by jsgui3's Control constructor pattern:

```javascript
/**
 * @param {Object} spec - Component specification
 * @param {Object} context - Render context with shared utilities
 * @returns {string} HTML string
 */
function MyComponent(spec, context) {
  // Validate inputs
  spec = spec || {};
  context = context || {};
  
  // Extract context utilities
  const { escapeHtml, formatBytes } = context;
  
  // Defensive defaults
  const title = spec.title || 'Untitled';
  const items = spec.items || [];
  
  // Compose HTML
  return `
    <div class="my-component">
      <h2>${escapeHtml(title)}</h2>
      ${items.map(item => ItemComponent(item, context)).join('')}
    </div>
  `;
}
```

### Render Context Pattern

Similar to jsgui3's context object, our render context provides shared services:

```javascript
function createRenderContext({ renderNav, db, urlsDbPath }) {
  return {
    // HTML utilities
    escapeHtml,
    formatBytes,
    formatNumber,
    
    // Navigation
    renderNav,
    
    // Optional: trace/logging
    startTrace: (name) => ({ /* ... */ }),
    
    // Database access (for data helpers)
    db,
    urlsDbPath
  };
}
```

## Component Library

### Core Components

Inspired by jsgui3's control library:

#### 1. `pageLayout` (Active_HTML_Document equivalent)
Base page wrapper with navigation and structure:

```javascript
function pageLayout({ title, nav, content, bodyClass }, context) {
  return `
<!doctype html>
<html>
<head>
  <title>${context.escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles/crawler.css">
</head>
<body class="${context.escapeHtml(bodyClass || '')}">
  ${nav}
  <main>
    ${content}
  </main>
</body>
</html>
  `;
}
```

#### 2. `pill` (Status Badge)
Reusable status indicator:

```javascript
function pill({ text, variant }, context) {
  const variantClass = variant || 'neutral';
  return `<span class="pill ${context.escapeHtml(variantClass)}"><code>${context.escapeHtml(text)}</code></span>`;
}
```

#### 3. `dataTable` (Grid equivalent)
Consistent table rendering:

```javascript
function dataTable({ headers, rows, emptyMessage }, context) {
  if (!rows || rows.length === 0) {
    return `<p class="empty-state">${context.escapeHtml(emptyMessage || 'No data')}</p>`;
  }
  
  return `
<table>
  <thead>
    <tr>${headers.map(h => `<th>${context.escapeHtml(h)}</th>`).join('')}</tr>
  </thead>
  <tbody>
    ${rows.map(row => `
      <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
    `).join('')}
  </tbody>
</table>
  `;
}
```

#### 4. `formFilters`
Consistent filter form generation:

```javascript
function formFilters({ fields, action, method }, context) {
  return `
<form method="${method || 'GET'}" action="${action || ''}">
  ${fields.map(field => formField(field, context)).join('')}
  <button type="submit">Apply Filters</button>
</form>
  `;
}
```

#### 5. `errorPage`
Standardized error display:

```javascript
function errorPage({ message, status }, context) {
  return pageLayout({
    title: `Error ${status || 500}`,
    nav: context.renderNav ? context.renderNav() : '',
    content: `
      <div class="error-container">
        <h1>Error ${context.escapeHtml(String(status || 500))}</h1>
        <pre>${context.escapeHtml(message)}</pre>
      </div>
    `
  }, context);
}
```

### Component Mixins (Inspired by jsgui3)

Rather than class mixins, we use composition functions:

```javascript
// Add consistent styling classes
function withContainerClasses(html, classes) {
  return html.replace('<div', `<div class="${classes}"`);
}

// Add data attributes for client-side activation
function withDataAttributes(html, attrs) {
  const attrString = Object.entries(attrs)
    .map(([key, val]) => `data-${key}="${escapeHtml(val)}"`)
    .join(' ');
  return html.replace('<div', `<div ${attrString}`);
}
```

## Tagged Template System (Optional)

Inspired by modern template literal patterns:

```javascript
/**
 * Tagged template for safe HTML generation
 * Auto-escapes interpolated values unless marked as raw
 */
function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = values[i];
    if (value === undefined) return result + str;
    
    // Handle raw HTML marker
    if (value && value.__html_raw) {
      return result + str + value.__html_raw;
    }
    
    // Auto-escape by default
    return result + str + escapeHtml(value);
  }, '');
}

// Mark trusted HTML as safe
html.raw = (htmlString) => ({ __html_raw: htmlString });

// Usage
const userInput = '<script>alert("xss")</script>';
const trustedNav = renderNav();

const page = html`
  <h1>${userInput}</h1>
  ${html.raw(trustedNav)}
`;
// Result: <h1>&lt;script&gt;alert("xss")&lt;/script&gt;</h1><nav>...</nav>
```

## Migration Strategy

### Phase 1: Utilities Foundation ✓
- [x] Create `src/ui/express/utils/html.js` with shared helpers
- [ ] Update all files to use centralized utilities

### Phase 2: Component Library
- [ ] Create `src/ui/express/components/` directory
- [ ] Implement core components (pageLayout, pill, dataTable, etc.)
- [ ] Add component tests

### Phase 3: View Refactoring
- [ ] Refactor one simple view (milestonesPage) as proof-of-concept
- [ ] Verify tests pass
- [ ] Document patterns for other views

### Phase 4: Route Cleanup
- [ ] Remove inline HTML from route handlers
- [ ] Use errorPage component consistently
- [ ] Standardize error handling

## Testing Strategy

### Component Tests

```javascript
describe('pill component', () => {
  let context;
  
  beforeEach(() => {
    context = { escapeHtml: (s) => String(s).replace(/</g, '&lt;') };
  });
  
  test('renders basic pill', () => {
    const html = pill({ text: 'Active', variant: 'good' }, context);
    expect(html).toContain('class="pill good"');
    expect(html).toContain('<code>Active</code>');
  });
  
  test('escapes dangerous content', () => {
    const html = pill({ text: '<script>xss</script>' }, context);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
```

### Integration Tests

Test composed views with real context:

```javascript
test('renders milestones page with components', () => {
  const context = createRenderContext({ renderNav: () => '<nav>Nav</nav>' });
  const html = renderMilestonesPage({
    milestones: [/* ... */],
    filters: {}
  }, context);
  
  expect(html).toContain('<nav>Nav</nav>');
  expect(html).toContain('class="pill');
  expect(html).toContain('<table>');
});
```

## Key Differences from jsgui3

1. **No Client-Side Reactivity**: We render once on the server, no data binding
2. **No Activation Lifecycle**: Pure SSR, no `activate()` method needed
3. **No Context Registry**: Simpler context object with just utilities
4. **String-Based**: Components return strings, not DOM manipulation objects
5. **Functional vs Class**: Functions instead of Control classes

## Key Similarities to jsgui3

1. **Composition Pattern**: Build complex UIs from simple pieces
2. **Specification Objects**: Consistent configuration pattern
3. **Context Management**: Shared services through context
4. **Defensive Programming**: Type checks and safe defaults
5. **Reusable Components**: Library of common UI patterns

## Benefits

- **DRY**: No more duplicated escapeHtml, ensureRenderNav, etc.
- **Testable**: Pure functions are easy to test in isolation
- **Composable**: Mix and match components to build pages
- **Maintainable**: Small, focused functions vs monolithic templates
- **Safe**: Centralized escaping reduces XSS risk
- **Consistent**: All pages use same component vocabulary

## References

- [jsgui3-html README](https://github.com/metabench/jsgui3-html)
- [jsgui3-server README](https://github.com/metabench/jsgui3-server)
- AGENTS.md - Working Agreement section
