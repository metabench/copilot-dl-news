# Session Summary: Experimental Research Skill

## Overview
Created the `experimental-research-metacognition` Skill to codify the "Research Loop" (Sense → Think → Act → Reflect) and provide a standard operating procedure for agents facing uncertainty. This Skill bridges the gap between "guessing" and "knowing" by enforcing hypothesis-driven experimentation.

## Key Deliverables
- `docs/agi/skills/experimental-research-metacognition/SKILL.md`: The core SOP document.
- `docs/agi/SKILLS.md`: Updated registry (verified).

## Key Decisions
- **Metacognition Focus**: Explicitly added a "Metacognition" section to teach agents *how* to think about their research process (stop rules, confidence calibration).
- **Tooling Autonomy**: Empowered agents to improve tooling autonomously when they encounter friction, rather than just complaining about it.
- **Integration**: Linked to `jsgui3-lab-experimentation` for UI-specifics and `session-discipline` for process.

## Next Steps
- Agents should use this Skill when encountering ambiguous bugs or undocumented subsystems.
- Future sessions should refine the "Tooling" section based on what tools agents actually build.
