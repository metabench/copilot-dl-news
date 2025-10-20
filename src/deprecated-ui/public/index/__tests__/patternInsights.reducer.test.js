/**
 * @jest-environment jsdom
 */

let createStore;
let registerReducers;
let initialState;

beforeAll(async () => {
  ({ createStore } = await import('../state/store.js'));
  ({ registerReducers } = await import('../state/reducers.js'));
  ({ initialState } = await import('../state/initialState.js'));
});

describe('pattern insights reducer', () => {
  let store;

  beforeEach(() => {
    store = createStore(initialState);
    registerReducers(store);
    store.dispatch('patterns/reset');
  });

  const getSummary = () => store.getState().patternInsights.summary;
  const getLog = () => store.getState().patternInsights.log;

  test('reset returns empty summary and log', () => {
    const summary = getSummary();
    expect(summary.totalEvents).toBe(0);
    expect(summary.uniqueSections).toBe(0);
    expect(summary.uniqueHints).toBe(0);
    expect(getLog()).toHaveLength(0);
  });

  test('milestone event updates summary and log', () => {
    const timestamp = Date.now();
    store.dispatch('patterns/addEvent', {
      source: 'milestone',
      stage: 'patterns-learned',
      timestamp,
      sections: ['world', 'sport'],
      articleHints: ['date-path'],
      homepageSource: 'network',
      summary: 'sections 2 · hints 1'
    });

    const summary = getSummary();
    expect(summary.totalEvents).toBe(1);
    expect(summary.uniqueSections).toBe(2);
    expect(summary.uniqueHints).toBe(1);
    expect(summary.lastHomepageSource).toBe('network');
    expect(summary.topHints[0]).toMatchObject({ label: 'date-path', count: 1 });
    expect(summary.topSections.map((item) => item.label)).toEqual(expect.arrayContaining(['world', 'sport']));

    const [entry] = getLog();
    expect(entry.stage).toBe('patterns-learned');
    expect(entry.sections).toEqual(['world', 'sport']);
    expect(entry.articleHints).toEqual(['date-path']);
    expect(entry.sectionCount).toBe(2);
  });

  test('stage events accumulate counts and trim log', () => {
    const baseTs = Date.now();
    for (let i = 0; i < 45; i += 1) {
      store.dispatch('patterns/addEvent', {
        source: 'stage',
        stage: 'infer-patterns',
        status: i % 2 === 0 ? 'started' : 'completed',
        timestamp: baseTs + i * 1000,
        sections: ['world', 'culture'],
        articleHints: i % 3 === 0 ? ['keywords'] : [],
        homepageSource: i % 4 === 0 ? 'cache' : 'network'
      });
    }

    const summary = getSummary();
    expect(summary.totalEvents).toBe(45);
  expect(summary.uniqueSections).toBe(2);
  const topLabels = summary.topSections.map((item) => item.label);
  expect(topLabels).toEqual(expect.arrayContaining(['world', 'culture']));
    expect(summary.homepageSourceCounts.network).toBeGreaterThan(0);
    expect(summary.homepageSourceCounts.cache).toBeGreaterThan(0);

    const log = getLog();
    expect(log).toHaveLength(40);
    expect(log[0].stage).toBe('infer-patterns');
    expect(log[0].sections).toEqual(['world', 'culture']);
  });
});
