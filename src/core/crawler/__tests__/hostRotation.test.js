const { pickRotatedHosts } = require('../hostRotation');

describe('pickRotatedHosts', () => {
  test('never-touched hosts lead; caller order breaks ties among them', () => {
    const candidates = [
      { domain: 'a.com', pending: 40, topPriority: 50 },
      { domain: 'b.com', pending: 5, topPriority: 50 },
      { domain: 'c.com', pending: 3, topPriority: 10 }
    ];
    const touched = new Map(); // nobody touched yet
    expect(pickRotatedHosts(candidates, touched, 2)).toEqual(['a.com', 'b.com']);
  });

  test('a recently-touched top host yields to untouched lower-ranked hosts', () => {
    const candidates = [
      { domain: 'a.com', pending: 40, topPriority: 50 }, // upstream winner...
      { domain: 'b.com', pending: 5, topPriority: 10 },
      { domain: 'c.com', pending: 3, topPriority: 10 }
    ];
    const touched = new Map([['a.com', Date.now()]]); // ...but just ran
    expect(pickRotatedHosts(candidates, touched, 2)).toEqual(['b.com', 'c.com']);
  });

  test('among touched hosts, least-recently-touched wins', () => {
    const now = Date.now();
    const candidates = ['a.com', 'b.com', 'c.com']; // plain-string form accepted too
    const touched = new Map([
      ['a.com', now - 1000],
      ['b.com', now - 60000],
      ['c.com', now - 30000]
    ]);
    expect(pickRotatedHosts(candidates, touched, 3)).toEqual(['b.com', 'c.com', 'a.com']);
  });

  test('bounded by maxHosts; empty/invalid input yields empty', () => {
    expect(pickRotatedHosts(['a.com', 'b.com'], new Map(), 1)).toEqual(['a.com']);
    expect(pickRotatedHosts([], new Map(), 3)).toEqual([]);
    expect(pickRotatedHosts(null, null, 3)).toEqual([]);
  });
});
