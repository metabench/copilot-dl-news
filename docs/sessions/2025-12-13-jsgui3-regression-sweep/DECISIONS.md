# Decisions – jsgui3 Stack Regression Sweep

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-13 | Define “ready to upgrade” gate | Gate includes: key SSR check scripts + representative Jest + Puppeteer E2Es (see `PLAN.md`/`WORKING_NOTES.md`). | Upgrade is allowed once this gate is green; post-upgrade reruns must match this set. |
| 2025-12-13 | Avoid false negatives during artifact generation | Run SSR check scripts sequentially (not in parallel), because interruptions / interleaved output can look like failures. | Baseline evidence is easier to interpret; slightly slower but more trustworthy. |
| 2025-12-13 | Puppeteer flake in URL filter toggle | Wait for UI client bootstrap (`window.__COPILOT_REGISTERED_CONTROLS__` + listing store) before triggering toggle change, and relax short 5s response timeouts. | E2E becomes repeatable across slower machines and eliminates hydration race flakes. |
