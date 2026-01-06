# Chapter 1: Why Place Names Are Hard

*Reading time: 10 minutes*

---

## The London Problem

Consider this headline:

> **"Fire destroys historic building in London"**

Which London?

- **London, United Kingdom** — population 9 million, capital city
- **London, Ontario, Canada** — population 400,000, significant city
- **London, Kentucky, USA** — population 8,000, county seat
- **London, Ohio, USA** — population 9,000
- **London, Arkansas, USA** — population 900

There are over 30 places named "London" worldwide. A human reader uses context clues to disambiguate:

- What publication is this from?
- What other places are mentioned?
- What's the topic (politics → likely UK; hockey → likely Ontario)?

Our system must do the same—algorithmically and deterministically.

---

## The Scale of Ambiguity

Place name ambiguity is pervasive:

| Name | Approximate Count |
|------|-------------------|
| Springfield | 35+ in USA alone |
| Paris | 25+ worldwide |
| Victoria | 20+ (cities, not including people) |
| Richmond | 30+ |
| Washington | 90+ |

Even seemingly unique names can surprise:
- **"Sydney"** — Australia, Canada, and several in the USA
- **"Berlin"** — Germany, plus towns in Connecticut, New Hampshire, Wisconsin, etc.

---

## Why This Matters for News

News articles present specific challenges:

### 1. Implicit Context
News assumes readers know the context. A UK newspaper writing about "London" won't clarify it's the UK one.

### 2. Multiple Places Per Article
An article might mention:
> "The prime minister flew from London to Paris for talks..."

Both need resolution. And they provide mutual context (London + Paris + prime minister → likely European capitals).

### 3. Speed Requirements
A crawler processing thousands of articles per day cannot spend seconds per article on disambiguation.

### 4. Explainability Requirements
When a human audits the system, they need to understand *why* "London" resolved to Ontario, not UK.

---

## The Naive Approach (and Why It Fails)

**Naive approach**: Pick the most populous candidate.

| Mention | Would Resolve To | Correct? |
|---------|------------------|----------|
| "London" in BBC article | London, UK ✓ | Usually |
| "London" in London Free Press | London, UK ✗ | Wrong — should be Ontario |
| "Paris" in Texas newspaper about local event | Paris, France ✗ | Wrong — could be Paris, TX |

Population-only ranking fails ~10-30% of the time for ambiguous names, depending on corpus.

---

## What Actually Works

The solution combines multiple signals:

### Signal 1: Publisher Prior
The publisher's home location is a strong prior:
- London Free Press → Ontario, Canada
- The Guardian → United Kingdom
- Austin American-Statesman → Texas, USA

### Signal 2: Co-occurring Places
Other places in the same article provide context:
- "London" + "Ontario" → London, ON
- "London" + "Thames" + "Parliament" → London, UK
- "London" + "Thames" + "Western University" → London, ON (there's a Thames River in Ontario too!)

### Signal 3: Administrative Containment
Places form hierarchies:
- London, ON is *inside* Ontario is *inside* Canada
- If we're confident about "Ontario", that boosts "London, ON"

### Signal 4: Lexical Hints
The text itself sometimes contains type information:
- "the city of Springfield" → it's a city, not a river or county
- "Springfield County" → it's an administrative region

---

## The Disambiguation Pipeline (Preview)

Our system will work in stages:

```
Article Text
    ↓
┌─────────────────────┐
│  Mention Detection  │  → Find candidate place spans
└─────────────────────┘
    ↓
┌─────────────────────┐
│ Candidate Generation│  → For each span, find possible entities
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Feature Scoring    │  → Score each candidate on multiple signals
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Coherence Pass     │  → Boost candidates that align with each other
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Selection + Conf.  │  → Pick winners, compute confidence
└─────────────────────┘
    ↓
Resolved Places + Explanations
```

Each stage is deterministic and explainable.

---

## What We Need to Build

To make this work, we need:

1. **A gazetteer** — A database of places with names, locations, and hierarchies
2. **A fast lookup layer** — SQLite cache for sub-millisecond name lookups
3. **A scoring function** — Weighted combination of features
4. **A coherence model** — How to boost mutually consistent candidates
5. **Publisher priors** — Mapping from news hosts to home regions

---

## Key Takeaways

- Place name ambiguity is common, not exceptional
- Population-only ranking fails frequently
- Context (publisher, co-mentions, hierarchy) is essential
- The system must be deterministic and explainable
- Speed matters at scale

---

## What to Build (This Chapter)

Nothing yet—this chapter is conceptual. But keep these test cases in mind:

| Article Context | Mention | Expected Resolution |
|-----------------|---------|---------------------|
| BBC News | "London" | London, UK |
| London Free Press | "London" | London, ON, CA |
| Texas local paper | "Paris" | Paris, TX (if local context) |
| Article mentioning "Ontario" | "London" | London, ON, CA |
| Article mentioning "UK Parliament" | "London" | London, UK |

These will become your regression fixtures.

---

*Next: [Chapter 2 — The Disambiguation Pipeline](./02-disambiguation-pipeline.md)*
