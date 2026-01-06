# Chapter 2: The Disambiguation Pipeline

*Reading time: 12 minutes*

---

## Pipeline Overview

Place disambiguation is a multi-stage pipeline. Each stage has a specific job, clear inputs, and clear outputs. Breaking the problem into stages makes each piece testable and debuggable.

```
┌────────────────────────────────────────────────────────────────┐
│                         INPUT                                  │
│  • Article text (title + body)                                │
│  • Publisher metadata (host, name)                            │
│  • Publication date                                           │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                    STAGE 1: MENTION DETECTION                  │
│  Find spans in text that might be place names                 │
│  Output: List of (text, startOffset, endOffset)               │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                 STAGE 2: CANDIDATE GENERATION                  │
│  For each mention, find matching entities in gazetteer        │
│  Output: List of (mention → [candidate entities])             │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                    STAGE 3: FEATURE SCORING                    │
│  Score each candidate based on context signals                │
│  Output: List of (candidate, feature_vector, raw_score)       │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                    STAGE 4: COHERENCE PASS                     │
│  Adjust scores for mutual consistency                         │
│  Output: List of (candidate, adjusted_score)                  │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                 STAGE 5: SELECTION & CONFIDENCE                │
│  Pick winner per mention, compute confidence                  │
│  Output: List of (mention, chosen_entity, confidence, reason) │
└────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Mention Detection

**Goal**: Find text spans that might be place names.

### Approaches (Simple to Complex)

**Level 1: Known-name lookup**
Scan for exact matches against a list of known place names.
- Pro: Simple, fast
- Con: Misses variations, catches false positives ("Jordan" the name)

**Level 2: Capitalization heuristics**
Capitalized words/phrases that aren't sentence starters.
- Pro: Catches unknown places
- Con: Catches many non-places (company names, people)

**Level 3: NER (Named Entity Recognition)**
Use a trained model to detect location entities.
- Pro: High accuracy
- Con: Adds ML dependency, slower

### Our Approach

Start with **Level 1.5**: Known-name lookup enhanced with capitalization patterns for 2-3 word phrases. This is deterministic and fast.

```
Input:  "Fire destroys historic building in London"
Output: [{ text: "London", start: 38, end: 44 }]
```

---

## Stage 2: Candidate Generation

**Goal**: For each mention, find all possible matching entities.

### The Lookup Process

```
mention: "London"
    ↓
normalize("London") → "london"
    ↓
Query: place_names WHERE normalized = "london"
    ↓
Results:
  • {id: 101, name: "London", country: "GB", kind: "locality", pop: 9M}
  • {id: 102, name: "London", country: "CA", adm1: "ON", kind: "locality", pop: 400K}
  • {id: 103, name: "London", country: "US", adm1: "KY", kind: "locality", pop: 8K}
  • ... (more)
```

### Key Design Decisions

1. **Normalize before lookup**: Casefold, strip punctuation
2. **Include aliases**: "UK" → "United Kingdom", "U.S." → "United States" (via `place_names` table)
3. **Limit candidates**: Return top 25 by priority_score, prune later
4. **Fast path**: If only 1 candidate exists, skip scoring (rare but helpful)

---

## Stage 3: Feature Scoring

**Goal**: Score each candidate based on how well it fits the article context.

### Feature Categories

| Category | Features | Weight Range |
|----------|----------|--------------|
| Publisher | country_match, adm1_match | High (+6-7) |
| Co-mentions | country_mentioned, adm1_mentioned | High (+4-5) |
| Priority | priority_score | Medium (+0-3) |
| Lexical | exact_name_match, kind_hint | Low (+1-2) |

### Scoring Formula

```
rawScore(candidate) = Σ (weight_i × feature_i)
```

Example for "London" with publisher = London Free Press:

| Candidate | publisher_CA | adm1_ON | priority | Raw Score |
|-----------|--------------|---------|------------|-----------|
| London, UK | 0 | 0 | 3 | 3 |
| London, ON | +6 | +7 | 2 | 15 |
| London, KY | 0 | 0 | 0.5 | 0.5 |

London, ON wins before we even do coherence.

---

## Stage 4: Coherence Pass

**Goal**: Boost candidates that are geographically consistent with other high-scoring candidates.

### The Intuition

If we're fairly confident the article is about Canada (from other mentions), candidates in Canada should get a boost.

### Algorithm Sketch

```
1. Build histogram: country → sum of top-candidate scores
2. Find dominant region (country or adm1 with highest total)
3. For each candidate:
   if candidate.country == dominantCountry:
     adjustedScore = rawScore + coherenceBonus
   else:
     adjustedScore = rawScore
