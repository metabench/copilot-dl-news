# Decisions — Basic Crawl Health

| Date | Context | Decision | Consequences |
|------|---------|----------|--------------|
| 2025-11-13 | Validate basic crawl health via automated suites | Treat the passing queueManager + phase integration Jest suites as sufficient evidence that the offline basic crawl logic is healthy for this checkpoint. | No code changes required; confidence limited to unit/integration coverage (live crawl still unverified). |
| 2025-11-13 | Align presets with new basic vs. intelligent crawl expectations | Move country hub exploration/ensure stages into `intelligentCountryHubDiscovery`; set `basicTopicDiscovery` (topics + place hubs only) as the default basic preset. | Basic CLI/config defaults skip country hub discovery; intelligent runs retain full flow without regressing prior behaviour. |
