'use strict';

const { assertAppendable, appendRecord } = require('../close-cycle');

const LEDGER = [
  '| 2026-08-06 | a row |',
  '<!-- cycle:{"id":10,"date":"2026-08-06"} -->',
  '| 2026-08-07 | another row |',
  '<!-- cycle:{"id":11,"date":"2026-08-07"} -->',
  ''
].join('\n');

describe('assertAppendable — the checks the hand-written scripts re-derived each cycle', () => {
  test('accepts the next id in sequence', () => {
    expect(assertAppendable(LEDGER, { id: 12, date: '2026-08-07' })).toBe(true);
  });

  test('refuses a duplicate id', () => {
    expect(() => assertAppendable(LEDGER, { id: 11, date: '2026-08-07' }))
      .toThrow(/already in the ledger/);
  });

  test('refuses to append into a gap — the wrong-tail mistake', () => {
    expect(() => assertAppendable(LEDGER, { id: 20, date: '2026-08-07' }))
      .toThrow(/is not in the ledger — refusing to append/);
  });

  test('refuses a malformed id or date', () => {
    expect(() => assertAppendable(LEDGER, { id: 'twelve', date: '2026-08-07' })).toThrow(/positive integer/);
    expect(() => assertAppendable(LEDGER, { id: 12 })).toThrow(/YYYY-MM-DD/);
    expect(() => assertAppendable(LEDGER, { id: 12, date: '7 Aug' })).toThrow(/YYYY-MM-DD/);
  });

  test('refuses a non-object stanza', () => {
    expect(() => assertAppendable(LEDGER, null)).toThrow(/must be an object/);
  });
});

describe('appendRecord', () => {
  const row = `| 2026-08-07 | ${'x'.repeat(300)} |`;

  test('appends the row and a machine stanza', () => {
    const { text } = appendRecord(LEDGER, row, { id: 12, date: '2026-08-07' });
    expect(text).toContain('<!-- cycle:{"id":12,"date":"2026-08-07"} -->');
    expect(text.indexOf(row)).toBeLessThan(text.indexOf('"id":12'));
  });

  test('PRESERVES CRLF — every record file in this repo uses it', () => {
    const crlf = LEDGER.replace(/\n/g, '\r\n');
    const { text } = appendRecord(crlf, row, { id: 12, date: '2026-08-07' });
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
  });

  test('rejects a row that is not a markdown table row', () => {
    expect(() => appendRecord(LEDGER, 'just some prose', { id: 12, date: '2026-08-07' }))
      .toThrow(/must be a markdown table row/);
  });

  test('rejects a suspiciously small append', () => {
    // A one-line row is not a cycle record; the hand-written scripts all
    // carried this check because a truncated write is silent otherwise.
    expect(() => appendRecord(LEDGER, '| short |', { id: 12, date: '2026-08-07' }))
      .toThrow(/not a cycle record/);
  });

  test('does not mutate the input text', () => {
    const copy = String(LEDGER);
    appendRecord(LEDGER, row, { id: 12, date: '2026-08-07' });
    expect(LEDGER).toBe(copy);
  });
});
