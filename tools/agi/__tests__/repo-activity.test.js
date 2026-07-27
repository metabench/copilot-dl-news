'use strict';

const { windowFromCycles, bucketDates } = require('../repo-activity');

describe('repo-activity pure parts', () => {
  it('windowFromCycles spans min..max stanza date, ignoring malformed dates', () => {
    expect(windowFromCycles([
      { id: 2, date: '2026-07-22' }, { id: 1, date: '2026-07-19' },
      { id: 3, date: 'not-a-date' }, { id: 4 }, { id: 5, date: '2026-07-27' }
    ])).toEqual({ from: '2026-07-19', to: '2026-07-27' });
  });

  it('windowFromCycles returns null with no usable dates', () => {
    expect(windowFromCycles([])).toBeNull();
    expect(windowFromCycles([{ id: 1 }, { id: 2, date: 'garbage' }])).toBeNull();
  });

  it('bucketDates counts per day, sorted, rejecting non-date lines', () => {
    expect(bucketDates(['2026-07-27', '2026-07-25', '2026-07-27', '', 'fatal: x', '2026-07-27']))
      .toEqual([['2026-07-25', 1], ['2026-07-27', 3]]);
  });
});
