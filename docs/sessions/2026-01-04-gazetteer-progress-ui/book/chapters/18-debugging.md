# Chapter 18: Debugging and Troubleshooting

*Reading time: 10 minutes*

---

## Common Problems and Solutions

This chapter is your field guide when things go wrong.

---

## Problem: Wrong Country Selected

**Symptom**: "London" resolves to UK when article is clearly about Canada.

**Diagnosis**:
```javascript
const result = await service.disambiguate('London', { publisher: 'cbc.ca' });

console.log('Top 3 candidates:');
for (const c of result.candidates.slice(0, 3)) {
  console.log(`  ${c.name}, ${c.country_iso2}: score=${c.score.toFixed(3)}`);
  console.log(`    features:`, c.features);
}
```

**Common causes**:

1. **Publisher prior too weak**
   - Check `config/publisher-priors.json`
   - Increase weight for Canadian publishers

2. **Priority overwhelming other signals**
   - London UK has priority ~70, London ON ~56
   - Reduce `weights.priorityScore` or increase `weights.publisherPrior`

3. **Coherence not running**
   - Verify `config.enableCoherence: true`
   - Check if other Canadian places were resolved first

**Fix**: Tune weights or add more context (resolvedRegions).

---

## Problem: Low Confidence on Easy Cases

**Symptom**: "Tokyo" returns confidence 0.55 when it should be obvious.

**Diagnosis**:
```javascript
const result = await service.disambiguate('Tokyo');
console.log('Confidence:', result.confidence);
console.log('Gap:', result.candidates[0].score - result.candidates[1]?.score);
```

**Common causes**:

1. **Tokyo appears multiple times in gazetteer**
   - Check: `SELECT * FROM places WHERE name_norm = 'tokyo'`
   - May have Tokyo (Japan) + Tokyo (various smaller places)

2. **Confidence formula too conservative**
   - Adjust thresholds in `computeConfidence()`

3. **Features returning neutral values**
   - No publisher provided → publisherPrior = 0.5
   - No context → textWindowContext = 0.5

**Fix**: Provide more context or adjust confidence thresholds.

---

## Problem: Abstaining Too Often

**Symptom**: 30% abstention rate when targeting 15%.

**Diagnosis**:
```javascript
const evalResults = await evaluateAccuracy(service, evalSet);
console.log('Abstention breakdown:');
for (const r of evalResults.abstained) {
  console.log(`  ${r.mention}: ${r.abstainReason}`);
}
```

**Common causes**:

1. **Confidence threshold too high**
   - Lower `config.confidenceThreshold` from 0.4 to 0.3

2. **Multi-way tie detection too sensitive**
   - Increase gap threshold in `shouldAbstain()`

3. **Missing gazetteer entries**
   - Check if abstained mentions exist in database
   - May need to add aliases

**Fix**: Lower thresholds or expand gazetteer.

---

## Problem: Coherence Overcorrecting

**Symptom**: International articles have all places forced to one country.

**Diagnosis**:
```javascript
const results = await service.disambiguateArticle(article);
for (const r of results.mentions) {
  console.log(`${r.mention}: ${r.resolved?.country_iso2}`);
  if (r.coherenceChange) {
    console.log(`  Changed from: ${r.coherenceChange.from}`);
    console.log(`  Reason: ${r.coherenceChange.reason}`);
  }
}
```

**Common causes**:

1. **Dominant country threshold too low**
   - Currently 50% → increase to 60%

2. **Not detecting international articles**
   - Add keyword detection for summits, treaties, bilateral

3. **Coherence bonus too large**
   - Reduce `coherenceBonus` from 0.15 to 0.10

**Fix**: Add international article detection or reduce coherence strength.

---

## Problem: Slow Performance

**Symptom**: Disambiguation takes 50ms per mention instead of 1ms.

**Diagnosis**:
```javascript
const start = Date.now();
const result = await service.disambiguate('London');
console.log(`Time: ${Date.now() - start}ms`);

// Profile phases
console.log('Candidates:', result.candidates.length);
```

**Common causes**:

1. **Missing indexes**
   ```sql
   EXPLAIN QUERY PLAN 
   SELECT * FROM places WHERE name_norm = 'london';
   -- Should show "USING INDEX idx_places_name_norm"
   ```

2. **Cache not working**
   - Check `service.candidateCache.size`
   - Verify cache key generation

3. **Containment queries slow**
   - Add index on `place_hierarchy(child_id)`

4. **Too many candidates**
   - Reduce `maxCandidates` from 50 to 20

**Fix**: Add indexes, verify caching, limit candidates.

---

## Problem: SRID Mismatch Errors

**Symptom**: PostGIS errors about geometry SRID mismatch.

**Diagnosis**:
```sql
SELECT ST_SRID(geom_wgs84) FROM countries LIMIT 1;  -- Should be 4326
SELECT ST_SRID(way) FROM admin_areas LIMIT 1;       -- Should be 3857
```

