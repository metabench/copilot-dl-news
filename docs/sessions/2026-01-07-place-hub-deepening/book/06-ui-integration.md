# UI Integration

The Hub Depth logic is integrated into the `PlaceHubGuessingMatrixControl` to provide visibility into the depth probing process.

## Cell State Model (6 States)

The matrix uses a 6-state model for cell visualization:

| State | Glyph | CSS Class | Meaning |
|-------|-------|-----------|---------|
| Unchecked | (empty) | `cell--unchecked` | No data yet |
| Guessed | `?` | `cell--guessed` | Candidate URL predicted |
| Pending | `•` | `cell--pending` | Verification in progress |
| Verified Present | `✓` | `cell--verified-present` | Hub confirmed to exist |
| **Deep Hub** | `✓` + count | `cell--deep-hub` | Hub with 10+ pages |
| Verified Absent | `×` | `cell--verified-absent` | Hub does not exist |

## Deep Hub Visual Indicators

When a verified hub has been depth-probed and found to have significant archive depth (10+ pages):

### Visual Treatment
```css
/* Green underline to indicate deep archive */
.cell--deep-hub {
  background: rgba(74,222,128,0.28);
  box-shadow: inset 0 -2px 0 var(--ok);
}

/* Page count badge */
.cell-depth {
  font-size: 9px;
  color: rgba(74,222,128,0.85);
  margin-left: 2px;
}
```

### Glyph Format
- **Checkmark + Count**: `✓1.9k` (for 1924 pages)
- Numbers are formatted with "k" suffix for thousands

### Tooltip Content
Hovering over a deep hub cell shows:
- `depth=X pages` — Maximum pagination depth
- `oldest=YYYY-MM-DD` — Oldest article date found
- `depth_checked=Xd ago` — Freshness of depth check

## Matrix Stats Header

The stats bar shows aggregate counts:

```javascript
// Stats displayed in header
`${stats.verifiedPresent} verified | ${stats.deepHubs} deep | ${stats.depthChecked} probed | ${stats.guessed} guessed`
```

Where:
- **verified**: Hubs confirmed to exist (all depths)
- **deep**: Hubs with `max_page_depth >= 10`
- **probed**: Hubs that have been depth-checked
- **guessed**: Candidate URLs not yet verified

## Implementation Files

### Query Layer
**File**: `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`

Fetches depth columns for each mapping:
- `max_page_depth`
- `oldest_content_date`
- `last_depth_check_at`

Calculates depth stats:
```javascript
let deepHubCount = 0;
let depthCheckedCount = 0;
// Count verified present hubs with maxDepth >= 10 as deep hubs
```

### UI Control
**File**: `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`

Methods updated:
- `_cellTd()` — Renders cell content with depth indicator
- `_buildStyles()` — Includes deep-hub CSS classes
- `_buildLegend()` — Shows "Deep Hub (10+ pages)" entry

## DB Adapter Pattern

All SQL queries live in the database adapter layer, not in UI controls:

```javascript
// CORRECT: Query in adapter
// src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js
function getMatrixData(db, options) {
  const rows = db.prepare(`
    SELECT m.*, p.name, ...
    FROM place_page_mappings m
    ...
  `).all();
  return rows;
}

// CORRECT: UI uses adapter
// src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js
const data = placeHubGuessingUiQueries.getMatrixData(this.db, options);
```

This separation ensures:
- Single source of truth for queries
- Easier testing and mocking
- Clear responsibility boundaries
