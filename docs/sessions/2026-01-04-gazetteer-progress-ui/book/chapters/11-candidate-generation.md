# Chapter 11: Candidate Generation

*Reading time: 10 minutes*

---

## The First Step in Disambiguation

Given a text mention like "London", candidate generation returns all possible places it could refer to:

```
Input:  "London"
Output: [
  { place_id: 1234, name: "London", country: "GB", importance: 70 },
  { place_id: 5678, name: "London", country: "CA", importance: 56 },
  { place_id: 9012, name: "London", country: "US", importance: 39 },
  ...
]
```

This chapter covers how to generate candidate lists efficiently and comprehensively.

---

## Core Lookup Query

The basic query joins places with their names:

```sql
SELECT 
  p.id AS place_id,
  pn.name,
  p.kind,
  p.country_code,
  p.priority_score AS importance
FROM places p
JOIN place_names pn ON pn.place_id = p.id
WHERE pn.normalized = ?
ORDER BY p.priority_score DESC
LIMIT 50;
```

But real text mentions are messy. We need multiple strategies.

---

## Strategy 1: Exact Match on Name

```javascript
function exactMatch(db, mention) {
  const norm = normalizePlace(mention);
  
  return db.all(`
    SELECT p.*, pn.name, 'exact' AS match_type
    FROM places p
    JOIN place_names pn ON pn.place_id = p.id
    WHERE pn.normalized = ?
    ORDER BY p.priority_score DESC
    LIMIT 20
  `, [norm]);
}
```

**Handles**: "London", "São Paulo", "New York"

---

## Strategy 2: Alias Match

Many places have multiple names. Check aliases too.

```javascript
function aliasMatch(db, mention) {
  const norm = normalizePlace(mention);
  
  return db.all(`
    SELECT p.*, pn.name, 'alias' AS match_type, pn.name_kind
    FROM places p
    JOIN place_names pn ON pn.place_id = p.id
    WHERE pn.normalized = ? 
      AND pn.name_kind IN ('alias', 'exonym', 'abbr')
    ORDER BY p.priority_score DESC
    LIMIT 20
  `, [norm]);
}
```

**Handles**: "UK" → United Kingdom, "NYC" → New York City, "Bombay" → Mumbai

---

## Strategy 3: Prefix Match (Partial Names)

For mentions like "New Yor" (partial), use prefix matching.

```javascript
function prefixMatch(db, mention, minLength = 4) {
  if (mention.length < minLength) return [];
  
  const norm = normalizePlace(mention);
  
  return db.all(`
    SELECT p.*, pn.name, 'prefix' AS match_type
    FROM places p
    JOIN place_names pn ON pn.place_id = p.id
    WHERE pn.normalized LIKE ? || '%'
    ORDER BY p.priority_score DESC
    LIMIT 20
  `, [norm]);
}
```

**Handles**: "New Y" → New York, "Californ" → California

**Warning**: Use sparingly—prefix matches can be noisy.

---

## Strategy 4: Compound Name Handling

Some places have compound names with meaningful parts.

```javascript
function compoundMatch(db, mention) {
  const norm = normalizePlace(mention);
  const parts = norm.split(' ');
  
  if (parts.length < 2) return [];
  
  // Try matching on significant part
  const candidates = [];
  
  // Match on first major word (skip "new", "san", "los", etc.)
  const skipWords = new Set(['new', 'san', 'los', 'las', 'la', 'el', 'de', 'del', 'saint', 'st']);
  const significantPart = parts.find(p => !skipWords.has(p) && p.length > 2);
  
  if (significantPart) {
    candidates.push(...db.all(`
      SELECT p.*, pn.name, 'compound_part' AS match_type
      FROM places p
      JOIN place_names pn ON pn.place_id = p.id
      WHERE pn.normalized LIKE '%' || ? || '%'
        AND pn.normalized != ?
      ORDER BY p.priority_score DESC
      LIMIT 10
    `, [significantPart, norm]));
  }
  
  return candidates;
}
```

**Handles**: Finds "Orleans" when given "New Orleans" (helps with partial mentions)

---

## Strategy 5: Country/Admin Qualified Names

When text says "London, Ontario", extract and use the qualifier.

