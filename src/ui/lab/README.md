# jsgui3 Lab Experiments

**Purpose**: Experimental controls, patterns, and proofs-of-concept for jsgui3 development.

> **Rule**: Lab code is for learning and prototyping. Production code goes in `src/ui/controls/` or relevant server directories.

---

## Active Experiments

| # | Name | Status | Description |
|---|------|--------|-------------|
| 001 | [Color Palette](experiments/001-color-palette/) | ✅ validated | MVVM patterns for color selection, Art Playground integration |
| 002 | [Platform Helpers](experiments/002-platform-helpers/) | active | Style proxy, comp model, registration, persisted fields |
| 003 | [Mixin Composition](experiments/003-mixin-composition/) | proposed | Compose control mixins safely (server-path baseline) |
| 004 | [Theme Mixin](experiments/004-theme-mixin/) | proposed | Custom theme mixin (class + data attr) safe on server path |
| 005 | [Delegation Baseline](experiments/005-delegation-baseline/) | proposed | Baseline delegated vs direct click listeners |
| 006 | [Capture vs Bubble](experiments/006-capture-vs-bubble/) | proposed | Ordering differences between capture and bubble delegation |
| 007 | [stopPropagation](experiments/007-stop-propagation/) | proposed | Handler coverage when stopPropagation is invoked |
| 008 | [stopImmediatePropagation](experiments/008-stop-immediate-propagation/) | proposed | Multi-handler ordering with stopImmediatePropagation |
| 009 | [target vs currentTarget](experiments/009-target-vs-current-target/) | proposed | target/currentTarget traces under delegation |
| 010 | [Nested Controls Bubbling](experiments/010-nested-controls-bubbling/) | proposed | Bubble paths across deep control chains |
| 011 | [Delegated Selector Matching](experiments/011-delegated-selector-matching/) | proposed | Selector hit/miss matrix for delegated handlers |
| 012 | [Dynamic Children Delegation](experiments/012-dynamic-children-delegation/) | proposed | Delegation coverage after add/remove children |
| 013 | [Custom Events Bubbling](experiments/013-custom-events-bubbling/) | proposed | Bubbling behavior of custom events vs native |
| 014 | [Delegation Performance Batch](experiments/014-delegation-performance-batch/) | proposed | Performance of delegated vs per-node listeners |

### Mixin storage pattern (lab mixins)

- Custom mixins should provide a `model.mixins` store with `_store` (array), `push`, and `each` so checks that iterate mixins work on the server path. See `mixins/theme.mixin.js` and run `node src/ui/lab/experiments/004-theme-mixin/check.js` for a working example.

### Lab Console UI

- `LabConsoleControl` (root: `src/ui/lab/LabConsoleControl.js`) renders a manifest-driven catalog of experiments with quick actions (🔍 explore README, 🧪 run check command, 🛠️ promote path).
- Manifest lives at `src/ui/lab/manifest.json`; checks at `src/ui/lab/checks/labConsole.check.js`.
- Use it as a lightweight launcher or embed in lab pages to keep experiments discoverable.

---

## Experiment Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  proposed   │ ─▶ │   active    │ ─▶ │  validated  │ ─▶ │  promoted   │
│ (idea only) │    │ (in dev)    │    │ (working)   │    │ (to prod)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │ deprecated  │
                                       │ (superseded)│
                                       └─────────────┘
```

---

## Directory Structure

```
src/ui/lab/
├── README.md                      # This file
├── manifest.json                  # Experiment catalog consumed by LabConsoleControl
├── checks/
│   └── labConsole.check.js        # Verifies lab console render
├── experiments/
│   ├── 001-color-palette/         # Each experiment gets a numbered folder
│   │   ├── README.md              # Experiment overview
│   │   ├── MVVM_ANALYSIS.md       # Detailed analysis/findings
│   │   ├── ART_PLAYGROUND_INTEGRATION.md  # Integration guide
│   │   └── check.js               # Verification script
│   ├── 002-platform-helpers/      # Platform helpers experiment
│   └── ...
├── mixins/                        # Experimental mixins
│   └── ...
└── utilities/                     # Helper functions
    └── ...
```

---

## Creating a New Experiment

1. **Create numbered directory**: `experiments/NNN-short-name/`
2. **Add README.md** with:
   - Purpose/hypothesis
   - Status (proposed/active/validated/deprecated)
   - Key findings
   - File list
3. **Add check.js** verification script
4. **Run and validate** before marking as validated
5. **Update this index** with the new experiment

---

## Promotion to Production

When an experiment is ready for production:

1. **Move control code** to appropriate `src/ui/controls/` location
2. **Add proper JSDoc** documentation
3. **Create unit tests** in `tests/ui/controls/`
4. **Update imports** in server files
5. **Mark experiment as `promoted`** in this index
6. **Keep experiment docs** as reference (don't delete)

---

## Related Documentation

- [JSGUI3_UI_ARCHITECTURE_GUIDE.md](../../../docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Full architecture reference
- [JSGUI3_EFFECTIVE_PATTERNS_QUICK_REFERENCE.md](../../../docs/guides/JSGUI3_EFFECTIVE_PATTERNS_QUICK_REFERENCE.md) - MVC/MVVM patterns
- [🧠 jsgui3 Research Singularity 🧠.agent.md](../../../.github/agents/🧠%20jsgui3%20Research%20Singularity%20🧠.agent.md) - Research agent instructions
