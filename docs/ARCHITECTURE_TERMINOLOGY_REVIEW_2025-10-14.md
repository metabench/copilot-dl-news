# Architecture Terminology Review - October 14, 2025

## Summary

Comprehensive review and correction of "queue" vs "crawl" terminology throughout the system. **Queues are now properly documented and presented as internal implementation details of crawls, not user-facing entities.**

---

## Problem Statement

**User Confusion**: UI said "Resume Queues" but users were actually resuming crawls. Queues are internal data structures (URLs pending visit within a crawl), but were being presented as if they were independently controllable entities.

**Architectural Reality**:
- **Crawls** are user-facing operations (start, pause, resume, clear)
- **Queues** are internal to crawls (implementation detail for tracking URLs to visit)
- `crawl_jobs` table = user-facing crawl records
- `queue_events` table = internal queue state within crawls

---

## Changes Made

### 1. New Documentation: `docs/ARCHITECTURE_QUEUES_ARE_INTERNAL.md`

**Purpose**: Comprehensive architectural clarification document

**Contents**:
- Core principle: Queues are implementation details
- Correct terminology (crawls vs queues)
- Architecture diagrams showing relationship
- Database schema explanation
- API design issues and legacy naming
- UI terminology standards
- Code implementation patterns
- Testing implications
- Migration strategy for future API changes

**Status**: ✅ Complete, referenced from AGENTS.md

---

### 2. UI Text Updates

**File**: `src/ui/public/index/jobsAndResumeManager.js`

**Changes**:
- ✅ File header: "Resume Queue Manager" → "Resume Crawl Manager"
- ✅ JSDoc comments: Added notes explaining "queues" variable = crawl jobs
- ✅ Summary text: "No resumable queues detected" → "No resumable crawls detected"
- ✅ Button text: "Resume 2 queues" → "Resume 2 crawls"
- ✅ Meta display: "queue: 45" → "pending: 45" (clearer for users)
- ✅ Status messages: "Checking paused queues" → "Checking paused crawls"
- ✅ Empty state: "No incomplete queues" → "No incomplete crawls"
- ✅ Fallback text: "Queue 123" → "Crawl 123"

**File**: `src/ui/express/public/index.html`

**Changes**:
- ✅ Section heading: "Resume Queues" → "Resume Crawls"
- ✅ Button title: "Clear all paused queues" → "Clear all incomplete crawls"
- ✅ Button text: "Clear Queues" → "Clear Crawls"

**File**: `src/ui/express/routes/api.resume-all.js`

**Changes**:
- ✅ Console logs: "clearing incomplete queues" → "clearing incomplete crawls"
- ✅ API response message: "Cleared N queues" → "Cleared N crawls"
- ✅ Error message: "Failed to clear queues" → "Failed to clear crawls"

**Result**: UI now consistently uses "crawl" terminology. Variable names remain "queue" for API compatibility (legacy).

---

### 3. Code Comments Added

**Purpose**: Explain why variable names say "queue" when they're actually crawl jobs

**Pattern**:
```javascript
// Note: "queues" here are actually incomplete crawl jobs (legacy API naming)
const queues = Array.isArray(data?.queues) ? data.queues.slice() : [];
```

**Locations**:
- `jobsAndResumeManager.js` - Multiple locations
- Future: Add to API route handlers

---

### 4. AGENTS.md Updates

**Section**: "Crawls vs Background Tasks"

**Changes**:
- ✅ Added reference to `ARCHITECTURE_QUEUES_ARE_INTERNAL.md`
- ✅ Updated table description: "queues are internal to crawls"
- ✅ Added "Critical Terminology Rule" section
- ✅ Updated "UI" line to say "Resume Crawls" section
- ✅ Added to Topic Index with ⭐ flag

**New Rules**:
```markdown
**Critical Terminology Rule** (October 2025):
- ✅ **Crawls** are user-facing entities
- ❌ **Queues** are internal implementation details
- Users never "resume a queue" - they "resume a crawl"
- UI text must say "Resume Crawls", not "Resume Queues"
```

---

### 5. API Compatibility Maintained

**Decision**: Keep API field names unchanged (no breaking change)

**Current API** (unchanged):
```javascript
GET /api/resume-all
{
  "queues": [...],        // Still called "queues"
  "recommendedIds": [...]
}

POST /api/resume-all
{
  "queueIds": [...]       // Still called "queueIds"
}
```

**Rationale**:
- Changing field names would break any API consumers
- Variable names in code are internal implementation
- JSDoc comments explain the discrepancy
- Future API v2 can fix naming (see migration strategy in docs)

