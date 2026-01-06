# Chapter 14: Development Roadmap

> **Implementation Status**: 📋 Planning document — See Chapter 16 for current implementation status.

## Current State Assessment

### What Works Well

| Component | Status | Confidence |
|-----------|--------|------------|
| Crawl daemon HTTP API | ✅ Stable | High |
| Console log filtering | ✅ Complete | High |
| Crawl operations | ✅ Functional | High |
| Content compression | ✅ Reliable | High |
| Analysis observable | ✅ Functional | Medium |
| Readability extraction | ✅ Good | High |
| XPath extraction | ⚠️ Limited patterns | Medium |
| Place mention detection | ✅ Basic | Medium |
| Gazetteer lookups | ✅ Functional | Medium |
| Disambiguation scoring | ⚠️ Needs work | Low |

### Known Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| XPath pattern coverage | Slow analysis for unknown domains | P1 |
| Multi-language aliases | Poor non-English disambiguation | P1 |
| Unified pipeline | Manual multi-step workflows | P2 |
| Real-time progress UI | Poor visibility into long runs | P2 |
| Disambiguation accuracy | Wrong place assignments | P2 |
| Performance monitoring | Unknown bottlenecks | P3 |

---

## Phase 1: Foundation Hardening (Week 1-2)

### Goal
Stabilize existing components before adding features.

### Tasks

#### 1.1 XPath Pattern Library
```
Priority: P1
Effort: 3 days
Dependencies: None

Current: ~20 patterns for known sites
Target: 100+ patterns covering major news sources

Implementation:
1. Audit existing patterns in config/extractors.json
2. Add patterns for top 50 news domains by traffic
3. Create pattern testing harness
4. Document pattern authoring guide
```

#### 1.2 Analysis Version Migration
```
Priority: P1
Effort: 2 days
Dependencies: None

Current: Manual version bumping
Target: Automated version tracking with migration scripts

Implementation:
1. Add analysis_schema_version to content_analysis
2. Create migration runner for version upgrades
3. Add --reanalyze flag to analysis observable
4. Support incremental re-analysis
```

#### 1.3 Error Telemetry
```
Priority: P1
Effort: 2 days
Dependencies: None

Current: Scattered console logging
Target: Structured error events in task_events

Implementation:
1. Define error event schema
2. Instrument all error paths
3. Add error summary endpoint
4. Create error dashboard
```

---

## Phase 2: Analysis Enhancement (Week 3-4)

### Goal
Improve extraction accuracy and add missing analysis stages.

### Tasks

#### 2.1 Readability Improvements
```
Priority: P1
Effort: 3 days
Dependencies: Phase 1

Current: Basic Readability.js integration
Target: Enhanced with pre/post processing

Implementation:
1. Add pre-processing for paywall markers
2. Add post-processing for boilerplate removal
3. Tune scoring for news article patterns
4. Add confidence scoring
```

#### 2.2 Fact Extraction Enhancement
```
Priority: P2
Effort: 5 days
Dependencies: 2.1

Current: Basic date/author extraction
Target: Rich fact extraction

New facts to extract:
- Publication timestamp (precise)
- Update timestamp
- Author name(s)
- Author role/title
- Source attribution
- Article type (news/opinion/analysis)
- Word count
- Reading time estimate
```

#### 2.3 Place Mention Disambiguation
```
Priority: P2
Effort: 5 days
Dependencies: Phase 1

Current: Basic population-based scoring
Target: Multi-feature scoring with confidence

Implementation:
1. Add publisher location prior
2. Add co-occurrence features
3. Add containment boost
4. Add confidence threshold filtering
5. Add disambiguation explanation endpoint
```

---

## Phase 3: Unified Pipeline (Week 5-6)

### Goal
Single-command workflow from crawl to report.

### Tasks

#### 3.1 Pipeline Orchestrator
```
Priority: P1
Effort: 5 days
Dependencies: Phase 2

Current: Manual multi-step execution
Target: Unified orchestrator with stage coordination

Implementation:
1. Create UnifiedPipeline class
2. Add stage dependency resolution
3. Add checkpoint/resume support
4. Add unified progress streaming
```

#### 3.2 Unified Progress UI
```
Priority: P2
Effort: 5 days
Dependencies: 3.1

Current: Separate UIs for crawl/analysis
Target: Single dashboard showing full pipeline

Implementation:
1. Design unified progress component
2. Implement multi-stage SSE stream
3. Add stage transition animations
4. Add cross-stage timing breakdown
```

#### 3.3 CLI Consolidation
```
Priority: P2
Effort: 3 days
Dependencies: 3.1

Current: Separate CLIs for each component
Target: Unified CLI with subcommands

Commands:
- `node unified.js crawl <url> [options]`
- `node unified.js analyze [options]`
- `node unified.js pipeline <url> [options]`
- `node unified.js status [jobId]`
- `node unified.js stop [jobId]`
```

---

## Phase 4: AI Agent Optimization (Week 7-8)

### Goal
Optimize for AI agent consumption and control.

### Tasks

