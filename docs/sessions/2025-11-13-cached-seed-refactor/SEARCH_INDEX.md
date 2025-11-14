# Search Index — Cached Seed Refactor

| Keyword | Context | Link |
| --- | --- | --- |
| processCacheResult | QueueManager, WorkerRunner, and PageExecutionService now honor this flag so cached seeds run full discovery. | `src/crawler/QueueManager.js`, `src/crawler/WorkerRunner.js`, `src/crawler/PageExecutionService.js` |
| cached seed CLI | Intelligent crawl CLI exposes `--seed-from-cache` and `--cached-seed` to enqueue cache-backed work. | `tools/intelligent-crawl.js`, `src/crawler/NewsCrawler.js` |
| cached seed tests | Regression coverage ensures QueueManager context propagation + PageExecutionService cache processing (and cache-miss fallback). | `src/crawler/__tests__/queueManager.basic.test.js`, `src/crawler/__tests__/pageExecutionService.test.js` |
