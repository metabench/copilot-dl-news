'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('md-edit batch mode', () => {
  const mdEditPath = path.join(__dirname, '../../../tools/dev/md-edit.js');

  function runMdEdit(args, options = {}) {
    return spawnSync(process.execPath, [mdEditPath, ...args], {
      encoding: 'utf8',
      ...options
    });
  }

  it('previews a batch replace without writing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-edit-batch-'));
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const fileA = path.join(docsDir, 'a.md');
    const fileB = path.join(docsDir, 'b.md');

    const before = [
      '# Doc',
      '',
      '## Validation',
      'old line',
      '',
      '## Tail',
      'end'
    ].join('\n');

    fs.writeFileSync(fileA, before, 'utf8');
    fs.writeFileSync(fileB, before, 'utf8');

    const replacement = ['new line 1', 'new line 2'].join('\n');

    const result = runMdEdit([
      fileA, // positional file still required by CLI; batch uses --dir
      '--dir',
      docsDir,
      '--replace-section',
      'Validation',
      '--with',
      replacement,
      '--emit-diff'
    ]);

    expect(result.status).toBe(0);

    const afterA = fs.readFileSync(fileA, 'utf8');
    const afterB = fs.readFileSync(fileB, 'utf8');
    expect(afterA).toBe(before);
    expect(afterB).toBe(before);

    expect(result.stdout).toContain('Batch replace (preview)');
    expect(result.stdout).toContain('@@ -');
  });

  it('applies a batch remove and writes files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-edit-batch-'));
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const fileA = path.join(docsDir, 'a.md');
    const fileB = path.join(docsDir, 'b.md');

    const before = [
      '# Doc',
      '',
      '## RemoveMe',
      'to remove',
      '',
      '## Tail',
      'end'
    ].join('\n');

    fs.writeFileSync(fileA, before, 'utf8');
    fs.writeFileSync(fileB, before, 'utf8');

    const result = runMdEdit([
      fileA,
      '--dir',
      docsDir,
      '--remove-section',
      'RemoveMe',
      '--fix'
    ]);

    expect(result.status).toBe(0);

    const afterA = fs.readFileSync(fileA, 'utf8');
    const afterB = fs.readFileSync(fileB, 'utf8');

    expect(afterA).not.toContain('## RemoveMe');
    expect(afterB).not.toContain('## RemoveMe');
    expect(result.stdout).toContain('Batch remove (applied)');
  });

  it('treats missing sections as no-ops with --allow-missing (batch)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-edit-batch-'));
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const fileA = path.join(docsDir, 'a.md');
    const fileB = path.join(docsDir, 'b.md');

    const beforeA = [
      '# Doc',
      '',
      '## RemoveMe',
      'to remove',
      '',
      '## Tail',
      'end'
    ].join('\n');

    const beforeB = [
      '# Doc',
      '',
      '## Tail',
      'end'
    ].join('\n');

    fs.writeFileSync(fileA, beforeA, 'utf8');
    fs.writeFileSync(fileB, beforeB, 'utf8');

    const result = runMdEdit([
      fileA,
      '--dir',
      docsDir,
      '--remove-section',
      'RemoveMe',
      '--allow-missing',
      '--fix',
      '--json'
    ]);

    expect(result.status).toBe(0);

    const manifest = JSON.parse(result.stdout);
    expect(manifest.summary.filesProcessed).toBe(2);
    expect(manifest.summary.filesChanged).toBe(1);
    expect(manifest.summary.filesWithErrors).toBe(0);

    const afterA = fs.readFileSync(fileA, 'utf8');
    const afterB = fs.readFileSync(fileB, 'utf8');
    expect(afterA).not.toContain('## RemoveMe');
    expect(afterB).toBe(beforeB);
  });

  it('truncates diffs via --diff-max-lines (batch JSON)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-edit-batch-'));
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const fileA = path.join(docsDir, 'a.md');

    const bodyLines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const before = ['# Doc', '', '## Validation', ...bodyLines, '', '## Tail', 'end'].join('\n');
    fs.writeFileSync(fileA, before, 'utf8');

    const replacementLines = Array.from({ length: 30 }, (_, i) => `new ${i + 1}`);
    const replacement = replacementLines.join('\n');

    const result = runMdEdit([
      fileA,
      '--dir',
      docsDir,
      '--replace-section',
      'Validation',
      '--with',
      replacement,
      '--emit-diff',
      '--diff-max-lines',
      '5',
      '--json'
    ]);

    expect(result.status).toBe(0);

    const manifest = JSON.parse(result.stdout);
    expect(manifest.files.length).toBe(1);
    expect(manifest.files[0].diff).toContain('diff truncated');
  });
});