---

## Architecture Clarifications

### Database Schema

```
crawl_jobs (User-Facing)
├── id: TEXT PRIMARY KEY
├── url: TEXT (starting URL for crawl)
├── status: TEXT ('running', 'completed', 'paused')
├── started_at: INTEGER
├── ended_at: INTEGER
└── args: TEXT (JSON configuration)

queue_events (Internal to Crawls)
├── id: INTEGER PRIMARY KEY
├── job_id: TEXT (FK → crawl_jobs.id)  ← Owned by crawl
├── action: TEXT ('discovered', 'visited', 'saved')
├── url: TEXT (URL being processed)
├── depth: INTEGER
└── ts: INTEGER
```

**Key Relationship**: `queue_events` CANNOT exist without parent `crawl_jobs`. Queues are subordinate.

---

### Mental Model

**❌ Wrong**: "Queues are things users can resume"
```
Queue 1 (paused)  ← User clicks "Resume Queue"
Queue 2 (paused)
```

**✅ Correct**: "Crawls are things users can resume; queues are internal state"
```
Crawl 1 (paused)  ← User clicks "Resume Crawl"
  └── Internal Queue: [url1, url2, url3, ...]  ← Restored automatically
Crawl 2 (paused)
  └── Internal Queue: [url4, url5, ...]
```

---

## Testing Implications

### Correct Test Names

```javascript
// ✅ Test crawl resume (which restores queue state)
test('should resume incomplete crawl', () => {
  const crawlId = startCrawl({ url: 'https://example.com' });
  pauseCrawl(crawlId);
  const result = resumeCrawl(crawlId);
  expect(result.resumed).toBe(1);
});

// ✅ Verify internal queue state is restored
test('should restore queue state when resuming crawl', () => {
  const crawlId = startCrawl({ url: 'https://example.com' });
  waitForDiscovery(crawlId, { minUrls: 10 });
  pauseCrawl(crawlId);
  resumeCrawl(crawlId);
  
  const queueEvents = getQueueEvents(crawlId);
  expect(queueEvents.length).toBeGreaterThan(0);
});
```

### Incorrect Test Names

```javascript
// ❌ Don't test "queue resume" - wrong mental model
test('should resume queue', () => {
  // Queues don't have independent lifecycle
});
```

---

## Future Work

### Phase 1: UI Text (✅ Complete - October 2025)
- Update all user-facing text to say "crawl"
- Add code comments explaining legacy variable names

### Phase 2: API v2 (Future)
- Add new API fields: `crawls` alongside `queues`
- Deprecate `queues` field name
- Document migration path for consumers

### Phase 3: Variable Renaming (Future)
- Rename `incompleteQueues` → `incompleteCrawls`
- Rename `queueIds` → `crawlIds`
- Update internal code systematically

---

## Validation Checklist

**UI Text**:
- ✅ Section header says "Resume Crawls"
- ✅ Button says "Resume N crawls" (not "queues")
- ✅ Status messages say "paused crawls" (not "queues")
- ✅ Empty state says "No incomplete crawls"
- ✅ Clear button says "Clear Crawls"

**Code**:
- ✅ Comments explain "queues" = crawl jobs
- ✅ JSDoc documents legacy parameter names
- ✅ Variable names kept for API compatibility

**Documentation**:
- ✅ ARCHITECTURE_QUEUES_ARE_INTERNAL.md created
- ✅ AGENTS.md updated with terminology rule
- ✅ Topic Index includes new doc
- ✅ Testing guidelines reflect correct mental model

**API**:
- ✅ Field names unchanged (no breaking change)
- ✅ Comments note discrepancy
- ✅ Migration strategy documented

---

## Impact Analysis

**User Experience**:
- ✅ Clearer terminology - "Resume Crawls" accurately describes action
- ✅ "pending: 45" clearer than "queue: 45"
- ✅ Confirmation dialog explains what's being cleared

**Developer Experience**:
- ✅ Comments explain variable naming discrepancy
- ✅ Architecture docs clarify relationship
- ✅ Testing patterns reflect correct mental model
- ✅ Future developers won't be confused

**API Consumers**:
- ✅ No breaking changes
- ✅ Existing integrations continue working
- ✅ Clear migration path documented for future

---

## Conclusion

**Architecture is now properly documented**: Queues are internal implementation details of crawls, not user-controllable entities.

**UI terminology is corrected**: All user-facing text consistently uses "crawl" terminology.

**Code maintains compatibility**: Variable names preserved, comments explain discrepancy.

**Future path is clear**: Migration strategy documented for eventual API v2 with correct field names.

