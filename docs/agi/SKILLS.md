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
| wlilo-design-system | WLILO, white leather, industrial luxury, obsidian, design system, palette, theme tokens, UI chrome | `docs/agi/skills/wlilo-design-system/SKILL.md` |
| jsgui3-wlilo-ui | jsgui3 UI design, WLILO UI, dashboard styling, table styling, obsidian panels, white leather | `docs/agi/skills/jsgui3-wlilo-ui/SKILL.md` |
| svg-collisions | svg, overlap, collisions, diagrams, WLILO, layout repair | `docs/agi/skills/svg-collisions/SKILL.md` |
| svg-theme-system | svg, theme, theming, tokens, style variants, WLILO, obsidian, white-leather, palettes | `docs/agi/skills/svg-theme-system/SKILL.md` |
| jsgui3-activation-debug | jsgui3, clicks don’t work, activation, Missing context.map_Controls | `docs/agi/skills/jsgui3-activation-debug/SKILL.md` |
| jsgui3-ssr-activation-data-bridge | data-jsgui-fields, data-jsgui-ctrl-fields, SSR hydration, activation pipeline, server→client data | `docs/agi/skills/jsgui3-ssr-activation-data-bridge/SKILL.md` |
| jsgui3-context-menu-patterns | context menu, right-click, popup menu, positioning, dismissal | `docs/agi/skills/jsgui3-context-menu-patterns/SKILL.md` |
| jsgui3-lab-experimentation | lab experiments, src/ui/lab, check.js, delegation suite, proving ground, research | `docs/agi/skills/jsgui3-lab-experimentation/SKILL.md` |
| experimental-research-metacognition | experimental research, hypothesis, minimal repro, evidence, tooling, metacognition, confidence calibration | `docs/agi/skills/experimental-research-metacognition/SKILL.md` |
| puppeteer-efficient-ui-verification | puppeteer, ui verification, scenario suite, fast e2e, fixtures, single browser reuse | `docs/agi/skills/puppeteer-efficient-ui-verification/SKILL.md` |
| autonomous-ui-inspection | ui inspection, screenshots, numeric layout metrics, playwright mcp, puppeteer, server check | `docs/agi/skills/autonomous-ui-inspection/SKILL.md` |
| session-discipline | session-init, session notes, evidence, follow-ups, continuity | `docs/agi/skills/session-discipline/SKILL.md` |
| targeted-testing | run tests, pick smallest suite, puppeteer/e2e, validate changes | `docs/agi/skills/targeted-testing/SKILL.md` |
| instruction-adherence | stay on track, instruction drift, resume main task after detour, re-anchor loop | `docs/agi/skills/instruction-adherence/SKILL.md` |
| mcp-memory-server-surgery | mcp, docs-memory, memory server, mcp-server, tools/list, tools/call, stdio, headerless, protocol changes | `docs/agi/skills/mcp-memory-server-surgery/SKILL.md` |
| crawl-system-diagnostics | crawl health, pipeline check, error rates, save rates, stuck runs, content storage, data anomalies, diagnostic tools | `docs/agi/skills/crawl-system-diagnostics/SKILL.md` |

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
