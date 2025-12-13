# Skills Registry (Draft)

This repo does not have Anthropic Claude Code “Skills” support directly, but we can emulate the same *pattern*:

- **Skill = capability pack**: trigger phrases + SOP + scripts/checks/tests + success criteria.
- **Discovery-first**: agents should search this registry before requesting new research.
- **Progressive disclosure**: each Skill links to deeper docs/scripts so agents pull only what they need.

## How agents should use this

1. **Search the registry** for a Skill that matches the task.
2. Open the Skill’s `SKILL.md` and follow its SOP.
3. If there is no matching Skill:
   - Create a stub Skill folder under `docs/agi/skills/<skill-name>/`.
   - Add a Follow-up in the current session requesting research/expansion.

### Quick discovery commands (no MCP required)

- Search skills + workflows + lessons quickly:
   - `node tools/dev/md-scan.js --dir docs/agi --search "<topic>" --json`
- Search prior sessions before starting new work:
   - `node tools/dev/md-scan.js --dir docs/sessions --search "<topic>" --json`

## Skills

| Skill | Primary use / triggers | Location |
| --- | --- | --- |
| telemetry-contracts | telemetry, drift, status/health endpoints, event naming | `docs/agi/skills/telemetry-contracts/SKILL.md` |
| svg-collisions | svg, overlap, collisions, diagrams, WLILO, layout repair | `docs/agi/skills/svg-collisions/SKILL.md` |
| jsgui3-activation-debug | jsgui3, clicks don’t work, activation, Missing context.map_Controls | `docs/agi/skills/jsgui3-activation-debug/SKILL.md` |
| session-discipline | session-init, session notes, evidence, follow-ups, continuity | `docs/agi/skills/session-discipline/SKILL.md` |
| targeted-testing | run tests, pick smallest suite, puppeteer/e2e, validate changes | `docs/agi/skills/targeted-testing/SKILL.md` |
| instruction-adherence | stay on track, instruction drift, resume main task after detour, re-anchor loop | `docs/agi/skills/instruction-adherence/SKILL.md` |

## Adding a new Skill (template)

Create a new folder:

- `docs/agi/skills/<skill-name>/SKILL.md`

Recommended `SKILL.md` outline:

- `name`, `description`
- **Scope** (what it does / doesn’t)
- **Inputs** (what info the agent needs)
- **Procedure** (step-by-step)
- **Validation** (commands and expected outputs)
- **Escalation / Research request** (when to ask for dedicated research)
- **References** (docs/scripts/tests)
