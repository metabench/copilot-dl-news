# 100 news websites + "everything in the DB" audit

Date: 2026-07-16. Companion to the recursive crawl loop
(docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md).

## PROGRESS (2026-07-16, same day)

- **Stale DBs retired**: gazetteer.db, gazetteer-standalone.db,
  crawl-multi.db, crawl-data.sqlite (+ wal/shm) moved to
  `data/backups/stale-dbs-2026-07-16/` after a containment probe showed
  only 3/10,596 names unique to the old gazetteer (historical variants,
  preserved in the archive). crawl-multi.db and crawl-data.sqlite had
  zero code references.
- **Single geo resolver**: `src/shared/utils/gazetteer-db-path.js`
  (explicit arg > GAZETTEER_DB_PATH > data/news.db). All ~12 former
  `data/gazetteer.db` defaults now resolve through it or default to
  news.db directly. PlaceLookup was silently loading the stale copy
  (508 places) — it now loads news.db (13,688 places / 275k names,
  verified live). Its SQL is schema-tolerant (old place_type column vs
  news.db's kind).
- **Per-site geo now in DB**: `src/tools/sync-site-geo.js` (idempotent,
  verified twice) merged country/language/tier from
  config/news-sources.json into `news_websites.metadata` (8 rows) and
  upserted `domain_locales` (3 → 15 rows, bare-host canonical form per
  migration 41; legacy www.-prefixed rows normalized).
- Bootstrap JSONs remain as install media only, per direction.

## Part 1 — Audit: what site/geo data lives OUTSIDE news.db today

The goal is that adding a news website (including its geographic
information) touches only the database. Today it doesn't. Findings, in
order of how much they violate that goal:

### 1. `data/bootstrap/news-sources.json` — ACTIVE seed, runtime-read
The real source of the 48 `news_websites` rows.
`news-crawler-db/src/db/sqlite/access/legacy-newsSourcesSeeder.ts` reads
this JSON **at require-time** (36 entries: url, label, icon-emoji,
region) and seeds the table. Adding 100 sites "properly" today would
mean editing this file. **This is the main offender.** Disposition:
ingest once into `news_websites`, then make the seeder DB-first (seed
only into an empty DB, ideally from an in-schema default set), and
retire the JSON.

### 2. `config/news-sources.json` — rich per-site data, read by NOTHING at runtime
Contains name, **country**, language, tier, per-site URL regexes and CSS
selectors for ~10 sites. No `src/` code reads it — only
`tools/migrations/add-regional-news-sources.js` and two dev tools. The
runtime equivalents already live in the DB (`site_url_patterns`, 72
rows). So per-site geographic info (country/language) currently sits in
a JSON that the crawler never consults — exactly the scatter we want to
eliminate. Disposition: migrate country/language/tier into
`news_websites.metadata` (or proper columns) + `domain_locales`; keep
selectors in `site_url_patterns`/`domain_classification_profiles`;
retire the file.

### 3. `data/bootstrap/wikidata-adm1-snapshot.json` + `bootstrap-db.json` — geo seeds
Read by `bootstrapDbLoader.js`, `WikidataAdm1Ingestor.js`, and
`connection.js`. Wikidata ADM1 (first-level admin regions) snapshot and
a small place/term seed. The live gazetteer is IN news.db (13,688
places / 737,590 place_names / 15,139 external ids), so these files are
one-shot ingestion inputs, but they are geo data on disk. Disposition:
acceptable as *installation media* for bootstrapping an empty DB, but
provenance should be recorded in `place_sources` (it is: 3 rows) and
the files must never be re-read once the DB is populated. Verify
`ensureGazetteer` doesn't silently re-ingest.

### 4. Stray sibling databases in `data/`
- `gazetteer.db` (508 places / 14,867 names): a stale partial copy of
  what news.db already owns. Nothing in src/tools references it by name
  apart from generic path config. Disposition: confirm no writer, then
  archive/delete.
- `gazetteer-standalone.db`: empty scaffold — delete.
- `crawl-multi.db`: **live-ish second store** (`domain_intelligence` 33,
  `domain_rate_limits` 34 rows) used by the multi-crawl path; news.db
  has its own `domain_rate_limits` (43). Two sources of truth for
  per-domain behavior. Disposition: fold into news.db or explicitly
  scope it as ephemeral.
- `crawl-data.sqlite`: no references found in src/tools — likely
  abandoned; archive/delete.

### 5. `config/puppeteer-domains.json` — exists but read from the WRONG PATH
The file lives in `config/`, but PuppeteerDomainManager resolves
`src/config/puppeteer-domains.json`, logs "No config … using defaults"
and falls back to the hard-coded list in FetchPipeline.js
(`theguardian.com`, `bloomberg.com`, `wsj.com`). So this per-domain
knowledge is (a) file-based and (b) silently ignored. Disposition: move
the manual list + auto-learned domains into a DB table (e.g.
`domain_fetch_strategies`), drop the JSON, keep the in-code list only
as last-resort default. (Candidates to add once DB-backed: lemonde.fr
(HTTP 402), reuters.com — see LOOP_STATE findings 2026-07-16.)

### 6. `crawl-lists/*.txt` — user-curated URL lists for `npm run crawl @name`
Human-authored convenience lists (uk-papers.txt). Borderline: they're
CLI input shorthands, not state. Disposition: fine to keep, or add a
`crawl_lists` table + tiny CRUD so they're shareable across machines.

### 7. Behavior config JSONs (lower priority)
`config.json` / `crawl.js.config.json` (default start URL = Guardian),
`priority-config*.json`, `category-keywords.json`, `extractors.json`,
`decision-trees/`, `crawl-sequences/`, `data/fleet*` (Oracle host).
These are *settings*, not data, but `category-keywords.json` and
`extractors.json` encode per-site/per-category knowledge that would
serve better in `crawler_settings` / `domain_classification_profiles`.

### Bottom line for "add 100 sites"
With the system as-is: you'd edit `data/bootstrap/news-sources.json`
(seeder) and optionally `config/news-sources.json` (unused richness) —
both files. **Recommended instead**: a small idempotent ingest tool that
upserts straight into `news_websites` (+ `domain_locales` for
country/language) from the table below, after which no JSON needs to
exist. The schema already fits: `news_websites(url, label,
parent_domain, url_pattern, website_type, enabled, metadata)` with
`metadata` JSON for tier/notes, and geographic linkage via
`domain_locales` and the in-DB gazetteer.

## Part 2 — The 100 sites

Columns: domain (crawl entry), name, country, primary language.
Tier 1 = global/agency, 2 = national flagship, 3 = major national/regional.

| # | Domain | Name | Country | Lang | Tier |
|---|--------|------|---------|------|------|
| 1 | reuters.com | Reuters | International | en | 1 |
| 2 | apnews.com | Associated Press | International | en | 1 |
| 3 | bbc.com/news | BBC News | UK | en | 1 |
| 4 | theguardian.com | The Guardian | UK | en | 1 |
| 5 | aljazeera.com | Al Jazeera English | Qatar | en | 1 |
| 6 | france24.com | France 24 | France | en/fr | 1 |
| 7 | dw.com | Deutsche Welle | Germany | en/de | 1 |
| 8 | euronews.com | Euronews | EU | en/multi | 1 |
| 9 | bloomberg.com | Bloomberg | US | en | 1 |
| 10 | ft.com | Financial Times | UK | en | 1 |
| 11 | economist.com | The Economist | UK | en | 1 |
| 12 | nytimes.com | The New York Times | US | en | 2 |
| 13 | washingtonpost.com | The Washington Post | US | en | 2 |
| 14 | wsj.com | The Wall Street Journal | US | en | 2 |
| 15 | usatoday.com | USA Today | US | en | 2 |
| 16 | latimes.com | Los Angeles Times | US | en | 2 |
| 17 | cnn.com | CNN | US | en | 2 |
| 18 | nbcnews.com | NBC News | US | en | 2 |
| 19 | cbsnews.com | CBS News | US | en | 2 |
| 20 | abcnews.go.com | ABC News (US) | US | en | 2 |
| 21 | foxnews.com | Fox News | US | en | 2 |
| 22 | npr.org | NPR | US | en | 2 |
| 23 | cnbc.com | CNBC | US | en | 2 |
| 24 | politico.com | Politico | US | en | 2 |
| 25 | axios.com | Axios | US | en | 3 |
| 26 | time.com | TIME | US | en | 3 |
| 27 | theatlantic.com | The Atlantic | US | en | 3 |
| 28 | newsweek.com | Newsweek | US | en | 3 |
| 29 | nypost.com | New York Post | US | en | 3 |
| 30 | chicagotribune.com | Chicago Tribune | US | en | 3 |
| 31 | bostonglobe.com | The Boston Globe | US | en | 3 |
| 32 | seattletimes.com | The Seattle Times | US | en | 3 |
| 33 | telegraph.co.uk | The Telegraph | UK | en | 2 |
| 34 | thetimes.co.uk | The Times | UK | en | 2 |
| 35 | independent.co.uk | The Independent | UK | en | 2 |
| 36 | dailymail.co.uk | Daily Mail | UK | en | 2 |
| 37 | mirror.co.uk | Daily Mirror | UK | en | 3 |
| 38 | thesun.co.uk | The Sun | UK | en | 3 |
| 39 | express.co.uk | Daily Express | UK | en | 3 |
| 40 | standard.co.uk | Evening Standard | UK | en | 3 |
| 41 | metro.co.uk | Metro | UK | en | 3 |
| 42 | news.sky.com | Sky News | UK | en | 2 |
| 43 | irishtimes.com | The Irish Times | Ireland | en | 2 |
| 44 | rte.ie | RTÉ News | Ireland | en | 2 |
| 45 | cbc.ca | CBC News | Canada | en | 2 |
| 46 | theglobeandmail.com | The Globe and Mail | Canada | en | 2 |
| 47 | nationalpost.com | National Post | Canada | en | 3 |
| 48 | thestar.com | Toronto Star | Canada | en | 3 |
| 49 | lemonde.fr | Le Monde | France | fr | 2 |
| 50 | lefigaro.fr | Le Figaro | France | fr | 2 |
| 51 | liberation.fr | Libération | France | fr | 3 |
| 52 | spiegel.de | Der Spiegel | Germany | de | 2 |
| 53 | zeit.de | Die Zeit | Germany | de | 2 |
| 54 | faz.net | Frankfurter Allgemeine | Germany | de | 2 |
| 55 | sueddeutsche.de | Süddeutsche Zeitung | Germany | de | 2 |
| 56 | welt.de | Die Welt | Germany | de | 3 |
| 57 | elpais.com | El País | Spain | es | 2 |
| 58 | elmundo.es | El Mundo | Spain | es | 2 |
| 59 | corriere.it | Corriere della Sera | Italy | it | 2 |
| 60 | repubblica.it | La Repubblica | Italy | it | 2 |
| 61 | ansa.it | ANSA | Italy | it | 2 |
| 62 | nrc.nl | NRC | Netherlands | nl | 3 |
| 63 | volkskrant.nl | de Volkskrant | Netherlands | nl | 3 |
| 64 | politico.eu | Politico Europe | EU | en | 3 |
| 65 | nzz.ch | Neue Zürcher Zeitung | Switzerland | de | 2 |
| 66 | swissinfo.ch | SWI swissinfo | Switzerland | en/multi | 3 |
| 67 | aftonbladet.se | Aftonbladet | Sweden | sv | 3 |
| 68 | politiken.dk | Politiken | Denmark | da | 3 |
| 69 | aftenposten.no | Aftenposten | Norway | no | 3 |
| 70 | hs.fi | Helsingin Sanomat | Finland | fi | 3 |
| 71 | timesofindia.indiatimes.com | The Times of India | India | en | 2 |
| 72 | thehindu.com | The Hindu | India | en | 2 |
| 73 | hindustantimes.com | Hindustan Times | India | en | 2 |
| 74 | ndtv.com | NDTV | India | en | 2 |
| 75 | dawn.com | Dawn | Pakistan | en | 2 |
| 76 | scmp.com | South China Morning Post | Hong Kong | en | 2 |
| 77 | straitstimes.com | The Straits Times | Singapore | en | 2 |
| 78 | channelnewsasia.com | CNA | Singapore | en | 2 |
| 79 | japantimes.co.jp | The Japan Times | Japan | en | 2 |
| 80 | asahi.com | Asahi Shimbun | Japan | ja/en | 2 |
| 81 | koreaherald.com | The Korea Herald | South Korea | en | 3 |
| 82 | bangkokpost.com | Bangkok Post | Thailand | en | 3 |
| 83 | thejakartapost.com | The Jakarta Post | Indonesia | en | 3 |
| 84 | inquirer.net | Philippine Daily Inquirer | Philippines | en | 3 |
| 85 | haaretz.com | Haaretz | Israel | en/he | 2 |
| 86 | timesofisrael.com | The Times of Israel | Israel | en | 3 |
| 87 | arabnews.com | Arab News | Saudi Arabia | en | 3 |
| 88 | gulfnews.com | Gulf News | UAE | en | 3 |
| 89 | hurriyetdailynews.com | Hürriyet Daily News | Turkey | en | 3 |
| 90 | news24.com | News24 | South Africa | en | 2 |
| 91 | mg.co.za | Mail & Guardian | South Africa | en | 3 |
| 92 | nation.africa | Nation | Kenya | en | 3 |
| 93 | punchng.com | The Punch | Nigeria | en | 3 |
| 94 | vanguardngr.com | Vanguard | Nigeria | en | 3 |
| 95 | abc.net.au/news | ABC News (AU) | Australia | en | 2 |
| 96 | smh.com.au | The Sydney Morning Herald | Australia | en | 2 |
| 97 | nzherald.co.nz | The New Zealand Herald | New Zealand | en | 3 |
| 98 | clarin.com | Clarín | Argentina | es | 2 |
| 99 | folha.uol.com.br | Folha de S.Paulo | Brazil | pt | 2 |
| 100 | eltiempo.com | El Tiempo | Colombia | es | 2 |

Known access hazards from live crawling so far: lemonde.fr answers
HTTP 402 (needs a puppeteer-class fallback), reuters.com start URLs get
policy-blocked silently, theguardian.com/bloomberg/wsj need the TLS
fallback (already handled). Expect the same for several tier-2 sites
(nytimes, ft, wsj paywalls).

## Part 3 — Recommended ingestion path (no new files)

1. One idempotent tool (`tools/dev-bridge/checks/` or `src/tools/`):
   upsert each row above into `news_websites` (url, label,
   parent_domain, url_pattern, website_type derived as in the seeder;
   `metadata` JSON carrying {country, language, tier}); mirror
   country/language into `domain_locales`.
2. The seeder is already insert-if-missing per URL (checked: it skips
   existing rows), so once the 100 are in the DB the JSON is inert for
   them — but it still auto-adds anything present in the file and
   missing from the DB, so the file remains an input until retired.
3. Retire `data/bootstrap/news-sources.json` and
   `config/news-sources.json` after migrating their unique content
   (selectors → site_url_patterns; already largely there).
4. New DB table for fetch strategy (puppeteer/proxy) per domain,
   replacing config/puppeteer-domains.json + fixing its path bug.
