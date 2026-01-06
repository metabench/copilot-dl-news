Context: Default crawl behavior needed to prioritize hub discovery + pattern learning, while keeping legacy sequences available.

Options:
1) Keep default sequence preset (basicArticleDiscovery) and rely on operators to invoke multi-modal manually.
2) Change the default sequence preset to a hub-heavy sequence (e.g., intelligentCountryHubDiscovery).
3) Add a multi-modal mode switch in the default runner/config and route defaults through the multi-modal orchestrator. (Chosen)

Decision: Implement `crawlDefaults.mode: "multi-modal"` with `crawlDefaults.multiModal` settings and update the crawl runner to dispatch multi-modal when mode indicates, leaving sequences available for explicit commands.

Consequences:
- Default runs now use the multi-modal loop with hub discovery + guessing and 1000-page batches.
- Existing sequence presets remain unchanged for explicit `--sequence` usage.
- Reverting defaults is a config-only change (mode switch).
