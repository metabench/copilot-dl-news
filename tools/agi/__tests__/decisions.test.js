'use strict';

const path = require('path');
const {
  parseFrontMatter, normaliseDecision, readDecisions, openDecisions, blockedTechs
} = require('../decisions');

describe('parseFrontMatter', () => {
  test('reads scalars and inline lists', () => {
    const fm = parseFrontMatter([
      '---',
      'decision: DEC-X',
      'status: open',
      'question: Should we?',
      'options: [a, b, c]',
      '---',
      '# heading'
    ].join('\n'));
    expect(fm).toMatchObject({ decision: 'DEC-X', status: 'open', question: 'Should we?' });
    expect(fm.options).toEqual(['a', 'b', 'c']);
  });

  test('a prose-only document yields null, so it is ignored rather than half-read', () => {
    expect(parseFrontMatter('# just a heading\n\nsome prose')).toBeNull();
    expect(parseFrontMatter('')).toBeNull();
    expect(parseFrontMatter(null)).toBeNull();
  });

  test('tolerates CRLF, which every doc in this repo uses', () => {
    const fm = parseFrontMatter('---\r\ndecision: DEC-Y\r\nstatus: open\r\nquestion: Q?\r\n---\r\n# h');
    expect(fm).toMatchObject({ decision: 'DEC-Y', status: 'open' });
  });
});

describe('normaliseDecision', () => {
  const ok = { decision: 'DEC-A', status: 'open', question: 'Q?' };

  test('accepts a well-formed record', () => {
    expect(normaliseDecision(ok, 'f.md')).toMatchObject({ id: 'DEC-A', status: 'open', blocks: [] });
  });

  test('THROWS on a malformed declaration rather than dropping it', () => {
    // A decision that silently fails to parse is a decision the owner never
    // sees — which is the exact failure this tool exists to end.
    expect(() => normaliseDecision({ status: 'open', question: 'Q?' }, 'f.md')).toThrow(/needs a 'decision' id/);
    expect(() => normaliseDecision({ decision: 'D', question: 'Q?' }, 'f.md')).toThrow(/status must be one of/);
    expect(() => normaliseDecision({ decision: 'D', status: 'maybe', question: 'Q?' }, 'f.md')).toThrow(/status must be one of/);
    expect(() => normaliseDecision({ decision: 'D', status: 'open' }, 'f.md')).toThrow(/needs a 'question'/);
  });

  test('a single string for options/blocks is accepted as a one-item list', () => {
    const d = normaliseDecision({ ...ok, options: 'only', blocks: 'TECH-X' }, 'f.md');
    expect(d.options).toEqual(['only']);
    expect(d.blocks).toEqual(['TECH-X']);
  });
});

describe('openDecisions / blockedTechs', () => {
  const list = [
    { id: 'A', status: 'open', blocks: ['TECH-1', 'TECH-2'] },
    { id: 'B', status: 'answered', blocks: ['TECH-1'] },
    { id: 'C', status: 'open', blocks: ['TECH-2'] },
    { id: 'D', status: 'closed', blocks: [] }
  ];

  test('only open decisions count', () => {
    expect(openDecisions(list).map((d) => d.id)).toEqual(['A', 'C']);
  });

  test('an ANSWERED decision stops blocking its tech', () => {
    const m = blockedTechs(list);
    expect(m.get('TECH-1').map((d) => d.id)).toEqual(['A']); // B is answered
    expect(m.get('TECH-2').map((d) => d.id)).toEqual(['A', 'C']);
  });
});

describe('the real corpus — acceptance test against answers already known', () => {
  // c231's rule: a new instrument must reproduce answers you already have
  // before any of its findings are trusted.
  const all = readDecisions();

  test('every decision doc with front-matter parses without throwing', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  test('the four decisions reported open in cycle 235 are STILL open', () => {
    // CONTAINMENT, not equality. This was an exact-set assertion until
    // 2026-08-11, when raising DEC-ENGINE-BOUNDARY turned it red — the system
    // working exactly as designed (a measurement produced a question, the
    // scaffold recorded it) failing a test that had frozen the answer.
    //
    // What this test is actually for is that none of the four the owner was
    // told about in c235 quietly DISAPPEARS. New decisions arriving is not a
    // regression; a `--new` scaffold exists to cause it. Every open decision is
    // still held to being well-formed by the test below.
    const ids = openDecisions(all).map((d) => d.id);
    for (const id of ['DEC-ARTICLECOMPRESSION', 'DEC-ORPHANED-CONTENT',
      'DEC-PENDING-MIGRATIONS', 'DEC-URLS-WRITERS']) {
      expect(ids).toContain(id);
    }
  });

  test('decisions the owner already answered are NOT offered again', () => {
    const open = openDecisions(all).map((d) => d.id);
    expect(open).not.toContain('DEC-UI-DEBT-METRIC');    // answered + shipped c235
    expect(open).not.toContain('DEC-TIMESTAMP-STORAGE'); // approved c223, executed c224
    expect(open).not.toContain('DEC-DEDUP-SCORING');     // dissolved c235
  });

  test('every open decision carries options and a doc path the owner can read', () => {
    for (const d of openDecisions(all)) {
      expect(d.options.length).toBeGreaterThan(0);
      expect(d.doc).toMatch(/^docs\/decisions\/.+\.md$/);
    }
  });
});
