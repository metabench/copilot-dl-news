# PLACE_DISAMBIGUATION_RESEARCH.md

Date: 2026-01-04
Scope: Deterministic place-name disambiguation (“London” → UK vs Ontario) for a news crawler, using PostGIS OSM admin boundaries + local SQLite cache.

## Problem framing (what we are actually solving)
We need **toponym resolution** in running text:
1) **Detection**: identify candidate spans in text that look like places (“London”, “Thames River”, “Ontario”).
2) **Candidate generation**: map each mention to a set of possible geographic entities.
3) **Disambiguation / ranking**: pick the best entity for each mention using context and priors.
4) **Explainability**: produce a confidence score + reasoning trace (deterministic and debuggable).

You already have (at minimum):
- Publisher metadata (host, publisher name, maybe known “home location”).
- Other place names in the article.
- A PostGIS-backed gazetteer (countries + admin areas).

## Recommended baseline approach (deterministic, debuggable)
**Approach**: multi-signal candidate ranking with a small, explicit feature set.

Core signals (high leverage):
- **Publisher prior**: publisher → home region (country/ADM1) prior.
- **Co-occurrence**: if multiple mentions align in the same region, boost that region.
- **Containment consistency**: city contained by ADM2 contained by ADM1 contained by country.
- **Population/priority_score**: when ambiguous, large/popular entities are more likely.
- **Lexical type hints**: “River”, “County”, “Province”, “Borough”, etc.

This is essentially an explainable “scoring model” (not ML training):

$$ score(entity | article) = \sum_i w_i \cdot feature_i(entity, article) $$

Where weights are hand-tuned, logged, and easy to adjust.

## Candidate generation strategies (what works well in practice)
### 1) Gazetteer lookup with normalization
- Normalize mention: casefold, strip punctuation, normalize whitespace.
- Maintain alias expansions: “UK” ↔ “United Kingdom”, “U.S.” ↔ “United States”.
- Use trigram/FTS index in SQLite for fast lookup.

**Why**: Candidate generation must be fast and broad; ranking will prune.

### 2) Region-first vs place-first candidate generation
Two reliable patterns:
- **Place-first**: “London” → list all Londons; rank using context.
- **Region-first**: infer likely country/ADM1 from other signals, then search for “London” within that region.

**Recommended**: do both:
- Generate global candidates from SQLite.
- If the article strongly implies a region (publisher prior + other mentions), also generate **region-filtered** candidates.

### 3) Two-pass geoparsing (cheaper, less false-positive)
Pass A: detect *strong* mentions (countries, ADM1, unique landmarks).
Pass B: use inferred region to interpret ambiguous city names.

## Disambiguation techniques (ranked options)
### Option A (recommended): Explainable scoring + region coherence
- Each mention produces candidates.
- Compute a per-candidate score.
- Add a **coherence bonus** if multiple selected candidates fall within a common region.

Implementation note: the coherence step can be greedy (fast) or graph-based (more accurate).

**Pros**: deterministic, explainable, cheap.
**Cons**: requires careful weight tuning and good caching.

### Option B: Graph-based joint inference (still deterministic)
Treat candidates as nodes; add edges for geographic containment compatibility.
Pick a maximum-weight consistent set (approximate with greedy/beam search).

**Pros**: better at mutual disambiguation (multiple ambiguous mentions).
**Cons**: more complex; still doable without ML.

### Option C: ML / neural geoparsers
Powerful but violates “deterministic, explainable” preference.

**Pros**: high accuracy possible.
**Cons**: difficult to debug, requires training/eval data, infrastructure.

## What to weight (practical heuristic weights)
A sane starting point (weights are illustrative, tune via logs):
- Publisher-home-region match: +6
- Mentioned ADM1 match (e.g., “Ontario”): +5
- Mentioned country match: +4
- Containment consistency (candidate city within inferred ADM1/country): +4
- Landmark alias match (“Western University” implies London ON): +6 (if you have a landmark dictionary)
- Population/priority_score prior: +0..+3
- Distance to publisher home (if you have lat/lng): -0..-3 (small penalty for far away)

## Known pitfalls & mitigations
### Pitfall: identical names across countries (London, Paris, Victoria, Springfield)
Mitigation:
- Region-first filtering when region confidence is high.
- Multi-mention coherence bonus.

### Pitfall: cross-border polygon quirks and SRID mismatch
Mitigation:
- Always transform to a shared SRID before spatial operations.
- Prefer point-in-polygon checks with a candidate centroid when polygons are messy.

### Pitfall: OSM admin_level inconsistency across countries
Mitigation:
- Do not hardcode meaning of admin_level globally.
- Store a “role” mapping per country (see POSTGIS_HIERARCHY_DESIGN.md).

### Pitfall: news text includes org/team names (London Drugs, Paris Saint‑Germain)
Mitigation:
- Maintain a small “non-place phrase” blacklist.
- Add NER-like heuristics: if surrounded by strong non-geographic context, downrank.

## Open-source references worth scanning (for concepts)
These are concept pointers (not required dependencies):
- Gazetteer-based geoparsing pipelines (candidate generation + ranking).
- CLAVIN-style approaches (heuristic resolution using GeoNames-like features).
- Wikipedia/Wikidata entity linking ideas (but keep deterministic).

## Acceptance criteria for this project
- Per-mention resolution returns: {chosenEntity, confidence, explanation, candidateSetTopN}.
- Typical articles resolve within ~20–50ms after warm cache.
- Deterministic output given same config + gazetteer snapshot.

## Example scenario: “London” in an Ontario news article
Input:
- Publisher: London Free Press (home ≈ London, Ontario)
- Mentions: Ontario, Thames River, Western University

Expected:
- London (Ontario, CA) beats London (UK) because:
  - Publisher prior strongly Canadian
  - Ontario mentioned
  - Local landmarks match (Thames River + Western)
  - Coherence score favors Ontario cluster
