# Plan – md-scan encoded emoji search

## Objective
Allow md-scan to accept base16/base64 encoded search terms (b16:/b64:) so agents can find emoji strings reliably on Windows terminals

## Done When
- [x] `md-scan` accepts `b16:`/`b64:` encoded search terms and searches work for emoji tokens.
- [x] `md-scan` supports `--find-emojis` inventory mode (text + `--json`).
- [x] Regression tests cover both behaviors.
- [x] Evidence commands are captured in `WORKING_NOTES.md`.
- [x] Key deliverables are documented in `SESSION_SUMMARY.md`.
- [x] Follow-ups (if any) are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- [tools/dev/md-scan.js](../../../tools/dev/md-scan.js)
- [tests/tools/__tests__/md-scan.emoji.test.js](../../../tests/tools/__tests__/md-scan.emoji.test.js)
- [tests/fixtures/tools/md/emoji-fixture.md](../../../tests/fixtures/tools/md/emoji-fixture.md)
- [tools/dev/README.md](../../../tools/dev/README.md)

## Risks & Mitigations
- **Unicode/emoji handling differs across shells**: prefer `b16:`/`b64:` inputs; avoid depending on literal emoji in command lines.
- **Regex word-boundary pitfalls**: only apply `\b...\b` for word-like terms so emoji/punctuation tokens still match.

## Tests / Validation
- `npm run test:by-path tests/tools/__tests__/md-scan.emoji.test.js`
- `npm run test:by-path tests/tools/__tests__/md-scan.i18n.test.js`
