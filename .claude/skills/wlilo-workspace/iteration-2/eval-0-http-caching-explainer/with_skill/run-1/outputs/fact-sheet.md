# Fact sheet — HTTP caching (max-age, ETag, 304 revalidation)

Sources: RFC 9111 (HTTP Caching) §4.2, §4.3, §5.2.2.1; RFC 9110 (HTTP Semantics) §8.8.3
(ETag), §13.1.2 (If-None-Match), §15.4.5 (304 Not Modified).

## Load-bearing facts

1. **Freshness (Cache-Control: max-age=N)** — the response's freshness lifetime is N seconds.
   A stored response is *fresh* while `current_age < freshness_lifetime`; while fresh it MAY be
   reused to answer requests **without any request to the origin** (RFC 9111 §4.2, §5.2.2.1).
2. **ETag** — an opaque validator (entity tag) chosen by the origin, sent in the `ETag`
   response header, e.g. `ETag: "a1b2c3"`. The cache stores it alongside the response body
   (RFC 9110 §8.8.3).
3. **Stale ≠ evicted** — once `age ≥ max-age` the response is *stale*, but the cache keeps it
   and *revalidates* instead of re-downloading: it sends a conditional request carrying
   `If-None-Match: "a1b2c3"` (RFC 9111 §4.3.1, RFC 9110 §13.1.2).
4. **304 Not Modified** — if the validator still matches the current representation, the
   origin answers `304`, which **has no body**. The cache updates the stored response's
   header fields from the 304 (fresh `Date`, `Cache-Control`, …), restarting the freshness
   clock, and serves the stored body (RFC 9110 §15.4.5, RFC 9111 §4.3.3–4.3.4).
5. **Changed branch** — if the ETag no longer matches, the origin sends a full `200 OK` with
   the new body and a new `ETag`; the cache replaces its stored copy (RFC 9111 §4.3.3).
6. **Cost ladder** — fresh hit: zero network. Stale + 304: one small round trip, headers
   only. Changed: full transfer. This is the entire point of the mechanism.
7. **Actors** — the browser (application), its HTTP cache, and the origin server are three
   distinct roles; the cache sits between the other two (RFC 9111 §1).

## Data model

```json
{
  "actors": [
    {"id": "browser", "icon": "💻", "label": "Browser"},
    {"id": "cache",   "icon": "📦", "label": "HTTP cache"},
    {"id": "origin",  "icon": "🗄️", "label": "Origin server"}
  ],
  "phases": [
    {"n": 1, "title": "First request — cache MISS", "t": "t = 0 s",
     "messages": [
       {"from": "browser", "to": "cache",  "literal": "GET /assets/app.js"},
       {"from": "cache",   "to": "origin", "literal": "GET /assets/app.js",
        "note": "no stored copy — request goes upstream"},
       {"from": "origin",  "to": "cache",  "literal": "200 OK + body",
        "headers": "Cache-Control: max-age=600 · ETag: \"a1b2c3\"", "emphasis": "gold-text"},
       {"from": "cache",   "to": "browser","literal": "200 OK",
        "note": "response stored — fresh for the next 600 s"}
     ]},
    {"n": 2, "title": "Repeat within 600 s — FRESH, served from cache",
     "state": "age = 180 s < max-age → FRESH",
     "messages": [
       {"from": "browser", "to": "cache",  "literal": "GET /assets/app.js"},
       {"from": "cache",   "to": "browser","literal": "200 OK",
        "note": "stored body returned — origin not asked"}
     ],
     "quiet_zone_card": "origin not contacted / age < max-age → reuse without revalidation"},
    {"n": 3, "title": "After 600 s — STALE, revalidate",
     "state": "age = 660 s > max-age → STALE",
     "messages": [
       {"from": "browser", "to": "cache",  "literal": "GET /assets/app.js"},
       {"from": "cache",   "to": "origin", "literal": "GET /assets/app.js",
        "headers": "If-None-Match: \"a1b2c3\"", "emphasis": "gold-text"},
       {"from": "origin",  "to": "cache",  "literal": "304 Not Modified — no body",
        "emphasis": "THE gold path",
        "note": "stored copy revalidated — new headers refresh it"},
       {"from": "cache",   "to": "browser","literal": "200 OK",
        "note": "stored body served — fresh for another 600 s"}
     ],
     "branch_note": "If the ETag no longer matched → 200 OK + new body + new ETag; cache replaces its copy"}
  ],
  "vocabulary": [
    {"literal": "Cache-Control: max-age=600", "gloss": "freshness lifetime; reuse with no request while age < 600 s"},
    {"literal": "ETag: \"a1b2c3\"",           "gloss": "opaque version fingerprint; stored as the validator"},
    {"literal": "If-None-Match: \"a1b2c3\"",  "gloss": "conditional GET; body only if current ETag differs"},
    {"literal": "304 Not Modified",           "gloss": "bodyless; headers refresh stored copy, clock restarts"}
  ]
}
```

## Design decisions

- Tier 2 (hybrid), diagram register. One obsidian sequence panel, three lifelines, three
  phase bands; leather footer with the four wire literals.
- The single gold-emphasized path is the 304 response (fact 4 — the star of the mechanism);
  the validator's journey (birth in phase 1, question in phase 3) gets gold *text* emphasis.
- Phase 2's quiet cache↔origin zone carries a dashed ghost card ("origin not contacted") —
  the void made deliberate, per finish.md §1.
