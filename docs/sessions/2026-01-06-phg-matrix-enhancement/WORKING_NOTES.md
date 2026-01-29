# Working Notes – Place Hub Guessing Matrix Enhancement

- 2026-01-06 — Session created via CLI. Add incremental notes here.

## 2026-01-06 Implementation Progress

### Phase 1-2 Complete: 5-State Matrix UI

Implemented the 5-state matrix system for Place Hub Guessing:

| State | Glyph | CSS Class | Description |
|-------|-------|-----------|-------------|
| unchecked | (empty) | `cell--none` | No mapping exists |
| guessed | `?` | `cell--guessed` | Candidate from place_hubs, not yet verified |
| pending | `•` | `cell--pending` | Being actively probed/verified |
| verified-present | `✓` | `cell--verified-present` | Verified to exist |
| verified-absent | `×` | `cell--verified-absent` | Verified not to exist |

### Files Modified

1. **`src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`**
   - Added `guessedCount` to stats calculation
   - Candidates with `status: 'candidate'` now counted separately from pending

2. **`src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`**
   - Updated legend to show 5 states
   - Updated stats to show "Guessed" count
   - Updated `_cellTd()` for 5-state logic with distinct glyphs
   - Updated `_buildVirtualSpecialCells()` for virtual scrolling
   - Added CSS for `.cell--guessed` (amber/yellow styling)
   - Added article metrics to tooltips for verified-present cells

3. **`src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`**
   - Added checks for all 5 state CSS classes
   - Added checks for legend labels

### Validation

- ✅ Check script: 27/27 checks passed
- ✅ No lint/type errors
- ✅ Server starts and renders matrix

### Visual Changes

- **Guessed cells**: Amber background (`rgba(251,191,36,0.28)`) with `?` glyph
- **Pending cells**: Gray background (`rgba(156,163,175,0.22)`) with `•` glyph
- **Tooltips**: Now include `articles=N` and `nav_links=N` for verified hubs

### Next Steps (Phase 3-6)

- [ ] Hub detail panel with article timeline
- [ ] Coverage dashboard
- [ ] Action buttons (verify, re-probe)
- [ ] Article metrics query functions for date range and coverage %
