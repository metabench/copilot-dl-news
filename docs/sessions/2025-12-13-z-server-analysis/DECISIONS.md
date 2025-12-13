# Decisions – z-server analysis

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-13 | Windows process inspection in z-server relies on `wmic`, which is deprecated/removed on newer Windows builds. | Prefer a cross-platform process list (`ps-list`) and add a Windows fallback via PowerShell CIM for command line retrieval; treat `wmic` as best-effort only. | Requires updating unit + E2E cleanup code paths; improves reliability on modern Windows and reduces brittle parsing. |
