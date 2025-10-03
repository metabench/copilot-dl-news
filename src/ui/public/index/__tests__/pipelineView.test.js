/**
 * @jest-environment jsdom
 */

let createPipelineView;

beforeAll(async () => {
  ({ createPipelineView } = await import('../pipelineView.js'));
});

describe('createPipelineView', () => {
  let panel;
  let updatedEl;
  let cards;
  let elements;
  let analysisHistorySection;
  let analysisHistoryList;
  let analysisHistoryClearButton;
  let view;

  beforeEach(() => {
    panel = document.createElement('section');
    updatedEl = document.createElement('span');

    cards = {
      analysis: document.createElement('article'),
      planner: document.createElement('article'),
      execution: document.createElement('article')
    };

    elements = {
      analysis: {
        status: document.createElement('span'),
        summary: document.createElement('p'),
        lastRun: document.createElement('span'),
        signals: document.createElement('span'),
        link: document.createElement('div')
      },
      planner: {
        status: document.createElement('span'),
        summary: document.createElement('p'),
        stage: document.createElement('span'),
        goals: document.createElement('span')
      },
      execution: {
        status: document.createElement('span'),
        summary: document.createElement('p'),
        jobs: document.createElement('span'),
        queue: document.createElement('span'),
        coverage: document.createElement('span')
      }
    };

    analysisHistorySection = document.createElement('section');
    analysisHistoryList = document.createElement('ul');
    analysisHistoryClearButton = document.createElement('button');
    analysisHistorySection.appendChild(analysisHistoryList);

    view = createPipelineView({
      panel,
      updatedEl,
      cards,
      elements,
      analysisHistorySection,
      analysisHistoryList,
      analysisHistoryClearButton
    }, {
      formatNumber: (value) => `#${value}`,
      formatRelativeTime: () => 'just now'
    });
  });

  test('updatePipeline renders analysis and planner stages', () => {
    const ts = Date.now();
    view.updatePipeline({
      analysis: {
        status: 'running',
        statusLabel: 'Running',
        summary: 'Analyzing latest crawl',
        signals: ['new signals'],
        detailUrl: 'https://example.test/analysis/1',
        runId: 'run-1',
        lastRun: ts
      },
      planner: {
        status: 'ready',
        statusLabel: 'Ready',
        stage: 'expansion',
        goals: { completed: 3, total: 5 },
        goalSummary: '#3/#5 complete'
      },
      execution: {
        status: 'running',
        jobs: 2,
        queue: 15
      }
    }, { timestamp: ts });

    expect(cards.analysis.getAttribute('data-status')).toBe('running');
    expect(elements.analysis.status.textContent).toBe('Running');
    expect(elements.analysis.summary.textContent).toBe('Analyzing latest crawl');
    expect(elements.analysis.link.querySelector('a')).not.toBeNull();
    expect(elements.planner.status.textContent).toBe('Ready');
    expect(elements.planner.goals.textContent).toBe('#3/#5 complete');
    expect(elements.execution.jobs.textContent).toBe('#2');
    expect(elements.execution.queue.textContent).toBe('#15');
    expect(panel.style.display).toBe('');
    expect(updatedEl.textContent).toContain('Updated');
  });

  test('renderAnalysisHistory toggles empty state and links', () => {
    view.renderAnalysisHistory([], { detailUrl: null });
    expect(analysisHistorySection.dataset.hasEntries).toBe('0');
    expect(analysisHistoryClearButton.disabled).toBe(true);
    expect(analysisHistoryList.textContent).toContain('No analysis telemetry yet.');

    const ts = Date.now();
    view.renderAnalysisHistory([
      { ts, summary: 'completed run', status: 'completed' }
    ], { detailUrl: 'https://example.test/analysis/1' });

    expect(analysisHistorySection.dataset.hasEntries).toBe('1');
    expect(analysisHistoryClearButton.disabled).toBe(false);
    const anchor = analysisHistoryList.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.href).toContain('example.test');
  });

  test('buildAnalysisHighlights summarises coverage and problems', () => {
    const highlights = view.buildAnalysisHighlights({
      coverage: { expected: 100, seeded: 40, coveragePct: 0.5 },
      problems: [{ kind: 'timeouts', count: 2 }],
      stats: { articlesSaved: 5, articlesFound: 10 }
    });

    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights.join(' ')).toContain('coverage');
    expect(highlights.join(' ')).toContain('timeouts');
  });
});
