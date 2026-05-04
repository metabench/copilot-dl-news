# Session: Simple Distributed Crawl Readiness

## Objective
Make the repository ready to run the smallest useful crawl in a way that is clearly simple in scope, but not implicitly local-only.

## Done When
- The simple crawl entry point and program flow are mapped from launcher to remote execution and local sync expectations.
- The more complex crawl paths are identified well enough to explain where simple crawl behavior stops and advanced behavior begins.
- The config/profile system is checked for both simple and complex crawl needs, with fixes applied for ambiguity or broken readiness.
- Oracle Cloud remote crawler connectivity/setup is checked through the existing tooling without starting an unbounded crawl.
- Repo terminology makes clear that "simple crawl" means low-scope/low-cardinality and can be distributed.

## Change Set
- Expected docs: `tools/crawl/AGENT.md`, `docs/cli/crawl.md`, possibly this session folder.
- Expected code/config: `tools/crawl/index.js`, `tools/crawl/profiles/*.json`, `tools/crawl/crawl-remote.js`, `tools/crawl/lib/*`, remote crawler deployment files if needed.

## Risks And Assumptions
- Do not start long-running or unbounded production crawls during readiness checks.
- Treat `crawl-remote.js` plus `deploy/remote-crawler-v2/` as the canonical distributed path unless evidence disproves it.
- Oracle Cloud may be reachable only through configured host/SSH/OCI tools available in the local environment.
- Avoid changing crawl semantics unless a concrete readiness blocker is found.

## Tests And Checks
- Run launcher/profile dry-run or list checks.
- Run remote status/health checks if safe.
- Run focused Node checks for any changed config or resolver behavior.
- Use docs/session notes to capture verified program flow.

## Workflow Branch
Readiness/review branch, not a V4 recovery or outage-classification loop. No V4 TTFSL operational cycle is planned.
