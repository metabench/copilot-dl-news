const { slugFromHubUrl, identifyAndPersistHub } = require('../hubIdentifier');

describe('slugFromHubUrl', () => {
  test('country hub', () => {
    expect(slugFromHubUrl('https://www.theguardian.com/world/zimbabwe')).toBe('zimbabwe');
  });
  test('composite hub', () => {
    expect(slugFromHubUrl('https://www.theguardian.com/world/russia-ukraine-war')).toBe('russia-ukraine-war');
  });
  test('topic hub (single segment)', () => {
    expect(slugFromHubUrl('https://www.theguardian.com/technology')).toBe('technology');
  });
  test('article path (date segment) → not a hub', () => {
    expect(slugFromHubUrl('https://www.theguardian.com/world/2026/jul/11/some-story')).toBeNull();
  });
  test('.html leaf → not a hub', () => {
    expect(slugFromHubUrl('https://x.com/section/story.html')).toBeNull();
  });
  test('root → null', () => {
    expect(slugFromHubUrl('https://x.com/')).toBeNull();
  });
});

describe('identifyAndPersistHub', () => {
  // Fake coverage adapter capturing upsertHub calls.
  function fakeAdapter() {
    const calls = [];
    return {
      _calls: calls,
      coverage: {
        upsertHub: async (data) => { calls.push(data); return 42; }
      }
    };
  }
  // Injected segmenter so the test needs no gazetteer.
  const segment = async (slug) => {
    if (slug === 'russia-ukraine-war') return { hubKind: 'composite', confidence: 1, unresolved: [], alternatives: [],
      members: [
        { memberType: 'place', placeSlug: 'russia', role: 'subject', position: 0 },
        { memberType: 'place', placeSlug: 'ukraine', role: 'counterpart', position: 1 },
        { memberType: 'topic', topicSlug: 'war', role: 'theme', position: 2 }
      ] };
    if (slug === 'zimbabwe') return { hubKind: 'place', confidence: 1, unresolved: [], alternatives: [],
      members: [{ memberType: 'place', placeSlug: 'zimbabwe', role: 'subject', position: 0 }] };
    return { hubKind: 'unknown', confidence: 0, unresolved: [slug], members: [], alternatives: [] };
  };

  test('persists a composite hub with ordered members', async () => {
    const adapter = fakeAdapter();
    const r = await identifyAndPersistHub({ host: 'www.theguardian.com', url: 'https://www.theguardian.com/world/russia-ukraine-war', adapter, segment });
    expect(r.persisted).toBe(true);
    expect(r.hubId).toBe(42);
    expect(r.hubKind).toBe('composite');
    const call = adapter._calls[0];
    expect(call.canonicalSlug).toBe('russia-ukraine-war');
    expect(call.members.map((m) => m.memberType)).toEqual(['place', 'place', 'topic']);
    expect(call.members.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  test('persists a place hub', async () => {
    const adapter = fakeAdapter();
    const r = await identifyAndPersistHub({ host: 'www.theguardian.com', url: 'https://www.theguardian.com/world/zimbabwe', adapter, segment });
    expect(r.persisted).toBe(true);
    expect(adapter._calls[0].hubKind).toBe('place');
  });

  test('skips unresolved slug without persisting', async () => {
    const adapter = fakeAdapter();
    const r = await identifyAndPersistHub({ host: 'x.com', url: 'https://x.com/section/xyzzy', adapter, segment });
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('unresolved');
    expect(adapter._calls).toHaveLength(0);
  });

  test('skips article URLs (no slug)', async () => {
    const adapter = fakeAdapter();
    const r = await identifyAndPersistHub({ host: 'x.com', url: 'https://x.com/world/2026/jul/11/story', adapter, segment });
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('no-slug');
  });
});
