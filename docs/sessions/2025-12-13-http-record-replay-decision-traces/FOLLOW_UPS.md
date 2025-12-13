# Follow Ups – HTTP Record/Replay Harness + Decision Trace Milestones

## Pending Validation
- [ ] Run test suites to confirm implementations work: `npm run test:by-path tests/crawler/httpRecordReplay.test.js tests/crawler/decisionTraceHelper.test.js`
- [ ] Verify facade instance wrapper with existing ingestor tests

## Documentation
- [ ] Document `hubFreshness.persistDecisionTraces` configuration option in config docs
- [ ] Add httpRecordReplay usage example to testing documentation

## Integration
- [ ] Wire `createDecisionTraceEmitter` into existing hub freshness code path (optional enhancement)
- [ ] Create first real record/replay test using Wikidata ingestor or similar network-dependent workflow
- [ ] Consider adding replay mode to existing crawler integration tests

## SVG Update
- [ ] Update crawler improvement plans SVG to reflect Phase A/B completion
