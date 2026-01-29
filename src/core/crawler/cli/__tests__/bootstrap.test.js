'use strict';

const { setupLegacyCliEnvironment } = require('../bootstrap');
const { setVerboseMode, isVerboseMode } = require('../progressReporter');

// Mock progressReporter module
jest.mock('../progressReporter', () => ({
  setVerboseMode: jest.fn(),
  isVerboseMode: jest.fn(),
  createCliLogger: jest.fn()
}));

// Mock progressAdapter module
jest.mock('../progressAdapter', () => ({
  createCliConsoleInterceptor: jest.fn(() => ({ restore: jest.fn() }))
}));

describe('bootstrap.js', () => {
  const { createCliConsoleInterceptor } = require('../progressAdapter');

  beforeEach(() => {
    jest.clearAllMocks();
    delete global.__COPILOT_GAZETTEER_VERBOSE;
  });

  afterEach(() => {
    delete global.__COPILOT_GAZETTEER_VERBOSE;
    jest.clearAllMocks();
  });

  describe('setupLegacyCliEnvironment', () => {
    it('throws TypeError when args is not an array', () => {
      const log = { info: jest.fn(), error: jest.fn() };

      expect(() => setupLegacyCliEnvironment({ args: 'not-an-array', log }))
        .toThrow(TypeError);
      expect(() => setupLegacyCliEnvironment({ args: 'not-an-array', log }))
        .toThrow('setupLegacyCliEnvironment expects args to be an array');
    });

    it('throws TypeError when log is missing', () => {
      expect(() => setupLegacyCliEnvironment({ args: [], log: null }))
        .toThrow(TypeError);
      expect(() => setupLegacyCliEnvironment({ args: [], log: null }))
        .toThrow('setupLegacyCliEnvironment requires a logger instance');
    });

    it('enables verbose mode when --verbose flag is present', () => {
      const log = { info: jest.fn(), error: jest.fn() };
      const args = ['--verbose', 'https://example.com'];

      const result = setupLegacyCliEnvironment({ args, log });

      expect(setVerboseMode).toHaveBeenCalledWith(true);
      expect(result.verboseModeEnabled).toBe(true);
      expect(global.__COPILOT_GAZETTEER_VERBOSE).toBe(true);
    });

    it('disables verbose mode when --verbose flag is absent', () => {
      const log = { info: jest.fn(), error: jest.fn() };
      const args = ['https://example.com', '--max-pages=10'];

      const result = setupLegacyCliEnvironment({ args, log });

      expect(setVerboseMode).toHaveBeenCalledWith(false);
      expect(result.verboseModeEnabled).toBe(false);
      expect(global.__COPILOT_GAZETTEER_VERBOSE).toBe(false);
    });

    it('installs console interceptors via progressAdapter', () => {
      const log = { info: jest.fn(), error: jest.fn() };
      const args = ['https://example.com'];

      setupLegacyCliEnvironment({ args, log });

      expect(createCliConsoleInterceptor).toHaveBeenCalledWith({ log });
    });

    it('returns restoreConsole function that cleans up environment', () => {
      const mockRestore = jest.fn();
      createCliConsoleInterceptor.mockReturnValueOnce({ restore: mockRestore });

      const log = { info: jest.fn(), error: jest.fn() };
      const args = ['--verbose'];

      const { restoreConsole } = setupLegacyCliEnvironment({ args, log });

      // Setup should have enabled verbose mode and set global
      expect(global.__COPILOT_GAZETTEER_VERBOSE).toBe(true);

      // Calling restoreConsole should clean everything up
      restoreConsole();

      expect(mockRestore).toHaveBeenCalledTimes(1);
      expect(setVerboseMode).toHaveBeenCalledWith(false);
      expect(global.__COPILOT_GAZETTEER_VERBOSE).toBeUndefined();
    });

    it('can be called multiple times with different args', () => {
      const log = { info: jest.fn(), error: jest.fn() };

      // First call with verbose
      const result1 = setupLegacyCliEnvironment({ args: ['--verbose'], log });
      expect(result1.verboseModeEnabled).toBe(true);
      result1.restoreConsole();

      // Second call without verbose
      const result2 = setupLegacyCliEnvironment({ args: [], log });
      expect(result2.verboseModeEnabled).toBe(false);
      result2.restoreConsole();

      // Verify verbose mode was toggled correctly both times
      expect(setVerboseMode).toHaveBeenCalledWith(true);
      expect(setVerboseMode).toHaveBeenCalledWith(false);
    });

    it('handles empty args array', () => {
      const log = { info: jest.fn(), error: jest.fn() };
      const args = [];

      const result = setupLegacyCliEnvironment({ args, log });

      expect(result.verboseModeEnabled).toBe(false);
      expect(global.__COPILOT_GAZETTEER_VERBOSE).toBe(false);
      expect(typeof result.restoreConsole).toBe('function');
    });

    it('treats --verbose anywhere in args array as enabled', () => {
      const log = { info: jest.fn(), error: jest.fn() };
      
      // Verbose at beginning
      const result1 = setupLegacyCliEnvironment({ 
        args: ['--verbose', 'https://example.com', '--max-pages=10'], 
        log 
      });
      expect(result1.verboseModeEnabled).toBe(true);

      // Verbose in middle
      const result2 = setupLegacyCliEnvironment({ 
        args: ['https://example.com', '--verbose', '--max-pages=10'], 
        log 
      });
      expect(result2.verboseModeEnabled).toBe(true);

      // Verbose at end
      const result3 = setupLegacyCliEnvironment({ 
        args: ['https://example.com', '--max-pages=10', '--verbose'], 
        log 
      });
      expect(result3.verboseModeEnabled).toBe(true);
    });
  });
});
