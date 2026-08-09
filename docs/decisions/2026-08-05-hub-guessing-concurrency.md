---
decision: DEC-HUBGUESS-CONCURRENCY
status: record
question: Hub-guessing concurrency knob was inert; fixed and owner-ruled.
---

# Hub-guessing worker concurrency: the knob was never connected

**Date:** 2026-08-05 (cycle 208)
**Status:** fixed, owner-ruled
**Affects:** place-hub guessing via the distributed fetch worker

## What was wrong

`src/api/routes/place-hubs.js` reads an operator knob:

```js
const concurrency = clampInt(
  guessOptions.concurrency ?? process.env.PLACE_HUB_GUESSING_CONCURRENCY,
  { min: 1, max: 100, fallback: 10 }
);
```

and passes it down as `distributedOptions: { batchSize, concurrency }`.

`src/core/orchestration/dependencies.js` spread that straight into
`createDistributedFetchAdapter({ ...distributedOptions })` — but
`DistributedFetchAdapter` reads **`options.maxConcurrency`**, not
`concurrency`:

```js
this.maxConcurrency = options.maxConcurrency || 20;
```

The key names never matched. Consequences:

1. **`PLACE_HUB_GUESSING_CONCURRENCY` was inert.** Setting it to 1 or to 100
   changed nothing.
2. **The effective value was 20**, the adapter's own default — double the 10
   the API advertises, and well above the crawler's ≤3 politeness gate.
3. That 20 is not local parallelism. It is sent to the remote fetch worker in
   **every batch payload** as `maxConcurrency`, instructing the worker how many
   concurrent fetches to run:

```js
const payload = { requests, maxConcurrency: options.maxConcurrency || this.maxConcurrency, ... };
```

## What could not be verified

Whether 20 concurrent worker fetches is *polite* depends on per-host
throttling **inside the worker**. That worker's code is in neither
`copilot-dl-news` nor `news-crawler-itself` — `resolveDefaultWorkerUrl()`
falls back to `http://127.0.0.1:8081`. So the politeness guarantee for this
path **cannot be established from source in this repo set**. It remains an
open question for whoever owns the worker.

## The fix

Mapped at the boundary that owns the adapter contract
(`dependencies.js`), rather than renaming the router's public option or
teaching the adapter a second name for the same thing:

```js
const { concurrency: aliasedConcurrency, ...restDistributed } = distributedOptions;
createDistributedFetchAdapter({
  workerUrl,
  localFetch: customFetchFn || fetchImpl,
  ...restDistributed,
  ...(restDistributed.maxConcurrency == null && aliasedConcurrency != null
    ? { maxConcurrency: aliasedConcurrency }
    : {}),
});
```

An explicitly-passed `maxConcurrency` still wins, so callers using the
adapter's own vocabulary are unaffected.

## Impact — read this before changing it back

- **Hub-guessing worker concurrency drops from an effective 20 to 10.** That
  is the value the route has always documented; nothing about the advertised
  contract changed, only whether it was honoured.
- `PLACE_HUB_GUESSING_CONCURRENCY` and the per-request `concurrency` option
  now actually work. They clamp to 1..100.
- Hub discovery may be somewhat slower per batch. If that matters, raise the
  env var deliberately — and record why — rather than reverting the mapping.
- Other `createDistributedFetchAdapter` callers that pass `maxConcurrency`
  directly are unchanged; callers that pass neither still get 20.

## Open follow-ups

- Confirm with the worker's owner whether it enforces **per-host** throttling.
  If it does not, the right ceiling here is the crawler's ≤3, not 10.
- Consider making the adapter's default explicit at every call site so no
  politeness-relevant number is ever inherited silently again.
