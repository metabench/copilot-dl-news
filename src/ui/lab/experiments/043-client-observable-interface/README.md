# Lab 043 — Client Observable Interface

Goal: expose a server-side observable (streamed over SSE) as **multiple client-side “observable-ish” interfaces**, with the primary target being the jsgui/jsgui3-native event model (`.on/.off/.raise`).

This lab reuses the remote observable server contract from Lab 042:
- `GET /api/remote-obs/events` — SSE stream of `{ type, value, ... }` messages
- `POST /api/remote-obs/command` — optional command channel (pause/resume/cancel)

## Client Interfaces

All interfaces are built on top of the same SSE client (`EventSource`). The adapters are in:
- `public/clientObservableAdapters.js`

Provided adapters:
- **Evented**: jsgui-aligned `.on/.off/.raise` surface
- **Rx-ish**: `subscribe({ next, error, complete }) -> { unsubscribe() }`
- **Async iterator**: `for await (const v of iter) { ... }`

## Run

- Standalone check: `node src/ui/lab/experiments/043-client-observable-interface/check.js`

The check starts an Express server, loads the page with Puppeteer, and asserts that all three adapters receive messages.

## Notes / platform fit

If we upstream any primitives into jsgui3:
- **Client**: a small `SseObservableClient` + `toEvented()` adapter likely belongs near client networking utilities.
- **Server**: keep using jsgui3-server publishers (or a small express helper) to expose an `fnl.observable` as SSE.

The higher-level “remote observable contract” (events + commands, conventions) can remain a lab/framework until multiple features depend on it.
