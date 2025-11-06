'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const MD_SCAN = path.join(__dirname, '../../../tools/dev/md-scan.js');

function runCli(...args) {
  return execFileSync('node', [MD_SCAN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
}

describe('md-scan bilingual help', () => {
  test('help lists chinese aliases', () => {
    const output = runCli('--help', '--lang', 'zh');
    expect(output).toContain('--search');
    expect(output).toContain('--搜');
  });

  test('chinese alias for help works', () => {
    const output = runCli('--助', '--语', 'zh');
    expect(output).toContain('--map-links');
    expect(output).toContain('--链图');
  });
});

describe('md-scan bilingual output', () => {
  const FIXTURE_DIR = path.join(__dirname, '../../fixtures/tools/md');

  test('search results include chinese summary', () => {
    const output = runCli('--dir', FIXTURE_DIR, '--search', 'planner', '--lang', 'zh', '--compact');

    expect(output).toContain('搜果');
    expect(output).toContain('匹数');
    expect(output).toContain('节:');
  });

  test('index renders chinese headings', () => {
    const output = runCli('--dir', FIXTURE_DIR, '--build-index', '--lang', 'zh', '--priority-only');

    expect(output).toContain('文档索');
    expect(output).toContain('优档');
  });
});
