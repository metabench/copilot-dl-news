# Plan – Crawler Improvements and Observables Integration

## Objective
Implement planned crawler abstractions (CrawlPlan, ProgressModel, ResourceBudget) and integrate observables for better state tracking.

## Done When
- [ ] `CrawlPlan` abstraction implemented and tested.
- [ ] `ProgressModel` abstraction implemented and tested.
- [ ] `ResourceBudget` abstraction implemented and tested.
- [ ] `CrawlContext` enhanced with observable properties (using `lang-tools` or similar).
- [ ] `NewAbstractionsAdapter` updated to support these new components.
- [ ] Documentation updated in `RELIABLE_CRAWLER_ROADMAP.md`.

## Change Set (initial sketch)
- `src/crawler/plan/CrawlPlan.js` (New)
- `src/crawler/progress/ProgressModel.js` (New)
- `src/crawler/budget/ResourceBudget.js` (New)
- `src/crawler/context/CrawlContext.js` (Update)
- `src/crawler/integration/NewAbstractionsAdapter.js` (Update)
- `src/crawler/CrawlerServiceWiring.js` (Update)

## Risks & Mitigations
- **Backward Compatibility**: Must ensure existing crawler logic continues to work while transitioning to new abstractions.
- **Performance**: Observable state changes should not introduce significant overhead in high-concurrency crawls.
- **Shadow Mode**: Keep new abstractions in shadow mode initially to validate consistency.

## Tests / Validation
- `tests/crawler/plan/CrawlPlan.test.js`
- `tests/crawler/progress/ProgressModel.test.js`
- `tests/crawler/budget/ResourceBudget.test.js`
- `tests/crawler/context/CrawlContext.observable.test.js`
