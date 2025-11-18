# Session 2025-11-15 · URL Filter Debug

**Scope**: Investigate and fix the `/urls` page toggle + bundle runtime errors reported on Nov 15.

## Quick Links
- [Plan](./PLAN.md)
- [Working Notes](./WORKING_NOTES.md)
- [Session Summary](./SESSION_SUMMARY.md)
- [Roadmap](./ROADMAP.md)
- [Follow Ups](./FOLLOW_UPS.md)
- [Decisions](./DECISIONS.md)

## Status
- 🔄 In progress — bundle throws `each_source_dest_pixels_resized_limited_further_info` reference error and toggle does not refresh data.

## Context Snapshot
- Client bundle: `public/assets/ui-client.js`
- Controls: `src/ui/controls/UrlFilterToggle.js`, `src/ui/controls/UrlListingTable.js`
- Server: `src/ui/server/dataExplorerServer.js`
- Docs lineage: see prior session `docs/sessions/2025-11-15-url-filter-client`
