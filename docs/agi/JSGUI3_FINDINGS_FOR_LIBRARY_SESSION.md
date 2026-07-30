# jsgui3 findings — handoff to a library-only session

**Written 2026-07-30 (cycle 163) from `copilot-dl-news`, for a session with access
to `jsgui3-html`, `jsgui3-client` and `jsgui3-server` only.**

Everything here came from building one real app on the framework: a
server-rendered, client-activated status page with an SVG DAG, a selectable
tree, several stock controls and an SSE strip. That app is NOT visible to you,
so every item below gives a reproduction you can construct inside the three
library repos alone.

Confidence is marked on every item. Read it — some of these are verified
defects, some are diagnosability complaints, and **one thing I initially
reported as a framework bug turned out to be me not reading the spec.** That one
is recorded at the bottom, deliberately, because the failure mode that misled me
is itself worth fixing.

---

## A. Verified defects

### A1. `Panel.content_container` is undefined after reattachment
**Confidence: high** (read from source; not separately reproduced in isolation)

`Panel._compose()` (`controls/organised/1-standard/6-layout/Panel.js`) creates
the `.panel-content` container and assigns `this.content_container`. It runs
only when `!spec.abstract && !spec.el`. Client reattachment constructs down the
`spec.el` path, so `content_container` is never set, and `add_content()` silently
falls back to `this.add(content)` — runtime content lands as a sibling of the
header instead of inside the content region.

*Repro:* SSR a `Panel({title})`, reattach it in a browser, call `add_content()`,
inspect where the child landed.

*Note:* `pre_activate_content_controls` DOES restore `_ctrl_fields`, and
`_compose` stores the container there as `_ctrl_fields.content_container`. So the
fix may be one line in `activate()`, mirroring what `Data_Grid.activate()`
already does for `this.table`:

```js
if (!this.content_container && this._ctrl_fields) {
    this.content_container = this._ctrl_fields.content_container;
}
```

### A2. Control elimination fails open silently
**Confidence: high** (measured: 28 KB → 144 KB of served CSS)

`resources/processors/bundlers/js/esbuild/JSGUI3_HTML_Control_Optimizer.js` has
two fail-open branches — `dynamic_control_access_detected` (~line 262) and
`package_usage_without_detected_identifiers` (~line 275). When either fires, the
whole library is kept, including every control's CSS, and **nothing is logged**.
The only symptom is a bundle several times larger than it should be.

I hit this and could not diagnose it from outside: splitting one entry file into
25 modules flipped elimination off. Two hypotheses were refuted by measurement
(making the `jsgui.controls[name] = Ctrl` registration static; naming the stock
controls in the entry file) — so the trigger is still unknown to me, and it is
plausibly a scan-reachability bug rather than intended behaviour.

*Ask:* make the bail reason log by default (or at minimum under `log: true`), and
surface it in `bundle_analysis`. A consumer currently has no way to know the
optimisation silently disengaged.

*Repro:* bundle any entry that spreads control usage across several `require`d
modules; compare served `/css/css.css` against the same code in a single file.
Measure on a WARM server — a cold `curl` returned 0 bytes because the bundle
publishes asynchronously at boot.

### A3. Light-themed hardcoded colours in some stock controls
**Confidence: high** (computed styles read in a browser)

On a dark page, `Key_Value_Table` renders `rgb(255,255,255)` background with
`rgb(30,30,30)` text, and `Chip` renders `rgb(241,245,249)` / `rgb(51,65,85)` —
while `Panel` and `Data_Table` in the same page pick up the surrounding dark
palette correctly. The result is white boxes cut into a dark panel. The
inconsistency is the issue: some controls are theme-aware and some are not.

---

## B. Diagnosability / developer-experience

### B1. Compose and reattach are asymmetric, and nothing says so
**This is the single highest-value documentation gap.**

