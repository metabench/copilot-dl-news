'use strict';

const ActivityHeadlinesControl = require('../ActivityHeadlinesControl');
const jsgui = require('jsgui3-html');

const MODEL = {
  source: 'remote',
  capabilities: { throughput: true, hostHealth: 'domain-state', headlines: false },
  throughput: { activeCount: 3, formatted: { downloaded: '1.25', saved: '0.80', network: '0.42', stored: '0.00', queue: '17' } },
  hostHealth: { badges: [] },
  headlines: { items: [], supported: false, note: 'remote spool has no analysed headlines; local news.db is the source of record' }
};

describe('ActivityHeadlinesControl (D4 slice 2b)', () => {
  it('renders the activity line from the normalized model', () => {
    const html = ActivityHeadlinesControl.renderHtml(MODEL);
    expect(html).toContain('remote');
    expect(html).toContain('3 active job(s)');
    expect(html).toContain('1.25/s docs');
    expect(html).toContain('0.42 MB/s');
  });

  it('renders the HONEST note when headlines are unsupported (the remote case)', () => {
    const html = ActivityHeadlinesControl.renderHtml(MODEL);
    expect(html).toContain('remote spool has no analysed headlines');
    expect(html).not.toContain('cdh-row');
  });

  it('escapes headline titles — the cycle-72 stored-XSS contract, proven inert', () => {
    const hostile = {
      ...MODEL,
      headlines: { supported: true, items: [{ title: '<script>alert(1)</script>', host: 'evil.com', when: 'now<b>' }] }
    };
    const html = ActivityHeadlinesControl.renderHtml(hostile);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('now<b>');
  });

  it('renders headline rows with meta when supported', () => {
    const withItems = {
      ...MODEL,
      source: 'local',
      headlines: { supported: true, items: [{ title: 'Real headline', host: 'bbc', when: '2h ago' }, { title: 'Second' }] }
    };
    const html = ActivityHeadlinesControl.renderHtml(withItems);
    expect(html).toContain('Real headline');
    expect(html).toContain('bbc · 2h ago');
    expect((html.match(/cdh-row/g) || []).length).toBe(2);
  });

  it('is safe on an empty/absent model', () => {
    expect(() => ActivityHeadlinesControl.renderHtml(null)).not.toThrow();
    const html = ActivityHeadlinesControl.renderHtml({});
    expect(html).toContain('unknown source');
    expect(html).not.toContain('undefined');
  });

  it('SSR-composes as a jsgui control (parity with its siblings)', () => {
    const ctx = new jsgui.Page_Context();
    const ctrl = new ActivityHeadlinesControl({ context: ctx, model: MODEL });
    const html = ctrl.all_html_render();
    expect(html).toContain('crawl-dash-activity-headlines');
    expect(html).toContain('3 active job(s)');
  });
});
