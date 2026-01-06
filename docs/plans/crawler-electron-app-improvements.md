# Crawler Electron App — Improvement Implementation Plan

> **Created**: 2026-01-03  
> **Status**: Planning  
> **Priority**: High (UX polish for production readiness)

---

## Executive Summary

This document details implementation plans for 10 identified issues in the Crawler Electron App. Each issue includes root cause analysis, proposed solution, affected files, implementation steps, and testing criteria.

---

## Issue 1: Counter Discrepancy (downloaded vs visited)

### Problem Statement
The main progress counter shows "4" while the URLs page claims "11 items". This confuses users about actual crawl progress.

### Root Cause
- **`pagesDownloaded`** only counts network fetches (source === 'network')
- **`pagesVisited`** counts all pages processed (network + cache)
- **`downloadedUrls.length`** counts all PAGE events received
- The progress ring uses `downloaded` while URL list uses array length

### Proposed Solution
**Option A (Recommended)**: Show both metrics in the UI
- Main counter: Show `visited` (all pages processed)
- Secondary indicator: Show cache hit ratio

**Option B**: Align on single metric
- Use `visited` everywhere for consistency

### Affected Files
```
src/ui/electron/crawlerApp/main.js       # Parse visited from PROGRESS JSON
src/ui/electron/crawlerApp/renderer.js   # Display logic
src/ui/electron/crawlerApp/index.html    # Add cache indicator element
src/ui/electron/crawlerApp/styles.css    # Style cache indicator
```

### Implementation Steps

#### Step 1: Update main.js PROGRESS parsing
```javascript
// In crawlProcess.stdout.on('data', ...)
else if (trimmed.startsWith('PROGRESS ')) {
  try {
    const json = JSON.parse(trimmed.slice(9));
    // Track both metrics
    crawlState.visited = json.visited ?? crawlState.visited ?? 0;
    crawlState.downloaded = json.downloaded ?? crawlState.downloaded ?? 0;
    crawlState.queued = json.queueSize || 0;
    crawlState.errors = json.errors || 0;
    crawlState.cacheHits = (json.visited || 0) - (json.downloaded || 0);
    sendUpdate();
  } catch (e) {}
}
```

#### Step 2: Update renderer.js progress display
```javascript
function updateProgress(visited, maxPages, cacheHits = 0) {
  // Use visited for main progress
  const percent = Math.min(1, visited / maxPages);
  // ... existing ring/bar updates using visited ...
  
  // Show cache indicator
  const cacheEl = document.getElementById('cacheIndicator');
  if (cacheEl && cacheHits > 0) {
    cacheEl.textContent = `${cacheHits} cached`;
    cacheEl.style.display = 'block';
  }
}
```

#### Step 3: Add cache indicator to index.html
```html
<div class="progress-bar-labels">
  <span id="progressPercent">0%</span>
  <span id="cacheIndicator" class="cache-indicator" style="display:none"></span>
  <span id="progressEta">--:--</span>
</div>
```

#### Step 4: Style the cache indicator
```css
.cache-indicator {
  color: var(--warning);
  font-size: 10px;
  text-transform: uppercase;
}
```

### Testing Criteria
- [ ] Progress counter matches URL list count
- [ ] Cache indicator appears when cache hits > 0
- [ ] ETA calculation uses correct base (visited, not downloaded)
- [ ] Completion detection uses visited >= maxPages

---

## Issue 2: PROGRESS Updates Throttled (Laggy Counter)

### Problem Statement
Progress counter updates in batches because CrawlerEvents throttles to 300ms minimum intervals.

### Root Cause
```javascript
// CrawlerEvents.js:78
if (!force && now - this._lastProgressEmitAt < 300) return;
```

### Proposed Solution
**Don't modify crawler internals.** Instead, update the UI counter locally when PAGE events arrive, then reconcile with PROGRESS JSON.

### Affected Files
```
src/ui/electron/crawlerApp/main.js       # Hybrid counting logic
```

### Implementation Steps

