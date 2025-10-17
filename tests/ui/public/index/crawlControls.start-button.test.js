/** @jest-environment jsdom */

import { createCrawlControls } from '../../../../src/ui/public/index/crawlControls.js';

describe('createCrawlControls start button integration', () => {
  const noop = () => {};
  let originalSetTimeout;
  let originalFetch;
  let originalWindowFetch;

  beforeEach(() => {
  originalSetTimeout = global.setTimeout;
  originalFetch = global.fetch;
  originalWindowFetch = window.fetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ jobId: 'job-42' })
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    window.__crawlProgress = {
      handleCrawlStart: jest.fn()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.setTimeout = originalSetTimeout;
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }

    if (originalWindowFetch) {
      window.fetch = originalWindowFetch;
    } else {
      delete window.fetch;
    }
    delete window.__crawlProgress;
  });

  function buildControls() {
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start crawl';

    const makeInput = (value = '') => {
      const el = document.createElement('input');
      el.value = value;
      return el;
    };

    const makeCheckbox = (checked = false) => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = checked;
      return el;
    };

    const elements = {
      startBtn,
      stopBtn: document.createElement('button'),
      pauseBtn: document.createElement('button'),
      resumeBtn: document.createElement('button'),
      analysisBtn: document.createElement('button'),
      analysisLink: document.createElement('a'),
      analysisStatus: document.createElement('div'),
      logs: document.createElement('pre'),
      progress: document.createElement('div')
    };

    const formElements = {
      crawlType: makeInput('news'),
      depth: makeInput('1'),
      maxPages: makeInput(''),
      concurrency: makeInput('2'),
      requestTimeoutMs: makeInput(''),
      pacerJitterMinMs: makeInput(''),
      pacerJitterMaxMs: makeInput(''),
      refetchIfOlderThan: makeInput(''),
      refetchArticleIfOlderThan: makeInput(''),
      refetchHubIfOlderThan: makeInput(''),
      slowMode: makeCheckbox(false),
      sitemapOnly: makeCheckbox(false),
      useSitemap: makeCheckbox(false),
      startUrl: makeInput('https://example.com/news')
    };

    const actions = {
      resetInsights: jest.fn(),
      setCrawlType: jest.fn(),
      renderAnalysisLink: jest.fn(),
      renderAnalysisStatus: jest.fn(),
      patchPipeline: jest.fn(),
      updateStartupStatus: jest.fn()
    };

    const formatters = {
      formatRelativeTime: jest.fn(() => 'just now')
    };

    return { elements, formElements, actions, formatters };
  }

  it('attaches a start handler that triggers a crawl request', async () => {
    const { elements, formElements, actions, formatters } = buildControls();

    const result = createCrawlControls({ elements, formElements, actions, formatters });

    expect(result).toMatchObject({ initialized: true });
    expect(typeof elements.startBtn.onclick).toBe('function');

    elements.startBtn.onclick();

    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  window.__startPollUntil = Date.now() - 1;

    expect(actions.resetInsights).toHaveBeenCalledTimes(1);
    expect(actions.setCrawlType).toHaveBeenCalledWith('news');

  expect(console.error).not.toHaveBeenCalled();

    expect(global.fetch).toHaveBeenCalled();
    const [firstUrl, firstOptions] = global.fetch.mock.calls[0];
    expect(firstUrl).toBe('/api/crawl');
    expect(firstOptions).toEqual(expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }));

    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sentBody).toMatchObject({
      crawlType: 'news',
      startUrl: 'https://example.com/news'
    });

    expect(elements.startBtn.disabled).toBe(true);
    expect(elements.startBtn.textContent).toBe('Running');
    expect(window.__crawlProgress.handleCrawlStart).toHaveBeenCalledWith(
      expect.objectContaining({ crawlType: 'news' })
    );
  });

  it('returns a callable analysis handler so regressions surface quickly', () => {
    const { elements, formElements, actions, formatters } = buildControls();
    elements.analysisBtn.textContent = 'Run analysis';

    const { initialized } = createCrawlControls({ elements, formElements, actions, formatters });
    expect(initialized).toBe(true);
    expect(typeof elements.analysisBtn.onclick).toBe('function');

    const response = {
      ok: true,
      status: 200,
      json: async () => ({ runId: 'abc123', detailUrl: '/analysis/abc123/ssr' })
    };

    global.fetch.mockResolvedValueOnce(response);

    const clickPromise = elements.analysisBtn.onclick();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/analysis/start',
      expect.objectContaining({ method: 'POST' })
    );

    return clickPromise;
  });
});
