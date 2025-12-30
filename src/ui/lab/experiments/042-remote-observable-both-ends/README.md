# Lab 042 — Remote Observable (both ends)

Goal: prove a minimal, repeatable pattern for **server-side `fnl.observable` → SSE → client-side observable-like adapter**, and show it can be hosted in two ways:

- **jsgui3-server routing** (no Express)
- **Express routes**

This lab deliberately avoids bundlers and keeps the “framework” local to the experiment so we can later decide what should become first-class `jsgui3` platform functionality.

## What’s in here

- `framework/server.js` — transport-agnostic SSE + command responder (pause/resume/cancel/setTickMs)
- `framework/shared.js` — message normalization + tiny observable utility (shared contract)
- `public/shared.js` — browser-global version of the shared contract
- `public/clientRemoteObservable.js` — `EventSource` → mini observable adapter
- `client.js` — jsgui3 page/control that consumes the client adapter
- `server.jsgui3.js` — jsgui3-server variant (mounts SSE endpoints via `server.router.set_route`)
- `server.express.js` — Express variant (mounts SSE endpoints via `app.get/app.post`)
- `check.js` — Puppeteer check that runs both variants

## Protocol contract (current)

Server emits SSE messages shaped like:

```js
{ type: 'next'|'error'|'complete'|'info', value?, message?, timestampMs }
```

Client adapter turns these into events:

- `obs.on('next', value)`
- `obs.on('error', err)`
- `obs.on('complete', () => {})`
- `obs.on('info', msg)`

Command endpoint accepts JSON:

```js
{ name: 'pause'|'resume'|'cancel'|'setTickMs', payload? }
```

## Where this likely belongs in jsgui3 (proposed)

- **Client-side**: a small library module (near `jsgui3-client`) that exposes a standard `createRemoteObservableClient({ url, EventSourceImpl?, fetchImpl? })` adapter.
- **Server-side**: a reusable SSE responder helper (near `jsgui3-server` routing utilities) that handles:
  - SSE headers
  - snapshot seed / history replay
  - heartbeat (optional)
  - safe teardown
- **Shared contract**: a tiny protocol definition (message types + normalizers) that can run in both Node and browser.

This lab is the “minimum viable” slice needed to make that platform decision with evidence.

## Running

- jsgui3-server variant: `node src/ui/lab/experiments/042-remote-observable-both-ends/server.jsgui3.js`
- Express variant: `node src/ui/lab/experiments/042-remote-observable-both-ends/server.express.js`
- Deterministic check: `node src/ui/lab/experiments/042-remote-observable-both-ends/check.js`