#### Step 1: Track local counter alongside PROGRESS counter
```javascript
let localPageCount = 0;  // Incremented on every PAGE event

crawlProcess.stdout.on('data', (data) => {
  // ...
  if (trimmed.startsWith('PAGE ')) {
    localPageCount++;
    // Use MAX of local count and last PROGRESS value for smooth display
    crawlState.visited = Math.max(localPageCount, crawlState.visited || 0);
    // ... rest of PAGE handling ...
  }
  else if (trimmed.startsWith('PROGRESS ')) {
    // PROGRESS is authoritative - reconcile
    const json = JSON.parse(trimmed.slice(9));
    crawlState.visited = json.visited ?? localPageCount;
    // Reset local if significantly different (sync point)
    if (Math.abs(localPageCount - (json.visited || 0)) > 5) {
      localPageCount = json.visited || 0;
    }
    // ... rest ...
  }
});
```

### Testing Criteria
- [ ] Counter increments smoothly (no visible jumps of >2)
- [ ] Final count matches authoritative PROGRESS value
- [ ] No duplicate increments

---

## Issue 3: Loading Overlay Shows Too Long

### Problem Statement
"Starting crawler..." overlay visible for several seconds while crawl is already running.

### Root Cause
Overlay waits for `state.running === true` in first update, but:
1. PROGRESS events are throttled (300ms)
2. First PAGE events may arrive before first PROGRESS
3. Crawl initialization (robots.txt, sitemap) takes time

### Proposed Solution
Hide overlay as soon as ANY crawl activity is detected (PAGE event or PROGRESS).

### Affected Files
```
src/ui/electron/crawlerApp/main.js       # Send hide signal earlier
src/ui/electron/crawlerApp/renderer.js   # React to any activity
```

### Implementation Steps

#### Step 1: Send loading:hide on first PAGE event
```javascript
let loadingHidden = false;

if (trimmed.startsWith('PAGE ')) {
  if (!loadingHidden) {
    mainWindow.webContents.send('loading:hide');
    loadingHidden = true;
  }
  // ... rest ...
}
```

#### Step 2: Also hide on startup-progress events
```javascript
if (trimmed.startsWith('STARTUP ') || trimmed.includes('robots.txt') || trimmed.includes('sitemap')) {
  // Update loading text to show what's happening
  mainWindow.webContents.send('loading:show', 'Loading robots.txt...');
}
```

#### Step 3: Add startup phase messages
```javascript
// Parse startup progress from crawler
if (trimmed.includes('Fetching robots')) {
  mainWindow.webContents.send('loading:show', 'Checking robots.txt...');
}
if (trimmed.includes('Parsing sitemap')) {
  mainWindow.webContents.send('loading:show', 'Parsing sitemap...');
}
if (trimmed.includes('Queue seeded')) {
  mainWindow.webContents.send('loading:show', 'Starting crawl...');
}
```

### Testing Criteria
- [ ] Overlay hides within 1 second of crawl start
- [ ] Startup phases shown (robots, sitemap, etc.)
- [ ] No flash of overlay when not auto-starting

---

## Issue 4: Tab Bar State Not Updated on Detail View

### Problem Statement
When viewing URL details, tab bar shows "URLs" as active, but navigating back doesn't always sync state.

### Root Cause
`showScreen()` updates tab bar, but detail screen is navigated via `showDetail()` which calls `showScreen('detail')`. The detail screen isn't in the tab bar, so no tab appears active.

### Proposed Solution
Keep parent tab active when in child screens. Detail is a child of URLs.

### Affected Files
```
src/ui/electron/crawlerApp/renderer.js   # Navigation logic
```

### Implementation Steps

#### Step 1: Track parent-child screen relationships
```javascript
const screenParents = {
  home: null,
  urls: null,
  detail: 'urls',    // detail is child of urls
  settings: null
};

function showScreen(name) {
  currentScreen = name;
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  
  // Update tab bar - use parent if current screen not in tabs
  const tabScreen = screenParents[name] || name;
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.screen === tabScreen);
  });
  
  // Focus management...
}
```

### Testing Criteria
- [ ] URLs tab stays highlighted when viewing details
- [ ] Back from detail returns to URLs with URLs tab active
- [ ] Tab clicks from detail go to correct screen

---

## Issue 5: Search/Filter Bar Not Implemented

### Problem Statement
The `🔍 Filter URLs...` element is non-functional placeholder.

### Root Cause
No click handler or input functionality implemented.

### Proposed Solution
Convert to real input with live filtering.

