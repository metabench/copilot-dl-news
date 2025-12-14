# Plan – Emoji Search in Markdown (md-scan)

## Objective
Consolidate canonical workflow for emoji search in markdown and add a helper CLI to encode/decode emojis.

## Done When
- [x] Canonical workflow doc exists and is linked from `docs/INDEX.md`.
- [x] Helper CLI (`emoji-encode`) exists with tests.
- [x] Tooling README points to the canonical workflow (no duplicate how-to drift).
- [x] Tests/validation commands recorded in `WORKING_NOTES.md`.
- [x] Session summary is complete.

## Change Set (initial sketch)
- [docs/workflows/emoji_search_markdown.md](../../../docs/workflows/emoji_search_markdown.md)
- [docs/INDEX.md](../../../docs/INDEX.md)
- [tools/dev/emoji-encode.js](../../../tools/dev/emoji-encode.js)
- [tests/tools/__tests__/emoji-encode.test.js](../../../tests/tools/__tests__/emoji-encode.test.js)
- [tools/dev/README.md](../../../tools/dev/README.md)

## Risks & Mitigations
- **Emoji literals unreliable on Windows shells**: workflow uses `b16:`/`b64:` and `--codepoint` to avoid literal emoji input.
- **Doc sprawl**: keep the detailed steps in one canonical workflow page and keep tool README as a pointer.

## Tests / Validation
- `npm run test:by-path tests/tools/__tests__/emoji-encode.test.js`
- `npm run test:by-path tests/tools/__tests__/md-scan.emoji.test.js`
- `npm run test:by-path tests/tools/__tests__/md-scan.i18n.test.js`
