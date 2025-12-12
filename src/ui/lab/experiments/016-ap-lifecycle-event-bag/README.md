# Experiment 016 — Art Playground: Lifecycle-Safe Event Binding

Status: **proposed**

## Goal
Prototype an idiomatic pattern for jsgui3 controls that bind DOM (and `document`) event listeners during `activate()` while providing a clean teardown (`deactivate()`/`destroy()`) path.

Why this matters for Art Playground:
- Controls bind to `document`-level events (`mousemove`, `mouseup`).
- In more dynamic UIs (hot reload, re-rendering, embedded panels), missing teardown can leak listeners.
- A small, reusable pattern helps keep controls reliable and testable.

## Hypothesis
A small `ListenerBag` helper can:
- bind listeners with a consistent API,
- avoid double-binding,
- remove all listeners in one call.

## Deliverables
- A minimal `ListenerBag` and a `FakeEventTarget` test harness.
- A `check.js` that validates: bind/unbind counts, idempotency, and teardown.

## Promotion candidate
If validated, the helper could be promoted to a shared utility (e.g. `src/ui/utils/listenerBag.js`) and used by Art Playground controls that currently bind `document` listeners.
