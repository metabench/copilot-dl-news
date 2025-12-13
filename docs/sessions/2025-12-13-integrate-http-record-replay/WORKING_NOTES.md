# Working Notes – Integrate HTTP record/replay commit

- 2025-12-13 — Session created via CLI.

## Commands run
- `git stash push -u -m "pre-cherry-pick local uncommitted changes"`
- `git cherry-pick 0480388` (applied as `10a58a9` on this branch)
- `npm run test:by-path tests/crawler/httpRecordReplay.test.js`
- `npm run test:by-path tests/crawler/decisionTraceHelper.test.js`

## Notes
- Used `git stash -u` to avoid cherry-pick failure from untracked session folders that would have been overwritten.
- `runTests` tool reported “No tests found” for these files; `npm run test:by-path` worked and is the repo-preferred runner.
