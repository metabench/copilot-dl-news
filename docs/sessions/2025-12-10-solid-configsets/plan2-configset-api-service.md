# Plan 2: Config Set API service layer

## Objective
Apply SRP/DI to decision config set API routes by extracting a service layer for business logic and keeping Express handlers thin and testable.

## Scope & Success Criteria
- Create `ConfigSetService` (or similar) with methods: list, get, getProductionSnapshot, createFromProduction, clone, update (bonuses/weights/features/metadata), delete, diff, promote.
- API handlers delegate to the service; validation stays minimal and clear.
- Add unit tests for the service using in-memory/temp filesystem via repository from Plan 1.
- Keep API surface and behavior unchanged for clients.

## Risks/Assumptions
- Depends on Plan 1 repository/service; ensure reuse to avoid duplication.
- Route behavior must stay backward compatible (status codes/messages).
- Tests should avoid touching real production files—use temp dirs.

## Steps
1) **Define service contract**: map each route to a service method signature and expected errors.
2) **Implement service** using DecisionConfigSetRepository/PromotionService from Plan 1.
3) **Refactor router** to call service; centralize error mapping.
4) **Tests**: service-level tests with temp dirs verifying success/error cases; router can be smoke-tested if needed.
5) **Docs**: brief note in session summary; no public doc change needed unless API semantics change (they shouldn't).

## Deliverables
- New service module with coverage.
- Router refactored to use service.
- Passing service tests (and existing checks remain green).