**Common causes**:

1. **Forgot to transform before comparison**
   ```sql
   -- WRONG: Comparing 3857 with 4326
   SELECT * FROM admin_areas a, countries c
   WHERE ST_Contains(c.geom_wgs84, a.way);
   
   -- CORRECT: Transform to same SRID
   SELECT * FROM admin_areas a, countries c
   WHERE ST_Contains(c.geom_wgs84, ST_Transform(a.way, 4326));
   ```

2. **Using wrong column**
   - `countries.geom_wgs84` is 4326
   - `admin_areas.way` is 3857

**Fix**: Always use `ST_Transform()` when mixing SRIDs.

---

## Debugging Tools

### CLI Debug Mode

```bash
node tools/disambiguate-cli.js "London" --debug --publisher cbc.ca

# Output:
# Mention: "London"
# Candidates: 12
#   1. London, GB: score=0.72, priority=70, matchQuality=0.95
#   2. London, CA: score=0.68, priority=56, matchQuality=0.95
#   ...
# Publisher prior: { GB: 0.2, CA: 0.85 }
# Coherence: not applied (single mention)
# Winner: London, GB (confidence: 0.65)
```

### SQL Exploration

```sql
-- Find all places named "London"
SELECT p.id, n.name, p.kind, p.country_code, p.priority_score
FROM places p
JOIN place_names n ON n.place_id = p.id
WHERE n.normalized = 'london'
ORDER BY p.priority_score DESC;

-- Check containment edges
SELECT c.name AS child, p.name AS parent, h.depth
FROM place_hierarchy h
JOIN places child_p ON child_p.id = h.child_id
JOIN place_names c ON c.place_id = child_p.id AND c.is_preferred = 1
JOIN places parent_p ON parent_p.id = h.parent_id
JOIN place_names p ON p.place_id = parent_p.id AND p.is_preferred = 1
WHERE c.normalized = 'london';

-- Check aliases
SELECT n.normalized, n.name_kind, p.country_code
FROM place_names n
JOIN places p ON p.id = n.place_id
WHERE n.normalized = 'uk';
```

### Visualization

Build a debug view that shows:

```html
<div class="debug-view">
  <h3>Disambiguating: "London"</h3>
  
  <table class="candidates">
    <tr>
      <th>Place</th>
      <th>Score</th>
      <th>Match</th>
      <th>Priority</th>
      <th>Publisher</th>
      <th>Containment</th>
    </tr>
    <tr class="winner">
      <td>London, UK</td>
      <td>0.72</td>
      <td class="high">0.95</td>
      <td class="high">0.70</td>
      <td class="low">0.20</td>
      <td class="neutral">0.50</td>
    </tr>
    <tr>
      <td>London, ON, CA</td>
      <td>0.68</td>
      <td class="high">0.95</td>
      <td class="medium">0.56</td>
      <td class="high">0.85</td>
      <td class="neutral">0.50</td>
    </tr>
  </table>
  
  <div class="explanation">
    Winner: London, UK (confidence: 65%)
    Publisher prior favors Canada, but priority differential is large.
  </div>
</div>
```

---

## Logging for Production

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/disambiguation.log' })
  ]
});

// In disambiguate():
logger.info('disambiguation', {
  mention,
  publisher: options.publisher,
  resolved: result.resolved?.display_label,
  confidence: result.confidence,
  abstained: result.abstained,
  abstainReason: result.abstainReason,
  candidateCount: result.candidates?.length,
  topScore: result.candidates?.[0]?.score,
  duration: endTime - startTime
});
```

---

## Runbook: Investigation Steps

When disambiguation fails:

1. **Reproduce** the failure with minimal input
2. **Check** if the place exists in gazetteer
3. **Examine** candidate scores and features
4. **Verify** publisher profile is loaded
5. **Test** with more context (resolvedRegions, textWindow)
6. **Check** coherence application
7. **Compare** with known-good similar cases
8. **Tune** weights if pattern is systematic

---

## What to Build (This Chapter)

1. **Create debug CLI**:
   ```bash
   node tools/disambiguate-cli.js --debug
   ```

2. **Add logging infrastructure**:
   ```
   src/gazetteer/logger.js
   ```

3. **Create debug view in UI**:
   - Show candidate table with feature breakdown
   - Highlight winning factors
   - Show coherence changes

4. **Create runbook document**:
   ```
   docs/runbooks/disambiguation-debugging.md
   ```

5. **Add health checks**:
   ```javascript
   // Periodic sanity checks
   const health = await service.healthCheck();
   // Returns: { dbConnected, placesCount, indexesPresent, sampleQueryTime }
   ```

6. **Create troubleshooting FAQ**:
   ```
   docs/faq/disambiguation-troubleshooting.md
   ```

---

*This concludes the main chapters. Continue to the appendices for reference materials.*

---

*Next: [Appendix A — SQL Recipes](./appendix-a-sql-recipes.md)*
