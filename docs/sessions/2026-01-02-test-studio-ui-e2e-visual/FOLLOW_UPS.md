# Follow Ups – Test Studio UI E2E (Visual)

- Fix/track: Jest open handles after `guardian-1000-page-crawl-persists-to-db.e2e.test.js` (run with `--detectOpenHandles`, identify remaining timers/servers/DB handles).
- Tighten: Reduce crawl overrun (`downloads=1004`, `visited=1008`) if desired by constraining fixture link emission or crawler enqueue logic.
- UX: Consider surfacing the DB-backed 1000-page rerun output artifacts path directly in Test Studio UI.
