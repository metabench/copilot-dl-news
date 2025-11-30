# jsgui3 Lab Experiments

**Purpose**: Experimental controls, patterns, and proofs-of-concept for jsgui3 development.

> **Rule**: Lab code is for learning and prototyping. Production code goes in `src/ui/controls/` or relevant server directories.

---

## Active Experiments

| # | Name | Status | Description |
|---|------|--------|-------------|
| 001 | [Color Palette](experiments/001-color-palette/) | ✅ validated | MVVM patterns for color selection, Art Playground integration |

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
├── experiments/
│   ├── 001-color-palette/         # Each experiment gets a numbered folder
│   │   ├── README.md              # Experiment overview
│   │   ├── MVVM_ANALYSIS.md       # Detailed analysis/findings
│   │   ├── ART_PLAYGROUND_INTEGRATION.md  # Integration guide
│   │   └── check.js               # Verification script
│   ├── 002-virtual-scroll/        # Future: Virtual scrolling
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
