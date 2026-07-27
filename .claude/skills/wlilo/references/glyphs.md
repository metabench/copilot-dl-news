# Emoji & Unicode vocabulary for WLILO

Emoji and unicode glyphs are WLILO's *illustration shorthand*: they deliver iconography at
text cost — no paths to draw, no icons to design — and they scale the vector-intensity ladder
down gracefully. Used with restraint they read as deliberate typography; used as confetti they
destroy the luxury register. The rule of scarcity that governs gold governs emoji too.

## Emoji as semantic icons

- **One emoji per node/section/row**, doing a job a label would otherwise do: 🗄️ database,
  ⚙️ process, 🌐 network, 🔒 auth, 📊 metrics, 🛰️ remote, 🧭 navigation, ⏳ pending,
  ✅ ok, ❌ failure, ⚠️ caution, 🔥 hot path, 🧊 cold storage, 🪝 hook, 📦 package, 🧪 test.
- Place them like *bezel ornaments*: leading a title, centered in an icon well, or capping a
  column — not scattered mid-sentence.
- Pick emojis whose silhouette survives small sizes (single strong shape beats busy scenes).
- Tone check: WLILO is a serious luxury surface. 🗄️⚙️🧭📐 fit; 🎉🤪🌈 rarely do (a single
  celebratory glyph is fine on a launch poster — that's the scarcity rule again).

## Unicode sets that earn their keep

| Set | Glyphs | WLILO use |
| --- | --- | --- |
| Box drawing | `┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ║ ╔ ╗ ╚ ╝` | Text-mode panels/tables inside `<text>` blocks; terminal-flavored artifacts |
| Blocks/shades | `▁ ▂ ▃ ▄ ▅ ▆ ▇ █ ░ ▒ ▓` | Inline bar charts and progress meters at text cost (`▇▇▇▂▁ 62%`) |
| Geometric | `● ○ ◆ ◇ ■ □ ▲ △ ▼ ▽ ◉ ◎ ◈` | Bullets, state dots (● active ○ idle), legend keys, connector endpoints |
| Arrows | `→ ⇒ ⟶ ↳ ⤷ ⇄ ⟳ ↺ ⮕ ⇢` | Flow inside labels; `↳` for nesting; `⟳` for retry/loops |
| Stars/marks | `✦ ✧ ★ ☆ ✓ ✔ ✗ ✕ ◦ · … ‣ ※` | `✦` is the house accent star (gold); checks/crosses for status columns |
| Dividers/ornament | `— – ─ ┄ ┈ · • ⋯ ‖` | Rules and separators; `┄` dashed leader lines in text |
| Math/tech | `Δ ∑ ∞ ≈ ≠ ≤ ≥ ± × ÷ ⌀ µ` | Metrics labels without images |
| Currency/units | `€ £ ¥ ₿ § ¶ °` | Data-dense tables |
| Enclosed | `① ② ③ ⓐ ⓑ Ⓐ` | Step numbering when a drawn badge is overkill |
| Small caps trick | `ᴀ ʙ ᴄ…` (or CSS `letter-spacing:0.05em` + uppercase) | Luxury label register |

## Rendering gotchas (learned the hard way — respect these)

- **Emoji in SVG `<text>` render through system emoji fonts** (Segoe UI Emoji on Windows,
  Apple Color Emoji on macOS, Noto on Linux). Color vs monochrome and exact metrics vary by
  platform — never design a layout that breaks if an emoji renders 20% wider or as monochrome.
- **Give emoji their own `<text>` element** (or generous `dx` padding ≈ 1.2em) rather than
  inlining mid-string when position matters; mixed-script metrics are unreliable.
- **Don't put emoji inside `textLength`-constrained text** — the scaler mangles them.
- Box-drawing alignment requires a **monospace font** (`JetBrains Mono, Consolas, monospace`)
  and one `<text>` per line with fixed `dy` steps; proportional fonts shred box art.
- Some glyphs (`✦ ◆ ●`) take `fill` beautifully in SVG — they're text, so gold `#c9a962` fills
  work; emoji generally IGNORE `fill` (they're color fonts). Use geometric glyphs when you need
  token-colored marks; use emoji when you need pictorial meaning.
- Escape `& < >` in text nodes; unicode itself needs no escaping in UTF-8 files, but declare
  nothing exotic — plain UTF-8, no BOM.
- In HTML/CSS surfaces the same vocabulary applies via `::before` content or plain text;
  `font-variant-numeric: tabular-nums` keeps block-bar charts aligned.

## Worked micro-example (unicode-led status row)

```xml
<text x="24" y="40" font-family="JetBrains Mono, Consolas, monospace" font-size="12"
      fill="#2d2d2d">🗄️ news.db      ▇▇▇▇▇▇▂▁ 78%   ● healthy   ↻ 02:14</text>
```
One emoji (identity), block-bar (data), geometric dot (state, could be `fill="#1a8f4d"` as its
own tspan), arrow glyph (last refresh). Zero paths drawn — and it already reads WLILO once it
sits on leather inside an obsidian panel.
