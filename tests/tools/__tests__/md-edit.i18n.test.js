'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const MD_EDIT = path.join(__dirname, '../../../tools/dev/md-edit.js');

function runCli(...args) {
  return execFileSync('node', [MD_EDIT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
}

describe('md-edit bilingual help', () => {
  test('help surfaces chinese aliases', () => {
    const output = runCli('--help', '--lang', 'zh');
    expect(output).toContain('--list-sections');
    expect(output).toContain('--节列');
  });

  test('chinese help alias is recognized', () => {
    const output = runCli('--助', '--语', 'zh');
    expect(output).toContain('--replace-section');
    expect(output).toContain('--替节');
  });
});

describe('md-edit bilingual output', () => {
  const FIXTURE = path.join(__dirname, '../../fixtures/tools/md/sample.md');

  test('list sections emits chinese header', () => {
    const output = runCli(FIXTURE, '--list-sections', '--lang', 'zh');

    expect(output).toContain('节:');
    expect(output).toContain('段:');
  });

  test('search content displays chinese summary', () => {
    const output = runCli(FIXTURE, '--search', 'plan', '--lang', 'zh', '--search-limit', '1');

    expect(output).toContain('搜:');
    expect(output).toContain('匹数');
  });
});
