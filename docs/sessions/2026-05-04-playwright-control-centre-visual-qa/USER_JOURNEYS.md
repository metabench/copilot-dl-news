# User Journeys: Playwright Control Centre Visual QA

| Journey | User goal | Start state | Steps | Visible success criteria | Evidence |
|---|---|---|---|---|---|
| Control centre overview | See available apps and switch between them | Unified app running | Open control centre, inspect navigation, switch apps | Navigation is usable, content is not squeezed, selected app is clear | Playwright snapshot/screenshot |
| Crawl operations panel | Review crawl controls and status concisely | Unified app running | Open `cloud-crawl` app | Key crawl actions and metrics are visible without clutter | Playwright screenshot + capture helper |
| Downloads evidence | Verify recent crawl/download data is readable | Unified app running | Open `downloads` app | Recent rows/cards are scannable on desktop and mobile | Playwright screenshot + direct image review |
| Screenshot review | Browse captured UI runs and comments | Unified app running with session screenshots | Open `screenshot-review` app, inspect filters/gallery/comments | Runs, images, DOM links, and comments are discoverable | Playwright screenshot |
| Bounded crawl display | Confirm small crawl output presents correctly | Remote crawl available | Run only 5 domains x 5 pages, refresh crawl/download screens | New/active crawl evidence is visible without layout breakage | CLI result + UI screenshots |