```javascript
function qualifiedMatch(db, mention) {
  // Pattern: "Place, Qualifier" or "Place, State/Province"
  const commaPattern = /^(.+),\s*(.+)$/;
  const match = mention.match(commaPattern);
  
  if (!match) return [];
  
  const placePart = normalizePlace(match[1]);
  const qualifierPart = normalizePlace(match[2]);
  
  // Try qualifier as parent (Country or Region)
  // We join through place_hierarchy to find if the candidate is contained in the qualifier
  let results = db.all(`
    SELECT child.*, child_name.name, 'qualified_parent' AS match_type
    FROM places child
    JOIN place_names child_name ON child_name.place_id = child.id
    JOIN place_hierarchy ph ON ph.child_id = child.id
    JOIN places parent ON parent.id = ph.parent_id
    JOIN place_names parent_name ON parent_name.place_id = parent.id
    WHERE child_name.normalized = ?
      AND (parent_name.normalized = ? OR parent_name.normalized LIKE ? || '%')
    ORDER BY child.priority_score DESC
    LIMIT 10
  `, [placePart, qualifierPart, qualifierPart]);
  
  return results;
}
```

**Handles**: "London, Ontario", "Paris, Texas", "Birmingham, Alabama"

---

## Combining Strategies

The main candidate generator tries strategies in order of precision:

```javascript
async function generateCandidates(db, mention, options = {}) {
  const candidates = [];
  const seenIds = new Set();
  
  function addUnique(results) {
    for (const r of results) {
      if (!seenIds.has(r.place_id)) {
        seenIds.add(r.place_id);
        candidates.push(r);
      }
    }
  }
  
  // 1. Check for qualified name first (most specific)
  addUnique(qualifiedMatch(db, mention));
  
  // 2. Exact name match
  addUnique(exactMatch(db, mention));
  
  // 3. Alias match
  addUnique(aliasMatch(db, mention));
  
  // 4. Prefix match (if enabled and still need candidates)
  if (options.allowPrefix && candidates.length < 3) {
    addUnique(prefixMatch(db, mention));
  }
  
  // 5. Compound part match (last resort)
  if (options.allowCompound && candidates.length < 3) {
    addUnique(compoundMatch(db, mention));
  }
  
  // Sort by priority
  candidates.sort((a, b) => b.priority_score - a.priority_score);
  
  // Limit total candidates
  return candidates.slice(0, options.maxCandidates || 50);
}
```

---

## Candidate Object Structure

Each candidate includes metadata for downstream scoring:

```javascript
{
  // Identity
  place_id: 1234,
  
  // Display
  name: "London",
  display_label: "London, Ontario, Canada",  // Computed
  
  // Classification
  kind: "locality",
  country_iso2: "CA",
  country_name: "Canada",
  adm1_name: "Ontario",
  
  // Location
  lat: 42.9849,
  lng: -81.2453,
  
  // Scoring inputs
  priority_score: 56,
  match_type: "exact",  // How we found this candidate
  
  // Match quality (computed)
  match_score: 1.0  // 1.0 for exact, 0.8 for alias, 0.5 for prefix
}
```

---

## Match Type Scoring

Different match types have different confidence:

| Match Type | Base Score | Rationale |
|------------|------------|-----------|
| `qualified_country` | 1.0 | Explicit qualifier—high confidence |
| `qualified_adm1` | 1.0 | Explicit qualifier |
| `exact` | 0.95 | Direct name match |
| `alias` (official) | 0.9 | Known alternate name |
| `alias` (common) | 0.85 | Informal name |
| `alias` (historic) | 0.7 | Old name—may be outdated |
| `prefix` | 0.5 | Partial match—low confidence |
| `compound_part` | 0.3 | Part of compound—very low confidence |

---

## Display Label Generation

Generate human-readable labels for disambiguation UI:

```javascript
function generateDisplayLabel(candidate) {
  const parts = [candidate.name];
  
  // Add ADM1 if different from name
  if (candidate.adm1_name && candidate.adm1_name !== candidate.name) {
    parts.push(candidate.adm1_name);
  }
  
  // Add country
  if (candidate.country_name) {
    parts.push(candidate.country_name);
  }
  
  return parts.join(', ');
}

// Examples:
// "London, England, United Kingdom"
// "London, Ontario, Canada"
// "London, Kentucky, United States"
// "Ontario, Canada"  (when Ontario is the place, not qualifier)
```

