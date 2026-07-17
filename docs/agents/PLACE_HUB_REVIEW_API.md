# Place-hub review API — operating guide for AI agents

Audience: an AI agent (Claude or similar) maintaining the news-crawler's
place-hub classification unattended. Base URL: `http://127.0.0.1:3170`
(the unified server; local-only). From a sandboxed session, relay calls
through the dev-bridge `http` action.

Principle: **the crawler reports what it could not settle; you settle it
through data, not code.** Heuristics (URL patterns, non-geo vetoes,
validations) are rows in news.db with provenance — editing them is the
normal move. Code changes are the escalation path, not the default.

## The loop

1. `GET /api/v1/place-hubs/review-queue?limit=50`
   Returns items needing judgment, each `{kind, host, key, evidence,
   suggestedActions}`. Kinds:
   - `unknown-term` — slug seen repeatedly, matched neither gazetteer nor
     non-geo veto. Decide: place / non-geo topic / junk.
   - `unverified-candidate` — fetched OK but no verification verdict.
   - `expired-validation` — verdict older than its TTL (default 2 years).
   - `structure-change` — bulk-404 of verified hubs; patterns were reset.
   - `uncertain-pattern` — learned pattern with accuracy 0.3–0.7.
2. Probe before deciding:
   - `GET /classify?url=…` — current classifier verdict + reasons.
   - `GET /search?place=…` or `?placeId=…` (`&fresh=1`) — what the system
     already believes about a place. Junk mappings show up here.
   - Cached page content (≤2y) is the evidence base for content checks —
     do not re-fetch what the archive already holds.
3. Write decisions (ALL writes require `agent` + `reason` — refused
   otherwise; everything is audited to `place_hub_audit`):
   - `POST /overrides` `{action: 'mark-non-geo', slug, …}` — global veto,
     clears matching unknown-terms.
   - `POST /overrides` `{action: 'resolve-unknown-term', host, termSlug,
     resolution: 'place'|'non-geo'|'junk', placeId?}`.
   - `POST /overrides` `{action: 'confirm-place-hub'|'reject-place-hub',
     url, host, placeId?, placeKind?, confidence?}` — writes the
     hub_validations ledger (2y TTL), updates candidate verdicts and
     place_page_mappings.
   - `POST /heuristics/patterns` `{op: 'upsert'|'demote', domain,
     patternType, patternRegex, placeKind?, accuracy?}` — the GOFAI rule
     base. `domain: '*'` = cross-site prior. Demote zeroes accuracy.
   - `POST /actions/learn` `{host}` — re-mine verified hubs into patterns.
   - `POST /actions/assess-structure` `{host, apply?}` — drift check;
     when drifted, resets host patterns and records a determination.

## Bot protections (domain_fetch_policies)

The DB models what each host does to bots and the strategy that works:
`GET /fetch-policies` lists rows (host, protection_kind, fetch_strategy
'direct'|'puppeteer'|'remote-worker'|'skip', evidence JSON, provenance,
recheck_after); `POST /fetch-policies` upserts one (agent+reason
required). The guess pipeline's fetch consults this table (puppeteer for
TLS-fingerprinting hosts like theguardian.com; kill-switch
GUESS_POLICY_FETCH=0), and blocked outcomes (ECONNRESET/402/403/429)
are merged back into `evidence` automatically. When a host starts
failing, check its policy's evidence first; change strategy through the
API, not code. Respect `recheck_after` — protections change, so stale
"blocked" verdicts deserve a re-probe. Known at seed time: guardian/
bloomberg/wsj = tls-fingerprint→puppeteer (verified for guardian);
lemonde.fr = http-402→puppeteer (TRIAL); reuters.com = bot-block→
puppeteer (guess; consider remote-worker).

## Decision guidance

- **A slug that is a real place** (gazetteer resolves it, classify says
  candidate): `confirm-place-hub` with the URL + placeId, then
  `resolve-unknown-term … resolution:'place'`.
- **A topic desk** (politics, science, opinion, climate-crisis):
  `mark-non-geo`. When in doubt whether a term is place-like on ONE site
  but topical elsewhere, prefer `resolve-unknown-term` scoped to the host
  over the global veto.
- **Section roots** (`/world`, `/news`): non-geo — the hubs are their
  children.
- **Ambiguous place names** (london the city vs london ontario): check
  `classify` evidence; if the site has a country context (domain_locales
  country_code), prefer the local interpretation; escalate to code only
  if the heuristic repeatedly fails.
- **After a structure-change item**: wait for a re-crawl to verify a few
  hubs, then `actions/learn` to rebuild patterns from fresh evidence.
- **Never** leave a mutation without a reason string that a later agent
  (or human) can follow.

## Escalation to code

If the same class of error recurs after heuristic fixes (e.g. a site
needs URL decoding rules the pattern language cannot express), that is a
code change in `src/services/placeHubs/PlaceHubUrlIndex.js` (classifier)
or `src/server/place-hub-review/registerPlaceHubReviewRoutes.js` (API).
Keep the loop: reproduce with a failing test, fix, run the suite, commit
with the evidence.

## Provenance vocabulary

- `gofai-prior-v1` — shipped cross-site priors.
- `learned-from-verified-hubs` — machine-mined host patterns.
- `ai-heuristic:<agent>` — patterns written through this API.
- `ai-review:<agent>` — non-geo slugs / validations decided by an agent.
- `hub_validations.validation_method` = 'ai-review' | 'cached-content' |
  'live-fetch' | 'title-url'.

## Worked example (2026-07-17, first live session)

Queue showed `andorra` (121 occurrences, unknown). `classify` returned
candidate 0.99 via learned `/world/{slug}` + gazetteer (placeId 382).
`confirm-place-hub` wrote the validation + mapping; `search?place=andorra`
then returned it fresh — and also exposed a junk mapping
(reuters.com/world/ ↦ Andorra) which `reject-place-hub` retired. Topic
slugs politics/science/global-development/world/all were `mark-non-geo`
(95 queue rows cleared). Total: 8 API calls, zero code changes.
