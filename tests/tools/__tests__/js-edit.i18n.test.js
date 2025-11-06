'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const JS_EDIT = path.join(__dirname, '../../../tools/dev/js-edit.js');
const FIXTURE = path.join(__dirname, '../../fixtures/tools/js-edit-sample.js');

function runCli(...args) {
  return execFileSync('node', [JS_EDIT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
}

describe('js-edit bilingual help', () => {
  test('help uses chinese aliases when requested', () => {
    const output = runCli('--help', '--lang', 'zh');
    expect(output).toContain('--list-functions');
    expect(output).toContain('--函列');
  });

  test('help alias triggers chinese mode', () => {
    const output = runCli('--助', '--语', 'zh');
    expect(output).toContain('--list-functions');
    expect(output).toContain('--函列');
  });
});

describe('js-edit bilingual operations', () => {
  test('locate renders chinese labels when zh mode active', () => {
    const output = runCli(
      '--file',
      FIXTURE,
      '--locate',
      'exports.alpha',
      '--lang',
      'zh'
    );

    expect(output).toContain('函 定');
    expect(output).toContain('名');
    expect(output).toContain('匹');
  });

  test('replace emits terse chinese guardrail summary', () => {
    const output = runCli(
      '--file',
      FIXTURE,
      '--replace',
      'exports.alpha',
      '--with-code',
      'function alpha() { return 42; }',
      '--lang',
      'zh'
    );

    expect(output).toContain('护栏');
    expect(output).toContain('检');
    expect(output).toContain('态');
    expect(output).toContain('详');
    expect(output).toContain('安');
  });

  test('context function emits chinese labels', () => {
    const output = runCli(
      '--file',
      FIXTURE,
      '--context-function',
      'exports.alpha',
      '--lang',
      'zh'
    );

    expect(output).toContain('函邻');
    expect(output).toContain('选:');
    expect(output).toContain('求垫');
    expect(output).toContain('邻窗');
  });
});
