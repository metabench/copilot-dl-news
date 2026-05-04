# User Journeys: Screenshot Tooling Control Centre

| Key | User goal | Start state | Steps | Expected visible outcome | Screenshot selectors |
| --- | --- | --- | --- | --- | --- |
| screenshot-review | Browse saved screenshot evidence | At least one `analysis.json` exists under a session `screenshots/` folder | Open `/?app=screenshot-review` | Runs list is populated, selected run displays image cards or skipped placeholders, comments are visible | `[data-screenshot-review-root]`, `[data-screenshot-review-ready]`, `[data-screenshot-review-runs]` |
| screenshot-comment | Leave a review comment for a screenshot run | Screenshot Review panel is loaded and a run is selected | Choose a target, type a comment, submit | Comment is appended to `SCREENSHOT_COMMENTS.md` and the comment log refreshes | `[data-screenshot-review-comment-form]`, `[data-screenshot-review-comments]` |
| route-capture | Capture UI routes with minimal custom code | Capture script defines route records | Run `scripts/ui/capture-unified-crawl-display.js --save-screenshots` | PNGs and `analysis.json` are written, `ok=true`, no overflow/errors | route `waitSelector` and optional `readySelector` |