# Emoji Search in Markdown (Windows-safe)

This workflow is the canonical way to search for emoji markers inside Markdown files on Windows, where shells and pipelines can strip or mangle literal emoji in command input.

## When to use this

- You need to find docs that contain a specific emoji marker.
- You want an inventory of all emojis used across a docs directory.
- You want a reliable copy/paste encoding (`b16:` / `b64:`) for a given emoji.

## 1) Inventory all emojis in a directory

Use `md-scan` inventory mode:

```powershell
node tools/dev/md-scan.js --dir docs --find-emojis
```

JSON output (recommended for automation):

```powershell
node tools/dev/md-scan.js --dir docs --find-emojis --json
```

The JSON payload includes:

- `utf8Hex` (use with `b16:` / `hex:`)
- `utf8Base64` (use with `b64:` / `base64:`)
- `occurrences[]` (file + line + column)

## 2) Search for a specific emoji (without typing the emoji)

Once you know the emoji’s UTF-8 hex bytes (from inventory or encoding tool), search with an encoded term:

```powershell
# Example: 🧠 is UTF-8 hex f09fa7a0
node tools/dev/md-scan.js --dir docs --search b16:f09fa7a0
```

Base64 form is also supported:

```powershell
# Example: ⚙️ is UTF-8 base64 4pqZ77iP
node tools/dev/md-scan.js --dir docs --search b64:4pqZ77iP
```

Notes:

- Prefer `b16:`/`b64:` on Windows to avoid shell encoding issues.
- `md-scan` only uses `\b...\b` word boundaries for word-like tokens, so emoji/punctuation tokens still match.

## 3) Get the encodings for an emoji (without relying on emoji input)

Use the helper CLI:

```powershell
# 🧠
node tools/dev/emoji-encode.js --codepoint U+1F9E0

# ⚙️ (U+2699 + U+FE0F)
node tools/dev/emoji-encode.js --codepoint U+2699,U+FE0F
```

Machine readable:

```powershell
node tools/dev/emoji-encode.js --codepoint U+1F9E0 --json
```

## Recommended authoring convention

When using emojis as “visual beacons” in docs, pair them with a stable word token so both work:

- `🧠 MEMORY — ...`
- `⚙️ CONFIG — ...`

That way, searches remain possible even if emoji gets removed by a toolchain.

## Validation

- `npm run test:by-path tests/tools/__tests__/md-scan.emoji.test.js`
- `npm run test:by-path tests/tools/__tests__/emoji-encode.test.js`
