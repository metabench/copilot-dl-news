# Decisions — 2025-11-17 Hub Eligibility Refresh

| Date       | Context | Decision | Consequences |
|------------|---------|----------|--------------|
| 2025-11-17 | URL eligibility for nav hubs | Use `maxAgeHubMs`-aware freshness check before dropping nav URLs already stored in SQLite | Queue stays populated with navigation work whenever operators demand fresh hubs |
