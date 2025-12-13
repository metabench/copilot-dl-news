'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveSessionId,
  planSessionLink,
  linkSession
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

describe('session-link CLI helpers', () => {
  let sandbox;
  let sourceRepo;
  let targetRepo;

  beforeEach(async () => {
    sandbox = await createSandbox('session-link-test-');
    sourceRepo = path.join(sandbox, 'source');
    targetRepo = path.join(sandbox, 'target');

    await fs.promises.mkdir(sourceRepo, { recursive: true });
    await fs.promises.mkdir(targetRepo, { recursive: true });

    // Create two sessions with the same slug; newest should be selected.
    await writeFile(
      path.join(sourceRepo, 'docs', 'sessions', '2025-11-01-shared-sessions', 'PLAN.md'),
      'old plan'
    );
    await writeFile(
      path.join(sourceRepo, 'docs', 'sessions', '2025-12-13-shared-sessions', 'PLAN.md'),
      'new plan'
    );
  });

  afterEach(async () => {
    await removeSandbox(sandbox);
    sandbox = null;
    sourceRepo = null;
    targetRepo = null;
  });

  it('resolves latest session id when given a slug', async () => {
    const resolved = await resolveSessionId({ repoRoot: sourceRepo, session: 'shared-sessions' });
    expect(resolved.sessionId).toBe('2025-12-13-shared-sessions');
    expect(resolved.sessionsRoot).toBe(path.join(sourceRepo, 'docs', 'sessions'));
  });

  it('plans a link from source to target', async () => {
    const plan = await planSessionLink({
      sourceRepoRoot: sourceRepo,
      targetRepoRoot: targetRepo,
      session: 'shared-sessions'
    });

    expect(plan.sessionId).toBe('2025-12-13-shared-sessions');
    expect(plan.sourceDir).toBe(path.join(sourceRepo, 'docs', 'sessions', plan.sessionId));
    expect(plan.destDir).toBe(path.join(targetRepo, 'docs', 'sessions', plan.sessionId));
  });

  it('does not change anything in dry-run mode', async () => {
    const result = await linkSession({
      sourceRepoRoot: sourceRepo,
      targetRepoRoot: targetRepo,
      session: 'shared-sessions',
      mode: 'copy',
      fix: false,
      force: false
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    await expect(fs.promises.stat(result.plan.destDir)).rejects.toThrow();
  });

  it('copies a session folder when mode=copy and --fix is enabled', async () => {
    const result = await linkSession({
      sourceRepoRoot: sourceRepo,
      targetRepoRoot: targetRepo,
      session: 'shared-sessions',
      mode: 'copy',
      fix: true,
      force: false
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);

    const copiedPlan = await fs.promises.readFile(path.join(result.plan.destDir, 'PLAN.md'), 'utf8');
    expect(copiedPlan).toBe('new plan');
  });
});
