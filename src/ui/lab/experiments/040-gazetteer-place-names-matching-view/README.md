# Lab 040 — Gazetteer place names: compact multilingual view + match inspector (jsgui3-server)

## Goal
Build a **compact, intuitive UI** for viewing a place’s names across languages **in the same shape the matcher uses**.

This lab is intentionally **DB-free** (uses fixtures) so we can iterate quickly on:
- grouping (lang → names)
- showing match keys (`normalized`, optional `slug`)
- explaining ambiguity
- match-inspector UX (segment → normalized)

Once the UI is right, we can wire it to the gazetteer DB via the existing query layer.

## Run
- `node src/ui/lab/experiments/040-gazetteer-place-names-matching-view/check.js`

It starts a real `jsgui3-server` instance on a free port, fetches `/`, asserts the SSR contains the expected control, then shuts down cleanly.

## Notes (related labs)
- Lab 020 demonstrates `jsgui3-server` SSR + activation + `ctrl_fields`.
- Lab 028 demonstrates routing on `jsgui3-server` via `server.router.set_route()`.
