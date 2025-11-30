# Plan – JSGUI3 Lab Tooling

## Objective
Implement headless control testing scripts and puppeteer micro-scenarios so we can validate jsgui3 controls without spinning up full servers.

## Done When
- [ ] `jsgui3-event-lab.js` exists under `tools/dev/` and can instantiate lab controls via jsdom, dispatch synthetic events, and optionally simulate detach/reattach.
- [ ] `ActivationHarnessControl` (or equivalent) lives in `src/jsgui3-lab/controls/` with a CLI scenario script that logs on/raise sequences and listener counts.
- [ ] `scripts/ui/capture-control.js` (Puppeteer micro-scenario) can render any lab control, take screenshots, and run evaluations with CLI flags.
- [ ] Documentation (INDEX + JSGUI3 guide + Thinker agent) references the new tooling, and session notes capture usage instructions.

## Change Set (initial sketch)
- `tools/dev/jsgui3-event-lab.js`
- `src/jsgui3-lab/controls/ActivationHarnessControl.js`
- `src/jsgui3-lab/checks/ActivationHarnessControl.scenario.js`
- `scripts/ui/capture-control.js`
- Docs: `docs/INDEX.md`, `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`, `.github/agents/🧠 jsgui3 Thinker 🧠.agent.md`
- Session docs under `docs/sessions/2025-11-30-jsgui3-lab-upgrades/`

## Risks & Mitigations
- **jsdom compatibility**: ensure `jsgui3-html` works with jsdom; mitigate by polyfilling missing globals or constraining features.
- **Puppeteer overhead**: keep script content-based to avoid full server; mitigate with cached templates and small timeouts.
- **API surface creep**: start minimal, document extension points before growing features.

## Tests / Validation
- Run `node tools/dev/jsgui3-event-lab.js --control SimplePanelControl --dispatch click` and confirm logs.
- Run `node src/jsgui3-lab/checks/ActivationHarnessControl.scenario.js` to verify event logs + listener counts.
- Run `node scripts/ui/capture-control.js --control SimplePanelControl --screenshot tmp/simple-panel.png` and confirm screenshot/JSON output.
