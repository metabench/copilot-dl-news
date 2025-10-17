# UI Blank Page Troubleshooting Guide

**Date**: October 14, 2025  
**Issue**: VS Code Simple Browser showing blank white page when accessing crawler UI  
**Resolution**: CSS variable definition and SASS organization

---

## Problem Summary

The crawler UI (`index.html`) was displaying as a completely blank white page in VS Code's Simple Browser despite:
- Server running successfully on port 41000
- HTML being served correctly (30KB response, 200 status)
- All external resources (CSS, JavaScript) loading successfully
- No JavaScript errors in console

## Root Cause

The issue was caused by **undefined CSS variables** in inline styles within `index.html`:

```html
<!-- BROKEN: CSS variables without fallbacks -->
<style>
  .stage-flow {
    background: var(--bg-panel);        /* ← Variable not defined! */
    border: 1px solid var(--border-subtle);  /* ← Variable not defined! */
  }
  .stage-item {
    background: var(--bg-subtle);       /* ← Variable not defined! */
    color: var(--text-muted);           /* ← Variable not defined! */
  }
</style>
```

When CSS variables are referenced but not defined anywhere in the stylesheet hierarchy:
1. The browser cannot resolve `var(--bg-panel)` to any value
2. The property becomes invalid and is ignored
3. Elements have no background colors, borders, or text colors
4. The page appears completely white with invisible content

## Why This Happened

The project had recently been refactored to use SASS with partials. The existing SASS files (`_core.scss`, `_telemetry.scss`, etc.) used CSS variables **with fallback values**:

```scss
// Existing SASS pattern (SAFE)
background: var(--bg-primary, white);  // ← Fallback provided
background: var(--bg-hover, #f1f3f5);  // ← Fallback provided
```

However, when the two-column compact layout was added to `index.html`, it was written as inline styles using CSS variables **without fallbacks**:

```css
/* Inline styles in HTML (BROKEN) */
background: var(--bg-panel);     /* No fallback! */
border: 1px solid var(--border-subtle);  /* No fallback! */
```

The CSS variables themselves (`--bg-panel`, `--bg-subtle`, `--border-subtle`, etc.) were never defined in any `:root` rule, so they evaluated to nothing.

## Investigation Steps

1. **Server verification**: Confirmed server running on port 41000
2. **HTML delivery**: Verified HTML was being served (30KB, DOCTYPE present)
3. **Resource loading**: Confirmed `/crawler.css` (70KB) and `/assets/global-nav.js` (2KB) loading successfully
4. **CSS variable search**: Discovered `--bg-panel` was referenced but never defined
5. **SASS file inspection**: Found existing SASS files used variables with fallbacks
6. **Root cause identification**: Inline styles used undefined variables without fallbacks

## Resolution

The fix involved three steps:

### 1. Create CSS Variable Definitions

Created `src/ui/express/public/styles/partials/_variables.scss`:

```scss
:root {
  // Background colors
  --bg-panel: #f8f9fa;
  --bg-subtle: #e9ecef;
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-hover: #f1f3f5;
  
  // Border colors
  --border-subtle: #dee2e6;
  
  // Text colors
  --text-primary: #212529;
  --text-muted: #6c757d;
  
  // Component colors
  --color-primary: #0d6efd;
  --color-primary-subtle: #cfe2ff;
  --color-success: #198754;
  // ... etc
}

.dark, [data-theme="dark"] {
  // Dark theme overrides
  --bg-panel: #2d2d2d;
  --bg-subtle: #3a3a3a;
  --border-subtle: #495057;
  --text-primary: #e9ecef;
  --text-muted: #adb5bd;
  // ... etc
}
```

### 2. Move Inline Styles to SASS

Added compact layout styles to `src/ui/express/public/styles/crawler.scss`:

```scss
@use 'partials/variables';  // ← Import variables first
@use 'partials/core';
// ... other imports

// Compact Layout Styles
.crawler-layout--compact {
  display: grid;
  grid-template-columns: 400px 1fr;
  grid-template-rows: auto 1fr;
  gap: 1rem;
  padding: 1rem;
  height: 100vh;
  overflow: hidden;
}

.stage-flow {
  background: var(--bg-panel);  // ← Now defined!
  border: 1px solid var(--border-subtle);  // ← Now defined!
}
// ... etc
```

### 3. Remove Inline Styles from HTML

Removed the entire `<style>` block (140+ lines) from `src/ui/express/public/index.html`:

```html
<!-- BEFORE (BROKEN) -->
<head>
  <link rel="stylesheet" href="/crawler.css" />
  <style>
    /* 140+ lines of inline CSS with undefined variables */
  </style>
</head>

<!-- AFTER (FIXED) -->
<head>
  <link rel="stylesheet" href="/crawler.css" />
  <!-- No inline styles needed! -->
</head>
```

### 4. Build SASS

Compiled SASS to CSS:

```bash
npm run sass:build
```

This generated `crawler.css` with:
- CSS variable definitions at the top (from `_variables.scss`)
- All compact layout styles (from `crawler.scss`)
- Proper cascade and theme support

## Verification

After fixes:
- Page loads correctly with visible content
- Two-column layout renders properly
- Stage flow indicators show correct colors
- Dark theme support ready (variables defined for both themes)
- No inline styles cluttering HTML

## Key Lessons

### For AI Agents

1. **CSS variables must be defined before use**: Check for `:root` rules defining custom properties
2. **Inline styles are last resort**: Prefer SASS/CSS files for maintainability
3. **Verify resource loading**: Blank page ≠ server error; check browser dev tools
4. **SASS variables ≠ CSS variables**: SASS `$var` compiles away; CSS `var(--prop)` must exist at runtime
5. **Use fallbacks in CSS variables**: `var(--color, #fallback)` prevents invisible content

### For Developers

1. **Establish CSS variable conventions**: Define all custom properties in a central location
2. **Use SASS for complex styling**: Leverage build system instead of inline styles
3. **Theme support requires planning**: Define variables for both light and dark themes upfront
4. **Test in target environment**: VS Code Simple Browser may behave differently than external browsers
5. **Document styling architecture**: Make variable definitions discoverable

## Prevention

To avoid this issue in the future:

1. **Create variables before referencing them**: Add to `_variables.scss` first
2. **Use SASS partials**: Keep styles organized and discoverable
3. **Lint CSS**: Tools can catch undefined variable references
4. **Template inline styles sparingly**: Only for truly dynamic values
5. **Document variable conventions**: Maintain a style guide

## Related Files

- `src/ui/express/public/styles/partials/_variables.scss` - CSS custom property definitions
- `src/ui/express/public/styles/crawler.scss` - Main SASS entry point
- `src/ui/express/public/index.html` - Main crawler UI page
- `src/ui/express/public/crawler.css` - Compiled CSS output (generated, don't edit)
- `package.json` - Contains `sass:build` script

## See Also

- `docs/CLIENT_MODULARIZATION_PLAN.md` - UI architecture overview
- `docs/HTML_COMPOSITION_ARCHITECTURE.md` - HTML templating patterns
- AGENTS.md "UI Module Pattern" section - Frontend code organization
