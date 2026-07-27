# Fact sheet — HTTP caching (ETag, max-age, 304 revalidation)

Grounding: RFC 9111 (HTTP Caching) and RFC 9110 (HTTP Semantics). Every element drawn in
`http-caching.svg` traces to one of these entries.

## Load-bearing facts

1. **Freshness (`Cache-Control: max-age=N`)** — a stored response is *fresh* while its
   current age ≤ N seconds. Age is counted from when the origin *generated* the response
   (the `Age` header carries time already spent in upstream caches), not from when the
   client received it. While fresh, a cache may serve the stored copy without contacting
   the origin at all. (RFC 9111 §4.2, §4.2.3)
2. **Validator (`ETag`)** — an opaque, origin-chosen string identifying one specific
   representation of a resource (e.g. `ETag: "a1b2c3"`). `W/"…"` marks a *weak* validator
   (semantic equivalence rather than byte-for-byte identity). (RFC 9110 §8.8.3)
3. **Conditional revalidation** — once stale, a cache does not blindly refetch; it sends a
   conditional request carrying the stored validator: `If-None-Match: "a1b2c3"` (falling
   back to `If-Modified-Since` + `Last-Modified`). When both are present, `If-None-Match`
   wins — a recipient MUST ignore `If-Modified-Since` if `If-None-Match` is present.
   (RFC 9110 §13.1.2–13.1.3)
4. **`304 Not Modified`** — returned when the presented validator still matches: headers
   only, **no body**. The cache updates the stored response's headers from the 304 (so a
   fresh `Cache-Control: max-age` restarts the freshness clock) and serves the *stored*
   body. The end client just sees a normal 200 — it never sees the 304. (RFC 9110 §15.4.5,
   RFC 9111 §4.3.3–4.3.4)
5. **If the representation changed** — the origin answers `200 OK` with the full new body
   and a new `ETag`; the cache replaces the stored copy and validator. (RFC 9111 §4.3.3)
6. **Cost model** — a 304 saves the transfer bytes, not the round trip: revalidation still
   costs ~1 RTT of latency. A *fresh* hit costs zero network. Hence the classic recipe:
   content-hashed assets get `Cache-Control: max-age=31536000, immutable`; HTML gets
   `no-cache` + `ETag` so every navigation revalidates cheaply.
7. **Directive gotcha** — `no-cache` does **not** mean "don't cache": it means *store, but
   revalidate before every reuse*. `no-store` is the directive that forbids storing.
   (RFC 9111 §5.2.2.4–5.2.2.5)

## Data model (Structure First)

```json
{
  "actors": [
    { "id": "client", "label": "Client", "icon": "🌐" },
    { "id": "cache",  "label": "HTTP cache", "icon": "📦" },
    { "id": "origin", "label": "Origin server", "icon": "🗄️" }
  ],
  "scenarios": [
    { "n": "①", "t": "0 s", "name": "Cache miss — origin sends the full response",
      "msgs": [
        { "from": "client", "to": "cache",  "line": "GET /app.js" },
        { "from": "cache",  "to": "origin", "line": "GET /app.js", "note": "cache miss → forward" },
        { "from": "origin", "to": "cache",  "line": "200 OK + body (48 KB)",
          "headers": "ETag: \"a1b2c3\" · Cache-Control: max-age=600" },
        { "from": "cache",  "to": "client", "line": "200 OK + body",
          "note": "stores body + validator (ETag) before answering" }
      ],
      "fact": [1, 2] },
    { "n": "②", "t": "120 s", "name": "Fresh hit — age < max-age, served from cache",
      "msgs": [
        { "from": "client", "to": "cache", "line": "GET /app.js" },
        { "from": "cache",  "to": "origin", "line": "✗ no request to origin", "style": "none" },
        { "from": "cache",  "to": "client", "line": "200 OK (from cache)",
          "note": "age 120 s < max-age 600 s → still fresh ✓" }
      ],
      "fact": [1, 6] },
    { "n": "③", "t": "900 s", "name": "Stale — revalidate with If-None-Match",
      "msgs": [
        { "from": "client", "to": "cache",  "line": "GET /app.js" },
        { "from": "cache",  "to": "origin", "line": "GET /app.js",
          "headers": "If-None-Match: \"a1b2c3\"" },
        { "from": "origin", "to": "cache",  "line": "304 Not Modified — headers only, no body",
          "note": "ETag matches — freshness resets from the 304's headers", "emphasis": true },
        { "from": "cache",  "to": "client", "line": "200 OK · stored body",
          "note": "the client just sees a fresh 200 — never the 304" },
        { "divider": "or — if the representation changed:" },
        { "from": "origin", "to": "cache",  "line": "200 OK · new body · ETag: \"d4e5f6\"",
          "note": "cache replaces the stored copy and its validator" }
      ],
      "fact": [3, 4, 5] }
  ],
  "field_notes": [
    { "fact": 7, "text": "no-cache ≠ don't cache — store but revalidate; no-store forbids storing" },
    { "fact": 2, "text": "ETags are opaque origin-chosen strings; W/\"…\" marks a weak validator" },
    { "fact": 3, "text": "If-None-Match wins over If-Modified-Since when both are sent" },
    { "fact": 6, "text": "hashed assets → max-age=31536000, immutable; HTML → no-cache + ETag" }
  ]
}
```

## Design decisions

- Register: **diagram** (docs visual). Vector intensity: **Tier 2 hybrid** — obsidian
  panels, gray connectors with gold arrowheads, gold reserved for the hero message (the
  304 response) and chrome; one emoji per actor chip; ①②③ enclosed numerals for steps.
- Layout: three stacked mini-sequence panels (Client / HTTP cache / Origin lanes repeated
  per panel so each scenario is self-contained), plus a "field notes" strip on leather.
