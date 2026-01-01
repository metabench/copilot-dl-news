# Change Plan — Subscription & Billing System (Phase 10 Item 2)

---

# Change Plan — Crawl Observer: SQL to DB layer + extract controls (2025-12-31)

## Goal
Finish the in-progress Crawl Observer refactor:
- Remove embedded SQL from the UI server; keep all SQL in `src/db/sqlite/v1/queries/crawlObserverUiQueries.js`.
- Move all jsgui3 controls into `src/ui/server/crawlObserver/controls/`.
- Keep behavior-compatible and efficiency stable (seq cursor paging, tail-by-default, limit clamp, payload gating via `includePayload`).

## Current Behavior
- Crawl Observer lives at `src/ui/server/crawlObserver/server.js` with inline SQL and some inline control definitions.

## Proposed Changes
- Refactor `server.js` to call `createCrawlObserverUiQueries(db)` instead of `db.prepare(...)`.
- Import `TaskListControl`, `TaskDetailControl`, `TelemetryDashboardControl` from the controls folder.
- Add a small smoke check under `src/ui/server/crawlObserver/checks/`.

## Focused Validation
- `node src/ui/server/crawlObserver/checks/crawlObserver.smoke.check.js`

## Notes
- Session plan/notes: `docs/sessions/2025-12-31-crawl-observer-sql-and-controls/`

---

# Change Plan — Unified App: mount Crawl Observer (2025-12-31)

## Goal
Expose Crawl Observer inside the Unified App on the unified server/port (no separate service/port required).

Non-goals:
- No UI redesign (keep iframe embed pattern for now).
- No changes to crawl event schema.

## Current Behavior
- Unified App embeds tools via iframes (mounted paths like `/rate-limit`, `/quality`, etc) in `src/ui/server/unifiedApp/subApps/registry.js`.
- Crawl Observer has a router factory (`createCrawlObserverRouter`) but is not mounted into Unified App, and the registry shows a placeholder mentioning a separate port.

## Proposed Changes
1) Mount Crawl Observer router in-process under `/crawl-observer` in `src/ui/server/unifiedApp/server.js`.
2) Update the Unified App registry entry to iframe `src="/crawl-observer"`.
3) Add base-path support to Crawl Observer UI so internal links + API fetches work when mounted.
4) Update `tests/ui/unifiedApp.registry.test.js` to assert the new embed mount path.

