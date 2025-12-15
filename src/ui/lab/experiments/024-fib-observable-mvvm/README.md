# Experiment 024 — Fibonacci Server Observable → MVVM (SSE)

**Status**: active

## Goal

Create a lab experiment where a **server-side observable** emits a new Fibonacci number every ~330ms, publishes it to the browser, and a client-side MVVM flow updates the UI with minimal glue.

## Approach

- Server:
  - Uses `fnl.observable` to generate `{ index, value }` ticks.
  - Publishes to browsers via **SSE** (`text/event-stream`) at `/events`.
- Client:
  - Connects with `EventSource` using a persisted `sseUrl`.
  - Updates `data.model` on every tick (single write path).
  - Mirrors into `view.data.model` and renders from view model.

## Files

- `server.js` — starts an SSE publisher + jsgui3 server page
- `client.js` — jsgui3 page + demo control, MVVM wiring, EventSource subscription
- `check.js` — deterministic Puppeteer check (waits for index ≥ 5 and validates Fibonacci)

## Run

- `node src/ui/lab/experiments/024-fib-observable-mvvm/check.js`
