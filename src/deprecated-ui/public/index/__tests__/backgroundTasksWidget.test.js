/**
 * @jest-environment jsdom
 */

let createBackgroundTasksWidget;

describe('backgroundTasksWidget.connectSSE', () => {
  let widgetSection;
  let tasksList;

  beforeEach(() => {
    widgetSection = document.createElement('section');
    tasksList = document.createElement('div');
  });

  beforeAll(async () => {
    ({ createBackgroundTasksWidget } = await import('../backgroundTasksWidget.js'));
  });

  function createEventSourceMock() {
    const handlers = new Map();
    return {
      handlers,
      addEventListener: jest.fn((type, handler) => {
        handlers.set(type, handler);
      }),
      removeEventListener: jest.fn((type) => {
        handlers.delete(type);
      })
    };
  }

  it('binds listeners and removes them when switching sources', () => {
    const widget = createBackgroundTasksWidget({ widgetSection, tasksList });

    const firstSource = createEventSourceMock();
    widget.connectSSE(firstSource);

    expect(firstSource.addEventListener).toHaveBeenCalledTimes(4);

    const secondSource = createEventSourceMock();
    widget.connectSSE(secondSource);

    expect(firstSource.removeEventListener).toHaveBeenCalledTimes(4);
    expect(secondSource.addEventListener).toHaveBeenCalledTimes(4);
  });

  it('falls back to on/off style emitters', () => {
    const widget = createBackgroundTasksWidget({ widgetSection, tasksList });

    const handlers = {};
    const source = {
      on: jest.fn((type, handler) => {
        handlers[type] = handler;
      }),
      off: jest.fn((type) => {
        delete handlers[type];
      })
    };

    widget.connectSSE(source);

    expect(source.on).toHaveBeenCalledWith('task-created', expect.any(Function));
    expect(typeof handlers['task-progress']).toBe('function');

    handlers['task-progress']({
      data: JSON.stringify({
        id: 'task-1',
        task_type: 'analysis',
        status: 'running',
        progress_current: 1,
        progress_total: 4
      })
    });

    expect(tasksList.innerHTML).toContain('analysis');
  });

  it('gracefully ignores sources without listener APIs', () => {
    const widget = createBackgroundTasksWidget({ widgetSection, tasksList });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => widget.connectSSE({})).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Provided event source'));

    warnSpy.mockRestore();
  });
});
