# UI Knowledge Sources

> **Consolidated reference for all jsgui3 and UI-related documentation.**
> When working on UI, controls, dashboards, or visualizations, consult these guides first.

## jsgui3 Core Guides

| Guide | Purpose | Priority | When to Read |
|-------|---------|----------|--------------|
| [JSGUI3_SSR_ISOMORPHIC_CONTROLS.md](JSGUI3_SSR_ISOMORPHIC_CONTROLS.md) | **Composition model, SSR patterns, client activation** — The definitive guide to how controls work | 🔴 CRITICAL | Before creating/modifying ANY control |
| [JSGUI3_UI_ARCHITECTURE_GUIDE.md](JSGUI3_UI_ARCHITECTURE_GUIDE.md) | Architecture overview, activation flow, experiments | 🔴 CRITICAL | Understanding control lifecycle |
| [JSGUI3_SHARED_CONTROLS_CATALOG.md](JSGUI3_SHARED_CONTROLS_CATALOG.md) | Complete inventory of reusable controls | 🟡 HIGH | Before creating new controls |
| [JSGUI3_PERFORMANCE_PATTERNS.md](JSGUI3_PERFORMANCE_PATTERNS.md) | Lazy rendering, control counting, optimization | 🟡 HIGH | Performance issues or large datasets |
| [JSGUI3_MVVM_PATTERNS.md](JSGUI3_MVVM_PATTERNS.md) | Data binding, computed properties, validators | 🟡 HIGH | Forms, complex state management |
| [JSGUI3_WINDOW_CONTROL_GUIDE.md](JSGUI3_WINDOW_CONTROL_GUIDE.md) | Floating windows, dialogs, z-index | 🟢 NORMAL | Tool panels, result viewers |
| [JSGUI3_COGNITIVE_TOOLKIT.md](JSGUI3_COGNITIVE_TOOLKIT.md) | Research methods, anti-patterns | 🟢 NORMAL | When stuck |

## Key Terminology

**Composition vs Rendering** (from SSR guide):

| Term | Meaning | Who Does It |
|------|---------|-------------|
| **Composition** | Building the control tree—adding children, setting properties | Your code |
| **Rendering** | Converting to HTML strings or DOM elements | jsgui3 (automatic) |

- Use `_compose*` method names, NOT `_render*`
- You **compose** controls; jsgui3 **renders** them

## Golden Rules (Quick Reference)

1. **Call `this.compose()` in constructor** — Required for SSR
2. **Pass `context` to ALL child controls** — Or nothing renders
3. **Use `dom.attributes.href` for links** — NOT `attr: { href }`
4. **Use `--detached` for servers** — So terminal stays available

## Visualization Guides

| Guide | Purpose | When to Read |
|-------|---------|--------------|
| [SVG_CREATION_METHODOLOGY.md](SVG_CREATION_METHODOLOGY.md) | 6-stage SVG pipeline, structure → layout → theme | Creating diagrams |
| [WLILO_STYLE_GUIDE.md](WLILO_STYLE_GUIDE.md) | White Leather + Industrial Luxury Obsidian aesthetic | Theming, styling |

## Testing & Debugging

| Guide | Purpose | When to Read |
|-------|---------|--------------|
| [TEST_HANGING_PREVENTION_GUIDE.md](TEST_HANGING_PREVENTION_GUIDE.md) | Preventing "Jest did not exit" warnings | E2E tests with servers |
| [PUPPETEER_UI_WORKFLOW.md](PUPPETEER_UI_WORKFLOW.md) | Browser console/network capture | Debugging UI routes |
| [ANTI_PATTERN_CATALOG.md](ANTI_PATTERN_CATALOG.md) | Quick lookup by symptom | When something "doesn't work" |
| [JSGUI3_DEBUGGING_GUIDE.md](JSGUI3_DEBUGGING_GUIDE.md) | Debugging activation issues | ctrl.dom.el is null, events not firing |

## Quick Discovery Commands

```bash
# Search jsgui3 guides specifically
node tools/dev/md-scan.js --dir docs/guides --search "compose" "activation" --json

# Search for control examples
node tools/dev/js-scan.js --dir src/ui/controls --search "compose" --json

# Check session history for UI work
node tools/dev/md-scan.js --dir docs/sessions --search "jsgui3" "control" --json
```

---

*This is a satellite file. Agent files should reference it rather than duplicating this content.*
