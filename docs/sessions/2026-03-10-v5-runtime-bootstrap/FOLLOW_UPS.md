# Follow Ups – V5 Runtime Bootstrap

## Next
- Fold real runtime reuse from `remote-crawler-v2` into the v5 boundary now that the initial server contract is stable and test-covered.
- Replace the default `hub-suggestions` placeholder with a real adapter over `CountryHubGapAnalyzer`, `PlaceHubPatternLearningService`, and topic-hub query surfaces.
- Add SSE or equivalent live status transport to the v5 boundary before UI work begins.
- Introduce the first restart-safe persisted run state so the bootstrap runtime stops being purely in-memory.
