# Comments – V5 Remote Crawler Application

## Intended Human Review

These are the main decisions worth explicit human confirmation before implementation accelerates:

### 1. Single-host first?
Recommendation: yes.

Reason:
- fastest path to a real remote product
- least dependency on currently drifted v4/fleet assets
- enough to deliver remote UI, article browsing, and bundle downloads

### 2. Should v5 have a new version boundary?
Recommendation: yes.

Reason:
- user asked for v5 "for all of it"
- current v2/v4 assets are useful, but docs and code drift is already high
- a clean v5 namespace reduces accidental breakage and simplifies testing

### 3. Should article browsing be core or optional?
Recommendation: core.

Reason:
- user explicitly wants to navigate and view downloaded news on the remote server
- existing article/Data Explorer assets make this achievable without greenfield work
- treat this as a first-class acceptance requirement, not a later module

### 4. Should large bundle export be async?
Recommendation: yes.

Reason:
- request/response streaming alone is weak operator UX for large datasets
- async jobs make retry/progress/download/history much better
- integrity metadata and restart-safe retry behavior should be part of the requirement

### 5. How strict should auth be in phase 1?
Recommendation:
- minimum acceptable before remote exposure: authenticated reverse proxy or equivalent private-access boundary
- if browser access is intended beyond a private tunnel, session-aware operator auth should be in the primary product path, not a late afterthought

### 6. Should intelligent place/topic hub guessing be core?
Recommendation: yes.

Reason:
- the repo already has country/place hub analysis, pattern learning, and hub-guessing UI query assets
- the user explicitly wants intelligent crawling, not just manual seeding
- hub suggestions become much more valuable when they are wired directly into crawl launch, review, and monitoring
