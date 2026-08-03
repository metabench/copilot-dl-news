# jsgui3 findings — handoff to a library-only session

**Written 2026-07-30 (cycle 163) from `copilot-dl-news`, for a session with access
to `jsgui3-html`, `jsgui3-client` and `jsgui3-server` only.**

Everything here came from building one real app on the framework: a
server-rendered, client-activated status page with an SVG DAG, a selectable
tree, several stock controls and an SSE strip. That app is NOT visible to you,
so every item gives a reproduction constructible inside the three library repos
alone.

> **Read section C first.** This report originally listed three defects that
> turned out not to be defects. All three came from reading jsgui3's source and
> *inferring* runtime behaviour instead of measuring it. The measurement, when I
> finally did it, took two minutes. **Trust nothing below that isn't marked
> MEASURED.**

---

## A. Surviving defects

### A1. Control elimination fails open silently
**MEASURED** — served CSS 28 KB → 144 KB, no diagnostic emitted.

`resources/processors/bundlers/js/esbuild/JSGUI3_HTML_Control_Optimizer.js` has
two fail-open branches — `dynamic_control_access_detected` (~line 262) and
`package_usage_without_detected_identifiers` (~line 275). When either fires the
whole library is kept, CSS included, and **nothing is logged**. The only symptom
is a bundle several times larger than it should be.

Splitting one bundle entry into 25 modules flipped elimination off in my app.
Two candidate triggers were refuted by measurement — making the
`jsgui.controls[name] = Ctrl` registration static, and naming the stock controls
in the entry file — so the actual trigger is unknown to me and may be a
scan-reachability bug rather than intended behaviour.

*Ask:* log the bail reason by default, and expose it on `bundle_analysis`. A
consumer currently cannot tell the optimisation disengaged.

*Repro:* bundle an entry that spreads control usage across several `require`d
modules; compare served `/css/css.css` with the same code in one file. Measure on
a WARM server — a cold `curl` returned 0 bytes because the bundle publishes
asynchronously at boot. Config is reachable from a consumer as
`Server({ bundler: { elimination: { jsgui3_html_controls: { log: true, emit_manifest: true } } } })`.

### A2. Inconsistent theming across stock controls
**MEASURED** — computed styles in a browser.

On a dark page `Key_Value_Table` renders `rgb(255,255,255)` on `rgb(30,30,30)`
text, and `Chip` renders `rgb(241,245,249)` / `rgb(51,65,85)`, while `Panel` and
`Data_Table` in the same page pick up the dark surroundings correctly. The
inconsistency is the issue, not the defaults.

---

## B. Diagnosability

### B1. Controls composed into an already-activated parent never activate
**MEASURED.**

`jsgui.activate(context)` walks the DOM once. Anything added afterwards has its
markup inserted but never receives `activate()`, so a control that renders from
`activate()` renders nothing. Every app composing at runtime hand-rolls:

```js
const walk = (c) => { for (const child of (c.content && c.content._arr) || []) {
    if (child && !child.__active && child.activate) child.activate();
    walk(child);
} };
```

*Ask:* do this in `add()` when the parent is already active, or document it with
this walker as the sanctioned snippet.

### B2. A stock control can reattach into a silently useless state
**MEASURED**, and the fix already exists — see C1. The residue worth acting on:
an SSR'd `Data_Grid` without `persist_activation_state` reattaches with **zero
columns** and renders the correct *number* of rows with **no cells**. That reads
as a CSS problem, and `aria-colcount` visibly drops 4 → 0, so the control knows
it lost something.

*Ask (cheapest high-value item in this report):* when a reattached `Data_Table`
finds rows and zero columns, emit one console warning naming
`persist_activation_state`. It would have saved me hours and prevented me filing
a bug against working code.

### B3. Misleading dead code in the activation walker
`html-core/html-core.js:147-155`:

```js
if (parent_jsgui_id) { if (map_controls[parent_jsgui_id]) { } }   // twice, empty
```

