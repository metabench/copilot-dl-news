# Working Notes – jsgui3-server activation lab after npm update

- 2025-12-14 — Session created via CLI. Add incremental notes here.

## Environment

- Main repo deps updated by user (`npm update` already run).
- No separate `package.json` under `src/ui/lab/**` (experiment uses main dependencies).

## Evidence

### Experiment 020 check

- Command: `node src/ui/lab/experiments/020-jsgui3-server-activation/check.js`
- Result: PASS
	- ✅ SSR returns 200 and includes `activation_lab_page` + `ctrl_fields_demo`
	- ✅ `data-jsgui-fields` contains `count`
	- ✅ `data-jsgui-ctrl-fields` includes `status` + `btn`
	- ✅ `/js/js.js` + `/css/css.css` return 200
	- ✅ Client activation sets `data-activated=1`
	- ✅ Click increments `data-count` and updates status text

### Notes

- Browser console still includes warnings like `Missing context.map_Controls for type undefined, using generic Control` and `&&& no corresponding control`.

### Reduce console noise

- Added a data-URL favicon in `ActivationLabPage` so the browser doesn’t request `/favicon.ico`.
- Re-ran the same check script; PASS and the `/favicon.ico` console error is gone.

## Activation pipeline notes (SSR → client)

Key takeaways from reading installed `jsgui3-*` runtime sources:

- Client startup (from `jsgui3-client`) runs activation automatically on window load: it creates a `Client_Page_Context`, updates standard controls, then calls `pre_activate(context)` followed by `activate(context)`.
- Persisted field hydration: `jsgui3-html` reads `data-jsgui-fields` from DOM elements during control construction and stores it into `_persisted_fields`. Controls can use that inside `activate()`.
- ctrl_fields hydration: `jsgui3-html` reads `data-jsgui-ctrl-fields` during pre-activation and binds named properties via `this[key] = context.map_controls[id]`.

Interpreting the remaining browser warnings:

- `Missing context.map_Controls for type <X>` means the DOM says the element is type `<X>` but the client context doesn’t have a constructor registered at `context.map_Controls[X]`. It falls back to generic `Control`.
- `Missing context.map_Controls for type undefined` is often log noise for exempt tags where `data-jsgui-type` is intentionally not emitted (notably `html/head/body`).
- `&&& no corresponding control` correlates with text nodes (often whitespace/newlines) during `pre_activate_content_controls` alignment; usually benign but indicates a fragile DOM↔control-array mapping.

Durable write-up (Skill): `docs/agi/skills/jsgui3-ssr-activation-data-bridge/SKILL.md`
