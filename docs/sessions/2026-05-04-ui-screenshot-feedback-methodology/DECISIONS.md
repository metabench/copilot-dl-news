# Decisions: UI Screenshot Feedback Methodology

## Session-Scoped Screenshot Artifacts Are The Default

Context: screenshots need to be viewable in the control centre, tied to active work, and easy for later agents to find alongside plans and notes.

Options:
- Save all screenshots under root `screenshots/` only.
- Save active screenshots under the current session folder and optionally mirror stable sets under root `screenshots/`.
- Save screenshots only as ephemeral test artifacts under `tmp/`.

Decision: active UI work should save screenshots under `docs/sessions/<session>/screenshots/` with `SCREENSHOT_REVIEW.md`, `SCREENSHOT_COMMENTS.md`, and `analysis.json`.

Consequences: control-centre/docs views can link directly to active artifacts; future agents inherit comments and evidence from the same session context; larger stable sets can still be mirrored or archived separately.

## Puppeteer Is The Default Automated Rig, Electron Is The Fidelity Rig

Context: agents need efficient automatic screenshot capture, but some workflows require the actual desktop control-centre shell.

Options:
- Use Electron for every screenshot.
- Use Puppeteer for every screenshot.
- Use Puppeteer by default and Electron when desktop shell persistence or fidelity matters.

Decision: use Puppeteer as the default deterministic capture rig; use Electron for persistent operator windows, desktop-shell-specific behavior, and long-running operations.

Consequences: routine captures stay fast and scriptable while Electron remains available for workflows where browser capture would miss the real product surface.

## Comments Are Requirements For Later UI Passes

Context: the user wants to write comments about screenshots and later ask agents to use those comments for modifications.

Options:
- Treat comments as informal notes only.
- Store comments in chat history.
- Store comments as files or SVG `agent-comment` groups near the screenshot review artifacts and require agents to read them.

Decision: create `SCREENSHOT_COMMENTS.md` beside screenshot reviews, support SVG `agent-comment` groups and `.agent/pending_comments.md`, and require future agents to read unresolved comments before UI edits.

Consequences: comments become durable, discoverable requirements instead of ephemeral conversation context.