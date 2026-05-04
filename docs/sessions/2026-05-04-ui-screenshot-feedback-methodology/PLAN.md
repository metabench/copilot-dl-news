# Plan: UI Screenshot Feedback Methodology

Objective: make automatic screenshot capture, Electron/Puppeteer visual evidence, user-journey planning, and control-centre comments a repeatable requirement for UI app work.

Done when:
- A methodology guide defines the artifact contract, capture rig expectations, Electron vs Puppeteer choice, and control-centre review loop.
- A workflow gives agents exact steps for planning user journeys, capturing screenshots, reviewing comments, and iterating.
- AI instructions and a reusable skill teach future agents when and how to apply the loop.
- Indexes/registries point to the new docs so the guidance is discoverable.
- Validation confirms the new markdown/customization files have sane frontmatter and no editor diagnostics.

Change set:
- `docs/guides/UI_SCREENSHOT_FEEDBACK_METHODOLOGY.md`
- `docs/workflows/ui-screenshot-feedback-loop.md`
- `.github/instructions/UI Screenshot Feedback.instructions.md`
- `.github/skills/ui-screenshot-feedback/SKILL.md`
- `docs/agi/skills/ui-screenshot-feedback/SKILL.md`
- `docs/INDEX.md`, `docs/agi/SKILLS.md`, and this session folder.

Risks/assumptions:
- Control-centre commenting may exist in more than one form: Markdown notes, SVG `agent-comment` groups, and `.agent/pending_comments.md`. The docs should support all three without assuming one implementation is finished.
- Screenshot artifacts can become bulky; prefer session-scoped galleries and analysis JSON, and archive large reusable sets when they are no longer active.
- Instructions should be specific enough to trigger on UI work without becoming broad context noise.

Validation:
- Read all new/updated markdown and customization files for frontmatter/path sanity.
- Use editor diagnostics on the touched docs/customization files.
- Check the docs index and skills registry include the new entries.