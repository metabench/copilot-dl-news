# Working Notes — 2025-11-16 Singularity Agent Refresh

## Research Log
- 2025-11-16 10:40 — Read https://www.vibebible.org/bible ("The Vibe Code Bible") using `fetch_webpage`. Key takeaways:
	- Docs-before-code is enforced through a required `docs/00-11` tree plus an AI Builder Contract that blocks coding until specs exist.
	- Lifecycle framing (Spark → Spec City → Scaffold → Thicken → Polish → Steward) keeps teams aware of phase-specific responsibilities.
	- Repeated reminders that AI must treat humans as architects, surface options before decisions, and keep docs/code in sync with zero "ghost" artifacts.
	- Quick-reference cheatsheets + contracts make the methodology easy to paste into new chats without rereading the entire canon.

## Command & Tooling Log
- Locale/mode: default English CLI output; js-scan/js-edit not yet invoked for this documentation-focused update.

## Ideas & Observations
- Singularity Engineer file should mirror the Vibe Bible structure: concise "Bible in 10 seconds", lifecycle summary, contract-like promises, and quick-checklists for doc/test expectations.
- Need an explicit "agent mandate" akin to AI Builder Contract so other tools know what to expect when invoking this agent.
- Proposed refresh outline:
	1. **Singularity Engineer in 10 Seconds** — top-line bullets (docs-first, binding plugin scope, CLI workflow, tests+docs lockstep).
	2. **Agent Contract** — responsibilities when a user invokes this agent (session setup, plan template, CLI mandates, doc updates).
	3. **Lifecycle (Spark → Steward analogue)** — adapt AGENTS.md loop into vibe-like phases (Discover, Spec, Scaffold, Execute, Steward) with crisp exit criteria.
	4. **Docs Stack Requirements** — remind agents of required session docs/AGENTS touches akin to `docs/00-11` rule.
	5. **Tooling Playcards** — keep existing js-scan/js-edit guidance but refactor into quick-reference cards vs long paragraphs.
	6. **Strategic Mode Hook** — reposition the "Strategic Analysis Mode" prompt as a phase-specific call-to-action.

## Implementation Notes
- Rewrote `.github/agents/💡Singularity Engineer💡.agent.md` to follow the plan above: new "in 10 seconds" splash, contract, lifecycle table, docs stack reminder, binding mandate, tooling cards, bilingual guidance, strategic mode, and tooling mandate.
- Preserved all prior requirements (binding plugin rules, session protocol, CLI expectations) but reframed them to align with the Vibe Bible methodology.

## Follow-ups To Track
- _TBD_
