# Improvement Recommendations — January 6, 2026

## Executive Summary

The multi-modal intelligent crawl system has been successfully implemented and pushed to the repository. This document outlines remaining work, technical debt, and strategic improvements.

---

## 🔴 Critical: Untracked Files (150+ files not committed)

The push included 117 modified files, but **~150 new files remain untracked**. These include:

### High-Priority Missing Files

| Category | Files | Risk |
|----------|-------|------|
| **Multi-modal core** | `src/crawler/multimodal/*` | 🔴 CRITICAL — Core feature code missing |
| **New DB queries** | `src/db/sqlite/v1/queries/multiModalCrawl.js`, `patternLearning.js` | 🔴 CRITICAL |
| **CLI tools** | `tools/crawl-multi-modal.js`, `tools/dev/crawl-*.js` | 🟠 HIGH |
| **UI server** | `src/ui/server/multiModalCrawl/*` | 🔴 CRITICAL |
| **Tests** | `src/db/__tests__/multiModalCrawlQueries.test.js` | 🟠 HIGH |
| **Sessions/docs** | `docs/sessions/2026-01-0*/*` | 🟡 MEDIUM |
| **Labs** | `labs/analysis-observable/*`, `labs/crawler-progress-integration/*` | 🟡 MEDIUM |

### Recommended Action

```bash
# Stage all untracked files
git add .

# Review what will be committed
git status

# Commit with descriptive message
git commit -m "feat: add multi-modal crawl system, CLI tools, and session docs"

# Push
git push
```

---

## 🟠 Branch Naming Mismatch

**Current branch**: `chore/test-studio-meta-e2e-2026-01-02`  
**Actual work**: Multi-modal intelligent crawl system

The branch name doesn't reflect the work done. Consider:
1. Continue on this branch and merge to main (simpler)
2. Create a PR with accurate description regardless of branch name
3. For future work, use descriptive branch names like `feat/multi-modal-crawl`

---

## 🟡 Technical Debt from Sessions

### From `2026-01-06-multi-modal-intelligent-crawl-review/FOLLOW_UPS.md`:

| Item | Priority | Effort |
|------|----------|--------|
| Rebuild `better-sqlite3` in Linux filesystem | 🟠 HIGH | 30 min |
| Audit/migrate SQL in non-adapter modules | 🟠 HIGH | 2-4 hrs |
| Add JSDoc for multi-modal orchestration | 🟡 MEDIUM | 1-2 hrs |
| Add hub guessing regression checks | 🟡 MEDIUM | 1 hr |

### From `2026-01-06-multi-modal-intelligent-crawl/PLAN.md` (incomplete items):

| Item | Status | Notes |
|------|--------|-------|
| Wire SkeletonHash into analysis phase | ❌ Pending | Layout signature computation |
| Connect to `CrawlPlaybookService.learnFromDiscovery()` | ❌ Pending | Pattern learning integration |
| Track hub staleness and refresh priorities | ❌ Pending | Hub lifecycle management |
| Add Electron wrapper option for CLI | ❌ Pending | Nice-to-have |

---

## 📋 Recommended Improvement Roadmap

### Immediate (Today)

1. **Commit untracked files** — The multi-modal feature is incomplete without `src/crawler/multimodal/*`
2. **Verify the feature works** — Run `node tools/crawl-multi-modal.js --help`

### Short-term (This Week)

3. **SQL adapter migration audit**
   - Use `node tools/dev/js-scan.js --dir src --search "db.prepare" "db.run" "db.all" --json`
   - Move any SQL outside `/src/db/` into proper adapter modules
   
4. **SkeletonHash integration**
   - Wire layout signature computation into the analysis phase
   - Enable pattern learning from page structure

5. **Test coverage**
   - Fix `better-sqlite3` binary issue (rebuild in native Linux or use Windows node_modules)
   - Run full test suite: `npm run test:by-path src/crawler/multimodal`

### Medium-term (Next Sprint)

6. **Hub lifecycle management**
   - Track hub staleness
   - Implement refresh priorities
   - Add hub health monitoring to dashboard

7. **Playbook integration**
   - Connect `CrawlPlaybookService.learnFromDiscovery()`
   - Enable cross-domain pattern sharing

8. **JSDoc expansion**
   - Document `MultiModalCrawlOrchestrator` API
   - Document configuration options
   - Add inline examples

### Nice-to-have (Backlog)

9. **Electron wrapper** for `crawl-multi-modal.js`
10. **Multi-site concurrent crawling** improvements
11. **Dashboard enhancements** (charts, historical views)

---

## 🔧 Cleanup: Files to Review

### Temporary/Debug Files at Root

These should probably be gitignored or removed:

```
check_geo_data.js
check_more_tables.js  
check_schema_details.js
check_specific_tables.js
tmp_check_es.js
tmp_check_langs.js
tmp_check_urls.js
tmp_wapo_crawl.txt
nul
data-explorer.check.html
```

### Recommendation

```bash
# Add to .gitignore
echo "check_*.js" >> .gitignore
echo "tmp_*.js" >> .gitignore
echo "tmp_*.txt" >> .gitignore
echo "*.check.html" >> .gitignore
echo "nul" >> .gitignore
```

---

## 📊 Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Multi-modal test coverage | ~50% (estimate) | 80% |
| JSDoc coverage (multimodal) | ~20% | 80% |
| SQL outside adapters | Unknown | 0 files |
| Untracked feature files | ~30 critical | 0 |

---

## ✅ Verification Checklist

Before considering multi-modal crawl "production ready":

- [ ] All `src/crawler/multimodal/*` files committed
- [ ] All `src/db/sqlite/v1/queries/multiModalCrawl.js` committed
- [ ] `tools/crawl-multi-modal.js` runs without error
- [ ] UI panel loads at `/?app=multi-modal-crawl`
- [ ] SSE endpoint streams progress
- [ ] At least one successful multi-modal crawl completed
- [ ] Tests pass (after `better-sqlite3` fix)
- [ ] JSDoc added to public APIs

---

## Summary

**Git Status**: 🟠 Partial — Core feature files still untracked  
**Feature Status**: 🟢 Implemented but not fully committed  
**Test Status**: 🟡 Some tests skipped due to binary issues  
**Doc Status**: 🟡 Sessions documented, JSDoc pending  

**Next Step**: Commit the remaining ~150 untracked files to complete the feature delivery.
