---
type: workflow
id: theme-schema-and-storage
status: canonical
audience: agents
tags:
  - ui
  - svg
  - theme
last-reviewed: 2026-02-12
---

# Theme Schema & Storage Workflow

**Scope**: Shared theme definitions for SVG, HTML, and jsgui3. Themes live in versioned JSON files, are queryable via the svg MCP tools, and are discoverable via the docs-memory MCP workflow listing.

## Schema (minimal, extensible)
- `name`, `displayName`, `description`, `aliases[]`
- `colors`: primary/accent/bg/border/text/success/warning/error/info (+ *_Bg variants)
- `typography`: font families, sizes, weights, line heights, letter spacing
- `spacing`: tokens (xs…3xl)
- `radii`: tokens (sm…full)
- `shadows`: tokens (sm, md, lg, glow, inner)
- `transitions`: tokens (fast, normal, slow)
- `svg`: palette for `background`, `surface`, `accent`, `status`, `text`, `connector`

## Storage
- JSON registry: `tools/dev/svg-templates/themes/*.json` (e.g., `obsidian.json`).
- Add themes by dropping a JSON file that follows the schema above; aliases allow friendly lookups.
- Fallback theme baked into `svg-mcp-tools` mirrors `obsidian.json` so queries never fail.

## MCP Access
- **SVG MCP** (`svg_theme`):
  - List: `svg_theme { action: "list" }` → available names + default.
  - Get: `svg_theme { action: "get", name: "obsidian" }` → tokens + `svg` palette + CSS variables.
- **Docs-memory MCP**: This workflow doc is readable via `docs_memory_getWorkflow` / `docs_memory_listWorkflows`, so agents can discover schema + storage from memory MCP.

## Applying Themes
- **SVG / svg-mcp tools**: Use `svg_theme` to fetch a palette, then feed colors into generators (`svg-gen.js`, `svg-components.js`) or MCP stamping plans.
- **HTML / jsgui3**: CSS variables returned by `svg_theme` follow the same naming as `themeService.themeConfigToCss`, so themes can be mapped into `:root` custom properties and reused in controls/layouts.

## Example Theme Snippet (obsidian)
```json
{
  "name": "obsidian",
  "colors": { "primary": "#1e293b", "accent": "#c9a227", "bg": "#0f172a", "text": "#f8fafc" },
  "typography": { "fontBody": "\"Inter\", -apple-system, sans-serif", "fontMono": "\"JetBrains Mono\", monospace" },
  "svg": { "background": { "primary": "#0a0d14" }, "accent": { "gold": "#c9a227" }, "text": { "primary": "#f0f4f8" } }
}
```

## Workflow
1) `svg_theme { action: "list" }` to pick a theme.
2) `svg_theme { action: "get", name: "<theme>" }` to retrieve tokens + `svg` palette + CSS variables.
3) Apply CSS variables to HTML/jsgui3 root; pass `svg` palette into generators/MCP stamp plans.
4) Commit new themes to `tools/dev/svg-templates/themes/` and note them in this workflow if schema changes.

---

## Resources for Non-Artist Agents

### Quick References
- **Theming Cookbook**: `tools/dev/svg-templates/THEMING_COOKBOOK.md` — step-by-step recipes, color palettes, component patterns
- **Snippet Library**: `tools/dev/svg-templates/snippets/*.json` — copy-paste ready defs blocks and component templates
- **Example SVG**: `tmp/decision-tree-editor-v2.svg` — reference implementation showing all patterns

### Memory MCP Lessons
Query `docs_memory_getLessons` with `sinceDate: "2025-12-10"` for:
- Gemstone button pattern (3-layer structure)
- Gemstone gradient recipes (Ruby/Emerald/Sapphire)
- Brushed metal gradient (5-stop alternating)
- Obsidian frame colors
- Drop shadow & gem glow filter recipes
- Decision tree edge curves (bezier formula)
- SVG layout hierarchy
- Form field styling

### Patterns Catalog
Query `docs_memory_getPatterns` for:
- **Luxury Gemstone UI Theme** — complete theme application steps
- **SVG MCP Element Construction Order** — MCP tool workflow

### White Leather × Obsidian Luxe Quick Start
1. Copy `defsBlock` from `snippets/white-leather-obsidian-defs.json` into your SVG
2. Use gradient IDs: `bgGradient`, `obsidianFrame`, `brushedMetal`, `rubyGem`, `emeraldGem`, `sapphireGem`
3. Use filter IDs: `dropShadow` (panels/frames), `gemGlow` (gems only)
4. Follow cookbook for component recipes
