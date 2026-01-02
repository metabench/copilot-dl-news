# Follow Ups – Unified App: Sub-App Foundations (Keep Iframes)

- Convert one low-risk sub-app (e.g. Home or a placeholder) into a true embedded panel implementation (no iframe), using `wrapPanelHtml(..., activationKey)` and a dedicated `registerActivator` hook.
- Decide on a formal sub-app contract shape (server-side) before migrating more apps:
	- `renderContent(req) -> { html, activationKey?, assets? }` vs keeping HTML + `data-*` attributes.
	- Whether activation needs separate `onShow` vs `onLoad` hooks.
- Add a small check or Jest test that asserts the unified shell client script contains the panel activation seam (guards against regressions when editing `_buildClientScript`).
