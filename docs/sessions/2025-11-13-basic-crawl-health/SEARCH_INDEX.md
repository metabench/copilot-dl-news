# Search Index — Basic Crawl Health

| Keyword | Context | Link |
|---------|---------|------|
| queueManager.basic | Jest target covering queue behaviour for basic crawls; PASS on 2025-11-13 | src/crawler/__tests__/queueManager.basic.test.js |
| queueManager.e2e | End-to-end queue pipeline test (hub→article) for default crawler; PASS on 2025-11-13 | src/crawler/__tests__/queueManager.e2e.test.js |
| phase-123-integration | Planner + crawler integration suite validating default crawl orchestration; PASS on 2025-11-13 | src/crawler/__tests__/phase-123-integration.test.js |
| basicTopicDiscovery | Basic crawl preset focusing on topic + place hubs (no country ensure/explore) | src/crawler/operations/sequencePresets.js |
| intelligentCountryHubDiscovery | Intelligent crawl preset retaining explore/ensure country hub flow | src/crawler/operations/sequencePresets.js |
| crawl.js place | CLI surface exposing place workflows (`place guess`, `place explore`); dovetails with basic crawl validations | crawl.js |
| guessPlaceHubsOperation | Operation wrapper enabling GuessPlaceHubs from crawl facade; supports targeted place crawl diagnostics | src/crawler/operations/GuessPlaceHubsOperation.js |