### Affected Files
```
src/ui/electron/crawlerApp/index.html    # Convert div to input
src/ui/electron/crawlerApp/renderer.js   # Add filter logic
src/ui/electron/crawlerApp/styles.css    # Style input state
```

### Implementation Steps

#### Step 1: Replace div with input in HTML
```html
<input type="text" class="search-bar" id="searchBar" 
       placeholder="🔍 Filter URLs..." 
       tabindex="0">
```

#### Step 2: Add filter logic in renderer
```javascript
let urlFilter = '';

document.getElementById('searchBar').addEventListener('input', (e) => {
  urlFilter = e.target.value.toLowerCase();
  renderUrlList();
});

function renderUrlList() {
  const list = document.getElementById('urlList');
  
  // Apply filter
  const filtered = urlFilter 
    ? currentUrls.filter(item => item.url.toLowerCase().includes(urlFilter))
    : currentUrls;
  
  document.getElementById('urlCount').textContent = 
    urlFilter 
      ? `${filtered.length} of ${currentUrls.length} items`
      : `${currentUrls.length} items`;
  
  if (filtered.length === 0) {
    list.innerHTML = urlFilter
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><div>No URLs match "${urlFilter}"</div></div>`
      : `<div class="empty-state"><div class="empty-icon">📭</div><div>No URLs downloaded yet</div></div>`;
    return;
  }
  
  // ... render filtered list ...
}
```

#### Step 3: Add keyboard shortcut
```javascript
// In keydown handler
if (e.key === '/' && currentScreen === 'urls' && !e.target.matches('input')) {
  e.preventDefault();
  document.getElementById('searchBar').focus();
}
```

#### Step 4: Style focused input
```css
.search-bar {
  background: var(--bg-card);
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-bottom: 12px;
  color: var(--text);
  font-size: 13px;
  width: 100%;
  transition: var(--transition);
}
.search-bar::placeholder { color: var(--text-dim); }
.search-bar:focus {
  outline: none;
  border-color: var(--success);
  background: var(--bg-card-hover);
}
```

### Testing Criteria
- [ ] Typing filters URL list in real-time
- [ ] Count updates to show "X of Y items"
- [ ] Empty state shows when no matches
- [ ] `/` key focuses search when in URLs view
- [ ] Escape clears filter and blurs input

---

## Issue 6: Settings Input Validation

### Problem Statement
Users can enter invalid values (negative numbers, empty URLs, non-numeric text).

### Proposed Solution
Add validation on blur and before save, with visual feedback.

### Affected Files
```
src/ui/electron/crawlerApp/renderer.js   # Validation logic
src/ui/electron/crawlerApp/styles.css    # Error state styles
```

### Implementation Steps

#### Step 1: Define validation rules
```javascript
const VALIDATION = {
  url: {
    validate: (v) => {
      try { new URL(v); return true; } 
      catch { return false; }
    },
    message: 'Enter a valid URL (https://...)',
    sanitize: (v) => v.trim()
  },
  maxPages: {
    validate: (v) => Number.isInteger(+v) && +v >= 1 && +v <= 100000,
    message: 'Enter 1-100000',
    sanitize: (v) => Math.max(1, Math.min(100000, parseInt(v, 10) || 1000))
  },
  maxDepth: {
    validate: (v) => Number.isInteger(+v) && +v >= 0 && +v <= 10,
    message: 'Enter 0-10',
    sanitize: (v) => Math.max(0, Math.min(10, parseInt(v, 10) || 3))
  },
  timeout: {
    validate: (v) => Number.isInteger(+v) && +v >= 5 && +v <= 300,
    message: 'Enter 5-300 seconds',
    sanitize: (v) => Math.max(5, Math.min(300, parseInt(v, 10) || 60))
  }
};
```

#### Step 2: Add blur validation
```javascript
['inputUrl', 'inputMaxPages', 'inputMaxDepth', 'inputTimeout'].forEach(id => {
  const input = document.getElementById(id);
  const field = id.replace('input', '').toLowerCase();
  const rule = VALIDATION[field === 'url' ? 'url' : field];
  
  input.addEventListener('blur', () => {
    if (!rule.validate(input.value)) {
      input.classList.add('input-error');
      showToast(rule.message, true);
    } else {
      input.classList.remove('input-error');
    }
  });
});
```

#### Step 3: Validate before save
```javascript
document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  const values = {
    url: document.getElementById('inputUrl').value,
    maxPages: document.getElementById('inputMaxPages').value,
    maxDepth: document.getElementById('inputMaxDepth').value,
    timeout: document.getElementById('inputTimeout').value
  };
  
  // Check all validations
  const errors = [];
  for (const [field, rule] of Object.entries(VALIDATION)) {
    const inputId = field === 'url' ? 'inputUrl' : `input${field.charAt(0).toUpperCase() + field.slice(1)}`;
    if (!rule.validate(values[field])) {
      errors.push(field);
      document.getElementById(inputId).classList.add('input-error');
    }
  }
  
  if (errors.length > 0) {
    showToast(`Invalid: ${errors.join(', ')}`, true);
    return;
  }
  
  // Sanitize and save
  await window.crawlerAPI.setConfig({
    url: VALIDATION.url.sanitize(values.url),
    maxPages: VALIDATION.maxPages.sanitize(values.maxPages),
    maxDepth: VALIDATION.maxDepth.sanitize(values.maxDepth),
    timeout: VALIDATION.timeout.sanitize(values.timeout) * 1000
  });
  
  showToast('Settings saved');
  showScreen('home');
});
```

#### Step 4: Add error styles
```css
.setting-input.input-error {
  color: var(--error);
  border-bottom: 1px solid var(--error);
}
```

### Testing Criteria
- [ ] Invalid URL shows error on blur
- [ ] Negative numbers rejected
- [ ] Non-numeric input sanitized to default
- [ ] Save blocked until all fields valid
- [ ] Error toast shows specific field

---

## Issue 7: Rate/ETA Warm-up Period

### Problem Statement
Rate shows `0/s` and ETA shows `calculating...` for several seconds at start.

### Root Cause
`rateHistory` needs multiple samples over time to compute rate.

### Proposed Solution
1. Show "warming up..." instead of "0/s" initially
2. Use instant rate (pages / elapsed) as fallback
3. Smooth transition to sliding window rate

### Affected Files
```
src/ui/electron/crawlerApp/renderer.js   # Rate calculation
```

### Implementation Steps

#### Step 1: Improve calculateRate with fallback
```javascript
function calculateRate() {
  const now = Date.now();
  rateHistory.push({ time: now, count: state.downloaded });
  rateHistory = rateHistory.filter(r => now - r.time < 10000);
  
  // Need at least 2 samples with 1+ second gap
  if (rateHistory.length < 2) {
    // Fallback: instant rate from start
    if (state.startTime && state.downloaded > 0) {
      const elapsed = (now - state.startTime) / 1000;
      if (elapsed > 1) {
        return (state.downloaded / elapsed).toFixed(1) + '/s';
      }
    }
    return 'warming...';
  }
  
  const first = rateHistory[0];
  const last = rateHistory[rateHistory.length - 1];
  const elapsed = (last.time - first.time) / 1000;
  
  if (elapsed < 1) return 'warming...';
  
  const rate = (last.count - first.count) / elapsed;
  return rate.toFixed(1) + '/s';
}
```

#### Step 2: Improve ETA with minimum display threshold
```javascript
// In updateProgress()
if (etaEl && state.startTime && downloaded > 0 && state.running) {
  const elapsed = (Date.now() - state.startTime) / 1000;
  
  // Need at least 3 seconds of data
  if (elapsed < 3) {
    etaEl.textContent = 'calculating...';
  } else {
    const rate = downloaded / elapsed;
    const remaining = maxPages - downloaded;
    const etaSec = rate > 0 ? remaining / rate : 0;
    
    if (etaSec > 0 && etaSec < 36000) {
      const mins = Math.floor(etaSec / 60);
      const secs = Math.floor(etaSec % 60);
      etaEl.textContent = `ETA ${mins}:${secs.toString().padStart(2, '0')}`;
    } else if (etaSec >= 36000) {
      etaEl.textContent = 'ETA 10+ hours';
    } else {
      etaEl.textContent = 'calculating...';
    }
  }
}
```

### Testing Criteria
- [ ] "warming..." shown for first 2-3 seconds
- [ ] Rate stabilizes to accurate value
- [ ] ETA appears within 5 seconds of crawl start
- [ ] No NaN or Infinity displayed

---

## Issue 8: Preset Chips Don't Reflect Loaded Config

### Problem Statement
When app loads saved config, no preset chip is highlighted if config matches a preset.

### Proposed Solution
Check loaded config against presets and highlight matching one.

### Affected Files
```
src/ui/electron/crawlerApp/renderer.js   # Config load logic
```

### Implementation Steps

#### Step 1: Add preset detection function
```javascript
function detectPreset(cfg) {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (cfg.maxPages === preset.maxPages &&
        cfg.maxDepth === preset.maxDepth &&
        cfg.timeout === preset.timeout) {
      return name;
    }
  }
  return null;  // Custom config
}
```

#### Step 2: Update chip state when config loads
```javascript
function updateUI(data) {
  if (data.config) {
    config = data.config;
    // ... existing updates ...
    
    // Detect and highlight matching preset
    const matchingPreset = detectPreset(config);
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === matchingPreset);
    });
  }
  // ...
}
```

#### Step 3: Add "Custom" indicator when no preset matches
```html
<!-- In settings section -->
<div class="preset-row">
  <button class="preset-chip" data-preset="quick" tabindex="0">Quick (10p)</button>
  <button class="preset-chip" data-preset="standard" tabindex="0">Standard</button>
  <button class="preset-chip" data-preset="deep" tabindex="0">Deep (500p)</button>
  <button class="preset-chip custom" data-preset="custom" tabindex="0" disabled>Custom</button>
