/**
 * @jest-environment jsdom
 */

const { renderCrawlsTable, renderCrawlsSummary } = require('../views/crawls/renderCrawlsTable');
const { createCrawlsViewModel } = require('../views/crawls/createCrawlsViewModel');

function createEventSourceStub() {
  class EventSourceStub {
    constructor() {
      this.listeners = new Map();
      EventSourceStub.instance = this;
    }

    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }

    emit(type, payload) {
      const handler = this.listeners.get(type);
      if (handler) {
        handler({ data: JSON.stringify(payload) });
      }
    }

    close() {}
  }

  return EventSourceStub;
}

describe('Crawls activation', () => {
  beforeEach(() => {
    jest.resetModules();
    const Stub = createEventSourceStub();
    global.EventSource = Stub;
    if (typeof window !== 'undefined') {
      window.EventSource = Stub;
    }
    document.body.innerHTML = '';
  });

  it('keeps summary counts in sync after activation updates', () => {
    const items = [
      {
        id: 'job-1',
        status: 'running',
        startedAt: '2025-10-10T10:00:00.000Z',
        metrics: { visited: 5, downloaded: 2, errors: 0, queueSize: 3 },
        isActive: true
      },
      {
        id: 'job-2',
        status: 'done',
        startedAt: '2025-10-09T10:00:00.000Z',
        endedAt: '2025-10-09T11:00:00.000Z',
        metrics: { visited: 10, downloaded: 8, errors: 1, queueSize: 0 },
        isActive: false
      }
    ];

    const viewModel = createCrawlsViewModel(items);
    const guidPrefix = 'test-';
    const summaryHtml = renderCrawlsSummary(viewModel.summary, guidPrefix);
    const tableHtml = renderCrawlsTable(viewModel.rows, guidPrefix);
    document.body.innerHTML = `${summaryHtml}${tableHtml}`;

    const enhancer = require('../public/js/crawls-enhancer.js');
    enhancer.scanAndActivate();

    expect(document.querySelector('[data-jsgui-id$="shown-count"]').textContent).toBe('2');
    expect(document.querySelector('[data-jsgui-id$="visited-total"]').textContent).toBe('15');
    expect(document.querySelector('[data-jsgui-id$="completed-count"]').textContent).toBe('1');

    enhancer.handleProgressEvent({
      jobId: 'job-1',
      status: 'running',
      metrics: { visited: 7, downloaded: 3, errors: 1, queueSize: 1 },
      startedAt: '2025-10-10T10:00:00.000Z'
    });

    expect(document.querySelector('[data-jsgui-id$="visited-total"]').textContent).toBe('17');
    expect(document.querySelector('[data-jsgui-id$="errors-total"]').textContent).toBe('2');

    const statusEntries = Array.from(document.querySelectorAll('[data-jsgui-role="status-item"]'))
      .map((el) => el.dataset.status);
    expect(statusEntries).toContain('running');
    expect(statusEntries).toContain('done');
  });
});
