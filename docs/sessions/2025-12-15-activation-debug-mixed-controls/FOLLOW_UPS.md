# Follow Ups – Activation debugging with mixed controls

- Extract a small shared helper (eg `src/ui/lab/shared/activationDiagnostics.js`) for building reports (missingTypes / missingConstructors / missingInstances) so labs stop duplicating logic.
- Add a tiny docs note (or Skill update) that explains the “constructor registry vs instance registry” split and points to lab 029 as the quickest repro.
- Optional: expose a minimal activation report hook in the main UI bundle behind a debug flag so production-ish pages can be diagnosed without modifying code.
