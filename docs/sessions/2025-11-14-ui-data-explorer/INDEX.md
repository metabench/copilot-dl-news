# Session – UI Data Explorer

**Objective**: expand the existing URL-only Express server into a multi-view crawler data explorer that can surface additional DB summaries without exposing raw HTML payloads.

**Status**: 🔄 In progress (2025-11-14)

**Quick Links**
- [Plan](./PLAN.md)
- [Working Notes](./WORKING_NOTES.md)
- [Session Summary](./SESSION_SUMMARY.md)
- [Follow Ups](./FOLLOW_UPS.md)

**Scope Highlights**
- Reuse the existing rendering pipeline while adding routes for additional summaries (domains, crawls, errors, etc.).
- Keep the UI read-only and focused on aggregate metrics (lengths, counts, timestamps) per user request.
- Rename the server entry point once it handles more than `/urls` to reflect the broader focus.
