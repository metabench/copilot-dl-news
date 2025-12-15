# 029 — Mixed Built-ins + Custom Activation

Purpose: exercise a control tree that mixes:

- A built-in control from `jsgui3-html` (`Color_Grid`)
- Custom controls defined in this repo (leaf + panel + page)

…and emit **structured activation diagnostics** (instead of relying on noisy console spam).

## What this lab catches

- Missing `data-jsgui-type` on server-rendered nodes (beyond `head`/`body`)
- Missing constructors for **custom** control types
- Missing `context.map_Controls[...]` entries for custom types
- Missing instances in `context.map_controls` for custom types (DOM has id, but control registry doesn’t)
- Custom `activate()` not running (leaves never set `data-leaf-activated=1`)
- Built-in require path issues (Color_Grid not available)

## How to run

```bash
node src/ui/lab/experiments/029-mixed-builtins-custom-activation/check.js
```

## Optional debug output

This lab stores a report on `window.__mixed_activation_report`.

To print it in the browser console (useful during manual debugging), set either flag:

- `window.__COPILOT_ACTIVATION_DEBUG__ = true`
- `window.__COPILOT_ACTIVATION_DEBUG_VERBOSE__ = true`

(These are gated so normal runs stay quiet.)
