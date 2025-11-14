# Roadmap

## Now
- Audit `_emitPageLog` coverage inside `PageExecutionService`.
- Patch missing emit in content acquisition failure path.

## Next
- Re-run focused crawl sample or unit proxy (if available) to confirm CLI output.
- Capture any additional emit gaps (e.g., exception paths in queue manager).

## Later
- Consider automated tests around `PAGE` events once logging helpers become injectable.
