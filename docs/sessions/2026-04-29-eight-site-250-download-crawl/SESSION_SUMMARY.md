# Session Summary

Status: Completed

## Objective
Run a UI-visible eight-site distributed crawl and verify at least 250 new local downloads per selected host.

## Results
Success. The crawl produced at least 250 new local `http_status = 200` downloads for each of eight major news websites, counted from baseline timestamp `2026-04-29T20:29:44.133Z`.

Final selected sites and local new 200-status download counts:

| Site | New OK Downloads |
|------|------------------|
| `bbc.com` | 298 |
| `aljazeera.com` | 272 |
| `theguardian.com` | 294 |
| `cbsnews.com` | 285 |
| `nbcnews.com` | 296 |
| `france24.com` | 298 |
| `euronews.com` | 300 |
| `independent.co.uk` | 294 |

Verification command:

```bash
node docs/sessions/2026-04-29-eight-site-250-download-crawl/host-download-delta.js --since 2026-04-29T20:29:44.133Z --sites "bbc.com,aljazeera.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com,euronews.com,independent.co.uk"
```

UI evidence:

- Unified jsgui3 UI: `http://localhost:51012`
- Downloads screenshot: `screenshots/eight-site-250-download-crawl/downloads.png`
- Crawl Status screenshot: `screenshots/eight-site-250-download-crawl/crawl-status.png`
- Screenshot analysis: `screenshots/eight-site-250-download-crawl/analysis.json`, `ok: true`

Operational cleanup:

- Remote crawler final state: orchestrator `IDLE`.
- Continuous sync process stopped.
- Unified UI intentionally left running for inspection.

Notes:

- Initial candidate sites `reuters.com`, `apnews.com`, `npr.org`, and `abcnews.go.com` were too shallow or blocked for this crawl path and were not counted in the final eight.
- Remote bounded crawl success was not treated as sufficient; final success used local `data/news.db` evidence after remote sync/pull.
