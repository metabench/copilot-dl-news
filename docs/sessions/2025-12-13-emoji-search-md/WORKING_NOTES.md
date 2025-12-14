# Working Notes – Emoji Search in Markdown (md-scan)

## Why

Windows shells and pipelines can strip or normalize literal emoji characters, which makes direct CLI searching unreliable.
The fix is to:

- inventory emojis and use stable encodings (`utf8Hex` / `utf8Base64`)
- search via encoded terms (`b16:` / `b64:`)
- generate encodings from codepoints (no literal emoji required)

## Evidence

- Added canonical workflow doc:
	- `docs/workflows/emoji_search_markdown.md`

- Tests executed:
	- `npm run test:by-path tests/tools/__tests__/emoji-encode.test.js`
	- `npm run test:by-path tests/tools/__tests__/md-scan.emoji.test.js`
	- `npm run test:by-path tests/tools/__tests__/md-scan.i18n.test.js`
