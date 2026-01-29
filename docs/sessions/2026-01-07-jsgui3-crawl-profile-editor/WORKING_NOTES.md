# Working Notes — jsgui3 Full Stack Crawl Profile Editor

## 2026-01-07 — Session created via CLI

### Findings: jsgui3-server bundling issues with linked packages

Attempted to use jsgui3-server with the full bundling pipeline (`new Server({ Ctrl, src_path_client_js })`), but encountered bundler errors due to symlinked packages:

```
X [ERROR] Cannot read directory ".../jsgui3-client/node_modules/jsgui3-html": The file cannot be accessed by the system.
```

**Root cause**: The esbuild bundler used by jsgui3-server cannot follow the symlink chain properly when:
- `jsgui3-client` is globally linked (lives in `nvm/v25.2.1/node_modules/`)
- `jsgui3-html` is locally linked (lives in `../jsgui3-html`)
- These packages reference each other through `node_modules/jsgui3-html` symlinks

**Workaround**: Use Express + jsgui3-html SSR approach with inline `<script>` for client interactivity. This is the same pattern used in the existing crawl strategies code.

### Lab Implementation

Created `labs/jsgui3-crawl-profile-editor/server.js` with:
- Express server at port 3105
- jsgui3-html SSR rendering via `makeDocument()`, `makeEl()`, `html()`
- Inline client JavaScript for interactivity
- Mock profile/operation data

**Key pattern for collapsible sections:**
```javascript
// In _composeAdvancedSection()
const header = makeEl(ctx, 'div', { class: 'section-header', onclick: 'toggleAdvanced()' });
header.add(makeEl(ctx, 'button', { type: 'button', id: 'advancedToggle' }).add(text(ctx, '▼ Show')));

const content = makeEl(ctx, 'div', { id: 'advancedContent', style: 'display: none' });

// In client script
function toggleAdvanced() {
  const content = document.getElementById('advancedContent');
  const btn = document.getElementById('advancedToggle');
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '▲ Hide' : '▼ Show';
}
```

### Tasks Completed

1. ✅ Port the toggle fix to original crawl strategies code
2. ✅ Consider simplifying the existing code to match the lab pattern
3. ✅ **Document the SSR + inline JS pattern for future reference**
   - Added comprehensive new section 11 to `docs/guides/JSGUI3_SSR_ISOMORPHIC_CONTROLS.md`
   - Covers: esbuild symlink issues, Express + SSR pattern, collapsible sections, form handling, range sliders, when to use, migration path

### Documentation Added

Added **Section 11: Express + SSR Workaround for Linked Packages** to `docs/guides/JSGUI3_SSR_ISOMORPHIC_CONTROLS.md` covering:

1. **11.1 The Problem** — esbuild symlink limitations with nested linked packages
2. **11.2 The Solution** — Express + jsgui3-html SSR pattern overview
3. **11.3 Complete Implementation Pattern** — Full server setup example
4. **11.4 Collapsible Sections Pattern** — Toggle buttons with CSS/JS
5. **11.5 Form Handling Pattern** — Async form submission with status messages
6. **11.6 Range Slider with Live Update** — Input range with live value display
7. **11.7 When to Use This Pattern** — Decision guide
8. **11.8 Migration Path** — Moving back to jsgui3-server when packages are published
9. **11.9 Full Working Example** — Points to lab implementation
10. **11.10 Troubleshooting** — Common issues and fixes
