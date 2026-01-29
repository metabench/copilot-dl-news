const {
  normalizeCompressionOptions,
  resolvePresetName,
  getCompressionConfigPreset,
  describePreset,
  PRESETS
} = require('../CompressionFacade');

describe('CompressionFacade', () => {
  test('normalizeCompressionOptions uses preset definitions', () => {
    const options = normalizeCompressionOptions({ preset: PRESETS.BROTLI_6 });
    expect(options).toMatchObject({
      algorithm: 'brotli',
      level: 6,
      preset: 'brotli_6'
    });
  });

  test('normalizeCompressionOptions clamps level per algorithm', () => {
    const options = normalizeCompressionOptions({ algorithm: 'gzip', level: 15 });
    expect(options).toMatchObject({ algorithm: 'gzip', level: 9 });
  });

  test('normalizeCompressionOptions validates algorithm', () => {
    expect(() => normalizeCompressionOptions({ algorithm: 'invalid' })).toThrow('Invalid compression algorithm');
  });

  test('resolvePresetName handles canonical keys', () => {
    expect(resolvePresetName('BROTLI_6')).toBe('brotli_6');
    expect(resolvePresetName('unknownPreset')).toBeNull();
  });

  test('getCompressionConfigPreset returns metadata', () => {
    const config = getCompressionConfigPreset(PRESETS.BROTLI_6);
    expect(config).toBeTruthy();
    expect(config.algorithm).toBe('brotli');
    expect(config.level).toBe(6);
  });

  test('describePreset generates fallback description', () => {
    const description = describePreset('gzip_3');
    expect(description).toContain('Gzip');
  });
});
