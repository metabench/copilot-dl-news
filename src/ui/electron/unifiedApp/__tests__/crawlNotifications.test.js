'use strict';

const { startCrawlCompletionNotifier, summarizeJob } = require('../crawlNotifications');

describe('crawl completion notifier (RB-010 residue)', () => {
  function makeWatcher(sequence) {
    let call = 0;
    const notify = jest.fn();
    const watcher = startCrawlCompletionNotifier({
      fetchJobs: async () => {
        const frame = sequence[Math.min(call, sequence.length - 1)];
        call += 1;
        if (frame instanceof Error) throw frame;
        return frame;
      },
      notify,
      intervalMs: 60_000, // ticks driven manually in tests
      logger: { log: () => {}, warn: () => {} }
    });
    return { watcher, notify };
  }

  afterEach(() => { /* watchers stopped per-test */ });

  test('announces a witnessed running→completed transition exactly once', async () => {
    const { watcher, notify } = makeWatcher([
      [{ id: 'a', status: 'running', startUrl: 'https://x.test/' }],
      [{ id: 'a', status: 'completed', startUrl: 'https://x.test/', progress: { downloaded: 4, errors: 0 } }],
      [{ id: 'a', status: 'completed', startUrl: 'https://x.test/' }] // still listed later — no re-announce
    ]);
    await watcher.tick();
    expect(notify).not.toHaveBeenCalled(); // still running
    await watcher.tick();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toEqual({ title: 'Crawl completed', body: 'https://x.test/ — 4 downloaded, 0 errors' });
    await watcher.tick();
    expect(notify).toHaveBeenCalledTimes(1); // once, ever
    watcher.stop();
  });

  test('never replays completions it did not witness running (mid-history start)', async () => {
    const { watcher, notify } = makeWatcher([
      [{ id: 'old', status: 'completed', startUrl: 'https://x.test/old' }]
    ]);
    await watcher.tick();
    await watcher.tick();
    expect(notify).not.toHaveBeenCalled();
    watcher.stop();
  });

  test('failed jobs are announced too; fetch errors are tolerated without losing state', async () => {
    const { watcher, notify } = makeWatcher([
      [{ id: 'b', status: 'running', startUrl: 'https://y.test/' }],
      new Error('server restarting'),
      [{ id: 'b', status: 'failed', startUrl: 'https://y.test/' }]
    ]);
    await watcher.tick();
    await watcher.tick(); // error tick — running-set must survive
    await watcher.tick();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].title).toBe('Crawl failed');
    watcher.stop();
  });

  test('concurrent jobs each announce once (the run-multi shape)', async () => {
    const { watcher, notify } = makeWatcher([
      [{ id: '1', status: 'running' }, { id: '2', status: 'running' }, { id: '3', status: 'running' }],
      [{ id: '1', status: 'completed' }, { id: '2', status: 'running' }, { id: '3', status: 'completed' }],
      [{ id: '1', status: 'completed' }, { id: '2', status: 'completed' }, { id: '3', status: 'completed' }]
    ]);
    await watcher.tick();
    await watcher.tick();
    expect(notify).toHaveBeenCalledTimes(2);
    await watcher.tick();
    expect(notify).toHaveBeenCalledTimes(3);
    watcher.stop();
  });

  test('a job that vanishes from the list without a terminal status is dropped silently', async () => {
    const { watcher, notify } = makeWatcher([
      [{ id: 'gone', status: 'running' }],
      []
    ]);
    await watcher.tick();
    await watcher.tick();
    expect(notify).not.toHaveBeenCalled();
    watcher.stop();
  });

  test('summarizeJob copes with sparse job objects', () => {
    expect(summarizeJob({})).toEqual({ title: 'Crawl finished', body: 'crawl job' });
    expect(summarizeJob(null).title).toBe('Crawl finished');
  });
});
