# Working Notes – Distributed crawl packaging

- 2026-01-07 — Session created via CLI.
- 2026-01-07 — Drafted distributed crawl design for remote workers (SSH-driven, tarball artifacts). See DESIGN.md.
- 2026-01-07 — Implemented worker server (labs/distributed-crawl/worker-server.js) with /batch POST for GET/HEAD list; added lab runner labs/distributed-crawl/lab-batch-fetch.js using a local stub target.
- 2026-01-07 — Worker now supports chunked batches of 20, optional Puppeteer fetch (`usePuppeteer`), no default body cap (maxBodyBytes=null unless provided), and lab updated to exercise Puppeteer flag.
- 2026-01-07 — Added remote-oriented lab (labs/distributed-crawl/lab-remote-worker.js) to send arbitrary URL lists to a running worker (local or remote) with CLI flags for concurrency/batchSize/puppeteer/body.
- 2026-01-07 — Added package.json (labs/distributed-crawl) with puppeteer dep; added controller-run.js to split URLs into batches, POST to worker, and save results.ndjson + summary.json locally.
