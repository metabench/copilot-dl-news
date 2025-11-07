# Plan: js-scan dependency follow-up

Objective: Validate the new `js-scan --deps-of` experience, capture representative outputs for memory docs, and scope the next round of dependency tooling enhancements.

Done when:
- MODEL and LOG each include at least one real `--deps-of` run (text + `--json`) documenting depth/limit behavior.
- Feedback or open questions about the dependency tables are captured in STATE along with proposed refinements (depth UI, guidance tweaks).
- Backlog of follow-up changes is drafted with acceptance notes so the next iteration can start without rediscovery.

Change set:
- docs/agents/js-tools/STATE.md
- docs/agents/js-tools/PLAN.md
- docs/agents/js-tools/LOG.md
- docs/agents/js-tools/MODEL.md
- tools/dev/js-scan/operations/dependencies.js (only if refinements emerge during validation)
- .github/agents/Upgrade js-md-scan-edit.agent.md (guidance section, if messaging changes)

Risks/assumptions:
- Sample targets must exist in the repo; choose stable fixtures to avoid flaky documentation.
- Additional guidance output should stay concise--overly verbose tips could dilute the "terse" requirement.
- Any refinements to dependency traversal must retain current performance characteristics on large workspaces.

Tests / verification:
- Manual: `node tools/dev/js-scan.js --deps-of tests/fixtures/tools/js-scan/sample.js --dep-depth 2 --limit 5` (text), the same with `--json`, and optionally `--deps-parse-errors` for detailed samples; record timings and output snippets.
- Automated: rerun `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath tests/tools/__tests__/js-scan.test.js` after CLI toggles or messaging changes.

Docs to update:
- docs/agents/js-tools/STATE.md (feedback + next steps)
- docs/agents/js-tools/LOG.md (command runs, observations)
- docs/agents/js-tools/MODEL.md (captured samples, refined module notes)
- .github/agents/Upgrade js-md-scan-edit.agent.md (if guidance copy changes)

Tasks:
1. Run the text and JSON `--deps-of` commands against stable fixtures; capture outputs and note runtime. (done 2025-11-07)
2. Summarize observations in LOG (command, duration, notable rows) and embed representative excerpts in MODEL under Active module notes. (done 2025-11-07)
3. Gather or articulate feedback (e.g., need for depth UI, guidance phrasing) and write them into STATE with acceptance criteria for future work. (done 2025-11-07)
4. Decide whether immediate code tweaks are warranted; if so, revise dependencies.js/help text and rerun targeted Jest suites. (done 2025-11-07, added `--deps-parse-errors`, updated help/tests)

Follow-up tasks:
1. Draft depth-aware UI and guidance tweaks (acceptance = documented variants + effort estimate).
2. Collect feedback on the new parse error hint (EN/zh) and decide whether to bubble counts into the tables by default.
