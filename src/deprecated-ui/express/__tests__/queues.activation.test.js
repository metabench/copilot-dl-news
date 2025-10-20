/**
 * @jest-environment jsdom
 */

const { renderQueuesTable, renderQueuesSummary } = require('../views/queues/renderQueuesTable');
const { createQueuesViewModel } = require('../views/queues/createQueuesViewModel');

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

describe('Queues activation', () => {
  beforeEach(() => {
    jest.resetModules();
    const Stub = createEventSourceStub();
    global.EventSource = Stub;
    if (typeof window !== 'undefined') {
      window.EventSource = Stub;
    }
    document.body.innerHTML = '';
  });

  it('updates summary counters after activation events', () => {
    const rows = [
      {
        id: 'queue-1',
        status: 'running',
        startedAt: '2025-10-10T08:00:00.000Z',
        events: 3,
        pid: 321
      },
      {
        id: 'queue-2',
        status: 'done',
        startedAt: '2025-10-09T07:00:00.000Z',
        endedAt: '2025-10-09T07:05:00.000Z',
        events: 6,
        pid: ''
      }
    ];

    const viewModel = createQueuesViewModel(rows);
    const guidPrefix = 'test-';
    const summaryHtml = renderQueuesSummary(viewModel.summary, guidPrefix);
    const tableHtml = renderQueuesTable(viewModel.rows, guidPrefix);
    document.body.innerHTML = `${summaryHtml}${tableHtml}`;

    const enhancer = require('../public/js/queues-enhancer.js');
    enhancer.scanAndActivate();

    expect(document.querySelector('[data-jsgui-id$="shown-count"]').textContent).toBe('2');
    expect(document.querySelector('[data-jsgui-id$="total-events"]').textContent).toBe('9');
    expect(document.querySelector('[data-jsgui-id$="active-pids"]').textContent).toBe('1');

    enhancer.handleQueueEvent({
      jobId: 'queue-1',
      status: 'done',
      events: 5,
      pid: 654,
      endedAt: '2025-10-10T08:05:00.000Z'
    });

    expect(document.querySelector('[data-jsgui-id$="total-events"]').textContent).toBe('11');
    expect(document.querySelector('[data-jsgui-id$="active-pids"]').textContent).toBe('1');

    const statusEntries = Array.from(document.querySelectorAll('[data-jsgui-role="status-item"]'))
      .map((el) => el.dataset.status);
    expect(statusEntries).toContain('done');
  });
});
