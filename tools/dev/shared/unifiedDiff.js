'use strict';

/**
 * Generates a small unified diff (line-based) without external dependencies.
 *
 * NOTE: This is intentionally simple (lookahead-based) and designed for CLI previews,
 * not perfect minimal diffs.
 *
 * @param {string} beforeText
 * @param {string} afterText
 * @param {{ contextLines?: number, label?: string }} [context]
 * @returns {string}
 */
function generateUnifiedDiff(beforeText, afterText, context = {}) {
  const beforeLines = String(beforeText || '').split('\n');
  const afterLines = String(afterText || '').split('\n');
  const contextLines = Number.isFinite(context.contextLines) ? context.contextLines : 3;
  const label = context.label || 'file';

  const diffLines = [];
  diffLines.push(`--- ${label} (before)`);
  diffLines.push(`+++ ${label} (after)`);

  let i = 0;
  let j = 0;
  const changes = [];

  while (i < beforeLines.length || j < afterLines.length) {
    if (i >= beforeLines.length) {
      changes.push({ type: 'add', beforeIdx: i, afterIdx: j, line: afterLines[j] });
      j++;
      continue;
    }

    if (j >= afterLines.length) {
      changes.push({ type: 'del', beforeIdx: i, afterIdx: j, line: beforeLines[i] });
      i++;
      continue;
    }

    if (beforeLines[i] === afterLines[j]) {
      changes.push({ type: 'ctx', beforeIdx: i, afterIdx: j, line: beforeLines[i] });
      i++;
      j++;
      continue;
    }

    let foundMatch = false;
    const lookahead = Math.min(5, Math.max(beforeLines.length - i, afterLines.length - j));

    for (let la = 1; la <= lookahead; la++) {
      if (i + la < beforeLines.length && beforeLines[i + la] === afterLines[j]) {
        for (let k = 0; k < la; k++) {
          changes.push({ type: 'del', beforeIdx: i + k, afterIdx: j, line: beforeLines[i + k] });
        }
        i += la;
        foundMatch = true;
        break;
      }

      if (j + la < afterLines.length && beforeLines[i] === afterLines[j + la]) {
        for (let k = 0; k < la; k++) {
          changes.push({ type: 'add', beforeIdx: i, afterIdx: j + k, line: afterLines[j + k] });
        }
        j += la;
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      changes.push({ type: 'del', beforeIdx: i, afterIdx: j, line: beforeLines[i] });
      changes.push({ type: 'add', beforeIdx: i + 1, afterIdx: j, line: afterLines[j] });
      i++;
      j++;
    }
  }

  const hunks = [];
  let currentHunk = null;

  for (let idx = 0; idx < changes.length; idx++) {
    const change = changes[idx];

    if (change.type !== 'ctx') {
      if (!currentHunk) {
        const startBefore = Math.max(0, change.beforeIdx - contextLines);
        const startAfter = Math.max(0, change.afterIdx - contextLines);
        currentHunk = { startBefore, startAfter, lines: [] };

        for (let c = startBefore; c < change.beforeIdx; c++) {
          if (c < beforeLines.length) {
            currentHunk.lines.push({ type: 'ctx', line: beforeLines[c] });
          }
        }
      }

      currentHunk.lines.push({ type: change.type, line: change.line });
      continue;
    }

    if (currentHunk) {
      currentHunk.lines.push({ type: 'ctx', line: change.line });

      let hasMoreChanges = false;
      for (let look = idx + 1; look < Math.min(idx + 1 + contextLines * 2, changes.length); look++) {
        if (changes[look].type !== 'ctx') {
          hasMoreChanges = true;
          break;
        }
      }

      if (!hasMoreChanges) {
        const ctxCount = currentHunk.lines.filter((l) => l.type === 'ctx').length;
        const excessCtx = ctxCount - contextLines * 2;

        if (excessCtx > 0) {
          let removed = 0;
          for (let r = currentHunk.lines.length - 1; r >= 0 && removed < excessCtx; r--) {
            if (currentHunk.lines[r].type === 'ctx') {
              currentHunk.lines.splice(r, 1);
              removed++;
            }
          }
        }

        hunks.push(currentHunk);
        currentHunk = null;
      }
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  for (const hunk of hunks) {
    const beforeCount = hunk.lines.filter((l) => l.type === 'ctx' || l.type === 'del').length;
    const afterCount = hunk.lines.filter((l) => l.type === 'ctx' || l.type === 'add').length;

    diffLines.push(`@@ -${hunk.startBefore + 1},${beforeCount} +${hunk.startAfter + 1},${afterCount} @@`);

    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
      diffLines.push(`${prefix}${line.line}`);
    }
  }

  return diffLines.join('\n');
}

module.exports = {
  generateUnifiedDiff
};
