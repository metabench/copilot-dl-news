# Decisions – Test Studio UI E2E (Visual)

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2026-01-02 | Jest/Test Studio cannot reliably import ESM-only `node-fetch` without experimental VM modules. | Add a resilient fetch loader: try `node-fetch`, else use minimal `http`/`https` fallback in `FetchPipeline`. | Keeps crawler + E2Es runnable under Jest; follow up to ensure fallback covers any edge cases (redirects/streaming) we later rely on. |