```

### Example

Article mentions: "Ontario", "Toronto", "London"

After individual scoring:
- Ontario → Ontario, CA (high score)
- Toronto → Toronto, CA (high score)  
- London → London, ON (score: 8), London, UK (score: 7)

Coherence pass:
- Dominant region: Canada
- London, ON gets +3 coherence bonus → 11
- London, UK stays at 7
- Gap widens, confidence increases

---

## Stage 5: Selection & Confidence

**Goal**: Pick the winner and explain why.

### Selection

Simply take the highest-scoring candidate after coherence adjustment.

### Confidence Calculation

Confidence should reflect:
- **Margin**: How much better is #1 than #2?
- **Absolute score**: Is the score actually high?

Simple formula:

```
margin = score_1 - score_2
confidence = clamp(0.5 + margin/20 + score_1/40, 0, 1)
```

| Scenario | Margin | Score | Confidence |
|----------|--------|-------|------------|
| Clear winner | 10 | 15 | 0.98 |
| Close race | 2 | 12 | 0.70 |
| Weak match | 3 | 5 | 0.63 |
| Tie | 0 | 10 | 0.50 |

### Explanation

For auditability, emit the top contributing features:

```json
{
  "mention": "London",
  "chosen": { "name": "London", "country": "CA", "adm1": "ON" },
  "confidence": 0.92,
  "explanation": "publisher_adm1_match (+7), publisher_country_match (+6), coherence_bonus (+3)"
}
```

---

## Data Flow Summary

```
Article: "Toronto mayor visits London city hall"
Publisher: Toronto Star (CA/ON)

Stage 1 → mentions: ["Toronto", "London"]

Stage 2 → candidates:
  Toronto: [Toronto-CA, Toronto-AU, ...]
  London:  [London-UK, London-ON, London-KY, ...]

Stage 3 → raw scores:
  Toronto-CA: 18 (publisher + priority)
  Toronto-AU: 2
  London-UK: 5
  London-ON: 13 (publisher match)

Stage 4 → coherence:
  Dominant: CA
  Toronto-CA: 18 + 2 = 20
  London-ON: 13 + 3 = 16
  London-UK: 5 (no bonus)

Stage 5 → output:
  Toronto → Toronto, CA (conf: 0.98)
  London → London, ON (conf: 0.91)
```

---

## Key Properties

| Property | How We Achieve It |
|----------|-------------------|
| Deterministic | No randomness, fixed weights, sorted candidate lists |
| Explainable | Feature breakdown in output |
| Fast | SQLite lookup, simple arithmetic |
| Tunable | Weights are configuration, not code |

---

## What to Build (This Chapter)

**Conceptual only**, but sketch out:

1. The data structures for each stage's output
2. The interface between stages
3. A test harness that can run one article through all stages and print intermediate results

Example interface sketch:

```javascript
// Stage outputs
type Mention = { text: string, start: number, end: number };
type Candidate = { placeId: number, name: string, country: string, adm1?: string, ... };
type ScoredCandidate = { candidate: Candidate, features: Record<string, number>, score: number };
type ResolvedPlace = { mention: Mention, chosen: Candidate, confidence: number, explanation: string };

// Pipeline
function detectMentions(text: string): Mention[];
function generateCandidates(mention: Mention, gazetteer: Gazetteer): Candidate[];
function scoreCandidate(candidate: Candidate, context: ArticleContext): ScoredCandidate;
function applyCoherence(scored: ScoredCandidate[], context: ArticleContext): ScoredCandidate[];
function selectWinner(candidates: ScoredCandidate[]): ResolvedPlace;
```

---

*Next: [Chapter 3 — Data Sources and Trade-offs](./03-data-sources.md)*
