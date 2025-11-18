# Plan: ui-dashboard-routing

Objective: Separate the dashboard summary UI from the URLs table so the landing page stays light and paging works reliably on narrow displays, while moving the URLs list to its own screen with responsive layout fixes.

Done when:
- Home route renders only the dashboard cards/jobs/atlas without the full URL table controls.
- Dedicated `/urls` page shows the table, filters, and pagination with layout tuned for sub-1400px widths.
- Navigation affordance (header/links) allows moving between Home and URLs.
- Client bundle updated accordingly and builds succeed (`npm run ui:client-build`).
- Session docs capture discovery commands, implementation notes, and verification steps.

Change set:
- `src/ui/server` routes/templates (home vs urls)
- `src/ui/client/index.js` if additional bootstraps required
- `src/ui/client/jobsManager.js`, other UI helpers for responsiveness tweaks
- `public/` or CSS assets for layout adjustments
- Session docs + any relevant README/workflow updates

Risks/assumptions:
- Assumes existing Express server can support multiple views without major refactor.
- Need to ensure Diagram Atlas/job widgets still have data sources per UI Singularity rules.
- Pagination state must persist when moving URLs content to new page.

Tests:
- `npm run ui:client-build`
- Targeted Jest or check scripts if pagination/table controls touched (`npm run test:by-path <test>` TBD)
- Manual browser spot-check (documented in WORKING_NOTES)

Docs to update:
- This session's WORKING_NOTES + summary
- `docs/sessions/SESSIONS_HUB.md`
- Add follow-ups if new backlog emerges
