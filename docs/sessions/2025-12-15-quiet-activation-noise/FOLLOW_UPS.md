# Follow Ups – Silence jsgui activation noise

- Upstream: gate `pre_activate`/`activate` logs inside jsgui3-html behind a debug flag (so consumers don’t need a console filter).
- Add a tiny doc note in `src/ui/README.md` about `window.__COPILOT_DISABLE_CONSOLE_FILTER__` and `window.__COPILOT_UI_DEBUG__`.
- Consider extending the filter to suppress other known-noise strings as they come up, but keep it string-match only (no broad silencing).
