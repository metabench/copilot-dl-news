const NewsCrawler = require('../crawl');

describe('NewsCrawler discover-structure mode', () => {
  test('drops article enqueues while allowing navigation work', () => {
    const crawler = new NewsCrawler('https://example.com', { crawlType: 'discover-structure' });

    expect(crawler.structureOnly).toBe(true);
    expect(crawler.plannerEnabled).toBe(true);
    expect(crawler.concurrency).toBe(4);
    expect(crawler.usePriorityQueue).toBe(true);

    const enqueue = jest.fn(() => true);
    const queueEventSpy = jest.spyOn(crawler.telemetry, 'queueEvent');
    crawler.queue = { enqueue };

    const articleDropped = crawler.enqueueRequest({
      url: 'https://example.com/a-story',
      depth: 1,
      type: 'article'
    });
    expect(articleDropped).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(queueEventSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'drop',
      reason: 'structure-skip',
      url: 'https://example.com/a-story'
    }));
    expect(crawler.state.structure.articleCandidatesSkipped).toBe(1);

    enqueue.mockClear();
    const navAllowed = crawler.enqueueRequest({
      url: 'https://example.com/section',
      depth: 1,
      type: 'nav'
    });
    expect(navAllowed).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(crawler.state.structure.articleCandidatesSkipped).toBe(1);

    enqueue.mockClear();
    const articleObjectDropped = crawler.enqueueRequest({
      url: 'https://example.com/another-story',
      depth: 2,
      type: { kind: 'article', reason: 'seed' }
    });
    expect(articleObjectDropped).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(crawler.state.structure.articleCandidatesSkipped).toBe(2);

    queueEventSpy.mockRestore();

    crawler.state.incrementStructureNavPages();
    crawler.state.recordStructureArticleLinks([{ url: 'https://example.com/world/foo' }]);
    const progressSpy = jest.spyOn(crawler.telemetry, 'progress').mockImplementation(() => {});
    crawler.emitProgress(false);
    expect(progressSpy).toHaveBeenCalledWith(expect.objectContaining({
      force: false,
      patch: {
        structure: expect.objectContaining({
          navPagesVisited: 1,
          articleCandidatesSkipped: 2,
          topSections: expect.any(Array)
        })
      }
    }));
    progressSpy.mockRestore();
  });
});
