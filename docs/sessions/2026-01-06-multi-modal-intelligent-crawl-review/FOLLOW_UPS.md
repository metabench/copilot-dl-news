# Follow Ups – Multi-modal crawl review and parallelization

- Rebuild `better-sqlite3` in a Linux filesystem (move repo off `/mnt/c`) so `src/db/__tests__/multiModalCrawlQueries.test.js` runs.
- Audit/migrate SQL in non-adapter modules (crawler, queue, background tasks, deprecated UI) into db adapters.
- Add JSDoc around multi-modal orchestration + hub guessing config, and mirror in the book if needed.
- Add hub guessing regression checks (Guardian + general) plus a crawl smoke run with `--status-interval`.
