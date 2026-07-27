'use strict';

const { parseCycleStanzas, computeSeries, renderSvg } = require('../progress-svg');

const FIXTURE = [
  'row text | -->',
  '<!-- cycle:{"id":10,"date":"2026-07-01","verified_improvements":1,"defects":[{"caught_by":"a","preship":true}],"pages_crawled":100} -->',
  'more prose',
  '<!-- cycle:{"id":11,"date":"2026-07-02","verified_improvements":0,"defects":[{"caught_by":"b","preship":true},{"caught_by":"c","preship":false}],"pages_crawled":0,"retracts":{"cycle":10,"claim":"x"}} -->',
  '<!-- cycle:{THIS IS NOT JSON} -->',
  '<!-- cycle:{"id":12,"date":"2026-07-03","verified_improvements":2,"pages_crawled":50} -->'
].join('\n');

describe('progress-svg', () => {
  it('parses stanzas, skips malformed ones, sorts by id', () => {
    const { cycles, skipped } = parseCycleStanzas(FIXTURE);
    expect(cycles.map((c) => c.id)).toEqual([10, 11, 12]);
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
});
