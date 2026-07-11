const { segmentSlug } = require('../slugSegmenter');

// In-memory lexicon mirroring what the DB-backed one provides. Place names
// include a multi-word entry (new caledonia) and abbreviations (us).
const PLACES = new Map([
  ['russia', 'russia'], ['ukraine', 'ukraine'], ['israel', 'israel'], ['gaza', 'gaza'],
  ['china', 'china'], ['zimbabwe', 'zimbabwe'], ['united states', 'united-states'],
  ['us', 'united-states'], ['new caledonia', 'new-caledonia'], ['new-caledonia', 'new-caledonia'],
]);
const TOPICS = new Map([
  ['war', 'war'], ['trade', 'trade'], ['technology', 'technology'], ['football', 'football'],
]);
const lexicon = {
  matchPlace: (phrase) => PLACES.has(phrase) ? { slug: PLACES.get(phrase) } : null,
  matchTopic: (phrase) => TOPICS.has(phrase) ? { slug: TOPICS.get(phrase) } : null,
};

const kinds = (r) => r.members.map((m) => `${m.memberType}:${m.placeSlug || m.topicSlug}`);

describe('slugSegmenter', () => {
  test('single place hub', () => {
    const r = segmentSlug('zimbabwe', lexicon);
    expect(r.hubKind).toBe('place');
    expect(kinds(r)).toEqual(['place:zimbabwe']);
    expect(r.members[0].role).toBe('subject');
  });

  test('single topic hub', () => {
    const r = segmentSlug('technology', lexicon);
    expect(r.hubKind).toBe('topic');
    expect(kinds(r)).toEqual(['topic:technology']);
  });

  test('COMPOSITE russia-ukraine-war → [place:russia, place:ukraine, topic:war]', () => {
    const r = segmentSlug('russia-ukraine-war', lexicon);
    expect(r.hubKind).toBe('composite');
    expect(kinds(r)).toEqual(['place:russia', 'place:ukraine', 'topic:war']);
    expect(r.members.map((m) => m.role)).toEqual(['subject', 'counterpart', 'theme']);
    expect(r.members.map((m) => m.position)).toEqual([0, 1, 2]);
    expect(r.unresolved).toEqual([]);
  });

  test('COMPOSITE israel-gaza-war', () => {
    const r = segmentSlug('israel-gaza-war', lexicon);
    expect(r.hubKind).toBe('composite');
    expect(kinds(r)).toEqual(['place:israel', 'place:gaza', 'topic:war']);
  });

  test('COMPOSITE us-china-trade (abbreviation + topic)', () => {
    const r = segmentSlug('us-china-trade', lexicon);
    expect(r.hubKind).toBe('composite');
    expect(kinds(r)).toEqual(['place:united-states', 'place:china', 'topic:trade']);
  });

  test('new-caledonia parses as ONE place (longest-match beats new+caledonia)', () => {
    const r = segmentSlug('new-caledonia', lexicon);
    expect(r.hubKind).toBe('place');
    expect(kinds(r)).toEqual(['place:new-caledonia']);
    expect(r.members).toHaveLength(1);
  });

  test('unresolved tokens are reported and lower confidence, not fatal', () => {
    const r = segmentSlug('russia-blahblah-war', lexicon);
    expect(r.unresolved).toEqual(['blahblah']);
    expect(kinds(r)).toEqual(['place:russia', 'topic:war']);
    expect(r.confidence).toBeLessThan(1);
    expect(r.confidence).toBeGreaterThan(0);
  });

  test('empty / unknown slug', () => {
    expect(segmentSlug('', lexicon).hubKind).toBe('unknown');
    expect(segmentSlug('xyzzy', lexicon).hubKind).toBe('unknown');
    expect(segmentSlug('xyzzy', lexicon).unresolved).toEqual(['xyzzy']);
  });

  test('multi-word place inside a composite (new-caledonia-football)', () => {
    const r = segmentSlug('new-caledonia-football', lexicon);
    expect(kinds(r)).toEqual(['place:new-caledonia', 'topic:football']);
    expect(r.hubKind).toBe('composite');
  });

  test('full confidence when every token resolves', () => {
    expect(segmentSlug('russia-ukraine-war', lexicon).confidence).toBe(1);
  });
});
