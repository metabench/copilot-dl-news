# Working Notes – Increase crawl widget log area

- 2025-12-07 — Session created via CLI. Add incremental notes here.
- 2025-12-07 — md-scan for "crawl widget" (session docs only).
- 2025-12-07 — Increased CrawlLogViewer visible lines (8) and widened snippet to 120 chars; rebuilt renderer bundle with esbuild.
- 2025-12-07 — Fixed progress stats not updating (URLs, Queue, Articles, Errors were stuck at 0):
  - Root cause: main.js only parsed `{"type":"progress"...}` format but crawler outputs `PROGRESS {...}` format
  - Fixed by adding Format 2 parsing in main.js for `PROGRESS {visited, queueSize, errors, saved, ...}` lines
  - Added `--progress-json` CLI flag support in overrideHelpers.js and CrawlOperation.js
- 2025-12-07 — Added log filtering popup with checkbox filters:
  - Filter button in log header shows/hides dropdown popup
  - 11 activity types: downloaded, queued, skipped, error, throttled, discovery, pagination, started, finished, crawling, info
  - Each type has icon, label, and color (emerald/ruby/sapphire/gold/amethyst)
  - All/None quick toggle buttons in popup header
  - Filter badge shows active count (e.g. "8/11") when some filters disabled
  - Activity type auto-detected from log text via `_detectActivityType()` pattern matching
  - Filters apply in `_renderLines()` before slicing to visible count

## Log Filtering Feature – How It Works

### UI Components
1. **Filter Button** (🔽) – In log header, toggles popup visibility
2. **Filter Badge** – Shows "X/Y" count when some types are filtered out (hidden when all enabled)
3. **Filter Popup** – Positioned dropdown with:
   - Header row with All/None quick buttons
   - Checkbox list with icon + label for each activity type

### Activity Types Detected
| Type | Icon | Detection Pattern | Color |
|------|------|-------------------|-------|
| downloaded | ✓ | "downloaded", "saved article" | emerald |
| queued | ➕ | "queued", "enqueued", "added to queue" | sapphire |
| skipped | ⏭️ | "skipped", "already visited", "filtered" | text |
| error | ⚠️ | "error", "failed", "exception" | ruby |
| throttled | 🐢 | "rate limit", "429", "throttle" | gold |
| discovery | 🗺️ | "sitemap", "archive" | amethyst |
| pagination | 📄 | "page=", "/page/" | sapphire |
| started | ▶️ | "started", "beginning" | emerald |
| finished | ⏹️ | "finished", "completed", "stopped" | gold |
| crawling | 🕷️ | "crawling", "fetching" | text |
| info | • | (default fallback) | text |

### Implementation Details
- **State**: `_activeFilters` (Set of enabled type IDs), `_filterPopupVisible` (boolean)
- **Rendering**: `_renderLines()` filters `_lines` array by `_activeFilters.has(line.activityType)` before display
- **Event Handlers**: Set up in `activate()` method for filter button, checkboxes, All/None buttons
- **Click-outside-to-close**: Document click listener in activate() closes popup when clicking elsewhere
- **CSS Classes**: `.cw-log-filter-popup`, `.cw-log-filter-popup__item--{color}`, `.cw-log-filter-badge`, `.cw-hidden`