---

## Handling Ambiguous Short Names

Some names are too short or common to look up reliably:

```javascript
const AMBIGUOUS_NAMES = new Set([
  'us', 'uk', 'la', 'ny',  // Abbreviations
  'bay', 'hill', 'lake', 'river',  // Generic features
  'north', 'south', 'east', 'west',  // Directions
  'new', 'old', 'big', 'little'  // Adjectives
]);

function isAmbiguousName(mention) {
  const norm = normalizePlace(mention);
  return AMBIGUOUS_NAMES.has(norm) || norm.length < 3;
}

// In generateCandidates:
if (isAmbiguousName(mention)) {
  return [];  // Or return with low confidence flag
}
```

---

## Batching for Efficiency

For articles with many mentions, batch the lookups:

```javascript
async function batchGenerateCandidates(db, mentions, options = {}) {
  // Normalize and dedupe mentions
  const uniqueMentions = [...new Set(mentions.map(normalizePlace))];
  
  // Single query for all exact matches
  const placeholders = uniqueMentions.map(() => '?').join(',');
  const allExact = db.all(`
    SELECT *, normalized AS lookup_key, 'exact' AS match_type
    FROM place_names
    JOIN places ON places.id = place_names.place_id
    WHERE normalized IN (${placeholders})
    ORDER BY normalized, priority_score DESC
  `, uniqueMentions);
  
  // Group by lookup key
  const resultMap = {};
  for (const row of allExact) {
    if (!resultMap[row.lookup_key]) {
      resultMap[row.lookup_key] = [];
    }
    resultMap[row.lookup_key].push(row);
  }
  
  // For each mention, get candidates (may need additional queries for aliases)
  const results = {};
  for (const mention of mentions) {
    const norm = normalizePlace(mention);
    results[mention] = resultMap[norm] || [];
    
    // If no exact matches, try aliases (which are now in place_names too, so this logic might be redundant if we query place_names directly)
    // But if we want to distinguish 'exact' vs 'alias' match types, we might need separate logic or check name_kind
    if (results[mention].length === 0) {
      results[mention] = aliasMatch(db, mention);
    }
  }
  
  return results;
}
```

---

## Edge Cases

### Unicode Normalization

```javascript
// These should all match the same place:
normalizePlace("São Paulo")     // "sao paulo"
normalizePlace("Sao Paulo")     // "sao paulo"
normalizePlace("SAO PAULO")     // "sao paulo"
normalizePlace("sao  paulo")    // "sao paulo"
```

### Abbreviation Expansion

```javascript
const ABBREVIATIONS = {
  'st': 'saint',
  'mt': 'mount',
  'ft': 'fort',
  'pt': 'port'
};

function expandAbbreviations(name) {
  const words = name.split(' ');
  return words.map(w => ABBREVIATIONS[w.toLowerCase()] || w).join(' ');
}

// "St. Louis" → "Saint Louis" (matches either form)
```

---

## What to Build (This Chapter)

1. **Create the candidate generator module**:
   ```
   src/gazetteer/candidateGenerator.js
   ```

2. **Implement all strategies**:
   - `exactMatch()`
   - `aliasMatch()`
   - `prefixMatch()`
   - `qualifiedMatch()`
   - `compoundMatch()`
   - `generateCandidates()` (combiner)

3. **Add batch lookup**:
   - `batchGenerateCandidates()`

4. **Add a CLI for testing**:
   ```bash
   node tools/gazetteer-lookup.js "London"
   node tools/gazetteer-lookup.js "London, Ontario"
   node tools/gazetteer-lookup.js --batch "London|Paris|Ontario"
   ```

5. **Write tests**:
   ```javascript
   test('exact match finds London GB first', () => {
     const candidates = generateCandidates(db, 'London');
     expect(candidates[0].country_iso2).toBe('GB');
   });
   
   test('qualified match finds London Ontario', () => {
     const candidates = generateCandidates(db, 'London, Ontario');
     expect(candidates[0].adm1_name).toBe('Ontario');
   });
   ```

---

*Next: [Chapter 12 — Feature Engineering for Scoring](./12-feature-engineering.md)*
