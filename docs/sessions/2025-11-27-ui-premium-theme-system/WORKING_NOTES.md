# Working Notes: UI Premium Theme System

## Session Start: 2025-11-27

### Initial Discovery

**Current Architecture:**
- CSS embedded in `render-url-table.js` via `buildCss()` function
- Colors are hardcoded (no CSS variables)
- Typography: System fonts only
- No theming infrastructure exists

**Key Files:**
- `src/ui/render-url-table.js` - Main HTML renderer with embedded CSS
- `src/ui/server/dataExplorerServer.js` - Express server, all routes
- `src/ui/controls/` - jsgui3 control library

### Design Decisions

**Why CSS Custom Properties?**
- Runtime switchable without rebuild
- Native browser support, no JS overhead
- Cascade naturally with component styles
- Can be serialized/stored as JSON theme configs

**Font Choices:**
- **Playfair Display** - Elegant serif for headings (luxury feel)
- **Inter** - Highly readable UI font, excellent number legibility
- **JetBrains Mono** - Technical data, code snippets

**Color Philosophy:**
- Dark themes reduce eye strain for data-heavy viewing
- Gold/amber accents signal premium (classic luxury cue)
- High contrast ratios (WCAG AA minimum) for accessibility
- Subtle gradients for depth without distraction

### Implementation Order

1. Create theme service (database + defaults)
2. Update CSS to use variables
3. Add theme injection to HTML renderer
4. Create theme editor UI control
5. Wire up API routes
6. Add client-side theme application
7. Test and polish

---

## Commands & Outputs

(To be populated during implementation)

