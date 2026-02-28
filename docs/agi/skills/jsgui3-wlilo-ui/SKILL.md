---
name: jsgui3-wlilo-ui
description: "Use when designing or polishing jsgui3 UIs in the WLILO style (White Leather + Industrial Luxury Obsidian): tokens, panels, tables, icon actions, and interaction-safe styling. Triggers: jsgui3 ui design, wlilo ui, dashboard styling, table styling, controls styling, obsidian panel, white leather background."
---

# Skill: jsgui3 WLILO UI Design (Tokens + Controls)

## Triggers

- "jsgui3 UI design", "WLILO UI", "dashboard styling", "table styling", "obsidian panels", "white leather"

## Scope

Use this Skill to apply WLILO consistently to jsgui3 UIs:
- **Token-driven styling** (no ad-hoc colors)
- **Obsidian panels** on **leather backgrounds**
- **Action affordances** using the repo’s emoji-icon convention
- **UI performance hygiene** (keep control counts lean)

Out of scope:
- Fixing activation bugs (use `jsgui3-activation-debug`)
- Large UX redesigns (start a dedicated session)

## Inputs

- Which server / route / control you’re styling
- Surface type: `dashboard`, `table`, `detail`, `form`
- State model: what is selectable/active/error

## Procedure

### 0) Memory load + user-visible feedback (required)

Load:
- `docs/agi/skills/wlilo-design-system/SKILL.md`
- `docs/guides/WLILO_STYLE_GUIDE.md`
- `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`

Then emit (1–2 lines):
- `🧠 Memory pull (for this task) — Skills=jsgui3-wlilo-ui, wlilo-design-system | Guides=WLILO_STYLE_GUIDE, JSGUI3_UI_ARCHITECTURE_GUIDE | I/O≈<in>→<out>`
- `Back to the task: <task description>`

### 1) Use a small UI token set

Prefer CSS variables with semantic names:
- `--wlilo-bg`
- `--wlilo-panel`
- `--wlilo-panel-2`
- `--wlilo-border`
- `--wlilo-text`
- `--wlilo-text-muted`
- `--wlilo-gold`
- `--wlilo-blue` (optional)

Apply via container classes:
- `.wlilo-app` (sets base tokens)
- `.wlilo-panel` / `.wlilo-panel--subtle`
- `.wlilo-table` / `.wlilo-table__row`

Rule: **classes + tokens** over inline per-node styling.

### 2) WLILO layout rules for jsgui3 controls

- Background: leather tone/gradient on the page.
- Grouping: place dense information into obsidian panels.
- Borders: thin gold/neutral border; avoid heavy strokes.
- Typography: keep table text readable; use muted secondary text for metadata.

### 3) Action icon convention

Match repo UX convention:
- Search: `🔍`
- Settings: `⚙️`
- Add: `➕`
- Delete: `🗑️`
- Edit: `✏️`
- Refresh: `🔄`

Use icons consistently in buttons/links/toolbars.

### 4) Performance hygiene (avoid 1000+ controls)

- Keep control counts lean; prefer rendering plain HTML for repeated rows/cells.
- Lazy load / paginate / virtualize when lists exceed ~200 items.

## Validation

- If you changed a UI control’s markup: run its nearest `checks/*.check.js`.
- If you changed client-side assets: run `npm run ui:client-build`.
- If you changed behavior: run the smallest relevant Jest suite via `npm run test:by-path ...`.

## Anti-Patterns to Avoid

- **Inline Styling**: Writing raw `.style.background = '...'` in JavaScript instead of using stateful classes and CSS variables.
- **Control Thrashing**: Creating thousands of standard DOM nodes via jsgui3 controls for simple table cells instead of raw HTML where appropriate.

## References

- WLILO style: `docs/guides/WLILO_STYLE_GUIDE.md`
- Base WLILO tokens: `docs/agi/skills/wlilo-design-system/SKILL.md`
- jsgui3 UI architecture: `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`
- Activation debugging: `docs/agi/skills/jsgui3-activation-debug/SKILL.md`
