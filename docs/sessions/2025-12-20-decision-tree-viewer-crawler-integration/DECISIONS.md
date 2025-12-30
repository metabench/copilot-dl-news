# Decisions – Connect crawler to decision tree viewer

## 2025-12-20 — Start with deep-link MVP

Decision: Implement a minimal “Decision Trees” entrypoint from the crawler UI that deep-links into the Decision Tree Viewer (prefer `/set/:slug` when an active config set slug is known).

Rationale:
- Ships a few-click UX immediately with low risk.
- Uses existing, stable primitives (DecisionConfigSetState + DecisionTreeViewer `/set/:slug`).
- De-risks later “decision trace” work by confirming users actually want per-URL explanations vs rule/policy visibility.

Follow-up: If per-URL explainability is still desired after MVP, design a small `DecisionTrace` JSON format and add viewer support incrementally (show list + encodedPath first; visual highlight later).

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-20 | _Brief context_ | _Decision summary_ | _Impact / follow-ups_ |
