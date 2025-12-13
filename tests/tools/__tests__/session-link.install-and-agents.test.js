'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  installTooling,
  upsertAgent,
  slugifyDocSlug
} = require('../../../tools/dev/session-link');

async function createSandbox(prefix) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeSandbox(root) {
  if (!root) return;
  await fs.promises.rm(root, { recursive: true, force: true });
}

async function writeFile(filePath, content) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
}

describe('session-link: tooling install + agents', () => {
  let sandbox;
  let sourceRepo;
  let targetRepo;

  beforeEach(async () => {
    sandbox = await createSandbox('session-link-install-test-');
    sourceRepo = path.join(sandbox, 'source');
    targetRepo = path.join(sandbox, 'target');

    await fs.promises.mkdir(sourceRepo, { recursive: true });
    await fs.promises.mkdir(targetRepo, { recursive: true });

    // Minimal sources for tooling install.
    await writeFile(path.join(sourceRepo, 'tools', 'dev', 'session-link.js'), '// tool');
    await writeFile(
      path.join(sourceRepo, 'docs', 'workflows', 'shared-sessions-across-repos.md'),
      '# workflow'
    );
    await writeFile(
      path.join(sourceRepo, 'tests', 'tools', '__tests__', 'session-link.test.js'),
      '// test'
    );
  });

  afterEach(async () => {
    await removeSandbox(sandbox);
    sandbox = null;
    sourceRepo = null;
    targetRepo = null;
  });

  it('slugifies doc slugs defensively', () => {
    expect(slugifyDocSlug('🕷️ Crawler Singularity 🕷️')).toBe('crawler-singularity');
    expect(slugifyDocSlug('   ')).toBe('agent');
    expect(slugifyDocSlug('JSGUI3__UI')).toBe('jsgui3-ui');
  });

  it('tooling install is dry-run by default', async () => {
    const result = await installTooling({
      sourceRepoRoot: sourceRepo,
      targetRepoRoot: targetRepo,
      fix: false,
      force: false,
      includeTests: true
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);

    await expect(
      fs.promises.stat(path.join(targetRepo, 'tools', 'dev', 'session-link.js'))
    ).rejects.toThrow();
  });

  it('tooling install copies files when --fix is enabled', async () => {
    const result = await installTooling({
      sourceRepoRoot: sourceRepo,
      targetRepoRoot: targetRepo,
      fix: true,
      force: false,
      includeTests: true
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);

    const copiedTool = await fs.promises.readFile(
      path.join(targetRepo, 'tools', 'dev', 'session-link.js'),
      'utf8'
    );
    expect(copiedTool).toBe('// tool');

    const copiedDoc = await fs.promises.readFile(
      path.join(targetRepo, 'docs', 'workflows', 'shared-sessions-across-repos.md'),
      'utf8'
    );
    expect(copiedDoc).toBe('# workflow');

    const copiedTest = await fs.promises.readFile(
      path.join(targetRepo, 'tests', 'tools', '__tests__', 'session-link.test.js'),
      'utf8'
    );
    expect(copiedTest).toBe('// test');
  });

  it('agent create writes agent file and updates index.json', async () => {
    const title = '🧠 jsgui3 Singularity 🧠';

    const result = await upsertAgent({
      targetRepoRoot: targetRepo,
      title,
      docSlug: null,
      purpose: 'Test agent for cross-repo workflows',
      tags: ['ui', 'jsgui3', 'singularity'],
      enhancement: 'jsgui3-singularity',
      action: 'create',
      fix: true,
      force: false
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);

    const agentPath = path.join(targetRepo, '.github', 'agents', `${title}.agent.md`);
    const agentBody = await fs.promises.readFile(agentPath, 'utf8');
    expect(agentBody).toContain('# 🧠 jsgui3 Singularity 🧠');

    const indexPath = path.join(targetRepo, '.github', 'agents', 'index.json');
    const index = JSON.parse(await fs.promises.readFile(indexPath, 'utf8'));
    expect(Array.isArray(index)).toBe(true);
    expect(index).toHaveLength(1);

    const entry = index[0];
    expect(entry.doc_slug).toBe('jsgui3-singularity');
    expect(entry.title).toBe(title);
    expect(entry.path).toBe(`.github/agents/${title}.agent.md`);
  });

  it('agent enhance is idempotent (marker replacement)', async () => {
    const title = '🔬 Edge Case Agent 🔬';
    const agentPath = path.join(targetRepo, '.github', 'agents', `${title}.agent.md`);

    await writeFile(agentPath, '# Base\n');

    const first = await upsertAgent({
      targetRepoRoot: targetRepo,
      title,
      docSlug: 'edge-case-agent',
      purpose: null,
      tags: [],
      enhancement: 'jsgui3-singularity',
      action: 'enhance',
      fix: true,
      force: false
    });

    expect(first.ok).toBe(true);

    const body1 = await fs.promises.readFile(agentPath, 'utf8');
    expect(body1).toContain('<!-- BEGIN COPILOT ENHANCEMENTS: jsgui3-singularity -->');

    const second = await upsertAgent({
      targetRepoRoot: targetRepo,
      title,
      docSlug: 'edge-case-agent',
      purpose: null,
      tags: [],
      enhancement: 'jsgui3-singularity',
      action: 'enhance',
      fix: true,
      force: false
    });

    expect(second.ok).toBe(true);

    const body2 = await fs.promises.readFile(agentPath, 'utf8');

    // Should not duplicate the markers.
    expect(body2.match(/BEGIN COPILOT ENHANCEMENTS: jsgui3-singularity/g)).toHaveLength(1);
  });
});
