
## Lab 044: fix + evidence (data-testid wiring)

### Root cause
- In this lab, setting HTML attributes like `data-testid` by passing them as top-level keys in a jsgui3 control spec (e.g. `tag(ctx, "button", { "data-testid": "flip-axes" })`) did **not** reliably emit the attribute into SSR HTML.
- Puppeteer then failed on `page.click('[data-testid="flip-axes"]')`.

### Fix pattern
- Set attributes via the control DOM attribute bag:
	- `ctrl.dom.attributes["data-testid"] = "flip-axes"`
	- same approach for wrapper divs and any ad-hoc `td` test ids.

### Evidence (command + outputs)
- Run: `node src/ui/lab/experiments/044-matrix-table-control/check.js`
- Result: all assertions green (SSR markers + activation + flip axes).
- Artifacts:
	- `screenshots/lab-044-matrix-table-control-a.png`
	- `screenshots/lab-044-matrix-table-control-b.png`

# Working Notes – MatrixTableControl Lab + Flip Axes

- 2025-12-30 — Session created via CLI. Add incremental notes here.
