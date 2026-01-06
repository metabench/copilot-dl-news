# Follow Ups – Place Hub Discovery Tool & Guardian Coverage

## High Priority

### 1. Test with Other News Sites
The `place-hub-discover.js` tool is generic. Test with:
- **BBC** — `/news/world/{region}` patterns
- **Reuters** — `/world/{region}` patterns
- **AP News** — Different URL structure

### 2. Improve Name Matching
Current matching uses exact normalized name lookups. Could improve:
- Fuzzy matching for near-misses
- Alias expansion (e.g., "UK" → "United Kingdom")
- Demonym handling ("American" → "United States")

### 3. Verification Workflow
Need UI/tooling to:
- Review pending mappings
- Mark as verified/rejected
- Track verification progress per host

## Medium Priority

### 4. Region/City Hub Discovery
Currently only discovers country-level hubs. Extend for:
- Region hubs (US states, UK regions)
- City hubs (major cities like London, New York)

### 5. Pattern Learning
Auto-detect URL patterns from existing verified mappings:
- If Guardian verified pattern is `/world/{slug}`, suggest for BBC
- Build pattern library per publisher

## Lower Priority

### 6. API Integration
Expose discovery as an API endpoint for the Place Hub Guessing Matrix UI:
- `POST /api/place-hubs/discover` with host + pattern
- Progress SSE for large discoveries

### 7. Evidence Enrichment
Store more evidence per mapping:
- Sample URLs from that hub
- Article counts
- Last active date_
