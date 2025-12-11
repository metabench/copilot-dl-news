# Plan 1: DecisionConfigSet model/service split

## Objective
Apply SRP/DI to DecisionConfigSet by separating pure model from persistence/promotion concerns so logic is testable in-memory and storage can vary.

## Scope & Success Criteria
- Introduce repository layer for load/save/list/delete that isolates filesystem and production paths.
- Introduce promotion service that handles backups and write-to-production, using the repository.
- Keep public behavior equivalent (API routes still work) but with cleaner boundaries.
- Add unit tests covering repository (in temp dir), model mutations, and promotion behavior (backup written, production files updated).

## Risks/Assumptions
- File paths currently hard-coded; refactor must not break callers expecting defaults.
- Promotion writes to production files; tests must use temp dirs to avoid mutating real config.
- Need to ensure existing check scripts still pass; adjust them if they rely on old location.

## Steps
1) **Discover current coupling**: Review DecisionConfigSet.js for model + I/O + promotion.
2) **Define interfaces**: Repository (load/save/list/delete, fromProduction), PromotionService (promote with optional backup) with configurable roots.
3) **Refactor code**: 
   - Extract pure model (mutations, diff, summaries, change log) into DecisionConfigSet (no fs).
   - New `DecisionConfigSetRepository` in `src/crawler/observatory/DecisionConfigSetRepository.js` handling filesystem I/O.
   - New `DecisionConfigPromotionService` handling promote-to-production using repository + backup dir.
4) **Wire defaults**: Provide helper factory to get default repo/service with current paths.
5) **Update check script**: Point to new API; ensure it passes using temp workspace.
6) **Tests**: Add unit tests (e.g., `tests/crawler/DecisionConfigSetRepository.test.js`) covering save/load/list/delete, backup, promotion writing files, and model diff/mutation behavior.

## Deliverables
- Refactored code with clear separation
- Passing unit tests for repository + promotion
- Updated check script if needed