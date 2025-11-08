'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { pruneTmp } = require('../../../tools/dev/tmp-prune');

async function touchFile(filePath, timestamp) {
  await fs.promises.writeFile(filePath, 'tmp');
  const time = timestamp instanceof Date ? timestamp : new Date(timestamp);
  await fs.promises.utimes(filePath, time, time);
}

async function touchDirectory(dirPath, timestamp) {
  await fs.promises.mkdir(dirPath, { recursive: true });
  const time = timestamp instanceof Date ? timestamp : new Date(timestamp);
  await fs.promises.utimes(dirPath, time, time);
}

describe('tmp-prune utility', () => {
  let sandboxRoot;

  const createSandbox = async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmp-prune-test-'));
    sandboxRoot = tempRoot;
    return tempRoot;
  };

  afterEach(async () => {
    if (sandboxRoot && await fs.promises.stat(sandboxRoot).then(() => true).catch(() => false)) {
      await fs.promises.rm(sandboxRoot, { recursive: true, force: true });
    }
    sandboxRoot = undefined;
  });

  it('schedules older entries for removal when exceeding keep threshold', async () => {
    const root = await createSandbox();
    const now = Date.now();

    for (let i = 0; i < 12; i += 1) {
      await touchFile(path.join(root, `file-${i}.txt`), now - i * 5000);
    }

    const nested = path.join(root, 'nested');
    await fs.promises.mkdir(nested, { recursive: true });
    for (let i = 0; i < 12; i += 1) {
      await touchFile(path.join(nested, `nested-${i}.txt`), now - i * 5000);
    }

    const stats = await pruneTmp({
      root,
      keep: 3,
      dryRun: true,
      captureDetails: true,
      stickyNames: [],
      sampleSize: 100
    });

    expect(stats.directoriesProcessed).toBeGreaterThanOrEqual(2);

    const rootRecord = stats.directories.find((record) => record.path === root);
    expect(rootRecord).toBeDefined();
    expect(rootRecord.removedPaths.length).toBe(10);

    const nestedRecord = stats.directories.find((record) => record.path === nested);
    expect(nestedRecord).toBeDefined();
    expect(nestedRecord.removedPaths.length).toBe(9);
  });

  it('removes entries on disk when fix mode is enabled', async () => {
    const root = await createSandbox();
    const now = Date.now();

    for (let i = 0; i < 6; i += 1) {
      const dirPath = path.join(root, `dir-${i}`);
      await fs.promises.mkdir(dirPath, { recursive: true });
      await touchDirectory(dirPath, now - i * 7000);
    }

    const stats = await pruneTmp({
      root,
      keep: 2,
      dryRun: false,
      captureDetails: true,
      stickyNames: []
    });

    expect(stats.entriesRemoved).toBe(4);

    const remaining = await fs.promises.readdir(root);
    expect(remaining.length).toBe(2);
    expect(remaining).toEqual(expect.arrayContaining(['dir-0', 'dir-1']));
  });

  it('always preserves .gitkeep even when older than keep limit', async () => {
    const root = await createSandbox();
    const now = Date.now();

    const gitkeep = path.join(root, '.gitkeep');
    await touchFile(gitkeep, now - 60_000);

    for (let i = 0; i < 4; i += 1) {
      await touchFile(path.join(root, `entry-${i}.txt`), now - i * 1000);
    }

    const stats = await pruneTmp({
      root,
      keep: 1,
      dryRun: true,
      captureDetails: true
    });

    const rootRecord = stats.directories.find((record) => record.path === root);
    expect(rootRecord).toBeDefined();
    expect(rootRecord.removedPaths).not.toContain(gitkeep);
    expect(rootRecord.retainedPaths).toContain(gitkeep);
  });
});
