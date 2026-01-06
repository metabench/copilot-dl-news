# Plan – Place Hub Discovery Tool & Guardian Coverage

## Objective
Create general-purpose place-hub-discover tool and expand Guardian place hub mappings from 54 to 225+

## Done When
- [x] General-purpose `place-hub-discover.js` tool created
- [x] Guardian place hub coverage expanded from 54 → 225 unique places
- [x] All 20 high-priority countries mapped (Ukraine, Russia, France, China, etc.)
- [x] Place-hubs UI verified working at http://localhost:3000/place-hubs
- [ ] Key deliverables documented in `SESSION_SUMMARY.md`
- [ ] Follow-ups recorded in `FOLLOW_UPS.md`

## Change Set
- `tools/dev/place-hub-discover.js` — New general-purpose discovery tool
- `data/news.db` — 225 Guardian place_page_mappings (54 verified + 171 pending)
- `src/ui/server/placeHubGuessing/` — Verified DB injection working

## Results Summary

### Guardian Coverage
| Metric | Before | After |
|--------|--------|-------|
| Total Mappings | 54 | 225 |
| Verified | 54 | 54 |
| Pending | 0 | 171 |
| High-Priority (20) | ~10 | **20/20** ✓ |

### Discovery Tool Features
1. **Pattern-based URL extraction** — SQLite LIKE + NOT GLOB for filtering
2. **Batch name matching** — 158,744 name variants indexed, O(1) lookups
3. **Deduplication** — Prefers English names over language variants
4. **Query string stripping** — Avoids `?page=2` duplicates
5. **Dry-run by default** — `--apply` flag to commit changes

### Usage
```bash
# Discover Guardian place hubs (dry run)
node tools/dev/place-hub-discover.js --host theguardian.com --limit 5000

# Apply discoveries
node tools/dev/place-hub-discover.js --host theguardian.com --limit 5000 --apply
```

## Risks & Mitigations
- **Wrong place matches** — Mitigated by preferring English names and country-only kind filter
- **Duplicate URLs** — Mitigated by query string stripping and existing-mapping filter

## Tests / Validation
- ✓ All 20 high-priority countries verified present
- ✓ UI loads at http://localhost:3000/place-hubs?hostQ=guardian&hostLimit=1
- ✓ DB debug endpoint shows connection healthy
