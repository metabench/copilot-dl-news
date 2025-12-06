# Follow Ups – Investigate MCP reduce undefined error

- Replace newline-based stdio transport with MCP-framed messages (Content-Length headers) or use the official MCP stdio transport helper.
- Add a minimal integration test (or check script) that simulates a framed MCP initialize + tools/list exchange to catch framing regressions.