</div>
```

```javascript
// When no preset matches
if (!matchingPreset) {
  document.querySelector('[data-preset="custom"]').classList.add('active');
} else {
  document.querySelector('[data-preset="custom"]').classList.remove('active');
}
```

### Testing Criteria
- [ ] Standard preset highlighted on fresh load
- [ ] Correct preset highlighted after save
- [ ] Custom shown when values don't match any preset
- [ ] Clicking preset clears Custom state

---

## Issue 9: No Keyboard Shortcut for Start/Stop

### Problem Statement
No quick keyboard shortcut to start or stop the crawl.

### Proposed Solution
Add `Ctrl+Enter` or `F5` as global start/stop toggle.

### Affected Files
```
src/ui/electron/crawlerApp/renderer.js   # Keyboard handler
```

### Implementation Steps

#### Step 1: Add shortcut in keydown handler
```javascript
document.addEventListener('keydown', async (e) => {
  // Ctrl+Enter or F5 = Toggle crawl
  if ((e.ctrlKey && e.key === 'Enter') || e.key === 'F5') {
    e.preventDefault();
    if (state.running) {
      await window.crawlerAPI.stopCrawl();
      showToast('Crawl paused');
    } else {
      rateHistory = [];
      await window.crawlerAPI.startCrawl();
      showToast('Crawl started');
    }
    return;
  }
  
  // ... existing shortcuts ...
});
```

#### Step 2: Add shortcut hint to button
```html
<button class="btn-primary" id="btnAction" tabindex="0" title="Start/Stop (Ctrl+Enter or F5)">
  Start Crawl
