# DISAMBIGUATION_ALGORITHM_SPEC.md

Date: 2026-01-04
Scope: Deterministic place disambiguation algorithm spec for news articles using SQLite gazetteer + optional PostGIS backstop.

## Inputs
Per article:
- `text` (title + body)
- `publisher` (host, publisher name)
- `published_at`
- Optional: section/category, author, known region tags.

Gazetteer data (served from SQLite):
- `places` + `place_names` + `place_parents` (see GAZETTEER_SYNC_STRATEGY.md)

## Outputs
For each detected place mention:
- `mentionText`
- `span` (start/end offsets)
- `candidatesTopN` (id + name + kind + country + score + feature breakdown)
- `chosen` (place_id)
- `confidence` (0–1)
- `explanation` (feature deltas)

## Step 0: Normalization helpers
- `normalize(s)`: casefold, trim, collapse whitespace, strip trailing punctuation.
- `canonicalizeCountry(s)`: alias map (UK/GB/United Kingdom, US/U.S./United States).
- `tokenize(text)`: simple tokenization for matching; keep original offsets.

## Step 1: Mention detection (MVP)
Start with a deterministic heuristic (upgrade later):
1) Candidate spans: capitalized tokens and 2–4 token sequences.
2) Filter out common stopwords and common non-place phrases.
3) Prefer spans that match known names in `place_names`.

MVP simplification:
- If you already have an extraction pipeline producing potential place strings, reuse it and treat mention detection as “given list of mentions”.

## Step 2: Candidate generation
Given `mentionNorm`:
1) Query `place_names.name_norm = mentionNorm` → return mapped places.
2) If no hits, query `places.name_norm = mentionNorm`.
3) If still none, optionally do FTS prefix query (if enabled):
   - return top K results.

Candidate limit recommendations:
- `K=25` initial, prune to top 10 after scoring.

## Step 3: Feature computation
Compute features for each candidate.

### Article-level priors
- `publisherHomeCountry`: lookup host → (country_iso2, adm1_id?) from a maintained table.
- `articleRegionHints`: extracted strong mentions like countries/ADM1.

### Candidate features (examples)
Boolean / numeric:
- `f_isPublisherCountryMatch` (0/1)
- `f_isPublisherAdm1Match` (0/1)
- `f_countryMentioned` (0/1)
- `f_adm1Mentioned` (0/1)
- `f_coherenceClusterBonus` (0..1)
- `f_priorityScore` (0..1)
- `f_nameExact` (0/1)
- `f_kindMatchesLexicalHint` (0/1)

Lexical hints examples:
- mention contains “River” → downrank `adm*`, upweight `waterway` (future)
- mention contains “Province/State/County” → upweight admin candidates.

## Step 4: Scoring
Linear scoring (hand-tuned weights):

$$ rawScore = \sum_i w_i \cdot f_i $$

Suggested initial weights:
- `w_publisher_country = +6`
- `w_publisher_adm1 = +7`
- `w_country_mentioned = +4`
- `w_adm1_mentioned = +5`
- `w_priorityScore = +2` (scaled)
- `w_kind_hint = +2`
- `w_exact_name = +1`

### Coherence pass (recommended)
After individual scoring, do a second pass:
- Build a histogram of countries/adm1 among top candidates.
- Add `clusterBonus` to candidates consistent with the dominant cluster.

Example:
- If top mentions imply Canada/Ontario, boost candidates in CA/ON.

## Step 5: Selection + confidence
Selection:
- Choose candidate with max final score.

Confidence:
Use score margin and absolute score.

One simple mapping:
- Let `s1` = best score, `s2` = runner-up.
- `margin = s1 - s2`.
- `confidence = sigmoid(a * margin + b * s1 + c)`.

Where `sigmoid(x)=1/(1+e^{-x})` and `(a,b,c)` are tuned by inspection.

MVP alternative (no sigmoid):
- `confidence = clamp01((margin / 10) + (s1 / 20))`.

## Step 6: Explanation
For chosen candidate, emit:
- top contributing features
- any decisive match (publisher prior, adm1 mention)
- margin vs runner-up

## Determinism requirements
- Same gazetteer snapshot + same config must produce identical results.
- Randomness forbidden.
- All heuristic thresholds are configuration.

## Pseudocode (end-to-end)
```js
function resolvePlaces(article, gazetteer, publisherPriors, config) {
  const mentions = detectMentions(article.text, gazetteer, config);
  const strongHints = extractStrongRegionHints(mentions, gazetteer, config);
  const publisherHint = publisherPriors.lookup(article.publisherHost);

  const results = [];
  for (const mention of mentions) {
    const candidates = generateCandidates(mention, gazetteer, config);
    const scored = candidates.map(c => {
      const features = computeFeatures({ mention, candidate: c, strongHints, publisherHint, article, config });
      const score = dot(features, config.weights);
      return { candidate: c, features, score };
    });

    const reranked = applyCoherenceBonus(scored, results, strongHints, publisherHint, config);
    const sorted = reranked.sort((a,b) => b.score - a.score);

    const best = sorted[0] ?? null;
    const second = sorted[1] ?? null;

    results.push(formatResult(mention, best, second, sorted, config));
  }
  return results;
}
```

## Testing strategy (minimum)
- Fixed fixtures: a handful of articles known to be UK vs Canada vs US Londons.
- Unit tests for:
  - normalization
  - alias resolution
  - scoring feature breakdown
  - confidence monotonicity (bigger margin → higher confidence)

## Debugging hooks (important)
- Log per mention: top N candidates with feature breakdown.
- Log per article: inferred region hints and publisher prior.
- Provide a CLI that runs the resolver on a text file and prints JSON.