Parent/child linking really happens in `control-enh.js:
pre_activate_content_controls`, and it works correctly. These empty branches read
as unfinished intent and are **directly responsible for two of the three wrong
conclusions in section C** — I read them as "the client tree is flat" and built
an app-side workaround around that false belief. Deleting them is a one-line
change that removes a real trap.

### B4. `Missing context.map_Controls for type undefined` on every page load
Observed 4× per load; cause not chased. Probably the document-level controls and
probably harmless — but indistinguishable from a genuinely missing registration,
which IS a silent killer (markup renders, nothing activates).

### B5. No control catalogue
155 controls, 48 mixins, no index. I proposed building `Panel`, `Chip`, `Badge`
and `Button` — all of which ship. A generated list (name, one line, spec shape)
removes an entire error class. The `.d.ts` files are good and underused.

---

## C. WITHDRAWN — three claims that were wrong, and why

Kept in full, because the pattern that produced them is the most useful thing
here for anyone maintaining this library.

### C1. "`Data_Grid` cannot round-trip its own SSR output" — WRONG
`persist_activation_state: true` serializes columns, rows, sort state, filters,
paging and selection into `data-jsgui-tabular-state` at compose time and reads it
back (`Data_Table.js:215-232`, `:533`; `Data_Grid._adopt_reattached_table_state`).
Documented at `Data_Grid.js:63`. I had listed the flag in my own adoption notes
and failed to connect it. Setting it fixed my app and deleted a workaround.

### C2. "`Panel.content_container` is undefined after reattachment" — WRONG
**MEASURED false:** two reattached `Panel` subclasses both reported
`content_container_set: true`, pointing at `.panel-content jsgui-panel-content`.
The `data-jsgui-ctrl-fields` hydration loop in `pre_activate_content_controls`
does `this[key] = context.map_controls[value]`, and `Panel._compose` registers
`content_container` as exactly such a field. It restores correctly.

### C3. "The client control tree is flat — no parents, empty `content._arr`" — WRONG
**MEASURED false:** after reattachment the application control reported 10
restored children, `parent` set, and a named descendant reachable by a plain
recursive walk at the expected depth, with its own children intact. The tree is
fully rebuilt.

### What actually happened, three times

I read a constructor, saw compose skipped on the `spec.el` path, and *inferred*
the consequences — instead of loading the page and looking. Every inference was
directionally plausible and specifically wrong. **The general lesson for this
library:** its compose/reattach seam is genuinely subtle and reading the source
is not sufficient to predict it. That is an argument for B3 (delete misleading
code), B2 (warn at the failure point) and a documented "what survives to the
client" page — not for the defects I invented.

---

## D. What the framework got right

- **SVG-as-controls** (`Chart_Base.svg_element`) — made a real interactive DAG
  possible without dropping to markup.
- **`Ctrl.css` statics** collected from the bundle text — a 1-file → 25-file split
  moved 17 CSS blocks with zero configuration.
- **The `selectable` mixin** works correctly through reattachment, including
  `action_select_only`. An explicit `mousedown` I had added was redundant
  (`defaultPrevented === true` proves the mixin's own handler fires).
- **`persist_activation_state`** and the **`_ctrl_fields` hydration** are careful,
  correct answers to the hardest part of this architecture. They mostly need to
  be louder and better documented, not changed.

## 2026-08-03 (cycle 169, measured): the style separator cannot see interpolated `Ctrl.css` template literals

The jsgui3-server publisher's "Separating styles and JS" pass parses the bundled
client source for literal `X.css = \`...\`` spans. Controls whose css template
literals INTERPOLATE values (`${tokens.surface.panel}` — the pattern any
design-token system produces) are invisible to it: the Crawl Console published
with **39 bytes** of collected css and rendered as unstyled document text while
every DOM/text assertion passed. Workaround (proven, also used by
CrawlStatusPage): inject the composed css at page level via a raw
`String_Control` inside a `<style>` head node. Library-side fix worth
considering: collect css by EVALUATING `Ctrl.css` on registered controls at
publish time instead of (or in addition to) source-text scanning. Found by
looking at a screenshot after 11 string assertions had passed — a computed-style
assertion (`getComputedStyle(document.body).backgroundColor`) now guards it.
