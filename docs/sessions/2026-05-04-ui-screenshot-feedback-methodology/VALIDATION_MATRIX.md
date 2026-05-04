# Validation Matrix: UI Screenshot Feedback Methodology

| Area | Check | Expected Evidence | Status |
| --- | --- | --- | --- |
| Methodology guide | Read `docs/guides/UI_SCREENSHOT_FEEDBACK_METHODOLOGY.md` | Artifact contract, journey planning, Electron/Puppeteer choice, comments loop are covered | Passed |
| Workflow | Read `docs/workflows/ui-screenshot-feedback-loop.md` | Step-by-step agent workflow exists with validation checklist | Passed |
| AI instructions | Read `.github/instructions/UI Screenshot Feedback.instructions.md` | Frontmatter plus actionable UI screenshot rules | Passed |
| Workspace skill | Read `.github/skills/ui-screenshot-feedback/SKILL.md` | Skill has discoverable trigger description and procedure | Passed |
| AGI skill registry | Read `docs/agi/SKILLS.md` and `docs/agi/skills/ui-screenshot-feedback/SKILL.md` | Skill is registered and has SOP/validation/references | Passed |
| Documentation index | `grep` for `UI Screenshot Feedback Loop` and `UI Screenshot Feedback Methodology` in `docs/INDEX.md` | New workflow and methodology guide are linked | Passed |
| Cross-links | `grep` in `docs/workflows/ui-inspection-workflow.md`, `docs/guides/PUPPETEER_UI_WORKFLOW.md`, and `docs/sessions/SESSIONS_HUB.md` | Existing workflow/guide/session hub point to the new loop/session | Passed |
| Editor diagnostics | VS Code diagnostics for touched docs/customization files | No markdown/frontmatter errors reported | Passed |
| Whitespace | `git diff --check -- <focused docs/customization paths>` | No whitespace errors | Passed |

Notes:
- This is documentation/instruction work, so validation is structural and discoverability-focused rather than runtime screenshot capture.