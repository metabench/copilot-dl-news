'use strict';

const { validateInteger } = require('../validators');

describe('validateInteger', () => {
  it('returns integer when valid', () => {
    expect(validateInteger('5', { fieldName: 'depth', contextLabel: 'config', min: 0 })).toBe(5);
  });

  it('throws when value is not finite', () => {
    expect(() => validateInteger('foo', { fieldName: 'depth', contextLabel: 'config' }))
      .toThrow('Invalid depth value in config: expected a number.');
  });

  it('throws when value below minimum', () => {
    expect(() => validateInteger(-1, { fieldName: 'maxPages', contextLabel: 'config', min: 1 }))
      .toThrow('Invalid maxPages value in config: expected a value >= 1.');
  });

  it('throws when value above maximum', () => {
    expect(() => validateInteger(11, { fieldName: 'rank', contextLabel: 'config', max: 10 }))
      .toThrow('Invalid rank value in config: expected a value <= 10.');
  });

  it('allows undefined when explicit', () => {
    expect(validateInteger(undefined, { fieldName: 'depth', contextLabel: 'config', allowUndefined: true })).toBeUndefined();
  });
});
