# Decisions – HTTP Record/Replay Harness + Decision Trace Milestones

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-13 | Facade API mismatch: callers instantiate HttpRequestResponseFacade expecting instance methods, but class only has static methods | Option A: Add HttpRequestResponseFacadeInstance wrapper class | Minimal change footprint; callers keep patterns; both APIs remain available |
| 2025-12-13 | HTTP fixture storage format | Store fixtures as JSON with inline body (base64 for binary, UTF-8 for text) | Simple, inspectable format; small overhead for binary; deterministic |
| 2025-12-13 | Decision trace persistence | Keep opt-in via `persist: true` flag, matching existing milestone system | No DB bloat by default; explicit about what gets stored |
| 2025-12-13 | Decision trace size limits | Truncate details payloads exceeding 8KB | Prevents runaway DB growth; logs truncation warning |
