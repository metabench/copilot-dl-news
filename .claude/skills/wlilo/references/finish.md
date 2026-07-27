# The finish pass — from valid to professionally designed

Passing validation makes an artifact *correct*; it does not make it *designed*. The gap
between the two is composition. Run this pass after layout and before final validation —
it is what a design director would do with a red pen. First-iteration evals showed exactly
these failures in otherwise-100%-valid output: void panels, a version badge glued to the
wordmark, one-size text inside panels, "luxury" textures invisible at viewing scale.

## 1 · Inhabitation (the void check)

Obsidian is precious — a panel is a stage, not a warehouse. After layout, compare each
panel's content bounding box to the panel itself: content should occupy **≥65% of the
panel's width AND height**. Below that, do one of: shrink the panel to the content (+padding),
enlarge the content to earn the space, or recompose (merge panels, move annotations inside).
Same at canvas level: outer margins 32–48px, and no horizontal band taller than ~15% of the
canvas may be empty. A sequence panel whose traffic clusters between two lifelines gets
narrowed — or the quiet side earns an annotation card. Empty space must read as *deliberate
breathing room around something*, never as leftover storage.

## 2 · Optical relationships (nothing floats, nothing touches)

- Every element is either **aligned to the grid** (8px multiples for all anchors) or
  **deliberately paired** with a neighbor at a stated clearance. No orphans drifting in space.
- Badges/chips attached to a wordmark or title: clearance ≥ 0.35em from the last glyph,
  vertically aligned to the title's cap-height or centerline — never touching, never sitting
  on the baseline like a subscript.
- Constant offsets everywhere they repeat: label-above-arrow gap (pick 6–8px, use it for ALL
  arrows), arrow endpoint insets from lifelines/nodes (8px), metadata (timestamps, footnotes)
  in one reserved gutter column — not hugging whatever edge is nearest.

## 3 · Hierarchy ladder (three roles per container, minimum)

Inside any panel, a reader's eye needs rungs. Use at least three distinguishable text roles:

| Role | Treatment | Scale |
| --- | --- | --- |
| Container title | Serif (Georgia/Playfair), gold or leather-on-obsidian | ~1.4× |
| Primary labels (actors, messages, nodes) | Sans semibold | ~1.15× |
| Secondary annotations (explanations, captions) | Sans regular, muted | 1.0× |

**Mono is for literals only** — headers, tokens, code (`max-age=600`, `If-None-Match`).
Prose set in mono reads as a terminal dump, not a designed artifact. In hero/poster pieces,
scale with confidence: display title ≥3× body, CTAs at least 44px tall, supporting elements
sized to the canvas, not to a form.

**Restraint tunes glyph density, never existence.** The finish pass trims a *littered* artifact
toward calm — but the emoji/unicode vocabulary is load-bearing illustration, not decoration to
sweep away. A diagram with N actors/sections keeps ~N semantic icons (one per actor, one per
section header), plus any block-bar/geometric marks that *carry data*. If the finish pass leaves
zero glyphs, it has over-corrected: the artifact now reads as plain text, and an explicit skill
requirement is unmet. The scarcity rule means "not on every word," never "none."

## 4 · Line hierarchy

Structural lines (lifelines, separators, grids): 0.75–1px, low contrast — furniture, not
content. Flow/message arrows: 1.75–2.5px with heads proportional to stroke (≥6px) — these
carry the story. **At most one gold-emphasized path per view** — the eye follows gold, and
two gold paths means no path. Everything else stays neutral (`#888`/`#6b7280`).

## 5 · Perceptible craft (tier 3 only)

Every luxury feature you claim must survive the "point at it" test — a viewer at 100% zoom
can point to it. Invisible craft is dead weight in the file. For hero pieces: raise grain
opacity to 0.04–0.06 (diagrams keep the subtler 0.025), give bezels a double stroke (outer
gold 1px + inner platinum 0.5px), give gems a glint (small white ellipse, opacity ~0.35,
upper-left), let brushed-metal bands be wide enough to show their alternation. If a feature
can't be made perceptible without shouting, cut it — restraint beats rumor.

## 6 · The squint test (final gate, do it every time)

Zoom to ~25% (or blur your mental render) and ask:
1. Does exactly one title dominate?
2. Do the zones read as balanced masses — or does one side/corner feel heavy while another
   is void?
3. Is the emphasized path findable in under a second?
4. Does anything visibly collide or touch that shouldn't?

Then zoom to 100% and walk the repeated offsets (arrow gaps, insets, gutters) — they must be
uniform. Fix what fails, re-run validation, done. When something feels off and you can't name
it, the house remedies in order: reduce glow, lighten the leather midtone, widen padding —
and now also: shrink the void, unglue the collision, add a hierarchy rung.
