# Plan – jsgui3-server activation lab after npm update

## Objective
Re-run experiment 020 checks after npm update, fix any regressions, and move activation demo forward.

## Done When
- [ ] Experiment 020 check passes after `npm update` (SSR + activation + ctrl_fields click).
- [ ] Any remaining browser-console warnings are triaged (kept as known-OK, or fixed).
- [ ] Outcomes captured in `SESSION_SUMMARY.md` with evidence commands.
- [ ] Follow-ups recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/lab/experiments/020-jsgui3-server-activation/check.js`
- `src/ui/lab/experiments/020-jsgui3-server-activation/client.js`
- `docs/sessions/2025-12-14-jsgui3-server-activation-npm-update/*`

## Risks & Mitigations
- `npm update` may change browser bundle contents (previous htmlparser/Tautologistics crash risk) → keep the Puppeteer click+activation assertions.
- Some console warnings may remain even when functionality works → explicitly document which are acceptable.

## Tests / Validation
- `node src/ui/lab/experiments/020-jsgui3-server-activation/check.js`
