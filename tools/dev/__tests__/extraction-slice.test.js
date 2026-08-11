'use strict';

const { describe: describeValue, fingerprint } = require('../extraction-slice');

describe('describe — the structural half of a delegation proof', () => {
  test('primitives report their type', () => {
    expect(describeValue(1)).toBe('number');
    expect(describeValue('s')).toBe('string');
    expect(describeValue(null)).toBe('null');
    expect(describeValue(undefined)).toBe('undefined');
  });

  test('a plain function reports its ARITY — a changed signature must show', () => {
    expect(describeValue((a, b) => a + b)).toBe('function/2');
    expect(describeValue(() => {})).toBe('function/0');
  });

  test('a class reports prototype methods with arity, and statics', () => {
    class Thing {
      constructor(a) { this.a = a; }
      run(x, y) { return x + y; }
      static make() { return new Thing(1); }
    }
    const d = describeValue(Thing);
    expect(d).toContain('class(1)');
    expect(d).toContain('run/2');
    expect(d).toContain('static:[make]');
    expect(d).not.toContain('constructor');
  });

  test('a DROPPED METHOD changes the description — the failure this must catch', () => {
    class Before { a() {} b() {} }
    class After { a() {} }
    expect(describeValue(Before)).not.toBe(describeValue(After));
  });

  test('a class that became a plain object changes the description', () => {
    class C { m() {} }
    expect(describeValue(C)).not.toBe(describeValue({ m: () => {} }));
  });

  test('accessors are reported, not silently skipped', () => {
    class WithGetter { get value() { return 1; } }
    expect(describeValue(WithGetter)).toContain('value:accessor');
  });

  test('arrays report length; nesting is depth-limited so diffs stay readable', () => {
    expect(describeValue([1, 2, 3])).toBe('array[3]');
    expect(describeValue({ a: { b: { c: { d: 1 } } } })).toBe('{a:{b:object}}');
  });
});

describe('fingerprint', () => {
  test('keys are SORTED, so export order cannot cause a false diff', () => {
    const a = fingerprint({ b: 1, a: 'x' });
    const b = fingerprint({ a: 'x', b: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.keys(a)).toEqual(['a', 'b']);
  });

  test('a LOST EXPORT changes the fingerprint', () => {
    expect(fingerprint({ a: 1, b: 2 })).not.toEqual(fingerprint({ a: 1 }));
  });

  test('same surface, different values, is NOT a diff — this is structural only', () => {
    // Deliberate and worth pinning: the fingerprint cannot see a changed method
    // body or a changed constant. That is what the re-pointed suites are for,
    // and both halves were run on every slice.
    expect(fingerprint({ n: 1 })).toEqual(fingerprint({ n: 999 }));
  });
});