#### 4.1 AI-Friendly API Responses
```
Priority: P1
Effort: 3 days
Dependencies: Phase 3

Current: Mixed text/JSON responses
Target: Consistently structured JSON with guidance

Implementation:
1. Standardize response envelope
2. Add action suggestions to errors
3. Add continuation tokens for pagination
4. Add timing/resource metadata
```

#### 4.2 Pre-Flight Checks API
```
Priority: P2
Effort: 2 days
Dependencies: None

Current: Agents guess at readiness
Target: Explicit readiness endpoint

Implementation:
1. Add /preflight endpoint
2. Check daemon, database, disk, memory
3. Return actionable fix suggestions
4. Support JSON output for automation
```

#### 4.3 Decision Explanation API
```
Priority: P2
Effort: 3 days
Dependencies: 2.3

Current: Black-box disambiguation
Target: Explainable decisions

Implementation:
1. Add /explain endpoint for disambiguation
2. Show feature scores breakdown
3. Show candidate ranking
4. Support "what-if" queries
```

---

## Phase 5: Performance & Scale (Week 9-10)

### Goal
Handle larger workloads efficiently.

### Tasks

#### 5.1 Batch Analysis Optimization
```
Priority: P1
Effort: 5 days
Dependencies: Phase 3

Current: 1-2 pages/second
Target: 10+ pages/second

Implementation:
1. Profile current bottlenecks
2. Parallelize independent stages
3. Add worker pool for CPU-bound work
4. Optimize database batch operations
```

#### 5.2 Memory Management
```
Priority: P2
Effort: 3 days
Dependencies: 5.1

Current: Unbounded growth during long runs
Target: Stable memory under streaming workload

Implementation:
1. Add streaming JSDOM alternative
2. Implement result batching
3. Add explicit garbage collection hints
4. Monitor and report memory usage
```

#### 5.3 Database Optimization
```
Priority: P2
Effort: 3 days
Dependencies: Phase 3

Current: Good indexes, some slow queries
Target: Sub-10ms for all common queries

Implementation:
1. Add query performance logging
2. Identify slow query patterns
3. Add covering indexes where needed
4. Optimize JOIN patterns
```

---

## Phase 6: Multi-Language Support (Week 11-12)

### Goal
Full support for non-English content.

### Tasks

#### 6.1 Multi-Language Alias Database
```
Priority: P1
Effort: 5 days
Dependencies: Phase 2

Current: English names only
Target: Names in top 10 languages

Implementation:
1. Design alias schema with language codes
2. Import OSM/GeoNames multilingual data
3. Add transliteration normalization
4. Add language detection for queries
```

#### 6.2 CJK Place Name Support
```
Priority: P2
Effort: 5 days
Dependencies: 6.1

Current: No CJK support
Target: Chinese, Japanese, Korean place names

Implementation:
1. Add Han character normalization
2. Add pinyin/romaji transliteration
3. Handle simplified/traditional variants
4. Add CJK-specific test fixtures
```

#### 6.3 Arabic/Cyrillic Support
```
Priority: P2
Effort: 3 days
Dependencies: 6.1

Current: No RTL/Cyrillic support
Target: Arabic, Russian, Ukrainian names

Implementation:
1. Add Arabic diacritic normalization
2. Add Cyrillic transliteration
3. Handle BGN/PCGN romanization
4. Add script detection
```

---

## Success Metrics

### Phase Completion Criteria

| Phase | Success Metric |
|-------|----------------|
| Phase 1 | Zero P1 bugs, 90% test coverage |
| Phase 2 | Extraction accuracy >95% |
| Phase 3 | Single-command pipeline working |
| Phase 4 | AI agent integration tests pass |
| Phase 5 | 10 pages/sec throughput |
| Phase 6 | Multi-language accuracy >85% |

### Overall Project Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Extraction accuracy | ~80% | >95% | Week 4 |
| Disambiguation accuracy | ~60% | >90% | Week 8 |
| Analysis throughput | 1-2/sec | 10+/sec | Week 10 |
| Language coverage | 1 | 10 | Week 12 |
| XPath pattern coverage | ~20 | 100+ | Week 2 |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSDOM remains bottleneck | Slow analysis | Investigate alternatives (htmlparser2, cheerio) |
| Multi-language data quality | Poor accuracy | Multiple data sources, validation |
| Scope creep | Timeline slip | Strict phase gates, backlog grooming |
| Integration complexity | Bugs | Comprehensive test suite |
| Performance regressions | User impact | Continuous benchmarking |

---

## Resource Requirements

### Development Time
- Phase 1: 10 days
- Phase 2: 13 days
- Phase 3: 13 days
- Phase 4: 8 days
- Phase 5: 11 days
- Phase 6: 13 days
- **Total: ~68 days** (plus buffer)

### External Data
- OSM place name exports
- GeoNames multilingual data
- News site HTML samples for XPath patterns

### Infrastructure
- Sufficient disk for test fixtures
- Memory for parallel analysis testing
- CI/CD pipeline for automated testing

---

## Next Chapter

[Chapter 15: Performance Targets →](15-performance.md)
