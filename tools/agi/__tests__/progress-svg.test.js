'use strict';

const { parseCycleStanzas, computeSeries, renderSvg } = require('../progress-svg');

const FIXTURE = [
  'row text | -->',
  '<!-- cycle:{"id":10,"date":"2026-07-01","verified_improvements":1,"defects":[{"caught_by":"a","preship":true}],"pages_crawled":100} -->',
  'more prose',
  '<!-- cycle:{"id":11,"date":"2026-07-02","verified_improvements":0,"defects":[{"caught_by":"b","preship":true},{"caught_by":"c","preship":false}],"pages_crawled":0,"retracts":{"cycle":10,"claim":"x"}} -->',
  '<!-- cycle:{THIS IS NOT JSON} -->',
  'prose that NAMES the convention: emit a <!-- cycle:{...} --> stanza per row',
  '<!-- cycle:{"id":12,"date":"2026-07-03","verified_improvements":2,"pages_crawled":50} -->'
].join('\n');

describe('progress-svg', () => {
  it('parses stanzas, skips malformed ones, sorts by id', () => {
    const { cycles, skipped } = parseCycleStanzas(FIXTURE);
    expect(cycles.map((c) => c.id)).toEqual([10, 11, 12]);
    // truly broken JSON counts as skipped; the documentation PLACEHOLDER does not
    expect(skipped).toBe(1);
  });

  it('computes cumulative improvements and pre/post defect splits', () => {
    const { cycles } = parseCycleStanzas(FIXTURE);
    const { rows, totals } = computeSeries(cycles);
    expect(rows.map((r) => r.cum)).toEqual([1, 1, 3]);
    expect(rows[1].pre).toBe(1);
    expect(rows[1].post).toBe(1);
    // a stanza with a `retracts` field is a correction event — shown, not hidden
    expect(rows[1].correction).toBe(true);
    expect(totals).toMatchObject({ cycles: 3, improvements: 3, defectsPre: 2, defectsPost: 1, corrections: 1, pages: 150 });
    expect(totals.maxDate).toBe('2026-07-03');
  });

  it('renders a well-formed SVG with no NaN coordinates', () => {
    const series = computeSeries(parseCycleStanzas(FIXTURE).cycles);
    const svg = renderSvg(series, [{ cycle: 11, label: 'test note' }]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('Verified improvements');
    expect(svg).toContain('test note');            // annotation drawn
    expect(svg).toContain('correction/retraction'); // marker title present
  });

  it('chart A runs on a true calendar-day axis, and both axes NAME their units', () => {
    const series = computeSeries(parseCycleStanzas(FIXTURE).cycles);
    const svg = renderSvg(series, []);
    // fixture dates 07-01..07-03 become uniform day bands with date labels
    expect(svg).toContain('calendar days');
    expect(svg).toContain('>07-01<');
    expect(svg).toContain('>07-03<');
    expect(svg).toContain('cycle sequence'); // chart B says what its axis is
  });

  it('an idle day occupies real width — the flat the time axis exists to show', () => {
    // cycles on 07-01 and 07-05 with NOTHING between: days 02-04 must still be
    // enumerated (uniform time), so the cumulative line crosses them flat
    const gapped = [
      '<!-- cycle:{"id":1,"date":"2026-07-01","verified_improvements":2} -->',
      '<!-- cycle:{"id":2,"date":"2026-07-05","verified_improvements":1} -->'
    ].join('\n');
    const svg = renderSvg(computeSeries(parseCycleStanzas(gapped).cycles), []);
    for (const d of ['>07-01<', '>07-02<', '>07-03<', '>07-04<', '>07-05<']) expect(svg).toContain(d);
    expect(svg).not.toContain('NaN');
  });

  it('handles an empty ledger without throwing', () => {
    const series = computeSeries([]);
    const svg = renderSvg(series, []);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('NaN');
  });

  it('escapes annotation labels (untrusted text cannot break markup)', () => {
    const series = computeSeries(parseCycleStanzas(FIXTURE).cycles);
    const svg = renderSvg(series, [{ cycle: 12, label: '<script>"x"&</script>' }]);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders repo lanes from an activity snapshot; no snapshot = pre-lanes layout', () => {
    const series = computeSeries(parseCycleStanzas(FIXTURE).cycles);
    const activity = {
      window: { from: '2026-07-01', to: '2026-07-03' },
      repos: [
        { name: 'copilot-dl-news', status: 'in', days: [['2026-07-01', 3], ['2026-07-03', 1]], total: 4 },
        { name: 'news-crawler-itself', status: 'in', note: 'no .git', days: [], total: 0 },
        { name: 'jsgui3-html', status: 'consume-only', days: [['2026-07-02', 1]], total: 1 }
      ],
      hiddenZeroConsumeOnly: ['jsgui3-client']
    };
    const withLanes = renderSvg(series, [], activity);
    expect(withLanes).toContain('Repo activity');
    expect(withLanes).toContain('copilot-dl-news · 2026-07-01 · 3 commits');
    // the unversioned repo is a loud warning lane, not a silent omission
    expect(withLanes).toContain('no .git — not in the record');
    expect(withLanes).toContain('1 zero-activity consume-only repo(s) not shown');
    expect(withLanes).not.toContain('NaN');

    const without = renderSvg(series, [], null);
    expect(without).not.toContain('Repo activity');
    expect(without).toContain('height="664"');       // base layout unchanged
    expect(withLanes).not.toContain('height="664"'); // lanes extend the canvas
  });
});