</button>
```

### Testing Criteria
- [ ] Ctrl+Enter starts crawl when stopped
- [ ] Ctrl+Enter stops crawl when running
- [ ] F5 works as alternative
- [ ] Toast confirms action
- [ ] Works from any screen

---

## Issue 10: URL List Performance with Large Counts

### Problem Statement
With 1000+ URLs, the URL list renders all items, causing potential performance issues.

### Proposed Solution
Implement virtual scrolling or pagination.

### Affected Files
```
src/ui/electron/crawlerApp/renderer.js   # Render logic
src/ui/electron/crawlerApp/styles.css    # Virtual scroll styles
```

### Implementation Steps

#### Step 1: Add pagination constants
```javascript
const PAGE_SIZE = 50;
let urlPage = 0;
```

#### Step 2: Paginate renderUrlList
```javascript
function renderUrlList() {
  const list = document.getElementById('urlList');
  
  const filtered = urlFilter 
    ? currentUrls.filter(item => item.url.toLowerCase().includes(urlFilter))
    : currentUrls;
  
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const start = urlPage * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);
  
  document.getElementById('urlCount').textContent = 
    `${start + 1}-${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`;
  
  // Render current page
  let html = pageItems.map((item, i) => {
    // ... existing item rendering with index = start + i ...
  }).join('');
  
  // Add pagination controls
  if (totalPages > 1) {
    html += `
      <div class="pagination">
        <button class="pagination-btn" id="prevPage" ${urlPage === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pagination-info">Page ${urlPage + 1} of ${totalPages}</span>
        <button class="pagination-btn" id="nextPage" ${urlPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>
    `;
  }
  
  list.innerHTML = html;
  
  // Pagination handlers
  document.getElementById('prevPage')?.addEventListener('click', () => {
    if (urlPage > 0) { urlPage--; renderUrlList(); }
  });
  document.getElementById('nextPage')?.addEventListener('click', () => {
    if (urlPage < totalPages - 1) { urlPage++; renderUrlList(); }
  });
  
  // ... click handlers for items ...
}
```

#### Step 3: Reset page on filter change
```javascript
document.getElementById('searchBar').addEventListener('input', (e) => {
  urlFilter = e.target.value.toLowerCase();
  urlPage = 0;  // Reset to first page
  renderUrlList();
});
```

#### Step 4: Add pagination styles
```css
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--border);
  margin-top: 8px;
}
.pagination-btn {
  background: var(--bg-card);
  border: none;
  color: var(--success);
  padding: 8px 16px;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 12px;
}
.pagination-btn:disabled {
  color: var(--text-dim);
  cursor: not-allowed;
}
.pagination-btn:not(:disabled):hover {
  background: var(--bg-card-hover);
}
.pagination-info {
  color: var(--text-muted);
  font-size: 11px;
}
```

### Testing Criteria
- [ ] Only 50 items rendered at a time
- [ ] Pagination controls appear when > 50 URLs
- [ ] Prev/Next navigate correctly
- [ ] Filter resets to page 1
- [ ] Page info shows correct range

---

## Implementation Order

### Phase 1: Critical Fixes (High Impact, Low Risk)
1. **Issue 1**: Counter discrepancy — Fixes user confusion
2. **Issue 3**: Loading overlay — Improves perceived performance
3. **Issue 9**: Keyboard shortcut — Quick win for power users

### Phase 2: Polish (Medium Impact)
4. **Issue 2**: Throttled updates — Smoother experience
5. **Issue 7**: Rate warm-up — Better feedback
6. **Issue 4**: Tab bar state — Navigation consistency

### Phase 3: Features (User-Requested)
7. **Issue 5**: Search filter — Functional requirement
8. **Issue 6**: Input validation — Data integrity
9. **Issue 8**: Preset detection — Settings UX

### Phase 4: Scale (Future-Proofing)
10. **Issue 10**: Pagination — Performance at scale

---

## Testing Checklist

### Manual Testing
- [ ] Fresh start without config file
- [ ] Load with existing config
- [ ] Auto-start crawl (--auto-start)
- [ ] Manual start/stop
- [ ] Navigate all screens via tabs
- [ ] Navigate all screens via keyboard
- [ ] Filter URLs with various patterns
- [ ] View URL details
- [ ] Change settings and save
- [ ] Use presets
- [ ] Complete 1000-page crawl
- [ ] Handle crawl errors gracefully

### Edge Cases
- [ ] Empty URL list
- [ ] Single URL
- [ ] 1000+ URLs
- [ ] All cache hits (no network)
- [ ] All network (no cache)
- [ ] Crawl stopped mid-way
- [ ] Invalid config file
- [ ] Network disconnect during crawl

---

## Appendix: File Structure

```
src/ui/electron/crawlerApp/
├── main.js              # Electron main process, IPC, crawl subprocess
├── preload.js           # Context bridge for renderer
├── renderer.js          # UI logic, event handlers, state management
├── index.html           # UI structure
├── styles.css           # Styling
└── crawler-config.json  # Persisted configuration
```

---

## Notes

- All changes should be backward-compatible with existing config files
- No changes to crawler internals (src/crawler/*) required
- Changes can be made while app is running; reload (Ctrl+R in dev) picks them up
- For production, changes take effect on next app launch
