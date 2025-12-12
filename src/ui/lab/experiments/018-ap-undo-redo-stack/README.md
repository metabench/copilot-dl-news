# Experiment 018 — Art Playground: Undo/Redo Command Stack

Status: **proposed**

## Goal
Prototype a minimal undo/redo stack for Art Playground operations.

Why this matters for Art Playground:
- Toolbar already has Undo/Redo buttons.
- A command stack makes “undo” reliable and avoids fragile, ad-hoc state snapshots.

## Hypothesis
If Canvas state is backed by a pure store (see Experiment 017), we can implement undo/redo as:
- command objects with `do()` and `undo()`
- a `CommandStack` that manages history and redo

## Deliverables
- `check.js` validates add/move/delete scenarios and stack semantics.

## Promotion candidate
If validated, promote command stack + a small set of Canvas commands (add, update, delete) into Art Playground isomorphic code, then wire Toolbar Undo/Redo to it.
