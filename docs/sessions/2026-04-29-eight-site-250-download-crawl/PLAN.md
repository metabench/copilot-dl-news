# Plan: Eight-Site 250 Download Crawl

Objective: Run and observe a crawl that stores at least 250 new downloaded pages per site across eight major news websites.

Done when:
- Eight major news websites are selected and recorded.
- Baseline local download counts are captured before the crawl.
- The crawl runs through the distributed remote path with local sync/pull into `data/news.db`.
- Each selected host has at least 250 new downloads after the run; hub pages may count.
- The jsgui3 UI is started and visual/API evidence is captured for crawl/download display.

Change set:
- `docs/sessions/2026-04-29-eight-site-250-download-crawl/*`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md` if the run produces useful UI/crawl learnings.

Risks/assumptions:
- Remote crawler availability and site rate limits may prevent all hosts from reaching 250 new downloads in one bounded run.
- News sites may block or redirect requests; verification will use local DB evidence, not remote status alone.
- Existing workflow files referenced by older instructions, `docs/workflows/WORKFLOW_REGISTRY.md` and `docs/workflows/continuous-crawl-repair-loop.md`, are absent in this repo snapshot; current `tools/crawl/AGENT.md` and `docs/INDEX.md` are used instead.

Operational workflow:
- Selected branch: remote v2 distributed crawl with sync/pull into local `data/news.db`.
- Initial branch: healthy measurement branch. If fleet status indicates outage, classify and repair before crawling.

Tests/checks:
- Remote status/health check.
- Local baseline and post-run host-count checks against `data/news.db`.
- UI server check/start plus screenshot or API evidence for crawl/download display.
