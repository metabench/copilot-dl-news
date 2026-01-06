# jsgui3 Idiomatic Progress UI Lab

**Lab Type**: Pattern investigation and documentation  
**Created**: 2026-01-04  
**Session**: [docs/sessions/2026-01-04-jsgui3-idiomatic-progress/](../../docs/sessions/2026-01-04-jsgui3-idiomatic-progress/)

## Objective

Create progress UI components using **idiomatic jsgui3 patterns** that:
1. Minimize raw HTML usage - compose everything with jsgui3 controls
2. Eliminate visual flashing and jittering
3. Follow established patterns from `JSGUI3_EFFECTIVE_PATTERNS_QUICK_REFERENCE.md`
4. Document obstacles, knowledge gaps, and framework limitations

## Key Improvements Over Previous Lab

| Issue in `jsgui3-ssr-progress` | Fixed in This Lab |
|-------------------------------|-------------------|
| Direct `style.display = 'none'` manipulation | Use `add_class`/`remove_class` with CSS transitions |
| Rapid DOM updates causing flashing | Debounce updates, use CSS-based state changes |
| Manual DOM queries in activate() | Store control references during compose() |
| Raw HTML strings for CSS | Control CSS as static property, injected once |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Idiomatic jsgui3 Progress                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   ProgressDisplayControl                       │ │
│  │  • Pure display, no network/polling logic                     │ │
│  │  • Smooth CSS transitions for all state changes               │ │
│  │  • State-driven updates via setState()                        │ │
│  │  • No direct DOM manipulation outside activate()              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   ProgressConnectorControl                     │ │
│  │  • Handles SSE/polling connection                             │ │
│  │  • Debounces rapid updates                                    │ │
│  │  • Wraps ProgressDisplayControl                               │ │
│  │  • Separation of concerns: network ↔ display                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Patterns Demonstrated

### 1. State-Driven Rendering

```javascript
// ✅ GOOD: State object with explicit update method
this._state = { phase: 'idle', current: 0, total: 0, warnings: [] };

setState(partial) {
  this._state = { ...this._state, ...partial };
  this._syncView();
}

// ❌ BAD: Direct property assignments scattered everywhere
this.current = 50;
this._updateBar();
this.showWarnings = true;
this._updateWarnings();
```

### 2. CSS-Based Visibility (No Flashing)

```javascript
// ✅ GOOD: CSS classes with transitions
_syncView() {
  if (this._state.warnings.length > 0) {
    this._warningsEl.remove_class('hidden');
  } else {
    this._warningsEl.add_class('hidden');
  }
}

// CSS:
.progress-display__warnings {
  transition: opacity 0.2s, max-height 0.2s;
  max-height: 100px;
  opacity: 1;
}
.progress-display__warnings.hidden {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

// ❌ BAD: Direct style manipulation (causes flashing)
this._warningDom.style.display = state.warnings.length ? 'block' : 'none';
```

### 3. Update Debouncing

```javascript
// ✅ GOOD: Debounce rapid updates
_scheduleUpdate() {
  if (this._pendingUpdate) return;
  this._pendingUpdate = requestAnimationFrame(() => {
    this._pendingUpdate = null;
    this._syncView();
  });
}

// ❌ BAD: Sync every update immediately
onProgress(state) {
  this._state = state;
  this._updateDisplay();  // Called 10x per second = jitter
}
```

### 4. Control Reference Storage

```javascript
// ✅ GOOD: Store control references during compose()
compose() {
  this._barEl = new ProgressBarEl({ context: this.context });
  this.add(this._barEl);
  
  this._warningsEl = new jsgui.Control({ context, tagName: 'div' });
  this._warningsEl.add_class('progress-display__warnings');
  this._warningsEl.add_class('hidden');  // Start hidden
  this.add(this._warningsEl);
}

// ❌ BAD: Query DOM in activate() or update methods
activate() {
  this._warningDom = this.dom.el.querySelector('[data-warning]');
}
```

---

## Running the Lab

### Web Server Mode

```bash
# Start the Express server (runs in foreground)
Start-Process -FilePath "node" -ArgumentList "labs/jsgui3-idiomatic-progress/server.js" -NoNewWindow

# Open in browser
# http://localhost:3102       - Full demo with SSE simulation
# http://localhost:3102/minimal - Just the progress bar

# Test the simulation: Click "Start Simulation" button
# Warnings appear/disappear smoothly at 30% and 60%
```

### Electron Mode

```bash
# Run as Electron app (spawns its own server)
npx electron labs/jsgui3-idiomatic-progress/electron-main.js

# Smoke test (exits after 5 seconds)
npx electron labs/jsgui3-idiomatic-progress/electron-main.js --smoke
```

### Testing API Endpoints

```bash
# Check current state
Invoke-WebRequest -Uri "http://localhost:3102/api/state" -UseBasicParsing | Select-Object -ExpandProperty Content

# Start simulation
Invoke-WebRequest -Uri "http://localhost:3102/api/start" -Method POST -UseBasicParsing

# Reset
Invoke-WebRequest -Uri "http://localhost:3102/api/reset" -Method POST -UseBasicParsing
```

## Files

| File | Purpose |
|------|---------|
| `controls/ProgressDisplayControl.js` | Pure display control, state-driven |
| `controls/ProgressBarEl.js` | Minimal progress bar element |
| `controls/ProgressConnectorControl.js` | SSE/polling wrapper with debouncing |
| `controls/index.js` | Exports |
| `server.js` | Demo server with SSE simulation |
| `OBSTACLES.md` | Knowledge gaps and framework limitations |
| `PATTERNS.md` | Pattern/anti-pattern catalog |

---

## Lessons Learned

See [OBSTACLES.md](./OBSTACLES.md) for framework limitations encountered.  
See [PATTERNS.md](./PATTERNS.md) for the full pattern/anti-pattern catalog.
