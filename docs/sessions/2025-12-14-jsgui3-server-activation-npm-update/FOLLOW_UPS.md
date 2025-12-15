# Follow Ups – jsgui3-server activation lab after npm update

- Track down what emits `Missing context.map_Controls for type undefined` during `pre_activate`.
	- Hypothesis: this corresponds to exempt tags (`head`/`body`) where `data-jsgui-type` is intentionally not emitted; consider silencing this log in pre_activate when tagName is exempt.
- Track down why `context.map_Controls` lacks constructors for common tags like `style` and `main` in the client context.
	- Hypothesis: the context boot only registers a subset of standard controls; consider a single startup hook that registers common tag controls (or maps missing tag types to generic Control without logging).
- Track down what emits `&&& no corresponding control` during `pre_activate` and whether it’s mostly whitespace text nodes (trim-empty) vs. a real content mismatch.
- (Optional) Teach the check script to fail on `pageerror` and unexpected console `error` entries (while allowing known warnings), to keep regressions loud.

See: `docs/agi/skills/jsgui3-ssr-activation-data-bridge/SKILL.md`
