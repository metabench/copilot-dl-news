# Working Notes – UrlDecision orchestrator wiring

- 2025-12-07 — Session created via CLI. Add incremental notes here.
- 2025-12-07 — UrlEligibilityService now consults UrlDecisionOrchestrator gate before legacy getUrlDecision to avoid double computation; query-superfluous still triggers handlePolicySkip via synthetic decision.
