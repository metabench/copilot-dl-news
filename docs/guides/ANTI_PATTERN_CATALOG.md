# Anti-Pattern Catalog

_Last Verified: 2025-01-09_

**Purpose**: Quick lookup for common mistakes across all jsgui3 and testing domains. Searchable reference to avoid repeating past errors.

**When to Read**: 
- Before starting unfamiliar work
- When something "doesn't work" and you're not sure why
- During code review

---

## 🔍 Quick Lookup by Symptom

| Symptom | Likely Mistake | Fix | Source Guide |
|---------|----------------|-----|--------------|
| Render time >500ms | Rendering all items upfront | Lazy rendering | [PERFORMANCE_PATTERNS](JSGUI3_PERFORMANCE_PATTERNS.md) |
| 8000+ controls created | No lazy loading | Placeholder + on-demand | [PERFORMANCE_PATTERNS](JSGUI3_PERFORMANCE_PATTERNS.md) |
| Jest hangs / won't exit | Server process not killed | SIGTERM → SIGKILL pattern | [TEST_HANGING_PREVENTION](TEST_HANGING_PREVENTION_GUIDE.md) |
| "Jest did not exit" | Browser not closed | `browser.close().catch(() => {})` | [TEST_HANGING_PREVENTION](TEST_HANGING_PREVENTION_GUIDE.md) |
| Test hangs on Windows | `shell: true` in spawn | Remove shell option | [TEST_HANGING_PREVENTION](TEST_HANGING_PREVENTION_GUIDE.md) |
| ctrl.dom.el is null | Accessing before activation | Use `_el()` helper pattern | [UI_ARCHITECTURE](JSGUI3_UI_ARCHITECTURE_GUIDE.md) |
| Event handler not firing | Missing activation | Call `activate()` after DOM link | [UI_ARCHITECTURE](JSGUI3_UI_ARCHITECTURE_GUIDE.md) |
| Data binding not updating | Wrong model reference | Use `this.data.model` not `this.view.data.model` | [MVVM_PATTERNS](JSGUI3_MVVM_PATTERNS.md) |
| Wasted research time | Reading entire source files | Targeted grep first | [COGNITIVE_TOOLKIT](JSGUI3_COGNITIVE_TOOLKIT.md) |
| Incomplete documentation | Documenting after task | Document as you discover | [COGNITIVE_TOOLKIT](JSGUI3_COGNITIVE_TOOLKIT.md) |
| **PowerShell emoji rename** | `ð§` instead of `🧠` | Use `agent-rename.js` | This file |
| **SVG has overlapping text** | Skipped collision detection | `svg-collisions.js --strict` | [SVG_METHODOLOGY](../guides/SVG_CREATION_METHODOLOGY.md) |
| **SVG boxes mispositioned** | Nested transforms miscalculated | Run collision detection, fix coordinates | [SVG_METHODOLOGY](../guides/SVG_CREATION_METHODOLOGY.md) |
| **Self-evaluation missed bugs** | Trusted mental model over tools | Always run validation tools before declaring complete | [SVG_METHODOLOGY](../guides/SVG_CREATION_METHODOLOGY.md) |

---

## 🚫 Performance Anti-Patterns

### Rendering Everything Upfront

```javascript
// ❌ WRONG: Creates 850+ controls for 850 items
compose() {
  this.items.forEach(item => {
    this.add(new ItemControl({ context: this.context, item }));
  });
}
```

**Impact**: 883ms control tree build, 1.5MB HTML output

**Fix**: Lazy rendering with placeholders → See [JSGUI3_PERFORMANCE_PATTERNS.md](JSGUI3_PERFORMANCE_PATTERNS.md)

---

### Optimizing Without Measuring

```javascript
// ❌ WRONG: Assuming you know the bottleneck
// "It must be the file I/O that's slow"
```

**Impact**: Wasted effort on wrong area (actual bottleneck was control tree 70%)

**Fix**: Create diagnostic script FIRST → See [JSGUI3_PERFORMANCE_PATTERNS.md](JSGUI3_PERFORMANCE_PATTERNS.md)

---

## 🚫 Testing Anti-Patterns

### Orphaned Server Process

```javascript
// ❌ WRONG: No cleanup
let serverProcess;
beforeAll(() => {
  serverProcess = spawn("node", ["server.js"]);
});
// Test ends → process keeps running → Jest hangs
```

**Fix**: SIGTERM → wait → SIGKILL pattern → See [TEST_HANGING_PREVENTION_GUIDE.md](TEST_HANGING_PREVENTION_GUIDE.md)

---

### Browser Close Without Error Handling

```javascript
// ❌ WRONG: Can throw, leaving browser open
afterAll(async () => {
  await browser.close();  // If this throws, Jest hangs
});
```

**Fix**: `await browser.close().catch(() => {})` → See [TEST_HANGING_PREVENTION_GUIDE.md](TEST_HANGING_PREVENTION_GUIDE.md)

---

### spawn() with shell=true on Windows

```javascript
// ❌ WRONG: Creates cmd.exe wrapper
serverProcess = spawn("node", [SERVER_PATH], { shell: true });
// Killing wrapper doesn't kill node.exe
```

**Fix**: Remove `shell: true` → See [TEST_HANGING_PREVENTION_GUIDE.md](TEST_HANGING_PREVENTION_GUIDE.md)

---

## 🚫 jsgui3 Architecture Anti-Patterns

### Accessing DOM Before Activation

```javascript
// ❌ WRONG: ctrl.dom.el is null during SSR
compose() {
  const el = this.dom.el;  // NULL!
  el.addEventListener('click', handler);  // Crash
}
```

