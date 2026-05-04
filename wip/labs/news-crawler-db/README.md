# News-Crawler-DB Drop-in Labs

This lab series evaluates whether the `news-crawler-db` module can replace the current DB layer in this repo with minimal changes.

## Goals

1. **Adapter compatibility** — confirm method coverage vs `NewsDatabase`.
2. **Handle compatibility** — ensure `.db` behaves like a `better-sqlite3` handle for query modules.
3. **Smoke flows** — validate basic read/write and schema assumptions without touching `data/news.db`.

## How to Run

```bash
node labs/news-crawler-db/experiments/001-adapter-surface-audit.js
node labs/news-crawler-db/experiments/002-db-handle-compat.js
node labs/news-crawler-db/experiments/003-basic-write-read-smoke.js
```

## Notes

- Experiments use temporary databases under `tmp/news-crawler-db-lab/`.
- If `news-crawler-db` is not installed, experiments report the missing module and exit non-fatally.
