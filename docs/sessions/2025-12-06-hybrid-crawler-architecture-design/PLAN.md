# Plan – Hybrid Crawler Architecture Design

## Objective
Design the Teacher/Worker model for hybrid crawling, with a **strong emphasis on static analysis** and **space-efficient storage of HTML structural signatures**.

## Done When
- [ ] `docs/designs/HYBRID_CRAWLER_ARCHITECTURE.md` is refined with implementation details, specifically the **Structural Signature** algorithm.
- [ ] A prototype script `tools/analyze-layout.js` demonstrates visual block detection.
- [ ] Database schema for `layout_templates` and `page_signatures` is defined.

## Change Set
- `docs/designs/HYBRID_CRAWLER_ARCHITECTURE.md` (Expanded Signature section)
- `src/teacher/` (New directory)
- `tools/analyze-layout.js` (New script)

## Risks & Mitigations
- **Signature Volatility**: Small changes (e.g., an extra `<div>` for an ad) might change the hash.
    *   *Mitigation*: Use "Fuzzy" signatures (LSH) or strip non-semantic tags before hashing.
- **Puppeteer Dependency**: Heavy install.
    *   *Mitigation*: Use `puppeteer-core` if possible, or keep it as an optional peer dependency.

## Tests / Validation
- Run `node tools/analyze-layout.js <url>` and verify it correctly identifies the main content block of a news article.
- Verify signature generation produces identical hashes for structurally identical pages.
