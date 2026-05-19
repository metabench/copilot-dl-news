# Plan: Crawl CLI Operator Command

Objective: reduce the manual crawl-operator sequence from the twelve-site run into a clearer single-command workflow with setup checks, feature reporting, coloured output, and emoji status cues.

Linked sessions:
- `docs/sessions/2026-05-12-twelve-site-100-page-crawl/`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

Done when:
- The prior crawl phase is reviewed for avoidable manual steps.
- `tools/crawl/crawl-remote.js` exposes a higher-level operator command for setup, launch, sync, local verification, and shutdown/drain.
- CLI output explains the remote host, local DB, target domains, sync/prune/adaptive options, and verification criteria.
- Coloured text and relevant emojis are used for human output while preserving `--json` behavior.
- Focused tests cover the new pure helper behavior and existing bounded-crawl reliability helpers still pass.
- Follow-up: Guardian/BBC 10-page profile can request depth-4 remote exploration and the tooling explains when known front-page/hub URLs produced no fresh downloads.
- Follow-up: "download target" accounting is based on newly exported/saved response content from this run, not merely already-known remote URL rows.
- Follow-up: the remote crawler server can be built and deployed with one CLI command that refuses to overwrite a busy server unless `--force` is supplied and suggested.

Change set:
- `tools/crawl/crawl-remote.js`
- `tools/crawl/lib/crawl-remote-bounded.js` if pure helpers are needed.
- `tests/tools/crawl-remote-bounded.test.js`
- `deploy/remote-crawler-v2/lib/run-worker.js` and `deploy/remote-crawler-v2/multi-domain-server.js` for remote max-depth propagation if needed.
- `tools/crawl/profiles/remote-guardian-bbc-10-agent.json`
- `docs/sessions/2026-05-12-crawl-cli-operator-command/*`
- `docs/sessions/SESSIONS_HUB.md`
- `tools/crawl/deploy-remote-server.js` for crawler-specific remote server build/deploy.
- `tests/tools/remote-crawler-deploy.test.js`

Risks/assumptions:
- The current runnable CLI remains in `copilot-dl-news`; `news-crawler-itself` is not yet the active implementation repo.
- Remote crawl APIs are live-network dependent, so automated validation should focus on local syntax and pure helper tests.
- The operator command should use conservative defaults and keep destructive remote prune behavior explicit or bounded to confirmed exported URL IDs.
- Existing remote DB rows use `INSERT OR IGNORE`; already-downloaded seed/hub URLs may not become pending again. Any fix must avoid destructive reset/requeue behavior and should prefer deeper queueing from not-yet-downloaded URLs.
- Deploy tooling must preserve remote crawl data, avoid shell interpolation for local commands, and make service interruption explicit when `--force` is needed.
