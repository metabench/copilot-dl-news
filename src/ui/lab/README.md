# jsgui3 Lab Experiments

**Purpose**: Experimental controls, patterns, and proofs-of-concept for jsgui3 development.

> **Rule**: Lab code is for learning and prototyping. Production code goes in `src/ui/controls/` or relevant server directories.

---

## Experiment Index

### Series Index

- Foundations (001-004): base mixins, themes, and platform helpers.
- Event Delegation (005-014): delegation order, propagation, and performance sequence.
- Streaming + Virtual (015): streaming/virtual harness and diagnostics.
- Art Playground (016-019): lifecycle, component store, undo/redo, and context menu patterns.
- Activation + MVVM (020-026): activation invariants and MVVM/MVC bridges.
- Telemetry + SSE (027-029): crawl telemetry and mixed activation diagnostics.
- Remote Observables (042-043): SSE observable bridges and client interfaces.
- Matrix + Virtualization (044-046): matrix controls, virtual scroll, smoothness.
- SVG UX (047): comment context controls and SVG interaction patterns.

| # | Name | Series | Status | Description |
|---|------|--------|--------|-------------|
| 001 | [Color Palette](experiments/001-color-palette/) | Foundations | ✅ validated | MVVM patterns for color selection and Art Playground integration |
| 002 | [Platform Helpers](experiments/002-platform-helpers/) | Foundations | active | Style proxy px coercion, comp wiring, registration helper, persisted fields |
| 003 | [Mixin Composition](experiments/003-mixin-composition/) | Foundations | proposed | Compose multiple control mixins safely (server-path baseline) |
| 004 | [Theme Mixin](experiments/004-theme-mixin/) | Foundations | proposed | Custom theme mixin (class + data attr) safe on server path |
| 005 | [Delegation Baseline](experiments/005-delegation-baseline/) | Event Delegation | proposed | Baseline delegated vs direct click listeners (order + counts) |
| 006 | [Capture vs Bubble](experiments/006-capture-vs-bubble/) | Event Delegation | proposed | Compare capture-phase vs bubble-phase delegation ordering |
| 007 | [stopPropagation](experiments/007-stop-propagation/) | Event Delegation | proposed | Trace handler coverage when stopPropagation is invoked |
| 008 | [stopImmediatePropagation](experiments/008-stop-immediate-propagation/) | Event Delegation | proposed | Multi-handler ordering when stopImmediatePropagation is used |
| 009 | [target vs currentTarget](experiments/009-target-vs-current-target/) | Event Delegation | proposed | Log target/currentTarget pairs under delegation |
| 010 | [Nested Controls Bubbling](experiments/010-nested-controls-bubbling/) | Event Delegation | proposed | Bubble paths across deep control chains |
| 011 | [Delegated Selector Matching](experiments/011-delegated-selector-matching/) | Event Delegation | proposed | Selector hit/miss behavior for delegated handlers |
| 012 | [Dynamic Children Delegation](experiments/012-dynamic-children-delegation/) | Event Delegation | proposed | Delegation coverage when children are added/removed post-activation |
| 013 | [Custom Events Bubbling](experiments/013-custom-events-bubbling/) | Event Delegation | proposed | Bubbling behavior of custom events vs native clicks |
| 014 | [Delegation Performance Batch](experiments/014-delegation-performance-batch/) | Event Delegation | proposed | Performance of delegated vs per-node listeners at scale |
| 015 | [Streaming + Virtual Harness](experiments/015-streaming-virtual-harness/) | Streaming + Virtual | proposed | Synthetic 2x2 (streaming on/off, virtual on/off) plus fractal hex virtual-scroll validation |
| 016 | [AP: Lifecycle Event Bag](experiments/016-ap-lifecycle-event-bag/) | Art Playground | proposed | Lifecycle-safe event binding + teardown for DOM/document listeners |
| 017 | [AP: Component Store](experiments/017-ap-component-store/) | Art Playground | proposed | DOM-free component store for selection + layers; enables undo/redo |
| 018 | [AP: Undo/Redo Stack](experiments/018-ap-undo-redo-stack/) | Art Playground | proposed | Command stack semantics for undo/redo on a pure component store |
| 019 | [Context Menu Patterns](experiments/019-context-menu-patterns/) | Art Playground | proposed | Standard DOM/jsgui3 contextmenu open/close/action pattern |
| 020 | [jsgui3-server Activation + ctrl_fields](experiments/020-jsgui3-server-activation/) | Activation + MVVM | active | SSR + client activation + data-jsgui-fields + data-jsgui-ctrl-fields |
| 021 | [Data_Model server→client bridge (MVC)](experiments/021-data-model-mvc/) | Activation + MVVM | active | SSR + client activation + Data_Object encoded/decoded via persisted fields + MVC pattern |
| 022 | [Data_Model server→client bridge (MVVM)](experiments/022-data-model-mvvm/) | Activation + MVVM | active | SSR + client activation + Data_Object encoded/decoded + data.model → view.data.model binding |
| 023 | [Advanced MVVM Patterns](experiments/023-advanced-mvvm-patterns/) | Activation + MVVM | active | Staged edits + computed + safe two-way binding (uses set() for change events) |
| 024 | [Fibonacci Server Observable → MVVM (SSE)](experiments/024-fib-observable-mvvm/) | Activation + MVVM | active | Server-side observable publishes Fibonacci ticks via SSE; client MVVM shows latest index + value |
| 025 | [MVVM Bindings Library](experiments/025-mvvm-bindings-library/) | Activation + MVVM | active | Reusable MVVM bindings helpers with deterministic check |
| 026 | [Activation Contract Lab](experiments/026-activation-contract-lab/) | Activation + MVVM | active | Enforces activation invariants: data-jsgui-type coverage, constructor registration, activate() runs |
| 027 | [ProgressBar + Telemetry SSE](experiments/027-progressbar-sse-telemetry/) | Telemetry + SSE | active | SSE crawl telemetry drives a ProgressBar via CrawlDisplayAdapter (indeterminate→determinate toggle) |
| 028 | [jsgui3-server SSE + Telemetry](experiments/028-jsgui3-server-sse-telemetry/) | Telemetry + SSE | active | Host /events on jsgui3-server (no Express) and stream observable telemetry to a ProgressBar |
| 029 | [Mixed Built-ins + Custom Activation](experiments/029-mixed-builtins-custom-activation/) | Telemetry + SSE | active | Combine built-in controls with custom activation + structured diagnostics |
| 042 | [Remote Observable (both ends)](experiments/042-remote-observable-both-ends/) | Remote Observables | active | Server observable → SSE → client adapter; compare jsgui3-server vs Express routing |
| 043 | [Client Observable Interface](experiments/043-client-observable-interface/) | Remote Observables | active | Expose SSE stream as Evented, Rx-ish, and async-iterator interfaces |
| 044 | [MatrixTableControl (flip axes)](experiments/044-matrix-table-control/) | Matrix + Virtualization | active | Matrix/table control: rotated headers, truncation/tooltips, flip-axes interaction with SSR checks |
| 045 | [Virtual Matrix Scroll](experiments/045-virtual-matrix-scroll/) | Matrix + Virtualization | active | Large matrix virtual scrolling prototype with bounded DOM + deterministic scroll/flip screenshots |
| 046 | [VirtualMatrixControl Smoothness](experiments/046-virtual-matrix-control-smoothness/) | Matrix + Virtualization | active | Smoothness regression lab for production VirtualMatrixControl: bounded DOM, renderSeq stability |
| 047 | [SVG Comment Context](experiments/047-svg-comment-context/) | SVG UX | active | Extract SVG comment/context interaction logic into reusable controls with independent hydration |

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
                        │ superseded  │
                        │ (kept here) │
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
