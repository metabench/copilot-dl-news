# Working Notes: Twelve-Site 100-Page Crawl

## 2026-05-12 Kickoff

- User requested a crawl of 12 news websites, downloading 100 new pages from each, with ongoing monitoring.
- Ownership: current runnable crawl operations remain in `copilot-dl-news`; intended future owner is `news-crawler-itself`, which is still an empty shell in this workspace.
- Repo-local crawl guide read: `tools/crawl/AGENT.md`.
- Remote health check succeeded: multi-domain v4 server healthy, 10 configured domains, 0 running.
- Remote status showed 10 idle configured domains: `bbc.com`, `theguardian.com`, `reuters.com`, `nytimes.com`, `washingtonpost.com`, `cnn.com`, `apnews.com`, `bloomberg.com`, `ft.com`, and `npr.org`.
- Remote health reported 0 stored payloads, while `content --json` returned older stored-domain rows; use sync/drain verification rather than health alone for storage truth.
- Initial local DB stats command failed because `../news-crawler-db/node_modules/better-sqlite3/build/Release/better_sqlite3.node` has an invalid ELF header in this shell. Local baseline and sync verification are blocked until the native binding is rebuilt or otherwise made usable.

## 2026-05-12 Run Notes

- Local DB access repair:
  - Stopped a Windows Node unified-app process (`src/ui/server/unifiedApp/server.js`, PID 83184) that was holding `data/news.db-shm`.
  - Rebuilt `better-sqlite3` for WSL in `news-crawler-db` and `copilot-dl-news`.
  - Moved stale Windows native binaries to `tmp/native-backups/` in each repo.
- Crawl marker for local verification: `2026-05-12T21:07:51.574Z` (`2026-05-12 21:07:51` for SQLite datetime normalization).
- First remote `run` attempt exposed a CLI regression: `normalizeDomains is not defined` in `tools/crawl/crawl-remote.js`.
  - Fixed by importing `normalizeDomains` from `tools/crawl/lib/crawl-remote-bounded.js`.
  - Validation: `node --check tools/crawl/crawl-remote.js` passed.
  - Focused tests passed: `npm run test:by-path -- tests/tools/crawl-remote-bounded.test.js tests/tools/crawl/crawl-backend.test.js` (2 suites, 24 tests).
- Original selected hosts included older preconfigured domains. Those stopped immediately with 0 new fetched because existing remote state was already complete/idle.
- Replacement strategy: use fresh crawl-friendly news domains and require local `http_responses` evidence, not only remote counters.

## Final Local Verification

Local verification query counted distinct `urls.id` joined to successful, non-empty `http_responses` after the crawl marker, matching either exact host or subdomain (`host = ? OR host LIKE %.host`).

Final locally verified hosts with at least 100 successful pages:

| Host | Unique pages | Last fetched |
| --- | ---: | --- |
| `independent.co.uk` | 100 | `2026-05-12 21:12:25` |
| `cbsnews.com` | 125 | `2026-05-12 21:13:02` |
| `nbcnews.com` | 234 | `2026-05-12 21:34:20` |
| `france24.com` | 102 | `2026-05-12 21:12:55` |
| `euronews.com` | 119 | `2026-05-12 21:12:23` |
| `abc.net.au` | 241 | `2026-05-12 21:34:26` |
| `voanews.com` | 233 | `2026-05-12 21:33:37` |
| `globalnews.ca` | 238 | `2026-05-12 21:34:00` |
| `huffpost.com` | 246 | `2026-05-12 21:33:34` |
| `standard.co.uk` | 241 | `2026-05-12 21:33:34` |
| `express.co.uk` | 239 | `2026-05-12 21:33:42` |
| `vox.com` | 237 | `2026-05-12 21:33:34` |
| `businessinsider.com` | 244 | `2026-05-12 21:33:58` |
| `metro.co.uk` | 242 | `2026-05-12 21:33:47` |

Result: target exceeded locally (`14` hosts at `>=100` successful pages; user asked for `12`).

## Sync / Remote State

- Continuous sync ran with `--prune-after-ingest` and exact exported URL IDs.
- First drain pass pulled `5692` URL rows and `1380` content records.
- Extension pass continued until repeated `No new data` rounds; it pulled `6007` URL rows and `1720` content records before clean SIGINT shutdown.
- Final remote `/api/status` reported `orchestrator.running=false`, `currentlyRunning=0`, `totals.fetched=0`, `totals.stored=0`, `totals.pending=0`.
- Note: `/api/content/stats` still reports historical stored rows across the remote DB, including older pre-existing domains and some current-run hosts. Status and export sync reported no active/pending export data after the final drain.
