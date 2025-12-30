# Plan – Phase 9 Item 6: Alert & Notification System

## Objective
Implement alert engine, rule evaluator, breaking news detector, notification service, DB adapter, and API routes

## Done When
- [x] AlertEngine.js - Main orchestrator
- [x] RuleEvaluator.js - Parse and evaluate rule conditions
- [x] BreakingNewsDetector.js - Detect breaking news from velocity/keywords
- [x] NotificationService.js - Multi-channel delivery (webhook, email, in-app)
- [x] alertAdapter.js - DB adapter for alert tables
- [x] index.js - Module exports
- [x] API routes for alerts (src/api/v1/routes/alerts.js)
- [x] Tests in tests/alerts/
- [x] Roadmap item marked complete

## Change Set
### Created Files
- `src/alerts/AlertEngine.js` - Main orchestrator, subscribes to EventBroadcaster
- `src/alerts/RuleEvaluator.js` - Rule condition evaluation with AND/OR/NOT logic
- `src/alerts/BreakingNewsDetector.js` - Velocity, keyword, sentiment-based detection
- `src/alerts/NotificationService.js` - Multi-channel delivery with throttling
- `src/alerts/index.js` - Module exports
- `src/db/sqlite/v1/queries/alertAdapter.js` - DB adapter for all alert tables
- `src/api/v1/routes/alerts.js` - REST API routes
- `tests/alerts/fixtures.js` - Test fixtures and mock services
- `tests/alerts/RuleEvaluator.test.js` - Rule evaluator tests
- `tests/alerts/BreakingNewsDetector.test.js` - Breaking news detector tests
- `tests/alerts/AlertEngine.test.js` - Alert engine tests

### Updated Files
- `data/roadmap-phase9.json` - Item 6 marked as completed

## Risks & Mitigations
- **Email delivery**: Requires SMTP configuration (documented in NotificationService)
- **Webhook reliability**: Implemented retry with exponential backoff
- **Alert spam**: Throttling (10/hour per user) and dedup implemented

## Tests / Validation
- `npm run test:by-path tests/alerts/` to run all alert system tests
- Manual testing with EventBroadcaster to verify end-to-end flow