**Fix**: Use `_el()` helper, check in `activate()` → See [JSGUI3_UI_ARCHITECTURE_GUIDE.md](JSGUI3_UI_ARCHITECTURE_GUIDE.md)

---

### Double Activation

```javascript
// ❌ WRONG: No guard
activate() {
  this.dom.el.addEventListener('click', handler);
  // If called twice → duplicate handlers
}
```

**Fix**: `if (this.__active) return; this.__active = true;` → See [JSGUI3_UI_ARCHITECTURE_GUIDE.md](JSGUI3_UI_ARCHITECTURE_GUIDE.md)

---

## 🚫 Research/Cognitive Anti-Patterns

### Reading Entire Source Files

```
❌ WRONG: "Let me read all of control.js (2000 lines)"
```

**Impact**: 30+ minutes lost, key info buried in noise

**Fix**: `grep_search` for specific patterns first → See [JSGUI3_COGNITIVE_TOOLKIT.md](JSGUI3_COGNITIVE_TOOLKIT.md)

---

### Documenting After Task Complete

```
❌ WRONG: "I'll write up what I learned after I finish"
```

**Impact**: Forgot details, incomplete docs, future agents repeat work

**Fix**: Document as you discover, while context is fresh → See [JSGUI3_COGNITIVE_TOOLKIT.md](JSGUI3_COGNITIVE_TOOLKIT.md)

---

### Assuming Docs Are Complete

```
❌ WRONG: "The docs don't mention X, so it must not exist"
```

**Impact**: Missed undocumented features/behaviors

**Fix**: Verify against source code → See [JSGUI3_COGNITIVE_TOOLKIT.md](JSGUI3_COGNITIVE_TOOLKIT.md)

---

## 🚫 SVG Creation Anti-Patterns

### Skipping Collision Detection

```bash
# ❌ WRONG: Declare SVG complete without validation
echo "Done! Here's your beautiful SVG"
```

**Impact**: Overlapping text, mispositioned boxes, unreadable diagrams

**Why it happens**: AI agents cannot "see" SVG output. They reason mathematically about coordinates, but nested transforms make absolute positions non-obvious.

**Fix**: ALWAYS run collision detection before declaring complete:
```bash
node tools/dev/svg-collisions.js your-diagram.svg --strict
# Pass criteria: Zero 🔴 HIGH severity issues
```

→ See [SVG_CREATION_METHODOLOGY.md](SVG_CREATION_METHODOLOGY.md)

---

### Trusting Mental Model Over Tools

```
❌ WRONG: "I calculated the positions correctly, so it must be fine"
```

**Impact**: 
- Created SVG with 8 HIGH-severity text overlaps
- Self-evaluated as 91/100 Grade A
- User had to point out the obvious layout bugs

**Root cause analysis**:
1. Evaluated output format (syntax, structure, features) not spatial correctness
2. Didn't run the collision detector that was designed for exactly this purpose
3. "Visualized" the SVG mentally instead of using objective measurement

**Fix**: 
- Never trust spatial reasoning for visual output
- The tools are your eyes—use them
- Zero HIGH issues = done; HIGH issues remaining = not done

---

### Miscalculating Nested Transforms

```xml
<!-- ❌ WRONG: Child extends outside parent -->
<g transform="translate(320, 40)">
  <!-- Parent at x=320, width=300, so right edge = 620 -->
  <g transform="translate(270, 20)">
    <!-- Child at x=590 (320+270), width=120, so right edge = 710 -->
    <!-- 710 > 620 → OVERFLOW! -->
    <rect width="120" height="40"/>
  </g>
</g>
```

**Impact**: Elements appear clipped or extend outside their containers

**Fix**: 
1. Calculate absolute positions manually: `parent_x + child_x = absolute_x`
2. Verify: `absolute_x + width <= parent_x + parent_width`
3. Run collision detection to catch violations

---

## 🚫 PowerShell / Windows Anti-Patterns

### Using PowerShell to Rename Emoji Filenames

```powershell
# ❌ WRONG: PowerShell corrupts Unicode/emojis
Rename-Item "🧠 Brain.md" "💡 Light.md"
Move-Item "🧠 Brain.md" "💡 Light.md"
mv "🧠 Brain.md" "💡 Light.md"

# Result: ð§  Brain.md (mojibake!)
```

**Why it happens**: PowerShell 5.1 defaults to legacy Windows-1252/CP437 encoding for filesystem operations, even when `$OutputEncoding` and `[Console]::OutputEncoding` are set to UTF-8. The encoding conversion happens at the Win32 API call layer.

**Impact**:
- Emoji characters become garbled multi-byte sequences (`🧠` → `ð§ `)
- Files become impossible to reference by name in scripts
- Git sees corrupted filenames, causing commit/diff issues

**Fix**: Use Node.js for any file operation involving Unicode characters:

```powershell
# ✅ CORRECT: Use Node.js native fs (calls proper UTF-16 API)
node tools/dev/agent-rename.js --from "Brain" --to "💡 Light 💡"

# ✅ CORRECT: Direct Node.js for custom renames
node -e "require('fs').renameSync('🧠 old.md', '💡 new.md')"
```

**Why Node.js works**:
- Node.js uses libuv which calls `MoveFileExW` (wide-char UTF-16 API)
- Bypasses PowerShell's encoding layer entirely
- Works regardless of console encoding settings

**Tools available**: `tools/dev/agent-rename.js` handles agent file renaming safely.

---

## Adding New Anti-Patterns

When you discover a new anti-pattern:

1. Add to the Quick Lookup table at the top
2. Add a detailed section with code example
3. Link to the relevant source guide
4. Update the source guide if needed

---

_Last updated: 2025-01-09_
