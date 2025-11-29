# Plan – Design Studio Server App

## Objective
Create Design Studio app based on docsViewer, targeting the `design/` directory with a **Luxury White Leather, Industrial Obsidian Features** theme.

## Done When
- [x] Session created and plan documented
- [ ] Shared utilities extracted to common location (docTree, markdownRenderer, svgRenderer)
- [ ] Shared isomorphic controls extracted (ResizableSplitLayoutControl, etc.)
- [ ] Design Studio server created (`src/ui/server/designStudio/server.js`)
- [ ] Design Studio CSS with "Luxury White Leather, Industrial Obsidian Features" theme
- [ ] Design Studio client JS and build script
- [ ] App-specific controls created (DesignAppControl, DesignNavControl, DesignViewerControl)
- [ ] Server runs and serves design directory content
- [ ] Documentation in README.md
- [ ] Follow-ups recorded in `FOLLOW_UPS.md`

## Change Set (initial sketch)

### New Shared Location
- `src/ui/shared/utils/` - Shared utilities (docTree, markdownRenderer, svgRenderer)
- `src/ui/shared/isomorphic/` - Shared isomorphic controls (ResizableSplitLayoutControl, ContextMenuControl, etc.)

### Design Studio App
- `src/ui/server/designStudio/server.js` - Main Express server
- `src/ui/server/designStudio/public/design-studio.css` - Luxury White Leather theme
- `src/ui/server/designStudio/public/design-studio.js` - Client-side vanilla JS
- `src/ui/server/designStudio/public/design-studio-client.js` - Bundled jsgui3 client
- `src/ui/server/designStudio/isomorphic/` - App-specific controls
- `src/ui/server/designStudio/README.md` - Documentation

### Build Script
- `scripts/build-design-studio-client.js` - esbuild script for client bundle

### Updates to docsViewer
- Update imports to use shared utilities

## Theme: Luxury White Leather, Industrial Obsidian Features

**Color Palette:**
- Primary background: Soft white/cream leather texture feel (#FAFAFA, #F5F5F5)
- Secondary/nav background: Warm off-white (#F0EDE8)
- Accent: Industrial obsidian black (#1A1A1A, #2D2D2D)
- Gold/brass accents: #C9A227 (from the SVG designs)
- Text: Deep charcoal (#333333)
- Borders: Subtle warm gray (#E0DCD5)
- Highlights: Soft shadows, stitching patterns

**Visual Features:**
- Clean, premium feel
- Obsidian-black header/accents contrasting white leather body
- Subtle texture/grain on backgrounds
- Gold accent highlights on interactive elements
- Smooth transitions

## Risks & Mitigations
- **Risk**: Breaking docsViewer when extracting shared code
  - **Mitigation**: Extract to shared location first, then update docsViewer imports, test, then build designStudio
- **Risk**: CSS conflicts if both apps loaded
  - **Mitigation**: Use unique CSS class prefixes (`.design-` vs `.doc-`)

## Tests / Validation
- Manual test: docsViewer still works after shared extraction
- Manual test: designStudio serves design directory
- Manual test: Theme looks correct (Luxury White Leather style)
- Check script: Create `src/ui/server/checks/designStudio.check.js`
