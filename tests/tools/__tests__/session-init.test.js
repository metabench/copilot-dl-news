'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createSessionResources,
  buildHubBlock,
  sanitizeSlug,
  toTitle
} = require('../../../tools/dev/session-init');

async function createSandbox() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'session-init-test-'));
  return root;
}

async function removeSandbox(root) {
  if (!root) return;
  await fs.promises.rm(root, { recursive: true, force: true });
}

describe('session-init CLI helpers', () => {
  let sandbox;

  beforeEach(async () => {
    sandbox = await createSandbox();
  });

  afterEach(async () => {
    await removeSandbox(sandbox);
    sandbox = null;
  });

  function sandboxPath(...segments) {
    return path.join(sandbox, ...segments);
  }

  async function prepareHubFile() {
    const hubDir = sandboxPath('docs', 'sessions');
    await fs.promises.mkdir(hubDir, { recursive: true });
    const hubPath = path.join(hubDir, 'SESSIONS_HUB.md');
    const baseline = `# Hub\n\n## Current Session\n\n### Session 2025-11-10: Existing\n\n**Duration**: Active\n\n## How Agents Should Use Session Documentation\n\n- Placeholder\n`;
    await fs.promises.writeFile(hubPath, baseline, 'utf8');
    return hubPath;
  }

  it('creates a full session folder and updates the hub', async () => {
    const hubPath = await prepareHubFile();
    const sessionsRoot = sandboxPath('docs', 'sessions');
    const templatesDir = path.resolve(__dirname, '../../../tools/dev/session-templates');

    const result = await createSessionResources({
      date: '2025-11-14',
      slug: 'demo-session',
      title: 'Demo Session',
      type: 'Tooling',
      objective: 'Validate CLI scaffolding',
      sessionsRoot,
      templatesDir,
      hubPath,
      reuseExisting: false,
      force: false
    });

    const expectedDir = path.join(sessionsRoot, '2025-11-14-demo-session');
    expect(result.sessionDir).toBe(expectedDir);
    expect(await fs.promises.readdir(expectedDir)).toEqual(
      expect.arrayContaining([
        'INDEX.md',
        'PLAN.md',
        'WORKING_NOTES.md',
        'SESSION_SUMMARY.md',
        'DECISIONS.md',
        'FOLLOW_UPS.md'
      ])
    );

    const indexContent = await fs.promises.readFile(path.join(expectedDir, 'INDEX.md'), 'utf8');
    expect(indexContent).toContain('Demo Session');
    expect(indexContent).toContain('Validate CLI scaffolding');

    const hubContent = await fs.promises.readFile(hubPath, 'utf8');
    expect(hubContent).toContain('### Session 2025-11-14: Demo Session');
    expect(result.hubUpdated).toBe(true);
  });

  it('reuses an existing session folder without overwriting files unless forced', async () => {
    const hubPath = await prepareHubFile();
    const sessionsRoot = sandboxPath('docs', 'sessions');
    const templatesDir = path.resolve(__dirname, '../../../tools/dev/session-templates');
    const sessionDir = path.join(sessionsRoot, '2025-11-14-demo-session');
    await fs.promises.mkdir(sessionDir, { recursive: true });
    const planPath = path.join(sessionDir, 'PLAN.md');
    await fs.promises.writeFile(planPath, 'custom plan', 'utf8');

    await createSessionResources({
      date: '2025-11-14',
      slug: 'demo-session',
      title: 'Demo Session',
      type: 'Tooling',
      objective: 'Reuse folder',
      sessionsRoot,
      templatesDir,
      hubPath,
      reuseExisting: true,
      force: false
    });

    const planContent = await fs.promises.readFile(planPath, 'utf8');
    expect(planContent).toBe('custom plan');
  });

  it('builds hub blocks with defaults', () => {
    const block = buildHubBlock({
      date: '2025-11-14',
      title: 'Demo Session',
      sessionId: '2025-11-14-demo-session',
      type: 'Tooling',
      objective: 'Sample objective'
    });
    expect(block).toContain('### Session 2025-11-14: Demo Session');
    expect(block).toContain('- Sample objective');
    expect(block).toContain('docs/sessions/2025-11-14-demo-session');
  });

  it('sanitizes slugs and generates title cases', () => {
    expect(() => sanitizeSlug('!!!')).toThrow();
    expect(sanitizeSlug('New_Feature')).toBe('new-feature');
    expect(toTitle('new-feature')).toBe('New Feature');
  });
});
