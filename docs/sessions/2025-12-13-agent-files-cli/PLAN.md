# Plan – Agent Files CLI Tooling

## Objective
Improve CLI tooling for understanding, validating, and safely editing .github/agents/*.agent.md files

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Add new CLI: `tools/dev/agent-files.js`
- Add tests: `tests/tools/__tests__/agent-files.test.js`
- Document tool: `tools/dev/README.md`

## Risks & Mitigations
- Risk: link-checking could create noisy failures if enforced in CI.
	- Mitigation: treat broken links as warnings by default; only fail in `--strict` mode.
- Risk: batch editing could accidentally touch non-agent markdown.
	- Mitigation: pass `--include-path .agent.md` to `md-edit` in the wrapper.

## Tests / Validation
- `npm run test:by-path tests/tools/__tests__/agent-files.test.js`
- `npm run test:by-path tests/tools/__tests__/agent-validate.test.js`
- Manual smoke:
	- `node tools/dev/agent-files.js --list`
	- `node tools/dev/agent-files.js --validate --check-handoffs`