## Focused Validation
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`

## Rollback Plan
- Revert the Unified App mount + registry changes; Crawl Observer remains available via its standalone server.

Branch: `chore/plan-unified-crawl-observer`

---

# Change Plan — Unified App: run crawl + progress (2025-12-31)

## Goal
Make it easy to start a crawl from the Unified App and view crawl progress in real time.

Constraints:
- Single service/port: everything runs inside the Unified App server.
- Reuse existing crawler UI (Crawl Status page + crawl telemetry stream) rather than inventing a new UI.

## Current Behavior
- Unified App can embed Crawl Observer and other dashboards, but does not expose a “run crawl” workflow.
- Crawl Status UI exists as `src/ui/server/crawlStatus/CrawlStatusPage.js`, and crawl telemetry endpoints exist in the API server, but they are not mounted inside the Unified App server.

## Proposed Changes
1) Mount shared RemoteObservable browser scripts in Unified App (`/shared-remote-obs/*`).
2) Mount crawl telemetry endpoints in Unified App:
  - `/api/crawl-telemetry/events` (SSE)
  - `/api/crawl-telemetry/remote-obs` (remote observable)
  - `/api/crawl-telemetry/history` (JSON history)
3) Mount crawl API v1 operations + in-process job registry in Unified App under `/api/v1/crawl`.
4) Add a Unified App sub-app that hosts the Crawl Status UI (mounted at `/crawl-status`) and includes a small “start crawl” form.
5) Update the Unified App registry test to assert the new sub-app is present and points at the mounted path.

## Integration Points
- Uses `TelemetryIntegration` to broadcast + persist telemetry (task_events).
- Uses `InProcessCrawlJobRegistry` + `registerCrawlApiV1Routes` for starting/controlling in-process crawl jobs.
- Crawl Observer continues to work (and can be used alongside Crawl Status for deep inspection).

## Focused Validation
- `node src/ui/server/crawlStatus/checks/crawlStatusPage.remoteObservable.check.js`
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`

## Rollback Plan
- Remove the new module mounts from Unified App and the Crawl Status sub-app entry; the rest of the Unified App remains unchanged.

Branch: `chore/plan-unified-app-run-crawl`

## Implementation Notes
- Completed wiring: `/shared-remote-obs`, `/api/crawl-telemetry/*`, `/api/v1/crawl/*`, and `/crawl-status` mounted in Unified App.
- Added Unified App sub-app entry: `crawl-status` iframe → `/crawl-status`.
- UX: simplified Crawl Status "Start crawl" flow to a URL-only quick start, with operation + overrides behind an Advanced expander.
- UX: added per-job deep link to Crawl Observer task detail (`/crawl-observer/task/<jobId>`) to enable deeper inspection from the simple UI.
- Validations run:
  - `node src/ui/server/crawlStatus/checks/crawlStatusPage.remoteObservable.check.js`
  - `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
  - Smoke render: `node -e "...renderCrawlStatusPageHtml..."` (asserts `crawl-start-form`, `crawl-start-operation-label`, `crawl-start-advanced` markers)

---

# Change Plan — Hub Guessing Matrix Chrome (UI)

## Goal
Extract the shared “matrix chrome” (filters, stats, legend, actions, flip-axes script, shared CSS) into a reusable control so Place Hub Guessing and future Topic Hub Guessing matrices share identical supercontrols and presentation.

Non-goals:
- No re-theming or layout redesign
- No behavior changes beyond refactoring into a shared control
- No Topic Hub Guessing UI implementation yet

## Current Behavior
- Place Hub Guessing matrix is rendered by `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`.
- It inlines: page theme vars + chrome CSS, view toggle script, filters form, stats, legend, and actions (flip button), then renders either `MatrixTableControl` or `VirtualMatrixControl`.
- Screenshot check expects stable selectors: root `[data-testid="place-hub-guessing"]`, flip button `[data-testid="flip-axes"]`, legend `[data-testid="matrix-legend"]`, and `data-view` toggling.

## Proposed Changes
### Step 1: Create reusable chrome control
- Add `src/ui/server/hubGuessing/controls/HubGuessingMatrixChromeControl.js`
- Add `src/ui/server/hubGuessing/controls/index.js` export
- Control responsibilities:
  - Shared CSS (theme vars, container, filters form, stats, legend, action bar, view toggle hide/show)
  - Shared view toggle script (root selector + flip button selector)
  - Render filters form, stats row, legend row, actions row (optional flip button)
  - Parameterize rootTestId/basePath/fields/stats/legend/includeFlipAxes/initialView

### Step 2: Refactor PlaceHubGuessingMatrixControl
- Replace inline chrome generation with `HubGuessingMatrixChromeControl`.
- Keep matrix-specific CSS + rendering (table/virtual/cell styles) in Place control.
- Preserve existing root data attributes: `data-testid`, `data-view`, `data-matrix-mode`, `data-matrix-threshold`.
- Preserve existing testids: `filters-form`, `flip-axes`, `matrix-legend`.

## Risks & Unknowns
- CSS split: ensure view toggling (`data-view`) and test selectors remain unchanged.
- Ensure no selector drift breaks screenshot check.

## Integration Points
- Place matrix control composes the shared chrome inside its root container.
- Future Topic Hub Guessing matrix can reuse the shared control from `src/ui/server/hubGuessing/controls/`.

## Docs Impact
- None (code-only refactor); session notes live under `docs/sessions/2025-12-31-hub-guessing-matrix-chrome/`.

## Focused Test Plan
Run the smallest checks for this feature:
- `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.screenshot.check.js`
- (If fast) `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`

## Rollback Plan
- Revert the Place control refactor and delete the new shared control files.

Branch: `chore/plan-hub-guessing-matrix-chrome`

## Goal
Implement tiered subscription plans with Stripe integration for payment processing. The system will manage user subscriptions (free/pro/enterprise), track API usage, and enforce plan limits.

Non-goals:
- Not implementing real Stripe calls (use mocks for development/testing)
- Not implementing invoice/receipt generation (future enhancement)
- Not implementing proration for mid-cycle upgrades (future enhancement)

## Current Behavior
- `userAdapter.js` manages users, sessions, events, preferences
- `UserService.js` handles authentication and profile management
- `src/api/v1/routes/users.js` has auth middleware patterns
- No billing/subscription system exists
- No usage tracking exists

## Proposed Changes

### Step 1: Database Schema (billingAdapter.js)
Create billing-related tables:
```sql
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'active',
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usage_metrics (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  metric TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  period TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, metric, period)
);

CREATE TABLE billing_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  data TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Step 2: billingAdapter.js
Database adapter following userAdapter patterns:
- CRUD for subscriptions
- Upsert for usage_metrics (increment counters)
- Log billing events
- Query usage by user/metric/period

### Step 3: StripeClient.js (Mocked)
Stripe API wrapper:
- Check STRIPE_SECRET_KEY environment variable
- `createCustomer(email, metadata)` → mock customer ID
- `createCheckoutSession(customerId, priceId)` → mock session
- `createPortalSession(customerId)` → mock portal URL
- `handleWebhook(payload, signature)` → parse events
- All methods throw helpful error if key missing (except in test mode)

### Step 4: SubscriptionService.js
Subscription management:
- `getSubscription(userId)` → plan, status, limits, usage
- `createSubscription(userId, plan, stripeData)`
- `updateSubscription(userId, plan)`
- `cancelSubscription(userId)`
- `getPlanLimits(plan)` → { apiCalls, exports, workspaces, alerts }
- Plan definitions: free, pro, enterprise

### Step 5: UsageTracker.js
Track API calls and exports:
- `increment(userId, metric, count = 1)`
- `getUsage(userId, metric, period?)`
- `resetUsage(userId, period)`
- `isOverLimit(userId, metric)` → boolean
- Metrics: api_calls, exports, alerts_sent

### Step 6: FeatureGate.js
Enforce plan limits:
- `checkLimit(userId, metric)` → { allowed, current, limit, percentage }
- `requirePlanLimit(metric)` → Express middleware
- Soft limit at 80% (warning), hard block at 100%
- 24h grace period after hitting limit

### Step 7: billing.js API Routes
REST endpoints:
- GET /api/v1/billing/subscription
- POST /api/v1/billing/checkout
- POST /api/v1/billing/portal
- POST /api/v1/webhooks/stripe
- GET /api/v1/billing/usage

### Step 8: Tests
Create tests in tests/billing/:
- SubscriptionService.test.js
- StripeClient.test.js (mock Stripe API)
- UsageTracker.test.js
- FeatureGate.test.js
- billingAdapter.test.js

## Risks & Unknowns
- Stripe webhook signature verification needs real testing with Stripe CLI
- Grace period logic may need refinement for edge cases
- Period calculation (monthly reset) must align with subscription start

## Integration Points
- `src/db/sqlite/v1/queries/userAdapter.js` — User ID reference
- `src/api/v1/routes/users.js` — Auth middleware pattern
- `src/users/UserService.js` — Service pattern reference

## Docs Impact
- Update CHANGE_PLAN.md with progress
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/billing/
```
Test cases:
- Plan tiers defined correctly with limits
- Subscription CRUD operations
- Usage increment and reset
- Limit checking at 80%/100%
- Feature gate middleware blocks appropriately
- Grace period allows access for 24h
- Stripe webhook events processed correctly
- API returns proper format

## Rollback Plan
- Drop subscriptions, usage_metrics, billing_events tables
- Remove API route changes
- Delete files under `src/billing/`

## File Structure
```
src/billing/
├── SubscriptionService.js   — Subscription management
├── StripeClient.js          — Stripe API wrapper (mocked)
├── UsageTracker.js          — Usage tracking
├── FeatureGate.js           — Plan limit enforcement
└── index.js                 — Module exports

src/db/sqlite/v1/queries/
└── billingAdapter.js        — Database adapter

src/api/v1/routes/
└── billing.js               — Billing API endpoints

tests/billing/
├── SubscriptionService.test.js
├── StripeClient.test.js
├── UsageTracker.test.js
├── FeatureGate.test.js
└── billingAdapter.test.js
```

Branch: `main` (direct implementation per request)

---

## Implementation Progress — COMPLETED 2025-12-27
- [x] Step 1: Database schema (billingAdapter.js)
- [x] Step 2: billingAdapter.js — 764 lines, CRUD for subscriptions/usage/events
- [x] Step 3: StripeClient.js — 484 lines, mock Stripe API with test mode
- [x] Step 4: SubscriptionService.js — 748 lines, subscription lifecycle management
- [x] Step 5: UsageTracker.js — 403 lines, usage tracking with limit checks
- [x] Step 6: FeatureGate.js — 482 lines, plan-based access control with grace periods
- [x] Step 7: billing.js API routes — 356 lines, REST endpoints for billing
- [x] Step 8: Tests — **92 tests passing** across 5 test files

### Test Results Summary (2025-12-27)
```
billingAdapter.test.js    — 29 tests ✓
StripeClient.test.js      — 13 tests ✓
UsageTracker.test.js      — 17 tests ✓
FeatureGate.test.js       — 16 tests ✓
SubscriptionService.test.js — 17 tests ✓
─────────────────────────────────
Total: 92 tests passing
```

### Plan Tiers Implemented
| Plan | API Calls | Exports | Workspaces | Alerts | Price |
|------|-----------|---------|------------|--------|-------|
| Free | 1,000 | 10 | 1 | 5 | $0/mo |
| Pro | 50,000 | 500 | 5 | 100 | $29/mo |
| Enterprise | Unlimited | Unlimited | Unlimited | Unlimited | $199/mo |

### Key Features
- Grace period: 24h after hitting hard limit
- Soft limit warning at 80%
- Stripe mock mode for development/testing
- Webhook idempotency via event deduplication
- Express middleware for route protection

---

# Previous Plan: Fact-Check Integration (Phase 9 Item 7)

## Goal
Implement fact-checking integration that surfaces credibility signals for articles and claims by matching article claims against fact-check databases and rating source credibility.

Non-goals:
- Not implementing full fact-checking (we integrate with external sources)
- Not crawling fact-check sites in real-time (use local database from RSS)
- Not building an ML-based claim verification model

## Current Behavior
- `FactExtractor.js` in aggregation module extracts quotes/claims/statistics from articles
- `SimHasher.js` provides fingerprinting for similarity matching
- `SentimentAnalyzer.js` provides tone analysis
- API at port 4000 has article endpoints
- No fact-check integration or credibility scoring exists

## Proposed Changes

### Step 1: Database Migration (trustAdapter.js)
Create trust-related tables:
```sql
-- Fact-checks from external sources (Snopes, PolitiFact, etc.)
CREATE TABLE fact_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_text TEXT NOT NULL,
  claim_simhash TEXT,
  rating TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  published_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- Source credibility ratings (from MBFC etc.)
CREATE TABLE source_credibility (
  host TEXT PRIMARY KEY,
  credibility_score INTEGER DEFAULT 50,
  mbfc_rating TEXT,
  bias_label TEXT,
  correction_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Article credibility analysis (cached results)
CREATE TABLE article_credibility (
  content_id INTEGER PRIMARY KEY,
  overall_score INTEGER DEFAULT 50,
  matched_fact_checks TEXT,
  source_score INTEGER,
  claim_count INTEGER DEFAULT 0,
  analyzed_at TEXT DEFAULT (datetime('now'))
);
```

### Step 2: ClaimExtractor.js
Extend FactExtractor for checkable claims:
- Extract sentences containing assertions
- Compute SimHash fingerprint for each claim
- Filter to claims suitable for fact-checking

### Step 3: SourceRater.js
Manage source credibility ratings:
- Load/update MBFC ratings
- Calculate credibility score from multiple factors
- Provide source lookup by host

### Step 4: CredibilityScorer.js
Calculate overall credibility score:
- Combine source score + matched fact-checks
- Weight factors per spec (40% MBFC, etc.)
- Generate badge (✅ High, ⚠️ Mixed, ❌ Low)

### Step 5: FactCheckService.js
Main orchestrator:
- Match claims to fact-check database using SimHash distance <5
- Query Google Fact Check API (optional, with caching)
- Aggregate results into credibility analysis

### Step 6: API Integration
Add routes:
- GET /api/v1/articles/:id/credibility
- GET /api/v1/sources/:host/credibility

### Step 7: Tests
- Unit tests for all modules
- Integration tests for API endpoints
- Target >80% coverage

### Step 8: Update Roadmap
- Mark tasks as done in roadmap-phase9.json

## Risks & Unknowns
- Google Fact Check API requires API key (make optional)
- MBFC data needs to be seeded (provide bootstrap data)
- SimHash distance threshold may need tuning

## Integration Points
- `src/aggregation/FactExtractor.js` — Reuse for claim extraction
- `src/analysis/similarity/SimHasher.js` — For claim matching
- `src/analysis/sentiment/SentimentAnalyzer.js` — For tone analysis
- `src/db/sqlite/v1/queries/` — Follow adapter pattern

## Docs Impact
- Update roadmap-phase9.json to mark tasks as done
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/trust/
```
Test cases:
- Claim extraction finds assertions
- SimHash matching works at distance <5
- Source credibility calculates correctly
- Overall score weighted correctly
- API returns expected format
- Badge assignment correct

## Rollback Plan
- Drop fact_checks, source_credibility, article_credibility tables
- Remove API route changes
- Delete files under `src/trust/`

## File Structure
```
src/trust/
├── FactCheckService.js    — Main orchestrator
├── ClaimExtractor.js      — Extract checkable claims
├── CredibilityScorer.js   — Calculate credibility score
├── SourceRater.js         — Manage source ratings
└── index.js               — Module exports

src/db/sqlite/v1/queries/
└── trustAdapter.js        — Database adapter

src/api/v1/routes/
└── trust.js               — Trust/credibility endpoints (or add to articles.js)

tests/trust/
├── ClaimExtractor.test.js
├── SourceRater.test.js
├── CredibilityScorer.test.js
├── FactCheckService.test.js
└── trustAdapter.test.js
```

Branch: `main` (direct implementation per request)

---

## Implementation Progress — COMPLETED 2025-12-28
- [x] Step 1: Database migration (trustAdapter.js)
- [x] Step 2: ClaimExtractor.js
- [x] Step 3: SourceRater.js
- [x] Step 4: CredibilityScorer.js
- [x] Step 5: FactCheckService.js
- [x] Step 6: API integration
- [x] Step 7: Tests (157 tests passing)
- [x] Step 8: Update roadmap

### Final Deliverables
```
src/trust/
├── FactCheckService.js     — Main orchestrator with Google API + caching (350 lines)
├── ClaimExtractor.js       — Extract checkable claims with SimHash (220 lines)
├── CredibilityScorer.js    — Weighted scoring: 40% MBFC + 30% fact-checks + 15% claims + 15% tone (180 lines)
├── SourceRater.js          — MBFC ratings, ~25 bootstrapped sources, badge generation (240 lines)
└── index.js                — Module exports

src/db/sqlite/v1/queries/
└── trustAdapter.js         — Factory function for trust DB operations (400 lines)

src/api/v1/routes/
└── trust.js                — 7 REST endpoints for credibility analysis

tests/trust/
├── ClaimExtractor.test.js     — 18 tests
├── SourceRater.test.js        — 32 tests
├── CredibilityScorer.test.js  — 31 tests
├── FactCheckService.test.js   — 30 tests
└── trustAdapter.test.js       — 46 tests
```

### Key Features Implemented
- **Claim Extraction**: Pattern-based extraction with SimHash fingerprints
- **Source Credibility**: MBFC_SCORES mapping with 25 bootstrapped sources
- **Credibility Formula**: `0.4*source + 0.3*factChecks + 0.15*claims + 0.15*tone`
- **Badges**: ✅ High (≥80), ⚠️ Mixed (50-79), ❌ Low (<50)
- **Flags**: KNOWN_FALSE_CLAIM, LOW_SOURCE_CREDIBILITY, HIGH_CLAIM_DENSITY, EXTREME_TONE
- **Google Fact Check API**: Optional integration with 24h cache
- **SimHash Matching**: Hamming distance <5 for claim matches

---

# Previous Plan: Topic Modeling & Clustering (Phase 9 Item 3)

## Goal
Implement topic discovery and story clustering to automatically group related articles into story threads and track topic trends over time.

Non-goals:
- Not implementing full LDA with Gibbs sampling (too complex in pure JS)
- Not implementing real-time model updates (batch processing)
- Not implementing user-defined topics (seed-based + clustering only)

## Current Behavior
- `KeywordExtractor.js` provides TF-IDF keyword extraction
- `SimHasher.js` provides fingerprinting for similarity detection
- `DuplicateDetector.js` provides content similarity search
- `tagAdapter.js` has entity and category storage patterns
- API at port 4000 has article endpoints
- No topic modeling or story clustering exists

## Proposed Changes

### Step 1: Database Migration
Create topic-related tables:
```sql
-- Topics (seed-based + discovered)
CREATE TABLE topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  keywords TEXT NOT NULL,  -- JSON array of top words
  is_seed INTEGER DEFAULT 0,  -- 1 for seed topics, 0 for discovered
  article_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Article-topic assignments (many-to-many)
CREATE TABLE article_topics (
  content_id INTEGER NOT NULL,
  topic_id INTEGER NOT NULL,
  probability REAL NOT NULL,
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (content_id, topic_id),
  FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- Story clusters (related articles about same event)
CREATE TABLE story_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headline TEXT NOT NULL,
  summary TEXT,
  article_ids TEXT NOT NULL,  -- JSON array
  article_count INTEGER DEFAULT 1,
  first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  primary_topic_id INTEGER,
  FOREIGN KEY(primary_topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

-- Topic trends (daily aggregates for trend detection)
CREATE TABLE topic_trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  date TEXT NOT NULL,  -- YYYY-MM-DD
  article_count INTEGER DEFAULT 0,
  avg_probability REAL DEFAULT 0,
  trend_score REAL DEFAULT 0,
  UNIQUE(topic_id, date),
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
```

### Step 2: Seed Topics Data File
Create `data/seed-topics.json` with 25 pre-defined topics:
- Each topic has name + keyword list
- Categories: politics, sports, tech, business, entertainment, health, science, world, etc.
- Keywords carefully selected for high precision

### Step 3: TopicModeler Service
Main service for topic discovery:
- Load seed topics from JSON
- Score articles against topics using keyword matching
- TF-IDF weighted keyword overlap score
- Return top 3 topics per article with probabilities
- Handle multi-topic assignment

### Step 4: StoryClustering Service
Group articles about same event:
- Use SimHash Hamming distance < 3 as primary signal
- Require shared entities (PERSON/ORG) as secondary signal
- Time proximity filter (articles within 48 hours)
- Merge new articles into existing clusters
- Create new cluster if no match

### Step 5: TrendDetector Service
Detect emerging topics:
- Calculate 7-day rolling baseline per topic
- Compute daily article counts per topic
- Alert when topic exceeds 2σ above baseline
- Track trend_score = (current - baseline) / baseline_stddev
- Return top trending topics with change metrics

### Step 6: Database Adapter (topicAdapter.js)
- CRUD for topics, article_topics, story_clusters, topic_trends
- Batch operations for processing
- Statistics queries for trends

### Step 7: API Integration
Add new routes:
- GET /api/v1/topics - List all topics with article counts
- GET /api/v1/topics/:id/articles - Articles for a topic
- GET /api/v1/stories - List story clusters
- GET /api/v1/stories/:id - Story detail with timeline
- GET /api/v1/trends - Trending topics

### Step 8: Tests
- Unit tests for TopicModeler
- Unit tests for StoryClustering
- Unit tests for TrendDetector
- Integration tests for API endpoints
- Target >80% coverage

### Step 9: Update Roadmap
- Mark tasks as done in roadmap-phase9.json

## Risks & Unknowns
- Seed topic quality affects classification accuracy
- Story clustering threshold may need tuning
- Trend detection depends on volume of articles
- Entity matching for clusters requires NER accuracy

## Integration Points
- `src/analysis/similarity/SimHasher.js` — For story clustering
- `src/analysis/similarity/DuplicateDetector.js` — Similar article detection
- `src/analysis/tagging/KeywordExtractor.js` — TF-IDF scoring
- `src/analysis/tagging/EntityRecognizer.js` — For cluster validation
- `src/db/sqlite/v1/queries/tagAdapter.js` — Entity access
- `src/api/v1/routes/` — Add new route files

## Docs Impact
- Update roadmap-phase9.json to mark tasks as done
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/analysis/topics/
```
Test cases:
- Seed topics load correctly
- Article scored against topics
- Multi-topic assignment works
- Story clusters group similar articles
- Time proximity filter works
- Trend baseline calculated correctly
- Trend detection triggers at 2σ
- API returns proper format
- Empty/edge cases handled

## Rollback Plan
- Drop topics, article_topics, story_clusters, topic_trends tables
- Remove API route changes
- Delete files under `src/analysis/topics/`

## File Structure
```
src/analysis/topics/
├── TopicModeler.js       — Seed-based topic classification
├── StoryClustering.js    — Story grouping using SimHash + entities
├── TrendDetector.js      — Emerging topic detection
└── index.js              — Module exports

src/db/sqlite/v1/queries/
└── topicAdapter.js       — Database adapter

src/db/sqlite/v1/migrations/
└── add_topics_tables.sql — Schema migration

src/api/v1/routes/
├── topics.js             — Topic endpoints
└── stories.js            — Story cluster endpoints

data/
└── seed-topics.json      — Pre-defined topic keywords

tests/analysis/topics/
├── TopicModeler.test.js
├── StoryClustering.test.js
├── TrendDetector.test.js
└── topicAdapter.test.js
```

Branch: `main` (direct implementation per request)

---

## Implementation Progress — COMPLETED 2025-12-27
- [x] Step 1: Database migration for topic tables
- [x] Step 2: Seed topics data file (25 topics)
- [x] Step 3: TopicModeler service
- [x] Step 4: StoryClustering service
- [x] Step 5: TrendDetector service
- [x] Step 6: topicAdapter.js database adapter
- [x] Step 7: API endpoints
- [x] Step 8: Tests with >80% coverage (97 tests passing)
- [x] Step 9: Update roadmap-phase9.json

### Final Deliverables
```
src/analysis/topics/
├── TopicModeler.js       — 220 lines (seed-based topic classification with TF-IDF)
├── StoryClustering.js    — 280 lines (SimHash + entity-based story grouping)
├── TrendDetector.js      — 320 lines (Baseline calculation + 2σ trend detection)
└── index.js              — Module exports

src/db/sqlite/v1/queries/
└── topicAdapter.js       — 450 lines (Full CRUD for topics, clusters, trends)

src/db/sqlite/v1/migrations/
└── add_topics_tables.sql — Schema (topics, article_topics, story_clusters, topic_trends)

src/api/v1/routes/
├── topics.js             — Topic list + article lookup endpoints
├── stories.js            — Story cluster endpoints
└── trends.js             — Trending topics endpoint

data/
└── seed-topics.json      — 25 pre-defined topics with keywords

tests/analysis/topics/
├── TopicModeler.test.js      — 35 tests
├── StoryClustering.test.js   — 28 tests
├── TrendDetector.test.js     — 27 tests
└── topicAdapter.test.js      — 7 tests (basic connectivity)
```

### Key Features Implemented
- **Topic Classification**: TF-IDF weighted keyword matching against 25 seed topics
- **Multi-Topic Assignment**: Top 3 topics per article with probability scores
- **Story Clustering**: SimHash Hamming distance < 3 + entity overlap requirement
- **Cluster Management**: Merge new articles, deactivate old clusters
- **Trend Detection**: 7-day rolling baseline with 2σ threshold
- **Breaking News Detection**: Velocity + keyword signals
- **API Endpoints**: /topics, /topics/:id/articles, /stories, /stories/:id, /trends

---

# Previous Plan: Automatic Summarization (Phase 9 Item 2) — COMPLETED 2025-12-26

## Goal
Implement extractive article summarization using TextRank algorithm with variable length options and API integration.

Non-goals:
- Not implementing abstractive summarization (LLM-based) — optional future enhancement
- Not implementing multi-document summarization
- Not implementing real-time summary generation (cache on first request)

## Current Behavior
- `KeywordExtractor.js` has TF-IDF logic that we can adapt for sentence vectorization
- `tokenize()` function already handles word tokenization with stopword removal
- `TaggingService.js` provides model for service patterns
- `tagAdapter.js` provides database adapter patterns
- API at port 4000 has article endpoints in `articles.js`
- No summarization exists

## Proposed Changes

### Step 1: Database Migration
Create `article_summaries` table:
```sql
CREATE TABLE article_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  length_type TEXT NOT NULL,  -- brief, short, full, bullets
  summary_text TEXT NOT NULL,
  method TEXT DEFAULT 'textrank',
  sentence_count INTEGER,
  word_count INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, length_type)
);
```

### Step 2: SentenceTokenizer (shared module)
- Split text into sentences on `.!?` with proper handling
- Handle abbreviations (Mr., Dr., U.S., etc.)
- Return array of `{text, start, end, index}`
- Share with sentiment module via index.js

### Step 3: TfIdfVectorizer
- Adapt KeywordExtractor's TF-IDF logic for sentence vectors
- Build vocabulary from document sentences
- Create sparse vectors (Map-based) for each sentence
- Support cosine similarity calculation between vectors

### Step 4: TextRank
- Build sentence similarity graph using cosine similarity
- Implement PageRank iteration:
  - Initialize scores uniformly (1/N)
  - Iterate: score[i] = (1-d) + d * Σ(weight[j,i] * score[j] / out_degree[j])
  - Converge when max delta < 0.0001
- Return ranked sentences with scores

### Step 5: Summarizer Service
- Main service following TaggingService pattern
- Length options:
  - `brief`: 1 sentence, ~25 words
  - `short`: 3 sentences, ~75 words  
  - `full`: 1 paragraph, ~150 words
  - `bullets`: 5 key points as bullet list
- Preserve original sentence order in output
- Count sentences and words for metadata

### Step 6: Database Adapter (summaryAdapter.js)
- Save summary with content_id, length_type, text, method
- Get summary by content_id and length_type
- Check if cached summary exists
- Delete summaries when article updated

### Step 7: API Integration
- Add GET /api/v1/articles/:id/summary endpoint
- Query params: length (brief|short|full), format (text|bullets|json)
- Return cached if available with `cached: true`
- Generate on first request

### Step 8: Tests
- Unit tests for SentenceTokenizer
- Unit tests for TfIdfVectorizer (cosine similarity)
- Unit tests for TextRank algorithm
- Unit tests for Summarizer service
- Integration tests for API endpoint
- Target >80% coverage

### Step 9: Update Roadmap
- Mark tasks as done in roadmap-phase9.json

## Risks & Unknowns
- Very short articles may not have enough sentences for meaningful ranking
- Sentence boundary detection can be tricky with abbreviations
- PageRank may not converge for certain graph structures (add max iterations)

## Integration Points
- `src/analysis/tagging/KeywordExtractor.js` — Adapt TF-IDF logic
- `src/analysis/tagging/stopwords.js` — Reuse stopword list
- `src/api/v1/routes/articles.js` — Add summary endpoint
- `src/db/sqlite/v1/queries/` — Follow adapter pattern

## Docs Impact
- Update roadmap-phase9.json to mark tasks as done
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/analysis/summarization/
```
Test cases:
- Sentences tokenized correctly with abbreviation handling
- TF-IDF vectors computed correctly
- Cosine similarity returns 0-1 range
- TextRank converges and ranks sentences
- Brief summary returns 1 sentence
- Short summary returns 3 sentences
- Bullets format returns 5 bullet points
- Sentence order preserved in output
- API caches and returns cached summaries
- Empty/short text handled gracefully

## Rollback Plan
- Drop `article_summaries` table
- Remove API route changes
- Delete files under `src/analysis/summarization/`

## File Structure
```
src/analysis/summarization/
├── Summarizer.js           — Main service (orchestrates summarization)
├── TextRank.js             — Graph-based sentence ranking
├── SentenceTokenizer.js    — Split text into sentences
├── TfIdfVectorizer.js      — TF-IDF vectors and cosine similarity
└── index.js                — Module exports

src/db/sqlite/v1/queries/
└── summaryAdapter.js       — Database adapter

src/db/sqlite/v1/migrations/
└── add_article_summaries_table.sql — Schema migration

tests/analysis/summarization/
├── SentenceTokenizer.test.js
├── TfIdfVectorizer.test.js
├── TextRank.test.js
├── Summarizer.test.js
└── summaryAdapter.test.js
```

Branch: `main` (direct implementation per request)

---

## Implementation Progress — COMPLETED 2025-12-26
- [x] Step 1: Database migration for article_summaries
- [x] Step 2: SentenceTokenizer
- [x] Step 3: TfIdfVectorizer with cosine similarity
- [x] Step 4: TextRank algorithm
- [x] Step 5: Summarizer service with length options
- [x] Step 6: summaryAdapter.js database adapter
- [x] Step 7: API endpoint integration
- [x] Step 8: Tests with >80% coverage (130 tests passing)
- [x] Step 9: Update roadmap-phase9.json

### Final Deliverables
```
src/analysis/summarization/
├── Summarizer.js           — Main service (280 lines)
├── TextRank.js             — Graph-based sentence ranking (160 lines)
├── SentenceTokenizer.js    — Split text into sentences (240 lines)
├── TfIdfVectorizer.js      — TF-IDF vectors and cosine similarity (180 lines)
└── index.js                — Module exports

src/db/sqlite/v1/queries/
└── summaryAdapter.js       — Database adapter (361 lines)

src/db/sqlite/v1/migrations/
└── add_article_summaries_table.sql — Schema migration

tests/analysis/summarization/
├── SentenceTokenizer.test.js — 28 tests
├── TfIdfVectorizer.test.js   — 21 tests
├── TextRank.test.js          — 19 tests
├── Summarizer.test.js        — 35 tests
└── summaryAdapter.test.js    — 27 tests
```

### Key Features Implemented
- **TextRank Algorithm**: PageRank on sentence similarity graph (damping=0.85)
- **4 Length Options**: brief (1 sentence), short (3 sentences), full (~150 words), bullets (5 points)
- **TF-IDF Vectorization**: Sparse vectors with cosine similarity
- **Sentence Tokenization**: Handles abbreviations (Mr., Dr., U.S., etc.)
- **Database Caching**: article_summaries table with upsert on (content_id, length_type)
- **API Endpoint**: GET /api/v1/articles/:id/summary?length=short&format=text

---

# Previous Plan: Sentiment Analysis Pipeline (Phase 9 Item 1) — IN PROGRESS

## Goal
Implement a lexicon-based sentiment analysis pipeline that scores articles on a -1.0 to +1.0 scale with confidence scores and per-entity sentiment breakdown.

Non-goals:
- Not implementing ML-based sentiment (use lexicon-based approach)
- Not implementing social media sentiment integration
- Not implementing real-time sentiment streaming (batch analysis)

## Current Behavior
- `EntityRecognizer.js` provides NER for PERSON, ORG, GPE entities
- `KeywordExtractor.js` provides TF-IDF keyword extraction (usable for aspects)
- `TaggingService.js` orchestrates tagging pipeline (model for our service)
- `tagAdapter.js` provides database patterns to follow
- API at port 4000 has article endpoints (`articles.js`)
- No sentiment analysis exists
- No AFINN lexicon data file exists

## Proposed Changes

### Step 1: Create Lexicon Data File
- Create `data/lexicons/afinn-165.json` with AFINN-165 words (-5 to +5 scores)
- Add domain-specific news terms (elections, markets, crisis, etc.)

### Step 2: SentenceTokenizer
- Split text into sentences using regex patterns
- Handle abbreviations (Mr., Dr., U.S., etc.) to avoid false splits
- Return array of sentences with start/end offsets

### Step 3: Lexicon Class
- Load AFINN-165 from JSON file
- Normalize words (lowercase, strip punctuation)
- Extend with news-specific terms
- Handle negation detection (not, never, n't)
- Handle intensifiers (very, extremely, slightly)

### Step 4: SentimentAnalyzer
- Main service following TaggingService pattern
- Score sentences using lexicon
- Aggregate to article-level score (-1.0 to +1.0)
- Calculate confidence (coverage of sentiment words)
- Generate breakdown (positive%, negative%, neutral%)
- Label generation (very_negative, negative, slightly_negative, neutral, etc.)

### Step 5: EntitySentiment
- Extract entities using EntityRecognizer
- Find sentences containing each entity
- Score sentiment in those sentences
- Aggregate to per-entity sentiment with mention counts

### Step 6: Database Adapter (sentimentAdapter.js)
- Create `article_sentiment` table (schema in task description)
- Save/get sentiment results
- Batch operations for processing

### Step 7: API Integration
- Add GET /api/v1/articles/:id/sentiment endpoint
- Response format per spec with overall, breakdown, entities, aspects

### Step 8: Tests
- Unit tests for Lexicon, SentenceTokenizer
- Unit tests for SentimentAnalyzer scoring
- Unit tests for EntitySentiment extraction
- Integration tests for API endpoint
- Performance test (<100ms per article)

### Step 9: Update Roadmap
- Mark tasks as done in roadmap-phase9.json

## Risks & Unknowns
- AFINN-165 lexicon needs to be sourced (MIT license, publicly available)
- Negation scope detection is imprecise without full parsing
- Entity sentiment may be inaccurate when entity is subject vs object
- Performance target of <100ms should be validated

## Integration Points
- `src/analysis/tagging/EntityRecognizer.js` — For NER in entity sentiment
- `src/analysis/tagging/KeywordExtractor.js` — For aspect identification
- `src/api/v1/routes/articles.js` — Add sentiment endpoint
- `src/db/sqlite/v1/queries/tagAdapter.js` — Model for adapter pattern

## Docs Impact
- Update roadmap-phase9.json to mark tasks as done
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/analysis/sentiment/
```
Test cases:
- Lexicon loads correctly and returns scores
- Negation inverts sentiment ("not good" → negative)
- Intensifiers amplify sentiment ("very bad" → more negative)
- Article score normalized to -1.0 to +1.0
- Confidence reflects sentiment word coverage
- Entity sentiment extracted for each entity
- Neutral text returns ~0 score
- API returns proper format

## Rollback Plan
- Drop `article_sentiment` table
- Remove API route changes
- Delete new files under `src/analysis/sentiment/`

## File Structure
```
src/analysis/sentiment/
├── SentimentAnalyzer.js    — Main service (lexicon scoring, aggregation)
├── Lexicon.js              — AFINN lexicon + extensions + negation/intensifiers
├── EntitySentiment.js      — Per-entity sentiment analysis
├── SentenceTokenizer.js    — Split text into sentences
└── index.js                — Module exports

src/db/sqlite/v1/queries/
└── sentimentAdapter.js     — Database adapter

data/lexicons/
└── afinn-165.json          — AFINN-165 lexicon data

tests/analysis/sentiment/
├── Lexicon.test.js
├── SentenceTokenizer.test.js
├── SentimentAnalyzer.test.js
├── EntitySentiment.test.js
└── sentimentAdapter.test.js
```

Branch: `chore/plan-sentiment-analysis`

---

## Implementation Progress — IN PROGRESS 2025-12-26
- [x] Step 1: Create AFINN lexicon data file
- [x] Step 2: Reuse SentenceTokenizer from summarization module
- [x] Step 3: Lexicon class with negation/intensifiers
- [x] Step 4: SentimentAnalyzer main service
- [x] Step 5: EntitySentiment for per-entity analysis
- [x] Step 6: sentimentAdapter.js database adapter
- [x] Step 7: API endpoint integration
- [x] Step 8: Tests with >80% coverage
- [ ] Step 9: Update roadmap-phase9.json

---

# Previous Plan: Article Recommendation Engine (Phase 8 Item 7) — COMPLETED 2025-12-27

## Goal
Recommend related articles based on content similarity (SimHash from Item 3), tags/categories (from Item 4), and trending signals. Provide hybrid scoring with configurable weights.

Non-goals:
- Not implementing collaborative filtering (user-based recommendations)
- Not implementing ML-based ranking (use formula-based scoring)
- Not implementing real-time recommendation updates (batch/cached approach)

## Current Behavior
- Content Similarity Engine (Item 3) provides SimHash-based similarity detection
- Content Tagging (Item 4) provides keywords, categories, and entities
- API Gateway (Item 2) provides REST infrastructure at port 4000
- No recommendation engine exists
- No trending calculation exists
- `content_access_log` table may exist for view tracking

## Proposed Changes

### Step 1: Schema Migration
Create recommendation tables:
- `article_trending`: content_id, view_count, last_view_at, trend_score, computed_at
- `article_recommendations`: source_id, target_id, score, strategy, reasons (JSON), computed_at

### Step 2: TrendingCalculator
- Decay formula: `trend_score = log(view_count + 1) * e^(-(now - last_view) / 86400)`
- Normalize scores to 0-1 range
- Handle cold-start (new articles with no views)

### Step 3: ContentRecommender
- Use DuplicateDetector's findSimilar() for SimHash-based similarity
- Threshold: Hamming distance ≤5 is considered similar
- Normalize similarity to 0-1 score

### Step 4: TagRecommender
- Jaccard similarity of keyword sets
- Same category = +0.3 boost
- Normalize scores to 0-1 range

### Step 5: RecommendationEngine (Orchestration)
- Hybrid scoring: `(content_sim * 0.5) + (tag_sim * 0.3) + (trending * 0.2)`
- Domain diversification: max 2 articles from same domain
- Support strategy selection: hybrid, content, tag, trending

### Step 6: Database Adapter
- `recommendationAdapter.js` with save/get methods
- Caching: store top 20 recommendations per article
- Bulk operations for nightly precomputation

### Step 7: API Integration
- GET /api/v1/articles/:id/recommendations
- Query params: ?limit=10&strategy=hybrid|content|tag|trending
- Response includes reasons for each recommendation

### Step 8: Tests
- Test hybrid scoring calculation
- Test domain diversification
- Test cold-start handling
- Test API response format

## Risks & Unknowns
- Trending requires view tracking — check if content_access_log exists
- Precomputation can be slow for large article sets — use batch processing
- Cold-start handling: rely on content+tag only for new articles

## Integration Points
- `src/analysis/similarity/DuplicateDetector.js` — SimHash-based content similarity
- `src/analysis/tagging/TaggingService.js` — Keywords and categories
- `src/db/sqlite/v1/queries/tagAdapter.js` — Tag database access
- `src/db/sqlite/v1/queries/similarityAdapter.js` — Fingerprint access
- `src/api/v1/routes/articles.js` — API endpoint integration

## Docs Impact
- Update roadmap.json to mark tasks as done
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/analysis/recommendations/
```
Test cases:
- Content-similar articles appear first
- Same-category articles ranked higher with boost
- Trending articles included in hybrid results
- No self-recommendation
- Domain diversification limits to 2 per domain
- Cold-start articles get content+tag recommendations
- API returns proper format with reasons

## Rollback Plan
- Drop `article_trending`, `article_recommendations` tables
- Remove API route changes

## File Structure
```
src/analysis/recommendations/
├── TrendingCalculator.js   — Trend scoring with decay
├── ContentRecommender.js   — SimHash-based recommendations
├── TagRecommender.js       — Tag/category-based recommendations
├── RecommendationEngine.js — Main orchestration with hybrid scoring
└── index.js                — Module exports

src/db/sqlite/v1/queries/
└── recommendationAdapter.js — Database adapter

tests/analysis/recommendations/
├── TrendingCalculator.test.js
├── ContentRecommender.test.js
├── TagRecommender.test.js
└── RecommendationEngine.test.js
```

Branch: `main` (direct implementation per request)

---

## Implementation Progress — COMPLETED 2025-12-27
- [x] Step 1: Schema migration for article_trending and article_recommendations
- [x] Step 2: TrendingCalculator — decay formula, normalization
- [x] Step 3: ContentRecommender — SimHash similarity wrapper
- [x] Step 4: TagRecommender — Jaccard + category boost
- [x] Step 5: RecommendationEngine — hybrid scoring, diversification
- [x] Step 6: recommendationAdapter.js — database operations
- [x] Step 7: API endpoint — GET /api/v1/articles/:id/recommendations
- [x] Step 8: Tests — 105 passing tests across 4 test files
- [x] Step 9: Update roadmap.json — marked as completed

### Final Deliverables
```
src/analysis/recommendations/
├── TrendingCalculator.js     — 220 lines (trend scoring with decay)
├── ContentRecommender.js     — 160 lines (SimHash-based recommendations)
├── TagRecommender.js         — 280 lines (Tag/category-based recommendations)
├── RecommendationEngine.js   — 400 lines (Hybrid scoring & orchestration)
└── index.js                  — Module exports

src/db/sqlite/v1/queries/
└── recommendationAdapter.js  — 300 lines (DB adapter with schema)

src/api/v1/routes/
└── articles.js               — Added GET /:id/recommendations endpoint

tests/analysis/recommendations/
├── TrendingCalculator.test.js     — 27 tests
├── ContentRecommender.test.js     — 28 tests
├── TagRecommender.test.js         — 20 tests
└── RecommendationEngine.test.js   — 30 tests
```

### Key Features Implemented
- **Hybrid Scoring**: `(content_sim * 0.5) + (tag_sim * 0.3) + (trending * 0.2)`
- **Trending Decay**: `log(view_count + 1) * e^(-(age_seconds) / 86400)`
- **Domain Diversification**: Max 2 articles from same domain
- **Cold-Start Handling**: Falls back to tag-based, then trending
- **Caching Support**: Precompute and cache recommendations
- **Strategy Selection**: hybrid, content, tag, or trending only

---

## Previous Plan: Content Similarity Engine (Phase 8 Item 3) — COMPLETED 2025-12-28
<details>
<summary>Click to expand completed plan</summary>

### Implementation Summary
- ✅ SimHasher — 64-bit FNV-1a fingerprints
- ✅ MinHasher — 128 hash function signatures  
- ✅ SimilarityIndex — LSH index (16 bands × 8 rows)
- ✅ DuplicateDetector — Main service with 111 tests
- ✅ API integration at `/api/v1/articles/:id/similar`
- ✅ Schema migration for `article_fingerprints` table

</details>
