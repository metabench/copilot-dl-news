const { waitForEvidenceSettle } = require('../sample-db-signals');

const noSleep = () => Promise.resolve();

function seq(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('waitForEvidenceSettle (c15 late-writer guard)', () => {
  test('settles when two consecutive readings match', async () => {
    const r = await waitForEvidenceSettle('x.db', { readCounts: seq(['5/0/0', '7/1/0', '7/1/0']), sleep: noSleep });
    expect(r.settled).toBe(true);
    expect(r.polls).toBe(3);
    expect(r.last).toBe('7/1/0');
  });

  test('reports unsettled when counts keep moving past tries', async () => {
    const r = await waitForEvidenceSettle('x.db', { readCounts: seq(['1', '2', '3', '4', '5']), tries: 5, sleep: noSleep });
    expect(r.settled).toBe(false);
    expect(r.polls).toBe(5);
  });

  test('stable-from-the-start settles on the second poll', async () => {
    const r = await waitForEvidenceSettle('x.db', { readCounts: () => '9/9/9', sleep: noSleep });
    expect(r.settled).toBe(true);
    expect(r.polls).toBe(2);
  });

  test('read errors never throw; distinct error readings do not fake a settle', async () => {
    const boom = () => { throw new Error('locked'); };
    const r = await waitForEvidenceSettle('x.db', { readCounts: boom, tries: 3, sleep: noSleep });
    expect(r.settled).toBe(false); // err:1, err:2, err:3 — all distinct by design
  });
});
