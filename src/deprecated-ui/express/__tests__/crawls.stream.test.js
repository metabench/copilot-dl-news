/**
 * @jest-environment node
 */

const { streamCrawlsListPage } = require('../views/crawlsListPage');
const { createCrawlsViewModel } = require('../views/crawls/createCrawlsViewModel');

function createResponseCollector() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(chunk);
    },
    end(chunk) {
      if (chunk) chunks.push(chunk);
    }
  };
}

describe('streamCrawlsListPage', () => {
  it('streams crawls rows in chunks', () => {
    const items = Array.from({ length: 3 }, (_, idx) => ({
      id: `job-${idx + 1}`,
      status: idx === 0 ? 'running' : 'done',
      startedAt: '2025-10-10T10:00:00.000Z',
      endedAt: idx ? '2025-10-10T11:00:00.000Z' : null,
      metrics: { visited: idx + 1, downloaded: idx, errors: 0, queueSize: 0 },
      isActive: idx === 0
    }));

    const viewModel = createCrawlsViewModel(items);
    const res = createResponseCollector();
    streamCrawlsListPage({
      res,
      renderNav: () => '<nav>nav</nav>',
      viewModel,
      chunkSize: 1
    });

    const html = res.chunks.join('');
    expect(html).toContain('crawls-table');
    expect((html.match(/data-crawl-id=/g) || []).length).toBe(3);
    expect(html).toContain('<nav>nav</nav>');
    expect(html).toContain('Crawls');
  });
});
