/**
 * @jest-environment node
 */

const { streamQueuesListPage } = require('../views/queuesListPage');
const { createQueuesViewModel } = require('../views/queues/createQueuesViewModel');

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

describe('streamQueuesListPage', () => {
  it('streams queue rows in batches', () => {
    const rows = [
      { id: 'queue-1', status: 'running', startedAt: '2025-10-10T08:00:00.000Z', events: 2, pid: 123 },
      { id: 'queue-2', status: 'done', startedAt: '2025-10-09T08:00:00.000Z', endedAt: '2025-10-09T09:00:00.000Z', events: 5, pid: '' }
    ];

    const viewModel = createQueuesViewModel(rows);
    const res = createResponseCollector();
    streamQueuesListPage({
      res,
      renderNav: () => '<nav>nav</nav>',
      viewModel,
      chunkSize: 1
    });

    const html = res.chunks.join('');
    expect(html).toContain('queues-table');
    expect((html.match(/data-job-id=/g) || []).length).toBe(2);
    expect(html).toContain('<nav>nav</nav>');
    expect(html).toContain('Queues');
  });
});
