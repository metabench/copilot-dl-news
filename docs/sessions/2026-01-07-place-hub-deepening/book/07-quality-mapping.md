# Mapping & Quality Improvement

This system fundamentally shifts the crawler from "wandering" to "mapping".

## 1. The Map is the Territory

By strictly verifying Hub functionality (pagination + temporal continuity), we build a **Site Map** that is more reliable than `sitemap.xml`.

- **sitemap.xml** is often incomplete or cluttered with non-news.
- **Hub structure** reflects how the *editors* organize content.

## 2. Place-Specific Extraction

### The Problem
Traditional crawling relies on NLP to say "This article is about France."
- **False Positives**: "The French fries were good."
- **Ambiguity**: "Georgia" (State vs Country).

### The Hub Solution
When we extract from `theguardian.com/world/georgia`, the **Context** is hard-coded in the URL structure.
- We **know** it is the Country Georgia because of the verified Hub classification.
- We treat this as **Ground Truth** for training our NLP classifiers.
- "If the Hub says it's Georgia, and the NLP says it's USA, the Hub wins (or at least triggers a review)."

## 3. High-Quality "History"
We obtain a continuous timeline for every place.
- **Completeness**: We know we have *every* article tagged "France" back to 2000.
- **Density**: We can measure "articles per month" for "France" vs "Germany".

## 4. Prioritization Logic
The crawler can now make intelligent decisions:
- "We haven't checked 'Yemen' depth in 30 days, and it's a conflict zone. **Priority Upgrade**."
- "We checked 'Antarctica' yesterday. **Skip**."
