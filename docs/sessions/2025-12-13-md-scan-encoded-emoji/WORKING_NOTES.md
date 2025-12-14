# Working Notes – md-scan encoded emoji search

## Minimal repro (why we need encoding)

On Windows/PowerShell, emoji literals can be stripped/sanitized before Node sees them.
Using Unicode escapes works reliably and lets us compute encodings without requiring emoji input.

Example (works):

`node -e "const e='\u{1F9E0}'; console.log(Buffer.from(e,'utf8').toString('hex'))"`

## Implementation notes

- `--search` terms now accept `b16:`/`hex:` and `b64:`/`base64:` prefixes (decoded as UTF-8).
- Multi-term search only uses `\b...\b` boundaries for word-like tokens (`[A-Za-z0-9_]+`).
	- This is important because `\b` does not behave predictably for emoji/punctuation.
- New operation: `--find-emojis` inventories emojis with `{emoji, count, utf8Hex, utf8Base64, occurrences[]}`.

## Evidence

- Tests:
	- `npm run test:by-path tests/tools/__tests__/md-scan.emoji.test.js`
	- `npm run test:by-path tests/tools/__tests__/md-scan.i18n.test.js`

