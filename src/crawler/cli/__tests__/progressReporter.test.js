'use strict';

// Mock chalk to avoid ESM issues
jest.mock('chalk', () => {
  const identity = (text) => String(text);
  const colorFn = Object.assign(identity, { bold: identity });
  return {
    green: colorFn,
    red: colorFn,
    yellow: colorFn,
    blue: colorFn,
    cyan: colorFn,
    gray: colorFn,
    white: colorFn,
    magenta: colorFn,
    dim: colorFn
  };
});

const {
  CLI_COLORS,
  CLI_ICONS,
  CLI_STAGE_LABELS,
  CLI_STAGE_ICONS,
  CLI_STAGE_COLORS,
  colorText,
  colorBold,
  createCliLogger,
  setVerboseMode,
  isVerboseMode,
  formatGeographyProgress,
  formatStageStart,
  formatStageComplete,
  formatAllStagesSummary
} = require('../progressReporter');

describe('progressReporter.js', () => {
  describe('Constants', () => {
    it('exports CLI_COLORS with expected color functions', () => {
      expect(CLI_COLORS).toBeDefined();
      expect(typeof CLI_COLORS.success).toBe('function');
      expect(typeof CLI_COLORS.error).toBe('function');
      expect(typeof CLI_COLORS.warning).toBe('function');
      expect(typeof CLI_COLORS.info).toBe('function');
      expect(typeof CLI_COLORS.progress).toBe('function');
      expect(typeof CLI_COLORS.muted).toBe('function');
    });

    it('exports CLI_ICONS with expected symbols', () => {
      expect(CLI_ICONS).toBeDefined();
      expect(CLI_ICONS.success).toBe('✓');
      expect(CLI_ICONS.error).toBe('✖');
      expect(CLI_ICONS.warning).toBe('⚠');
      expect(CLI_ICONS.info).toBe('ℹ');
      expect(CLI_ICONS.progress).toBe('⚙');
      expect(CLI_ICONS.complete).toBe('✅');
      expect(CLI_ICONS.geography).toBe('🌍');
    });

    it('exports CLI_STAGE_LABELS with stage names', () => {
      expect(CLI_STAGE_LABELS).toBeDefined();
      expect(CLI_STAGE_LABELS.countries).toBe('Countries');
      expect(CLI_STAGE_LABELS.adm1).toBe('Regions');
      expect(CLI_STAGE_LABELS.cities).toBe('Cities');
      expect(CLI_STAGE_LABELS.boundaries).toBe('Boundaries');
    });

    it('exports CLI_STAGE_ICONS with stage emojis', () => {
      expect(CLI_STAGE_ICONS).toBeDefined();
      expect(CLI_STAGE_ICONS.countries).toBe('🌐');
      expect(CLI_STAGE_ICONS.adm1).toBe('🗺️');
      expect(CLI_STAGE_ICONS.cities).toBe('🏙️');
      expect(CLI_STAGE_ICONS.boundaries).toBe('🛡️');
    });

    it('exports CLI_STAGE_COLORS with color functions for each stage', () => {
      expect(CLI_STAGE_COLORS).toBeDefined();
      expect(typeof CLI_STAGE_COLORS.countries).toBe('function');
      expect(typeof CLI_STAGE_COLORS.cities).toBe('function');
      expect(typeof CLI_STAGE_COLORS.boundaries).toBe('function');
      expect(typeof CLI_STAGE_COLORS.default).toBe('function');
    });
  });

  describe('colorText and colorBold', () => {
    it('colorText applies color function when provided', () => {
      const mockColorFn = jest.fn(text => `[colored]${text}`);
      const result = colorText(mockColorFn, 'test');
      expect(result).toBe('[colored]test');
      expect(mockColorFn).toHaveBeenCalledWith('test');
    });

    it('colorText returns plain text when color function is null', () => {
      const result = colorText(null, 'test');
      expect(result).toBe('test');
    });

    it('colorBold applies bold styling when available', () => {
      const mockColorFn = {
        bold: jest.fn(text => `[bold]${text}`)
      };
      const result = colorBold(mockColorFn, 'test');
      expect(result).toBe('[bold]test');
      expect(mockColorFn.bold).toHaveBeenCalledWith('test');
    });
  });

  describe('Verbose Mode', () => {
    beforeEach(() => {
      setVerboseMode(false);
    });

    it('defaults to verbose mode disabled', () => {
      expect(isVerboseMode()).toBe(false);
    });

    it('setVerboseMode(true) enables verbose mode', () => {
      setVerboseMode(true);
      expect(isVerboseMode()).toBe(true);
    });

    it('setVerboseMode(false) disables verbose mode', () => {
      setVerboseMode(true);
      setVerboseMode(false);
      expect(isVerboseMode()).toBe(false);
    });

    it('setVerboseMode coerces to boolean', () => {
      setVerboseMode('truthy-string');
      expect(isVerboseMode()).toBe(true);

      setVerboseMode(0);
      expect(isVerboseMode()).toBe(false);

      setVerboseMode(1);
      expect(isVerboseMode()).toBe(true);
    });
  });

  describe('createCliLogger', () => {
    let mockStdout, mockStderr, logger;

    beforeEach(() => {
      mockStdout = jest.fn();
      mockStderr = jest.fn();
      logger = createCliLogger({ stdout: mockStdout, stderr: mockStderr });
    });

    it('creates logger with default stdout/stderr when not provided', () => {
      const defaultLogger = createCliLogger();
      expect(defaultLogger).toBeDefined();
      expect(typeof defaultLogger.success).toBe('function');
      expect(typeof defaultLogger.error).toBe('function');
    });

    it('success() logs with success icon and color', () => {
      logger.success('Operation completed');
      expect(mockStdout).toHaveBeenCalledTimes(1);
      const call = mockStdout.mock.calls[0];
      expect(call[0]).toContain('✓');
      expect(call[1]).toBe('Operation completed');
    });

    it('error() logs with error icon and color', () => {
      logger.error('Operation failed');
      expect(mockStdout).toHaveBeenCalledTimes(1);
      const call = mockStdout.mock.calls[0];
      expect(call[0]).toContain('✖');
      expect(call[1]).toBe('Operation failed');
    });

    it('warn() logs with warning icon and color', () => {
      logger.warn('Potential issue');
      expect(mockStdout).toHaveBeenCalledTimes(1);
      const call = mockStdout.mock.calls[0];
      expect(call[0]).toContain('⚠');
      expect(call[1]).toBe('Potential issue');
    });

    it('info() logs with info icon and color', () => {
      logger.info('Informational message');
      expect(mockStdout).toHaveBeenCalledTimes(1);
      const call = mockStdout.mock.calls[0];
      expect(call[0]).toContain('ℹ');
      expect(call[1]).toBe('Informational message');
    });

    it('progress() displays progress bar with percentage', () => {
      logger.progress('Processing', 50, 100);
      expect(mockStdout).toHaveBeenCalledTimes(1);
      const output = mockStdout.mock.calls[0][0];
      expect(output).toContain('50%');
      expect(output).toContain('Processing');
      expect(output).toMatch(/\[.*\]/); // Progress bar brackets
    });

    it('progress() handles 0% correctly', () => {
      logger.progress('Starting', 0, 100);
      const output = mockStdout.mock.calls[0][0];
      expect(output).toContain('0%');
    });

    it('progress() handles 100% correctly', () => {
      logger.progress('Complete', 100, 100);
      const output = mockStdout.mock.calls[0][0];
      expect(output).toContain('100%');
    });

    it('progress() includes optional details parameter', () => {
      logger.progress('Processing', 25, 100, '25 of 100 files');
      const output = mockStdout.mock.calls[0][0];
      expect(output).toContain('25%');
      expect(output).toContain('25 of 100 files');
    });

    it('stat() logs label-value pairs', () => {
      logger.stat('Total Items', '1,234');
      expect(mockStdout).toHaveBeenCalledTimes(1);
      const call = mockStdout.mock.calls[0];
      expect(call[0]).toContain('Total Items:');
      expect(call[1]).toBe('1,234');
    });

    it('debug() only logs when verbose mode is enabled', () => {
      setVerboseMode(false);
      logger.debug('Debug message 1');
      expect(mockStderr).not.toHaveBeenCalled();

      setVerboseMode(true);
      logger.debug('Debug message 2');
      expect(mockStderr).toHaveBeenCalledTimes(1);
      const call = mockStderr.mock.calls[0];
      expect(call[0]).toContain('[DEBUG]');
      expect(call[1]).toBe('Debug message 2');
    });

    it('debug() accepts multiple arguments', () => {
      setVerboseMode(true);
      logger.debug('Message', { key: 'value' }, 123);
      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        'Message',
        { key: 'value' },
        123
      );
    });
  });

  describe('formatGeographyProgress', () => {
    it('returns null when data is missing', () => {
      expect(formatGeographyProgress(null)).toBeNull();
      expect(formatGeographyProgress(undefined)).toBeNull();
      expect(formatGeographyProgress({})).toBeNull();
    });

    it('formats running status with progress icon', () => {
      const data = {
        gazetteer: { status: 'running', currentStage: 'countries' }
      };
      const result = formatGeographyProgress(data);
      expect(result).toBeTruthy();
      expect(result).toContain('⚙'); // Progress icon
      expect(result).toContain('Countries');
    });

    it('formats completed status with success icon', () => {
      const data = {
        gazetteer: { status: 'completed', currentStage: 'boundaries' }
      };
      const result = formatGeographyProgress(data);
      expect(result).toBeTruthy();
      expect(result).toContain('✅'); // Complete icon
      expect(result).toContain('Boundaries');
    });

    it('formats error status with error icon', () => {
      const data = {
        gazetteer: { status: 'failed', error: 'Connection timeout' }
      };
      const result = formatGeographyProgress(data);
      expect(result).toBeTruthy();
      expect(result).toContain('✖'); // Error icon
    });

    it('formats idle status with idle icon', () => {
      const data = {
        gazetteer: { status: 'idle' }
      };
      const result = formatGeographyProgress(data);
      expect(result).toBeTruthy();
      expect(result).toContain('○'); // Idle icon
    });

    it('includes stage-specific icon and label', () => {
      const data = {
        gazetteer: { status: 'running', currentStage: 'cities' }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('🏙️'); // Cities icon
      expect(result).toContain('Cities');
    });

    it('includes country code for cities stage when available', () => {
      const data = {
        gazetteer: {
          status: 'running',
          currentStage: 'cities',
          lastProgress: {
            payload: { countryCode: 'GB' }
          }
        }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('Cities');
      expect(result).toContain('GB');
    });

    it('includes canonical name for boundaries stage', () => {
      const data = {
        gazetteer: {
          status: 'running',
          currentStage: 'boundaries',
          lastProgress: {
            payload: {
              canonicalName: 'London',
              countryCode: 'GB'
            }
          }
        }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('Boundaries');
      expect(result).toContain('London');
      expect(result).toContain('GB');
    });

    it('includes percentage complete when available', () => {
      const data = {
        gazetteer: {
          status: 'running',
          currentStage: 'countries',
          lastProgress: {
            payload: { phase: 'discovery', percentComplete: 75 }
          }
        }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('75%');
    });

    it('includes upserted/processed/errors counts when available', () => {
      const data = {
        gazetteer: {
          status: 'running',
          currentStage: 'countries',
          lastProgress: {
            payload: {
              phase: 'discovery',
              totalUpserted: 50,
              totalProcessed: 100,
              totalErrors: 2
            }
          }
        }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('✓50'); // Success icon + upserted
      expect(result).toContain('100 total');
      expect(result).toContain('✖2'); // Error icon + errors
    });

    it('estimates remaining time when timing data available', () => {
      const data = {
        gazetteer: {
          status: 'running',
          currentStage: 'countries',
          lastProgress: {
            payload: {
              timing: { estimatedRemainingMs: 125000 } // ~2 minutes
            }
          }
        }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('~2m left');
    });

    it('shows seconds for short remaining times', () => {
      const data = {
        gazetteer: {
          status: 'running',
          currentStage: 'countries',
          lastProgress: {
            payload: {
              timing: { estimatedRemainingMs: 45000 } // 45 seconds
            }
          }
        }
      };
      const result = formatGeographyProgress(data);
      expect(result).toContain('~45s left');
    });
  });

  describe('formatStageStart', () => {
    it('returns null when stage key is missing', () => {
      expect(formatStageStart(null)).toBeNull();
      expect(formatStageStart(undefined)).toBeNull();
      expect(formatStageStart('')).toBeNull();
    });

    it('formats stage start with pending icon and stage details', () => {
      const result = formatStageStart('countries');
      expect(result).toBeTruthy();
      expect(result).toContain('⏳'); // Pending icon
      expect(result).toContain('🌐'); // Countries icon
      expect(result).toContain('Countries');
      expect(result).toContain('starting');
    });

    it('handles unknown stages with default formatting', () => {
      const result = formatStageStart('unknown-stage');
      expect(result).toBeTruthy();
      expect(result).toContain('unknown-stage');
      expect(result).toContain('starting');
    });
  });

  describe('formatStageComplete', () => {
    it('returns null when stage key is missing', () => {
      expect(formatStageComplete(null, {})).toBeNull();
      expect(formatStageComplete(undefined, {})).toBeNull();
      expect(formatStageComplete('', {})).toBeNull();
    });

    it('formats stage completion with complete icon and stage details', () => {
      const result = formatStageComplete('countries', {});
      expect(result).toBeTruthy();
      expect(result).toContain('✅'); // Complete icon
      expect(result).toContain('🌐'); // Countries icon
      expect(result).toContain('Countries');
    });

    it('includes processed count when available', () => {
      const stats = { recordsProcessed: 150 };
      const result = formatStageComplete('cities', stats);
      expect(result).toContain('150 processed');
    });

    it('includes upserted count when available', () => {
      const stats = { recordsUpserted: 50 };
      const result = formatStageComplete('cities', stats);
      expect(result).toContain('✓50 new');
    });

    it('shows 0 new when no records upserted', () => {
      const stats = { recordsUpserted: 0 };
      const result = formatStageComplete('cities', stats);
      expect(result).toContain('0 new');
    });

    it('includes error count when available', () => {
      const stats = { errors: 5 };
      const result = formatStageComplete('cities', stats);
      expect(result).toContain('✖5');
    });

    it('shows 0 errors when no errors occurred', () => {
      const stats = { errors: 0 };
      const result = formatStageComplete('cities', stats);
      expect(result).toContain('0 errors');
    });

    it('includes ingestor count when available', () => {
      const stats = { ingestorsCompleted: 3 };
      const result = formatStageComplete('boundaries', stats);
      expect(result).toContain('3 ingestors');
    });

    it('uses singular form for single ingestor', () => {
      const stats = { ingestorsCompleted: 1 };
      const result = formatStageComplete('boundaries', stats);
      expect(result).toContain('1 ingestor');
      expect(result).not.toContain('ingestors');
    });

    it('combines all available statistics', () => {
      const stats = {
        recordsProcessed: 200,
        recordsUpserted: 75,
        errors: 3,
        ingestorsCompleted: 5
      };
      const result = formatStageComplete('adm1', stats);
      expect(result).toContain('200 processed');
      expect(result).toContain('✓75 new');
      expect(result).toContain('✖3');
      expect(result).toContain('5 ingestors');
    });
  });

  describe('formatAllStagesSummary', () => {
    it('returns null when summary is missing or invalid', () => {
      expect(formatAllStagesSummary(null)).toBeNull();
      expect(formatAllStagesSummary(undefined)).toBeNull();
      expect(formatAllStagesSummary('not-an-object')).toBeNull();
    });

    it('formats overall gazetteer summary', () => {
      const summary = {};
      const result = formatAllStagesSummary(summary);
      expect(result).toBeTruthy();
      expect(result).toContain('📊'); // Summary icon
      expect(result).toContain('Gazetteer summary');
    });

    it('includes stages count when available', () => {
      const summary = { stagesCompleted: 4 };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('4 stages');
    });

    it('includes total processed count', () => {
      const summary = { recordsProcessed: 5000 };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('5000 processed');
    });

    it('includes total upserted count', () => {
      const summary = { recordsUpserted: 1200 };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('✓1200 new');
    });

    it('shows 0 new when no records upserted', () => {
      const summary = { recordsUpserted: 0 };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('0 new');
    });

    it('includes total error count', () => {
      const summary = { errors: 15 };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('✖15');
    });

    it('shows 0 errors when no errors occurred', () => {
      const summary = { errors: 0 };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('0 errors');
    });

    it('combines all available summary statistics', () => {
      const summary = {
        stagesCompleted: 5,
        recordsProcessed: 10000,
        recordsUpserted: 3500,
        errors: 42
      };
      const result = formatAllStagesSummary(summary);
      expect(result).toContain('5 stages');
      expect(result).toContain('10000 processed');
      expect(result).toContain('✓3500 new');
      expect(result).toContain('✖42');
    });
  });
});
