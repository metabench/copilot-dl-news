# Working Notes – Lab: Remote Observable on Both Ends

- 2025-12-21 — Implemented Lab 042 experiment scaffold + framework + servers.
- Validation: `node src/ui/lab/experiments/042-remote-observable-both-ends/check.js` (captured output: `tmp/lab042.check3.out.txt`).
- Debug note: when generating inline JS inside a template literal, `\n` must be written as `\\n` in the template source; otherwise the generated JS contains an actual newline inside a string literal → `SyntaxError: Invalid or unexpected token`.
