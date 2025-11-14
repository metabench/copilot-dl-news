# Follow Ups — 2025-11-20 UI Data Explorer Production Tests

- Investigate whether we can close the production `better-sqlite3` handles more aggressively (or reuse `openNewsDb` in read-only mode) so `jest_careful_runner` stops flagging hanging workers when both suites run together.
- Extend the production-data coverage to `/urls/:id` and `/domains/:host` once we have a deterministic fixture that ships with the repo instead of the mutable `data/news.db` snapshot.