Constructors branch on `spec.el`; reattachment always takes that branch, so
anything a control establishes while composing is absent client-side. This is a
real contract and it is currently learned by debugging. It caused, in my app:
a dead child reference held from compose, an empty grid, and a wasted
investigation into `Panel`.

*Ask:* one page — "what survives to the client, and what you must re-supply" —
plus a note on every control whose spec state is compose-only.

### B2. Controls composed into an already-activated parent never activate
**Confidence: high** (measured)

`jsgui.activate(context)` walks the DOM once. Anything added afterwards has its
markup inserted but never receives `activate()`, so any control that does work
there renders nothing. Every app that composes at runtime has to hand-roll a
walker:

```js
const walk = (c) => { for (const child of (c.content && c.content._arr) || []) {
    if (child && !child.__active && child.activate) child.activate();
    walk(child);
} };
```

*Ask:* either do this in `add()` when the parent is already active, or document
it as a rule with the walker as the sanctioned snippet.

### B3. Misleading dead code in the activation walker
**Confidence: high** (`html-core/html-core.js:147-155`)

```js
if (parent_jsgui_id) { if (map_controls[parent_jsgui_id]) { } }   // twice, empty
```

Parent/child linking really happens later, in
`control-enh.js: pre_activate_content_controls`. These empty branches read as an
unfinished intention and cost me a wrong conclusion — I initially concluded the
client control tree was flat, which it is not.

### B4. `Missing context.map_Controls for type undefined` fires on every page
**Confidence: medium** (observed 4× per load; cause not chased)

Elements carrying `data-jsgui-id` with no `data-jsgui-type`. Probably the
document-level controls, and probably harmless — but it is indistinguishable
from a genuinely missing registration, which IS a silent killer (markup renders,
nothing activates). Worth either suppressing or making the message actionable.

### B5. No control catalogue
155 controls and 48 mixins with no index. I proposed building `Panel`, `Chip`,
`Badge` and `Button` — all of which ship. A generated list (name, one line, spec
shape) would remove an entire error class for both humans and agents. The `.d.ts`
files are good and underused; pointing at them explicitly would help too.

---

## C. WITHDRAWN — and why it still matters

**I reported "`Data_Grid` cannot round-trip its own SSR output" as a defect. It
is not one.** `persist_activation_state: true` serializes columns, rows, sort
state, filters, paging and selection into `data-jsgui-tabular-state` at compose
time, and the reattached control reads it back
(`Data_Table.js:215-232`, `:533`; `Data_Grid._adopt_reattached_table_state`). It
is documented at `Data_Grid.js:63`. I had even listed the flag in my own adoption
notes and failed to connect it. Setting it fixed my app and let me delete a
workaround.

The reason this is still worth your attention is the **failure mode**, not the
default:

- With the flag off, an SSR'd `Data_Grid` reattaches with **zero columns** and
  then renders the correct *number* of rows with **no cells**.
- That reads as a CSS problem, not a data problem. I chased styling first.
- `aria-colcount` goes from `4` in the SSR markup to `0` after activation — the
  control demonstrably knows it has lost something.

*Ask (cheap, high value):* when a reattached `Data_Table` finds itself with rows
and zero columns, emit one console warning naming `persist_activation_state`.
That single line would have saved me hours and would have prevented me filing a
bug against working code. The information is already available at that point —
the rendered `<th>` elements still carry `data-column-key`.

---

## D. What the framework got right, for balance

- **SVG-as-controls** (`Chart_Base.svg_element`) is elegant, and it is what made
  a real interactive DAG possible without dropping to markup.
- **`Ctrl.css` statics** collected out of the bundle text: a 1-file → 25-file
  split moved 17 CSS blocks with zero configuration.
- **The `selectable` mixin** works correctly through reattachment, including
  `action_select_only`; an app-level explicit `mousedown` I had added turned out
  to be redundant (`defaultPrevented === true` proves the mixin's own handler
  fires).
- **`persist_activation_state`** is the right idea — the SSR/activation seam is
  the hard part of this architecture and someone thought about it carefully. It
  just needs to be louder.
