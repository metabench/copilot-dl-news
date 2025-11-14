# Agent Guidance

- Always start by reading `PageExecutionService.js` around `_emitPageLog` usages to maintain context.
- Avoid adding new console output surfaces; reuse the existing `PAGE` JSON helper so `progressAdapter` can continue formatting without updates.
- When modifying JavaScript files, leverage `tools/dev/js-scan.js` for dependency discovery and `tools/dev/js-edit.js` for batch edits when the change spans multiple regions.
- Keep CLI output minimal: no per-link chatter, only the structured event per page.
- Document any additional telemetry fields or status codes in this session's WORKING_NOTES.
