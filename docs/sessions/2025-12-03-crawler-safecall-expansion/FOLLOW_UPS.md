# Follow Ups – Crawler SafeCall Expansion

- Audit remaining crawler modules (`PageExecutionService`, `CrawlerEvents`, etc.) for `catch (_){}` blocks and migrate them to `safeCall` / `safeCallAsync`.
- QueueManager still performs raw `this.cache.get()` calls in `_pullFromQueueType`; consider wrapping them with `safeCallAsync` (similar to `_maybeAttachCacheContext`).
- If we keep mocking `../utils` in tests, prefer `jest.requireActual` to avoid drifting exports (document this pattern in testing guide).
